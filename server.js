const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {}; // Хранилище игровых комнат

io.on('connection', (socket) => {
    console.log(`Игрок подключился: ${socket.id}`);

    // Логика поиска комнаты и старта игры
    socket.on('joinGame', () => {
        // Находим свободную комнату или создаем новую
        // Инициализируем поле 8х8 и 2 артиллерии для каждого
    });

    // Получение действия от игрока (Fire или Move)
    socket.on('playerAction', (data) => {
        // data = { type: 'fire' или 'move', targetX, targetY, unitId }
        // 1. Проверяем, его ли сейчас ход и укладывается ли в 9 секунд
        // 2. Если move: проверяем, что дистанция <= 3 клеток
        // 3. Если fire: проверяем попадание по координатам врага
        // 4. Переключаем ход, сбрасываем таймер и отправляем обновления обоим игрокам
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        // Логика завершения игры при выходе соперника
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
