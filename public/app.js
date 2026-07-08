// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- ЛОГИКА ---
socket.on('connect', () => {
    console.log("Соединение установлено!");
    socket.emit('joinGame');
});

// ГЛАВНЫЙ ФИКС: Убираем всё, что мешает
socket.on('gameStart', (data) => {
    console.log("ПОЛУЧЕН GAME START, переключаю интерфейс...");
    
    // 1. Попробуем скрыть конкретный контейнер
    const uiContainer = document.getElementById('ui-container');
    if (uiContainer) {
        uiContainer.style.display = 'none';
        console.log("Скрыт #ui-container");
    }
    
    // 2. Если не помогло, очистим всё тело документа, чтобы оставить только canvas
    // (это гарантированно уберет надпись CONNECTING...)
    const bodyChildren = document.body.children;
    for (let i = 0; i < bodyChildren.length; i++) {
        if (bodyChildren[i].tagName !== 'CANVAS' && bodyChildren[i].tagName !== 'SCRIPT') {
            bodyChildren[i].style.display = 'none';
        }
    }
    
    console.log("Интерфейс обновлен, игра готова.");
});

socket.on('connect_error', (err) => console.error("Ошибка сокета:", err));
