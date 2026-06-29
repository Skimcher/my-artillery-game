const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {}; 
let waitingPlayer = null; // Сюда сажаем игрока, который ждет соперника

// Функция для создания пустого поля 8х8
function createEmptyGrid() {
    return Array(8).fill(null).map(() => Array(8).fill(0));
}

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Игрок запрашивает старт игры
    socket.on('joinGame', () => {
        if (!waitingPlayer) {
            // Если никого нет, создаем новую комнату
            const roomId = 'room_' + socket.id;
            waitingPlayer = { socket, roomId };
            socket.join(roomId);
            socket.emit('waiting', 'Ожидание соперника...');
        } else {
            // Если кто-то уже ждет, подключаем текущего игрока к нему
            const roomId = waitingPlayer.roomId;
            const player1 = waitingPlayer.socket;
            const player2 = socket;
            
            socket.join(roomId);
            waitingPlayer = null; // Сбрасываем ожидание

            // Инициализируем состояние игры для этой комнаты
            rooms[roomId] = {
                players: {
                    p1: { id: player1.id, units: [{x:1, y:1}, {x:1, y:6}] }, // Начальные точки артиллерии 1
                    p2: { id: player2.id, units: [{x:6, y:1}, {x:6, y:6}] }  // Начальные точки артиллерии 2
                },
                turn: player1.id, // Первый ход у Игрока 1
                timer: 9,
                roomId: roomId
            };

            // Оповещаем обоих, что игра началась, и передаем им их роли
            player1.emit('gameStart', { role: 'p1', state: rooms[roomId] });
            player2.emit('gameStart', { role: 'p2', state: rooms[roomId] });

            // Запускаем игровой цикл таймера для этой комнаты
            startGameTimer(roomId);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        if (waitingPlayer && waitingPlayer.socket.id === socket.id) {
            waitingPlayer = null;
        }
        // Здесь можно добавить логику уведомления соперника об уходе игрока
    });
});

function startGameTimer(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.interval = setInterval(() => {
        room.timer--;
        io.to(roomId).emit('timerUpdate', room.timer);

        if (room.timer <= 0) {
            // Время вышло — меняем ход
            room.timer = 9;
            const playerIds = Object.keys(room.players).map(k => room.players[k].id);
            room.turn = room.turn === playerIds[0] ? playerIds[1] : playerIds[0];
            
            io.to(roomId).emit('turnChanged', { turn: room.turn, timer: room.timer });
        }
    }, 1000);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
