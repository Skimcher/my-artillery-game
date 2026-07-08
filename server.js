const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка CORS для работы со всеми доменами, включая фреймы itch.io
const io = socketIo(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

app.use(express.static(path.join(__dirname, 'public')));

// --- GAME CONFIGURATION ---
const FIELD_SIZE = 25;
const TURN_TIME_LIMIT = 30; // Секунд на ход
const MATCHMAKING_TIMEOUT = 300; // 5 минут ожидания оппонента

let waitingPlayer = null;
const activeGames = {}; 

function createInitialUnits() {
    return [
        { x: 5,  y: 5,  hp: 100, destroyed: false },
        { x: 12, y: 5,  hp: 100, destroyed: false },
        { x: 20, y: 5,  hp: 100, destroyed: false }
    ];
}

// --- NETWORKING LOGIC ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('joinGame', () => {
        // Если игрок уже в активной игре, игнорируем повторный вход
        if (socket.gameId) return;

        if (!waitingPlayer) {
            // Игрок становится в очередь
            waitingPlayer = socket;
            socket.emit('waiting');
            console.log(`Player ${socket.id} is waiting for an opponent...`);

            // Запускаем 300-секундный таймер ожидания матча
            socket.matchmakingTimerValue = MATCHMAKING_TIMEOUT;
            socket.matchmakingInterval = setInterval(() => {
                socket.matchmakingTimerValue--;
                if (socket.matchmakingTimerValue <= 0) {
                    clearInterval(socket.matchmakingInterval);
                    if (waitingPlayer && waitingPlayer.id === socket.id) {
                        socket.emit('gameOver', { winner: 'timeout' });
                        waitingPlayer = null;
                    }
                }
            }, 1000);

        } else {
            // Нашелся соперник, создаем комнату
            if (waitingPlayer.id === socket.id) return; 

            const p1 = waitingPlayer;
            const p2 = socket;
            clearInterval(p1.matchmakingInterval); // Отменяем таймер ожидания

            waitingPlayer = null;
            const gameId = `game_${p1.id}_${p2.id}`;

            p1.gameId = gameId;
            p2.gameId = gameId;
            p1.role = 'p1';
            p2.role = 'p2';

            p1.join(gameId);
            p2.join(gameId);

            const initialGameState = {
                turn: p1.id, // Первым ходит P1
                timer: TURN_TIME_LIMIT,
                players: {
                    p1: { id: p1.id, units: createInitialUnits() },
                    p2: { id: p2.id, units: createInitialUnits() }
                }
            };

            activeGames[gameId] = {
                state: initialGameState,
                p1: p1,
                p2: p2,
                timerInterval: null
            };

            // Отправляем событие старта обоим игрокам
            p1.emit('gameStart', { role: 'p1', state: initialGameState });
            p2.emit('gameStart', { role: 'p2', state: initialGameState });

            console.log(`Game started: ${gameId}`);
            startGameTimer(gameId);
        }
    });

    socket.on('playerAction', (action) => {
        const gameId = socket.gameId;
        if (!gameId || !activeGames[gameId]) return;

        const game = activeGames[gameId];
        if (game.state.turn !== socket.id) return; // Не твой ход!

        const currentRole = socket.role; 
        const opponentRole = (currentRole === 'p1') ? 'p2' : 'p1';

        if (action.type === 'fire') {
            // Проверка координат внутри границ поля
            if (action.x < 0 || action.x > FIELD_SIZE || action.y < 0 || action.y > FIELD_SIZE) return;

            let hitType = 'miss';
            const opponentUnits = game.state.players[opponentRole].units;

            opponentUnits.forEach(unit => {
                if (unit.destroyed) return;

                // Считаем дистанцию до цели
                const dist = Math.hypot(unit.x - action.x, unit.y - action.y);

                if (dist <= 0.97) { // Прямое попадание (DIRECT_RADIUS)
                    unit.hp -= 50;
                    hitType = 'direct';
                } else if (dist <= 4.13) { // Осколки (SPLASH_RADIUS)
                    unit.hp -= 20;
                    if (hitType !== 'direct') hitType = 'splash';
                }

                if (unit.hp <= 0) {
                    unit.hp = 0;
                    unit.destroyed = true;
                }
            });

            // Транслируем результат выстрела в комнату
            io.to(gameId).emit('fireResult', {
                x: action.x,
                y: action.y,
                targetRole: opponentRole,
                result: hitType
            });

            checkWinCondition(gameId);
            if (activeGames[gameId]) switchTurn(gameId);

        } else if (action.type === 'move') {
            const unitIndex = action.unitIndex;
            const myUnits = game.state.players[currentRole].units;

            if (!myUnits[unitIndex] || myUnits[unitIndex].destroyed) return;
            if (action.x < 0 || action.x > FIELD_SIZE || action.y < 0 || action.y > FIELD_SIZE) return;

            // Перемещаем юнит на сервере
            myUnits[unitIndex].x = action.x;
            myUnits[unitIndex].y = action.y;

            io.to(gameId).emit('gameStateUpdate', game.state);
            switchTurn(gameId);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);

        // Если отключился игрок из очереди
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            clearInterval(socket.matchmakingInterval);
            waitingPlayer = null;
            return;
        }

        // Если отключился игрок из активной сессии
        const gameId = socket.gameId;
        if (gameId && activeGames[gameId]) {
            const game = activeGames[gameId];
            clearInterval(game.timerInterval);

            // Оповещаем оставшегося игрока о технической победе
            socket.to(gameId).emit('gameOver', { winner: 'system' });

            if (game.p1) delete game.p1.gameId;
            if (game.p2) delete game.p2.gameId;
            delete activeGames[gameId];
        }
    });
});

// --- CORE GAME ENGINE TIMERS ---
function startGameTimer(gameId) {
    const game = activeGames[gameId];
    if (!game) return;

    clearInterval(game.timerInterval);
    game.state.timer = TURN_TIME_LIMIT;

    game.timerInterval = setInterval(() => {
        game.state.timer--;
        io.to(gameId).emit('timerUpdate', game.state.timer);

        if (game.state.timer <= 0) {
            // Время вышло — автоматически передаем ход сопернику
            switchTurn(gameId);
        }
    }, 1000);
}

function switchTurn(gameId) {
    const game = activeGames[gameId];
    if (!game) return;

    // Меняем id активного игрока местами
    const currentTurnId = game.state.turn;
    const nextTurnId = (currentTurnId === game.p1.id) ? game.p2.id : game.p1.id;
    game.state.turn = nextTurnId;

    startGameTimer(gameId);

    io.to(gameId).emit('turnChanged', {
        turn: game.state.turn,
        timer: game.state.timer,
        state: game.state
    });
}

function checkWinCondition(gameId) {
    const game = activeGames[gameId];
    if (!game) return;

    const p1AllDead = game.state.players.p1.units.every(u => u.destroyed);
    const p2AllDead = game.state.players.p2.units.every(u => u.destroyed);

    if (p1AllDead || p2AllDead) {
        clearInterval(game.timerInterval);
        let winnerId = null;

        if (p1AllDead && p2AllDead) winnerId = 'draw'; // Маловероятно, но на случай взаимного уничтожения
        else winnerId = p1AllDead ? game.p2.id : game.p1.id;

        io.to(gameId).emit('gameOver', { winner: winnerId });

        delete game.p1.gameId;
        delete game.p2.gameId;
        delete activeGames[gameId];
    }
}

// --- START SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
