const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const expressApp = express();
const server = http.createServer(expressApp);
const io = new Server(server);

expressApp.use(express.static('public'));

let rooms = {}; 
let waitingPlayer = null; 

// Функция для генерации уникальных случайных координат для двух пушек игрока
function generateRandomUnits() {
    const u1 = { x: Math.floor(Math.random() * 8), y: Math.floor(Math.random() * 8), destroyed: false };
    let u2 = { x: Math.floor(Math.random() * 8), y: Math.floor(Math.random() * 8), destroyed: false };
    
    // Если координаты совпали, перегенерируем вторую пушку, пока они не станут уникальными
    while (u1.x === u2.x && u1.y === u2.y) {
        u2.x = Math.floor(Math.random() * 8);
        u2.y = Math.floor(Math.random() * 8);
    }
    
    return [u1, u2];
}

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    socket.on('joinGame', () => {
        if (!waitingPlayer) {
            const roomId = 'room_' + socket.id;
            
            // Таймер ожидания соперника на 300 секунд (5 минут)
            let waitingTimerValue = 300;
            
            const waitingInterval = setInterval(() => {
                waitingTimerValue--;
                
                // Отправляем текущие секунды клиенту
                socket.emit('timerUpdate', waitingTimerValue);
                
                // Если за 5 минут никто не пришел, убираем игрока из очереди
                if (waitingTimerValue <= 0) {
                    clearInterval(waitingInterval);
                    socket.emit('gameOver', { winner: null }); 
                    if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
                        waitingPlayer = null;
                        console.log(`Время ожидания в комнате ${roomId} истекло.`);
                    }
                }
            }, 1000);

            waitingPlayer = { socket, roomId, interval: waitingInterval };
            socket.join(roomId);
            socket.emit('waiting', 'Ожидание соперника...');
            socket.emit('timerUpdate', waitingTimerValue); 
            
        } else {
            // Оппонент нашелся! Очищаем таймер ожидания перед стартом игры
            clearInterval(waitingPlayer.interval);

            const roomId = waitingPlayer.roomId;
            const player1 = waitingPlayer.socket;
            const player2 = socket;
            
            socket.join(roomId);
            waitingPlayer = null; 

            // Генерируем случайные начальные позиции для обеих команд
            rooms[roomId] = {
                players: {
                    p1: { id: player1.id, role: 'p1', units: generateRandomUnits() }, 
                    p2: { id: player2.id, role: 'p2', units: generateRandomUnits() }  
                },
                turn: player1.id, 
                timer: 9,
                roomId: roomId
            };

            // Отправляем замаскированное состояние (туман войны) при старте игры
            player1.emit('gameStart', { role: 'p1', state: getMaskedState(rooms[roomId], 'p1') });
            player2.emit('gameStart', { role: 'p2', state: getMaskedState(rooms[roomId], 'p2') });

            startGameTimer(roomId);
        }
    });

    // Обработка отключения игрока из очереди
    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            clearInterval(waitingPlayer.interval);
            waitingPlayer = null;
            console.log(`Очередь ожидания очищена, так как первый игрок вышел.`);
        }
    });

    // --- ОБРАБОТКА ХОДА ИГРОКА ---
    socket.on('playerAction', (data) => {
        let roomId = null;
        for (const r of socket.rooms) {
            if (r.startsWith('room_')) {
                roomId = r;
                break;
            }
        }
        
        const room = rooms[roomId];
        if (!room) return; 

        const currentPlayer = data.forcedRole ? room.players[data.forcedRole] : (room.players.p1.id === socket.id ? room.players.p1 : room.players.p2);
        const enemyPlayer = currentPlayer.role === 'p1' ? room.players.p2 : room.players.p1;

        if (data.type === 'fire') {
            const hitIndex = enemyPlayer.units.findIndex(u => !u.destroyed && u.x === data.x && u.y === data.y);
            
            if (hitIndex !== -1) {
                console.log(`Попадание по координатам X:${data.x}, Y:${data.y}`);
                enemyPlayer.units[hitIndex].destroyed = true;
                
                io.to(roomId).emit('fireResult', { result: 'hit', x: data.x, y: data.y, targetRole: enemyPlayer.role });

                const aliveUnits = enemyPlayer.units.filter(u => !u.destroyed);
                if (aliveUnits.length === 0) {
                    io.to(roomId).emit('gameOver', { winner: currentPlayer.id });
                    clearInterval(room.interval);
                    delete rooms[roomId];
                    return;
                }
            } else {
                io.to(roomId).emit('fireResult', { result: 'miss', x: data.x, y: data.y, targetRole: enemyPlayer.role });
            }
            
            // После выстрела отправляем обновленное замаскированное состояние игрокам
            sendMaskedStateToAll(room);
            switchTurn(room);
        }
        
        if (data.type === 'move') {
            const unit = currentPlayer.units[data.unitIndex];
            if (unit && !unit.destroyed) {
                unit.x = data.x;
                unit.y = data.y;
                
                // Отправляем замаскированное состояние после перемещения
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

        if (room.timer <= 0) {
            switchTurn(room);
        }
    }, 1000);
}

function switchTurn(room) {
    room.timer = 9; // Время на ход — 9 секунд
    const p1Id = room.players.p1.id;
    const p2Id = room.players.p2.id;
    room.turn = (room.turn === p1Id) ? p2Id : p1Id;

    io.to(room.roomId).emit('turnChanged', {
        turn: room.turn,
        timer: room.timer
    });
}

// Функция для раздельной отправки замаскированного состояния игрокам
function sendMaskedStateToAll(room) {
    const stateForP1 = getMaskedState(room, 'p1');
    const stateForP2 = getMaskedState(room, 'p2');
    
    io.to(room.players.p1.id).emit('gameStateUpdate', stateForP1);
    io.to(room.players.p2.id).emit('gameStateUpdate', stateForP2);
}

// Функция маскировки состояния комнаты (Туман войны)
function getMaskedState(room, role) {
    const state = JSON.parse(JSON.stringify(room));
    
    if (role === 'p1') {
        // Для p1 прячем живые пушки игрока p2
        state.players.p2.units = state.players.p2.units.map(u => {
            return u.destroyed ? u : { x: -1, y: -1, destroyed: false };
        });
    } else if (role === 'p2') {
        // Для p2 прячем живые пушки игрока p1
        state.players.p1.units = state.players.p1.units.map(u => {
            return u.destroyed ? u : { x: -1, y: -1, destroyed: false };
        });
    }
    return state;
}

// Запуск сервера на 3000 порту
server.listen(3000, () => {
    console.log('Сервер запущен на http://localhost:3000');
});
