const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {};
let waitingPlayer = null;

const FIELD_SIZE = 25;
const UNIT_RADIUS = 1.5; // Модель 3м, радиус 1.5м
const DIRECT_RADIUS = 1.25; // Диаметр 2.5м -> радиус 1.25м
const SPLASH_RADIUS = 4.13; // Радиус осколков

function generateUnits() {
    const min = UNIT_RADIUS;
    const max = FIELD_SIZE - UNIT_RADIUS;
    const units = [];
    for(let i = 0; i < 2; i++) {
        units.push({
            x: min + Math.random() * (max - min),
            y: min + Math.random() * (max - min),
            hp: 100,
            destroyed: false
        });
    }
    return units;
}

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    if (!waitingPlayer) {
        waitingPlayer = socket;
        socket.emit('waiting');
    } else {
        const roomId = `room_${waitingPlayer.id}_${socket.id}`;
        const p1 = waitingPlayer;
        const p2 = socket;
        waitingPlayer = null;

        p1.join(roomId);
        p2.join(roomId);

        rooms[roomId] = {
            id: roomId,
            players: {
                p1: { id: p1.id, units: generateUnits() },
                p2: { id: p2.id, units: generateUnits() }
            },
            turn: p1.id,
            timer: 30,
            interval: null
        };

        p1.emit('gameStart', { role: 'p1', state: getMaskedState(rooms[roomId], 'p1') });
        p2.emit('gameStart', { role: 'p2', state: getMaskedState(rooms[roomId], 'p2') });

        startRoomTimer(roomId);
    }

    socket.on('playerAction', (data) => {
        const roomId = Array.from(socket.rooms).find(r => r.startsWith('room_'));
        if (!roomId || !rooms[roomId]) return;

        const room = rooms[roomId];
        if (room.turn !== socket.id) return;

        const myRole = room.players.p1.id === socket.id ? 'p1' : 'p2';
        const opponentRole = myRole === 'p1' ? 'p2' : 'p1';

        if (data.type === 'fire') {
            // Координаты приходят в метрах (0..25) относительно поля противника
            const targetUnits = room.players[opponentRole].units;
            
            io.to(roomId).emit('fireResult', {
                x: data.x,
                y: data.y,
                targetRole: opponentRole
            });

            targetUnits.forEach(unit => {
                if (unit.destroyed) return;
                const dist = Math.hypot(unit.x - data.x, unit.y - data.y);

                if (dist <= DIRECT_RADIUS) {
                    unit.hp = 0;
                    unit.destroyed = true;
                } else if (dist <= SPLASH_RADIUS) {
                    unit.hp = Math.max(0, unit.hp - 51);
                    if (unit.hp === 0) unit.destroyed = true;
                }
            });

            checkGameOver(roomId);
        } 
        else if (data.type === 'move') {
            const unit = room.players[myRole].units[data.unitIndex];
            if (unit && !unit.destroyed) {
                // Ограничиваем перемещение границами поля
                unit.x = Math.max(UNIT_RADIUS, Math.min(FIELD_SIZE - UNIT_RADIUS, data.x));
                unit.y = Math.max(UNIT_RADIUS, Math.min(FIELD_SIZE - UNIT_RADIUS, data.y));
            }
        }

        switchTurn(roomId);
    });

    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
            return;
        }
        const roomId = Object.keys(rooms).find(r => rooms[r].players.p1.id === socket.id || rooms[r].players.p2.id === socket.id);
        if (roomId) {
            clearInterval(rooms[roomId].interval);
            io.to(roomId).emit('gameOver', { winner: 'opponent_disconnected' });
            delete rooms[roomId];
        }
    });
});

function switchTurn(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    room.turn = room.turn === room.players.p1.id ? room.players.p2.id : room.players.p1.id;
    room.timer = 30;
    
    sendStateUpdate(roomId);
}

function startRoomTimer(roomId) {
    const room = rooms[roomId];
    room.interval = setInterval(() => {
        if (!rooms[roomId]) return;
        room.timer--;
        io.to(roomId).emit('timerUpdate', room.timer);
        if (room.timer <= 0) {
            switchTurn(roomId);
        }
    }, 1000);
}

function sendStateUpdate(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const p1Socket = io.sockets.sockets.get(room.players.p1.id);
    const p2Socket = io.sockets.sockets.get(room.players.p2.id);

    if (p1Socket) p1Socket.emit('turnChanged', { turn: room.turn, state: getMaskedState(room, 'p1'), timer: room.timer });
    if (p2Socket) p2Socket.emit('turnChanged', { turn: room.turn, state: getMaskedState(room, 'p2'), timer: room.timer });
}

function checkGameOver(roomId) {
    const room = rooms[roomId];
    const p1Dead = room.players.p1.units.every(u => u.destroyed);
    const p2Dead = room.players.p2.units.every(u => u.destroyed);

    if (p1Dead || p2Dead) {
        clearInterval(room.interval);
        let winner = null;
        if (p1Dead && !p2Dead) winner = room.players.p2.id;
        if (p2Dead && !p1Dead) winner = room.players.p1.id;
        io.to(roomId).emit('gameOver', { winner: winner });
        delete rooms[roomId];
    }
}

function getMaskedState(room, viewerRole) {
    const opponentRole = viewerRole === 'p1' ? 'p2' : 'p1';
    return {
        turn: room.turn,
        players: {
            [viewerRole]: room.players[viewerRole],
            [opponentRole]: {
                id: room.players[opponentRole].id,
                units: room.players[opponentRole].units.map(u => u.destroyed ? { ...u } : { x: -1000, y: -1000, hp: u.hp, destroyed: false })
            }
        }
    };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
