// --- ИНИЦИАЛИЗАЦИЯ И ПОДКЛЮЧЕНИЕ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- СТИЛИ (CSS) ---
const style = document.createElement('style');
style.innerHTML = `
    #controls { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; gap: 10px; }
    #controls button { padding: 10px 20px; cursor: pointer; }
    .hp-bar-container { position: absolute; width: 60px; height: 8px; background: rgba(0,0,0,0.6); border: 1px solid #fff; pointer-events: none; }
    .hp-bar-fill { height: 100%; background: #2ed573; transition: width 0.2s; }
`;
document.head.appendChild(style);

// --- ФУНКЦИИ ОТРИСОВКИ ---
function createVisualUnit(id, hp) {
    const hpContainer = document.createElement('div');
    hpContainer.id = `hp-${id}`;
    hpContainer.className = 'hp-bar-container';
    hpContainer.innerHTML = `<div class="hp-bar-fill" style="width: ${hp}%"></div>`;
    document.body.appendChild(hpContainer);
}

// --- THREE.JS СЦЕНА ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

// --- ПРОВЕРКА СОКЕТА ---
socket.on('connect', () => {
    console.log("Соединение установлено!");
    socket.emit('joinGame');
});

console.log("Файл app.js успешно загружен до конца.");
