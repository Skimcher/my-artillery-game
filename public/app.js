// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- СЦЕНА ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.set(0, 50, 50);
camera.lookAt(0, 0, 0);

// --- ОБРАБОТКА СОБЫТИЙ ---
socket.on('gameStart', (data) => {
    console.log("Игра началась, скрываю загрузчик...");
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'none';
    
    // Отрисовываем состояние, которое прислал сервер
    renderUnits(data.state);
});

socket.on('gameStateUpdate', (state) => {
    renderUnits(state);
});

socket.on('turnChanged', (data) => {
    console.log("Ход изменен:", data);
    renderUnits(data.state);
});

// --- ФУНКЦИЯ ОТРИСОВКИ ---
function renderUnits(state) {
    // 1. Очищаем сцену от старых танков (кроме света/полей)
    scene.children.filter(c => c.type === 'Group').forEach(c => scene.remove(c));
    
    // 2. Рисуем юнитов из state
    if (state && state.players) {
        Object.keys(state.players).forEach(role => {
            state.players[role].units.forEach(unit => {
                if (unit.destroyed) return;
                const geometry = new THREE.BoxGeometry(2, 2, 2);
                const material = new THREE.MeshBasicMaterial({ color: role === 'p1' ? 0x0000ff : 0xff0000 });
                const box = new THREE.Mesh(geometry, material);
                box.position.set(unit.x - 10, 1, unit.y - 10); // Упрощенная координата
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
