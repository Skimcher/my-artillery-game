const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const expressApp = express();
const server = http.createServer(expressApp);
const io = new Server(server);

expressApp.use(express.static('public'));

let rooms = {}; 
let waitingPlayer = null; 

// --- ИГРОВЫЕ ПАРАМЕТРЫ (СИНХРОНИЗИРОВАНО С КЛИЕНТОМ) ---
const FIELD_SIZE = 25;       // Размер поля в метрах
const UNIT_RADIUS = 1.725;   // 3.45м / 2 (размер 3D-модели +15%)
const DIRECT_RADIUS = 0.97;  // Радиус критического попадания (100 HP / уничтожение)
const SPLASH_RADIUS = 4.13;  // Радиус осколков (строго -51 HP)

// Генерация случайных позиций САУ на поле боя
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
    
    // Проверка, чтобы пушки не заспавнились слишком близко друг к другу
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
                roomId: roomId,
                interval: null
            };

            player1.emit('gameStart', { role: 'p1', state: getMaskedState(rooms[roomId], 'p1') });
            player2.emit('gameStart', { role: 'p2', state: getMaskedState(rooms[roomId], 'p2') });

            startGameTimer(roomId);
        }
    });

    // --- ОБРАБОТКА ДЕЙСТВИЙ ИГРОКА (ОБНОВЛЕННАЯ СИНХРОННАЯ ЛОГИКА) ---
    socket.on('playerAction', (action) => {
        const roomId = Object.keys(rooms).find(r => 
            rooms[r].players.p1.id === socket.id || 
            rooms[r].players.p2.id === socket.id
        );
        if (!roomId) return;

        const room = rooms[roomId];
        if (room.turn !== socket.id) return; 

        const activeRole = room.players.p1.id === socket.id ? 'p1' : 'p2';
        const opponentRole = activeRole === 'p1' ? 'p2' : 'p1';

        if (action.type === 'fire') {
            let hitResult = 'miss';
            const targetUnits = room.players[opponentRole].units;

            targetUnits.forEach((unit) => {
                if (unit.destroyed) return;

                const distance = Math.hypot(unit.x - action.x, unit.y - action.y);

                if (distance <= DIRECT_RADIUS) {
                    unit.hp = 0; 
                    unit.destroyed = true;
                    hitResult = 'direct';
                } 
                else if (distance <= SPLASH_RADIUS) {
                    unit.hp -= 51; 
                    hitResult = 'splash';
                    
                    if (unit.hp <= 0) {
                        unit.hp = 0;
                        unit.destroyed = true;
                    }
                }
            });

            io.to(roomId).emit('fireResult', { x: action.x, y: action.y, targetRole: opponentRole, result: hitResult });
            
            checkWinCondition(roomId);
            switchTurn(roomId);
        } 
        else if (action.type === 'move') {
            const unit = room.players[activeRole].units[action.unitIndex];
            
            if (unit && !unit.destroyed) {
                const min = UNIT_RADIUS;
                const max = FIELD_SIZE - UNIT_RADIUS;
                
                unit.x = Math.max(min, Math.min(max, action.x));
                unit.y = Math.max(min, Math.min(max, action.y));
                
                console.log(`Игрок ${activeRole} передвинул САУ №${action.unitIndex} в: X=${unit.x}, Y=${unit.y}`);
                
                // Мгновенно обновляем состояние на клиентах, чтобы танк изменил позицию визуально
                const p1Socket = io.sockets.sockets.get(room.players.p1.id);
                const p2Socket = io.sockets.sockets.get(room.players.p2.id);
                if (p1Socket) p1Socket.emit('gameStateUpdate', getMaskedState(room, 'p1'));
                if (p2Socket) p2Socket.emit('gameStateUpdate', getMaskedState(room, 'p2'));
            }
            
            switchTurn(roomId);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            clearInterval(waitingPlayer.interval);
            waitingPlayer = null;
        }
        const roomId = Object.keys(rooms).find(r => rooms[r].players.p1.id === socket.id || rooms[r].players.p2.id === socket.id);
        if (roomId) {
            clearInterval(rooms[roomId].interval);
            const winnerId = rooms[roomId].players.p1.id === socket.id ? rooms[roomId].players.p2.id : rooms[roomId].players.p1.id;
            io.to(roomId).emit('gameOver', { winner: winnerId });
            delete rooms[roomId];
        }
    });
});

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ИГРЫ ---

function startGameTimer(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    if (room.interval) clearInterval(room.interval);
    room.timer = 9;

    room.interval = setInterval(() => {
        room.timer--;
        io.to(roomId).emit('timerUpdate', room.timer);

        if (room.timer <= 0) {
            switchTurn(roomId);
        }
    }, 1000);
}

function switchTurn(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.turn = room.turn === room.players.p1.id ? room.players.p2.id : room.players.p1.id;
    
    const p1Socket = io.sockets.sockets.get(room.players.p1.id);
    const p2Socket = io.sockets.sockets.get(room.players.p2.id);

    if (p1Socket) p1Socket.emit('turnChanged', { turn: room.turn, timer: 9, state: getMaskedState(room, 'p1') });
    if (p2Socket) p2Socket.emit('turnChanged', { turn: room.turn, timer: 9, state: getMaskedState(room, 'p2') });

    startGameTimer(roomId);
}

function checkWinCondition(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const p1AllDestroyed = room.players.p1.units.every(u => u.destroyed);
    const p2AllDestroyed = room.players.p2.units.every(u => u.destroyed);

    if (p1AllDestroyed || p2AllDestroyed) {
        clearInterval(room.interval);
        let winner = null;
        if (p1AllDestroyed && !p2AllDestroyed) winner = room.players.p2.id;
        if (p2AllDestroyed && !p1AllDestroyed) winner = room.players.p1.id;

        io.to(roomId).emit('gameOver', { winner: winner });
        delete rooms[roomId];
    } else {
        const p1Socket = io.sockets.sockets.get(room.players.p1.id);
        const p2Socket = io.sockets.sockets.get(room.players.p2.id);
        if (p1Socket) p1Socket.emit('gameStateUpdate', getMaskedState(room, 'p1'));
        if (p2Socket) p2Socket.emit('gameStateUpdate', getMaskedState(room, 'p2'));
    }
}

// Туман войны: Игрок видит координаты врага только если вражеская САУ уничтожена
function getMaskedState(room, viewerRole) {
    const opponentRole = viewerRole === 'p1' ? 'p2' : 'p1';
    
    const maskedOpponentUnits = room.players[opponentRole].units.map(unit => {
        if (unit.destroyed) {
            return { x: unit.x, y: unit.y, hp: 0, destroyed: true };
        } else {
            return { x: -1000, y: -1000, hp: unit.hp, destroyed: false }; 
        }
    });

    return {
        turn: room.turn,
        players: {
            [viewerRole]: { units: room.players[viewerRole].units },
            [opponentRole]: { units: maskedOpponentUnits }
        }
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
