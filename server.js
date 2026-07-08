const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// БРОНЕБОЙНАЯ НАСТРОЙКА CORS для Itch.io фреймов
const io = require('socket.io')(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

app.use(express.static(path.join(__dirname, 'public')));

const FIELD_SIZE = 25;
let waitingPlayer = null;
const activeGames = {}; // room -> game state

// ТАЙМИНГИ ИЗМЕНЕНЫ ПО ВАШЕМУ ТРЕБОВАНИЮ:
const TURN_TIME_LIMIT = 9;      // Время на ход: 9 секунд
const MATCHMAKING_TIMEOUT = 300; // Время ожидания соперника: 300 секунд

let matchmakingTimers = {};

function getRandomPosition() {
    const min = 2;
    const max = FIELD_SIZE - 2;
    return Math.random() * (max - min) + min;
}

function createInitialState(p1Id, p2Id) {
    return {
        turn: p1Id,
        players: {
            p1: {
                id: p1Id,
                units: [
                    { x: getRandomPosition(), y: getRandomPosition(), hp: 100, destroyed: false },
                    { x: getRandomPosition(), y: getRandomPosition(), hp: 100, destroyed: false }
                ]
            },
            p2: {
                id: p2Id,
                units: [
                    { x: getRandomPosition(), y: getRandomPosition(), hp: 100, destroyed: false },
                    { x: getRandomPosition(), y: getRandomPosition(), hp: 100, destroyed: false }
                ]
            }
        },
        timer: TURN_TIME_LIMIT
    };
}

let timerIntervals = {};
function startTurnTimer(room) {
    if (timerIntervals[room]) clearInterval(timerIntervals[room]);
    
    timerIntervals[room] = setInterval(() => {
        const state = activeGames[room];
        if (!state) {
            clearInterval(timerIntervals[room]);
            return;
        }
        
        state.timer--;
        io.to(room).emit('timerUpdate', state.timer);
        
        if (state.timer <= 0) {
            state.turn = (state.turn === state.players.p1.id) ? state.players.p2.id : state.players.p1.id;
            state.timer = TURN_TIME_LIMIT;
            io.to(room).emit('turnChanged', { turn: state.turn, timer: state.timer, state: state });
        }
    }, 1000);
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on('joinGame', () => {
        if (!waitingPlayer) {
            waitingPlayer = socket;
            socket.emit('waiting');

            // Запускаем таймер ожидания на 300 секунд для первого игрока
            matchmakingTimers[socket.id] = setTimeout(() => {
                if (waitingPlayer && waitingPlayer.id === socket.id) {
                    waitingPlayer.emit('gameOver', { winner: 'timeout' });
                    waitingPlayer = null;
                }
                delete matchmakingTimers[socket.id];
            }, MATCHMAKING_TIMEOUT * 1000);

        } else {
            // Очищаем таймер ожидания, так как соперник нашелся
            if (matchmakingTimers[waitingPlayer.id]) {
                clearTimeout(matchmakingTimers[waitingPlayer.id]);
                delete matchmakingTimers[waitingPlayer.id];
            }

            const p1 = waitingPlayer;
            const p2 = socket;
            const room = `room_${p1.id}_${p2.id}`;

            p1.join(room);
            p2.join(room);

            p1.gameState = { room, role: 'p1' };
            p2.gameState = { room, role: 'p2' };

            const initialState = createInitialState(p1.id, p2.id);
            activeGames[room] = initialState;

            p1.emit('gameStart', { role: 'p1', state: initialState });
            p2.emit('gameStart', { role: 'p2', state: initialState });

            waitingPlayer = null;
            startTurnTimer(room);
        }
    });

    socket.on('playerAction', (action) => {
        if (!socket.gameState) return;
        const { room, role } = socket.gameState;
        const state = activeGames[room];

        if (!state || state.turn !== socket.id) return;

        const opponentRole = (role === 'p1') ? 'p2' : 'p1';

        if (action.type === 'fire') {
            io.to(room).emit('fireResult', {
                x: action.x,
                y: action.y,
                targetRole: opponentRole,
                result: 'splash'
            });

            state.players[opponentRole].units.forEach(unit => {
                if (unit.destroyed) return;
                const dist = Math.sqrt(Math.pow(unit.x - action.x, 2) + Math.pow(unit.y - action.y, 2));
                if (dist <= 0.97) {
                    unit.hp -= 50;
                } else if (dist <= 4.13) {
                    unit.hp -= 25;
                }
                if (unit.hp <= 0) {
                    unit.hp = 0;
                    unit.destroyed = true;
                }
            });
        } 
        else if (action.type === 'move') {
            const unit = state.players[role].units[action.unitIndex];
            if (unit && !unit.destroyed) {
                unit.x = Math.max(0.5, Math.min(FIELD_SIZE - 0.5, action.x));
                unit.y = Math.max(0.5, Math.min(FIELD_SIZE - 0.5, action.y));
            }
        }

        const opponentAlive = state.players[opponentRole].units.some(u => !u.destroyed);
        if (!opponentAlive) {
            clearInterval(timerIntervals[room]);
            io.to(room).emit('gameOver', { winner: socket.id });
            delete activeGames[room];
            return;
        }

        state.turn = state.players[opponentRole].id;
        state.timer = TURN_TIME_LIMIT;
        io.to(room).emit('turnChanged', { turn: state.turn, timer: state.timer, state: state });
    });

    socket.on('disconnect', () => {
        if (matchmakingTimers[socket.id]) {
            clearTimeout(matchmakingTimers[socket.id]);
            delete matchmakingTimers[socket.id];
        }
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        if (socket.gameState) {
            const { room } = socket.gameState;
            clearInterval(timerIntervals[room]);
            io.to(room).emit('gameOver', { winner: 'system' });
            delete activeGames[room];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
