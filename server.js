const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const expressApp = express();
const server = http.createServer(expressApp);
const io = new Server(server);

expressApp.use(express.static('public'));

let rooms = {}; 
let waitingPlayer = null; 

// Игровые параметры
const FIELD_SIZE = 25;       
const UNIT_RADIUS = 1.725;     // 3.45м / 2 (модель увеличена на 15%)
const DIRECT_RADIUS = 3;       // Прямое попадание (0 HP)
const SPLASH_RADIUS = 6;       // Радиус осколков (-51 HP)

function generateRandomUnits() {
    const min = UNIT_RADIUS;
    const max = FIELD_SIZE - UNIT_RADIUS;

    const u1 = { 
        x: min + Math.random() * (max - min), 
        y: min + Math.random() * (max - min), 
        hp: 100,
        destroyed: false 
    };
    
    let u2 = { 
        x: min + Math.random() * (max - min), 
        y: min + Math.random() * (max - min), 
        hp: 100,
        destroyed: false 
    };
    
    while (Math.hypot(u1.x - u2.x, u1.y - u2.y) < (UNIT_RADIUS * 2)) {
        u2.x = min + Math.random() * (max - min);
        u2.y = min + Math.random() * (max - min);
    }
    
    return [u1, u2];
}

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    socket.on('joinGame', () => {
        if (!waitingPlayer) {
            const roomId = 'room_' + socket.id;
            let waitingTimerValue = 300;
            
            const waitingInterval = setInterval(() => {
                waitingTimerValue--;
                socket.emit('timerUpdate', waitingTimerValue);
                
                if (waitingTimerValue <= 0) {
                    clearInterval(waitingInterval);
                    socket.emit('gameOver', { winner: null }); 
                    if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
                        waitingPlayer = null;
                    }
                }
            }, 1000);

            waitingPlayer = { socket, roomId, interval: waitingInterval };
            socket.join(roomId);
            socket.emit('waiting', 'Ожидание соперника...');
            socket.emit('timerUpdate', waitingTimerValue); 
            
        } else {
            clearInterval(waitingPlayer.interval);
            const roomId = waitingPlayer.roomId;
            const player1 = waitingPlayer.socket;
            const player2 = socket;
            
            socket.join(roomId);
            waitingPlayer = null; 

            rooms[roomId] = {
                players: {
                    p1: { id: player1.id, role: 'p1', units: generateRandomUnits() }, 
                    p2: { id: player2.id, role: 'p2', units: generateRandomUnits() }  
                },
                turn: player1.id, 
                timer: 9,
                roomId: roomId
            };

            player1.emit('gameStart', { role: 'p1', state: getMaskedState(rooms[roomId], 'p1') });
            player2.emit('gameStart', { role: 'p2', state: getMaskedState(rooms[roomId], 'p2') });

            startGameTimer(roomId);
        }
    });

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            clearInterval(waitingPlayer.interval);
            waitingPlayer = null;
        }
    });

    socket.on('playerAction', (data) => {
        let roomId = null;
        for (const r of socket.rooms) {
            if (r.startsWith('room_')) { roomId = r; break; }
        }
        const room = rooms[roomId];
        if (!room) return; 

        const currentPlayer = data.forcedRole ? room.players[data.forcedRole] : (room.players.p1.id === socket.id ? room.players.p1 : room.players.p2);
        const enemyPlayer = currentPlayer.role === 'p1' ? room.players.p2 : room.players.p1;

        let targetX = Math.max(0, Math.min(FIELD_SIZE, data.x));
        let targetY = Math.max(0, Math.min(FIELD_SIZE, data.y));

        if (data.type === 'fire') {
            let hitType = 'miss'; // Модификатор попадания для анимации эффектов

            enemyPlayer.units.forEach(u => {
                if (!u.destroyed) {
                    const distance = Math.hypot(u.x - targetX, u.y - targetY);
                    
                    // 1. Проверяем прямое попадание
                    if (distance <= (DIRECT_RADIUS + UNIT_RADIUS)) {
                        u.hp = 0;
                        u.destroyed = true;
                        hitType = 'hit';
                    } 
                    // 2. Проверяем попадание осколками (если не было прямого)
                    else if (distance <= (SPLASH_RADIUS + UNIT_RADIUS)) {
                        u.hp = Math.max(0, u.hp - 51);
                        if (u.hp === 0) u.destroyed = true;
                        if (hitType !== 'hit') hitType = 'splash'; // splash считается попаданием
                    }
                }
            });
            
            // Отправляем результат клиентам (hit/splash — взрывы, miss — ямка)
            io.to(roomId).emit('fireResult', { result: hitType, x: targetX, y: targetY, targetRole: enemyPlayer.role });

            const aliveUnits = enemyPlayer.units.filter(u => !u.destroyed);
            if (aliveUnits.length === 0) {
                io.to(roomId).emit('gameOver', { winner: currentPlayer.id });
                clearInterval(room.interval);
                delete rooms[roomId];
                return;
            }
            
            sendMaskedStateToAll(room);
            switchTurn(room);
        }
        
        if (data.type === 'move') {
            const unit = currentPlayer.units[data.unitIndex];
            if (unit && !unit.destroyed) {
                unit.x = Math.max(UNIT_RADIUS, Math.min(FIELD_SIZE - UNIT_RADIUS, targetX));
                unit.y = Math.max(UNIT_RADIUS, Math.min(FIELD_SIZE - UNIT_RADIUS, targetY));
                
                sendMaskedStateToAll(room);
                switchTurn(room);
            }
        }
    });
});

function startGameTimer(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    room.interval = setInterval(() => {
        room.timer--;
        io.to(roomId).emit('timerUpdate', room.timer);
        if (room.timer <= 0) { switchTurn(room); }
    }, 1000);
}

function switchTurn(room) {
    room.timer = 9;
    const p1Id = room.players.p1.id;
    const p2Id = room.players.p2.id;
    room.turn = (room.turn === p1Id) ? p2Id : p1Id;
    io.to(room.roomId).emit('turnChanged', { turn: room.turn, timer: room.timer });
}

function sendMaskedStateToAll(room) {
    io.to(room.players.p1.id).emit('gameStateUpdate', getMaskedState(room, 'p1'));
    io.to(room.players.p2.id).emit('gameStateUpdate', getMaskedState(room, 'p2'));
}

function getMaskedState(room, role) {
    const state = {
        turn: room.turn,
        timer: room.timer,
        roomId: room.roomId,
        players: JSON.parse(JSON.stringify(room.players))
    };
    
    // В тумане войны скрываем живые вражеские САУ (передаем hp, но прячем координаты)
    if (role === 'p1') {
        state.players.p2.units = state.players.p2.units.map(u => u.destroyed ? u : { x: -1000, y: -1000, hp: u.hp, destroyed: false });
    } else if (role === 'p2') {
        state.players.p1.units = state.players.p1.units.map(u => u.destroyed ? u : { x: -1000, y: -1000, hp: u.hp, destroyed: false });
    }
    return state;
}

server.listen(3000, () => { console.log('Сервер запущен на http://localhost:3000'); });
