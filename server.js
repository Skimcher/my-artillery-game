const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {}; 
let waitingPlayer = null; 

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    socket.on('joinGame', () => {
        if (!waitingPlayer) {
            const roomId = 'room_' + socket.id;
            waitingPlayer = { socket, roomId };
            socket.join(roomId);
            socket.emit('waiting', 'Ожидание соперника...');
        } else {
            const roomId = waitingPlayer.roomId;
            const player1 = waitingPlayer.socket;
            const player2 = socket;
            
            socket.join(roomId);
            waitingPlayer = null; 

            rooms[roomId] = {
                players: {
                    p1: { id: player1.id, role: 'p1', units: [{x:1, y:1}, {x:1, y:6}] }, 
                    p2: { id: player2.id, role: 'p2', units: [{x:6, y:1}, {x:6, y:6}] }  
                },
                turn: player1.id, 
                timer: 9,
                roomId: roomId
            };

            player1.emit('gameStart', { role: 'p1', state: rooms[roomId] });
            player2.emit('gameStart', { role: 'p2', state: rooms[roomId] });

            startGameTimer(roomId);
        }
    });

    // --- ОБРАБОТКА ХОДА ИГРОКА (ВЫСТРЕЛ ИЛИ ДВИЖЕНИЕ) ---
  // --- ОБРАБОТКА ХОДА ИГРОКА (ВЫСТРЕЛ ИЛИ ДВИЖЕНИЕ) ---
    socket.on('playerAction', (data) => {
        // Гарантированный поиск игровой комнаты, отсекая собственный ID сокета
        let roomId = null;
        for (const r of socket.rooms) {
            if (r.startsWith('room_')) {
                roomId = r;
                break;
            }
        }
        
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id) return; 

        const isP1 = room.players.p1.id === socket.id;
        const currentPlayer = isP1 ? room.players.p1 : room.players.p2;
        const enemyPlayer = isP1 ? room.players.p2 : room.players.p1;

        let actionSuccess = false;

        if (data.type === 'fire') {
            const hitIndex = enemyPlayer.units.findIndex(u => u.x === data.x && u.y === data.y);
            if (hitIndex !== -1) {
                enemyPlayer.units.splice(hitIndex, 1); 
                if (enemyPlayer.units.length === 0) {
                    io.to(roomId).emit('gameOver', { winner: currentPlayer.id });
                    clearInterval(room.interval);
                    delete rooms[roomId];
                    return;
                }
            }
            actionSuccess = true;
        } 
        else if (data.type === 'move') {
            const unit = currentPlayer.units[data.unitIndex];
            if (unit) {
                const distanceX = Math.abs(unit.x - data.x);
                const distanceY = Math.abs(unit.y - data.y);

                if (distanceX <= 3 && distanceY <= 3) {
                    const cellBusy = currentPlayer.units.some((u, idx) => idx !== data.unitIndex && u.x === data.x && u.y === data.y);
                    if (!cellBusy) {
                        unit.x = data.x;
                        unit.y = data.y;
                        actionSuccess = true;
                    }
                }
            }
        }

        if (actionSuccess) {
            switchTurn(room);
        }
    });
        const room = rooms[roomId];

        if (!room || room.turn !== socket.id) return;

        if (!room || room.turn !== socket.id) return; // Защита: ходит только тот, чей ход

        // Определяем, кто ходит (p1 или p2) и кто соперник
        const isP1 = room.players.p1.id === socket.id;
        const currentPlayer = isP1 ? room.players.p1 : room.players.p2;
        const enemyPlayer = isP1 ? room.players.p2 : room.players.p1;

        let actionSuccess = false;

        if (data.type === 'fire') {
            // ЛОГИКА ВЫСТРЕЛА
            // Проверяем, есть ли вражеская пушка на этих координатах
            const hitIndex = enemyPlayer.units.findIndex(u => u.x === data.x && u.y === data.y);
            
            if (hitIndex !== -1) {
                console.log(`Попадание! В комнате ${roomId} уничтожена пушка на X:${data.x}, Y:${data.y}`);
                enemyPlayer.units.splice(hitIndex, 1); // Удаляем уничтоженную пушку
                
                // Проверяем условия победы
                if (enemyPlayer.units.length === 0) {
                    io.to(roomId).emit('gameOver', { winner: currentPlayer.id });
                    clearInterval(room.interval);
                    delete rooms[roomId];
                    return;
                }
            }
            actionSuccess = true;
        } 
        
        else if (data.type === 'move') {
            // ЛОГИКА ДВИЖЕНИЯ
            const unit = currentPlayer.units[data.unitIndex];
            if (unit) {
                // Вычисляем дистанцию движения (Math.abs возвращает модуль числа)
                const distanceX = Math.abs(unit.x - data.x);
                const distanceY = Math.abs(unit.y - data.y);

                // Движение максимум на 3 клетки в любую сторону
                if (distanceX <= 3 && distanceY <= 3) {
                    // Проверяем, не занята ли клетка нашей второй пушкой
                    const cellBusy = currentPlayer.units.some((u, idx) => idx !== data.unitIndex && u.x === data.x && u.y === data.y);
                    
                    if (!cellBusy) {
                        unit.x = data.x;
                        unit.y = data.y;
                        actionSuccess = true;
                    }
                }
            }
        }

        // Если действие выполнено успешно по правилам — передаем ход
        if (actionSuccess) {
            switchTurn(room);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            waitingPlayer = null;
        }
        // Если игрок вышел из активной игры, закрываем комнату
        const roomId = 'room_' + socket.id;
        if (rooms[roomId]) {
            clearInterval(rooms[roomId].interval);
            delete rooms[roomId];
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

// Функция смены хода
function switchTurn(room) {
    room.timer = 9; // Сброс таймера обратно на 9 сек
    const p1Id = room.players.p1.id;
    const p2Id = room.players.p2.id;
    
    // Меняем ID текущего игрока на противоположный
    room.turn = room.turn === p1Id ? p2Id : p1Id;

    // Рассылаем обновленное состояние игры и информацию о смене хода
    io.to(room.roomId).emit('gameStateUpdate', room);
    io.to(room.roomId).emit('turnChanged', { turn: room.turn, timer: room.timer });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
