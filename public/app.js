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

// --- ЛОГИКА ---
socket.on('connect', () => {
    console.log("Соединение установлено, запрашиваем игру...");
    socket.emit('joinGame');
});

// Слушаем обновление состояния
socket.on('gameStart', (data) => {
    console.log("Игра началась:", data);
    renderGame(data.state);
});

socket.on('gameStateUpdate', (state) => {
    renderGame(state);
});

// ФУНКЦИЯ ОТРИСОВКИ (Очищает сцену и рисует заново)
function renderGame(state) {
    // 1. Удаляем старые объекты (кубики)
    scene.children.filter(obj => obj.type === 'Mesh').forEach(obj => scene.remove(obj));

    // 2. Рисуем юнитов
    if (state && state.players) {
        Object.keys(state.players).forEach(role => {
            state.players[role].units.forEach(unit => {
                if (unit.destroyed) return;
                const geometry = new THREE.BoxGeometry(2, 2, 2);
                const material = new THREE.MeshBasicMaterial({ color: role === 'p1' ? 0x0000ff : 0xff0000 });
                const box = new THREE.Mesh(geometry, material);
                box.position.set(unit.x - 10, 1, unit.y - 10);
                scene.add(box);
            });
        });
    }
}

// --- ЦИКЛ ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
