// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- ЛОГИКА СОКЕТОВ ---
socket.on('connect', () => {
    console.log("Соединение установлено!");
    socket.emit('joinGame');
});

// ГЛАВНЫЙ ФИКС: ОБРАБОТКА НАЧАЛА ИГРЫ
socket.on('gameStart', (data) => {
    console.log("ПОЛУЧЕН GAME START:", data);
    
    // Скрываем экран CONNECTING
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.display = 'none';
    } else {
        // Если ID другой, пробуем скрыть через класс или просто убрать текст
        const body = document.body;
        body.innerHTML = ''; // ОЧИСТКА - для теста (если экран пропадет, значит событие работает)
    }
});

// Отладка
socket.on('connect_error', (err) => console.error("Ошибка сокета:", err));
