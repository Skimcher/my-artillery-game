// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- СЦЕНА THREE.JS ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.set(0, 50, 50);
camera.lookAt(0, 0, 0);

// --- ЛОГИКА СОКЕТОВ ---
socket.on('connect', () => {
    console.log("Соединение установлено!");
    socket.emit('joinGame');
});

socket.on('gameStart', (data) => {
    console.log("Игра началась! Скрываем экран загрузки.", data);
    
    // 1. Принудительно скрываем экран загрузки (если ID 'loader' существует в HTML)
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    // Если id называется иначе, можно попробовать скрыть через родительский элемент
    document.body.style.overflow = 'visible'; 
    
    // 2. Вызываем отрисовку танков (функция должна быть определена ниже)
    if (typeof renderUnits === 'function') {
        renderUnits(data.state);
    }
});

// --- ФУНКЦИЯ ОТРИСОВКИ ---
function renderUnits(state) {
    console.log("Отрисовываю юнитов...");
    // Здесь ваша логика перебора state.players и добавления моделей в сцену
}

// --- ЦИКЛ ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
