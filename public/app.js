// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- ОТЛАДОЧНЫЙ ЛОГ ВСЕХ СОБЫТИЙ ---
socket.onAny((event, ...args) => {
    console.log("ПРИШЛО СОБЫТИЕ:", event, args);
});

// --- ЛОГИКА ---
socket.on('connect', () => {
    console.log("Соединение с сервером установлено, отправляю joinGame...");
    socket.emit('joinGame');
});

socket.on('gameStart', (data) => {
    console.log("СЕРВЕР ПРИСЛАЛ gameStart:", data);
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    
    // Если игра началась, пробуем отрисовать юнитов
    if (typeof renderUnits === 'function') {
        renderUnits();
    }
});

socket.on('connect_error', (err) => {
    console.error("ОШИБКА СОЕДИНЕНИЯ:", err);
});
