// --- ИНИЦИАЛИЗАЦИЯ СОКЕТОВ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- ИНИЦИАЛИЗАЦИЯ THREE.JS ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.set(0, 50, 50);
camera.lookAt(0, 0, 0);

// --- ЛОГИКА ---
socket.on('connect', () => {
    console.log("Соединение установлено!");
    socket.emit('joinGame');
});

socket.on('gameStart', (data) => {
    console.log("ПОЛУЧЕН GAME START, запускаю рендеринг:", data);
    
    // ПРИНУДИТЕЛЬНАЯ ОЧИСТКА ЭКРАНА
    // Убираем всё содержимое body, чтобы исчезла надпись CONNECTING...
    document.body.innerHTML = ''; 
    document.body.appendChild(renderer.domElement);
    
    // Рисуем игру
    renderGame(data.state);
});

socket.on('gameStateUpdate', (state) => {
    renderGame(state);
});

// ФУНКЦИЯ ОТРИСОВКИ
function renderGame(state) {
    // Удаляем старые объекты (кубики)
    scene.children.filter(obj => obj.type === 'Mesh').forEach(obj => scene.remove(obj));
    
    // Рисуем юнитов из state
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

// ЦИКЛ АНИМАЦИИ
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
