const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const expressApp = express();
const server = http.createServer(expressApp);
const io = new Server(server);

expressApp.use(express.static('public'));

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
                    p1: { id: player1.id, role: 'p1', units: [{x:1, y:1, destroyed: false}, {x:1, y:6, destroyed: false}] }, 
                    p2: { id: player2.id, role: 'p2', units: [{x:6, y:1, destroyed: false}, {x:6, y:6, destroyed: false}] }  
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

        let actionSuccess = false;

        if (data.type === 'fire') {
            // Ищем только среди ЖИВЫХ пушек врага
            const hitIndex = enemyPlayer.units.findIndex(u => !u.destroyed && u.x === data.x && u.y === data.y);
            
            if (hitIndex !== -1) {
                console.log(`Попадание по координатам X:${data.x}, Y:${data.y}`);
                
                // Вместо удаления — помечаем уничтоженной
                enemyPlayer.units[hitIndex].destroyed = true;
                
                io.to(roomId).emit('fireResult', { result: 'hit', x: data.x, y: data.y, targetRole: enemyPlayer.role });

                // Проверяем, остались ли живые пушки
                const aliveUnits = enemyPlayer.units.filter(u => !u.destroyed);
                if (aliveUnits.length === 0) {
                    io.to(roomId).emit('gameOver', { winner: currentPlayer.id });
                    clearInterval(room.interval);
                    delete rooms[roomId];
                    return;
                }
            } else {
                console.log(`Промах по координатам X:${data.x}, Y:${data.y}`);
                io.to(roomId).emit('fireResult', { result: 'miss', x: data.x, y: data.y, targetRole: enemyPlayer.role });
            }
            actionSuccess = true;
        } 
        else if (data.type === 'move') {
            const unit = currentPlayer.units[data.unitIndex];
            // Уничтоженная пушка ходить не может!
            if (unit && !unit.destroyed) {
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

    socket.on('disconnect', () => {
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            waitingPlayer = null;
        }
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

function broadcastState(room) {
    const p1Socket = io.sockets.sockets.get(room.players.p1.id);
    const p2Socket = io.sockets.sockets.get(room.players.p2.id);

    if (p1Socket) p1Socket.emit('gameStateUpdate', getMaskedState(room, 'p1'));
    if (p2Socket) p2Socket.emit('gameStateUpdate', getMaskedState(room, 'p2'));
}

// Фильтрация тумана войны: отдаем свои пушки ВСЕГДА, а вражеские — ТОЛЬКО если они destroyed: true
function getMaskedState(room, targetRole) {
    const p1Filtered = room.players.p1.units.filter(u => targetRole === 'p1' || u.destroyed);
    const p2Filtered = room.players.p2.units.filter(u => targetRole === 'p2' || u.destroyed);

    return {
        turn: room.turn,
        timer: room.timer,
        players: {
            p1: { role: 'p1', units: p1Filtered },
            p2: { role: 'p2', units: p2Filtered }
        }
    };
}

function switchTurn(room) {
    room.timer = 9;
    const p1Id = room.players.p1.id;
    const p2Id = room.players.p2.id;
    
    room.turn = room.turn === p1Id ? p2Id : p1Id;

    broadcastState(room);
    io.to(room.roomId).emit('turnChanged', { turn: room.turn, timer: room.timer });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

process.on('uncaughtException', (err) => console.error(err));
process.on('unhandledRejection', (reason) => console.error(reason));
