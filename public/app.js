// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- СТИЛИ (ВСТРОЕННЫЕ) ---
const style = document.createElement('style');
style.innerHTML = `
    #controls { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); z-index: 1000; display: flex; gap: 15px; }
    #controls button { padding: 12px 25px; cursor: pointer; }
    .hp-bar-container { position: absolute; width: 60px; height: 8px; background: rgba(0,0,0,0.6); border: 1px solid #fff; z-index: 900; pointer-events: none; }
    .hp-bar-fill { height: 100%; background: #2ed573; transition: width 0.2s; }
`;
document.head.appendChild(style);

// --- СОЗДАНИЕ HP ---
function createVisualUnit(id, serverX, serverY, ringColor, isDestroyed, owner, hp) {
    const hpContainer = document.createElement('div');
    hpContainer.id = `hp-${id}`;
    hpContainer.className = 'hp-bar-container';
    hpContainer.innerHTML = `<div class="hp-bar-fill" style="width: ${hp}%"></div>`;
    document.body.appendChild(hpContainer);
}

// --- ОСНОВНОЙ ЦИКЛ (МИНИМУМ) ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(41, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

console.log("Игра загружена успешно!");
