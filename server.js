const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

// БРОНЕБОЙНАЯ НАСТРОЙКА CORS: разрешаем любые внешние подключения и фреймы Itch.io
const io = require('socket.io')(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

// Отдача статических файлов из папки public
app.use(express.static(path.join(__dirname, 'public')));

// --- ИГРОВАЯ ЛОГИКА СЕРВЕРА ---
const FIELD_SIZE = 25;
let waitingPlayer = null;
const activeGames = {}; // room -> game state

function createInitialState(p1Id, p2Id) {
    return {
        turn: p1Id,
        players: {
            p1: {
                id: p1Id,
                units: [
                    { x: 5,  y: 5,  hp: 100, destroyed: false },
                    { x: 12, y: 5,  hp: 100, destroyed: false },
                    { x: 20, y: 5,  hp: 100, destroyed: false }
                ]
            },
            p2: {
                id: p2Id,
                units: [
                    { x: 5,  y: 20, hp: 100, destroyed: false },
                    { x: 12, y: 20, hp: 100, destroyed: false },
                    { x: 20, y: 20, hp: 100, destroyed: false }
                ]
            }
        },
        timer: 30
    };
}

// Управление комнатами и таймерами
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
            // Смена хода по таймауту
            state.turn = (state.turn === state.players.p1.id) ? state.players.p2.id : state.players.p1.id;
            state.timer = 30;
            io.to(room).emit('turnChanged', { turn: state.turn, timer: state.timer, state: state });
        }
    }, 1000);
}

io.on('connection', (socket) => {
    console.log(`Пользователь подключился: ${socket.id}`);

    socket.on('joinGame', () => {
        if (!waitingPlayer) {
            waitingPlayer = socket;
            socket.emit('waiting');
        } else {
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

            // Расчет урона юнитам противника
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
                unit.x = Math.max(0, Math.min(FIELD_SIZE, action.x));
                unit.y = Math.max(0, Math.min(FIELD_SIZE, action.y));
            }
        }

        // Проверка на окончание игры
        const opponentAlive = state.players[opponentRole].units.some(u => !u.destroyed);
        if (!opponentAlive) {
            clearInterval(timerIntervals[room]);
            io.to(room).emit('gameOver', { winner: socket.id });
            delete activeGames[room];
            return;
        }

        // Передача хода
        state.turn = state.players[opponentRole].id;
        state.timer = 30;
        io.to(room).emit('turnChanged', { turn: state.turn, timer: state.timer, state: state });
    });

    socket.on('disconnect', () => {
        console.log(`Пользователь отключился: ${socket.id}`);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
        if (socket.gameState) {
            const { room } = socket.gameState;
            clearInterval(timerIntervals[room]);
            io.to(room).emit('gameOver', { winner: 'system', reason: 'Opponent disconnected' });
            delete activeGames[room];
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
