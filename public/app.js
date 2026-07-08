// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- SCENE SETUP ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

camera.position.set(0, 40, 40);
camera.lookAt(0, 0, 0);

const light = new THREE.AmbientLight(0xffffff, 1);
scene.add(light);

// Загрузка модели танка (используйте ваш URL)
const loader = new THREE.GLTFLoader();
let tankTemplate = null;
loader.load('https://artillery-game2.onrender.com/models/sau.glb', (gltf) => {
    tankTemplate = gltf.scene;
});

// --- ЛОГИКА ---
socket.on('connect', () => socket.emit('joinGame'));

socket.on('gameStart', (data) => renderGame(data.state));
socket.on('gameStateUpdate', (state) => renderGame(state));

function renderGame(state) {
    // Удаляем старые юниты (ищем группы, которые мы создали ранее)
    scene.children.filter(obj => obj.type === 'Group').forEach(obj => scene.remove(obj));
    
    if (!state || !state.players) return;
    
    Object.keys(state.players).forEach(role => {
        state.players[role].units.forEach(unit => {
            if (unit.destroyed) return;
            
            if (tankTemplate) {
                const tank = tankTemplate.clone();
                // Координаты (подправьте смещение, если нужно)
                tank.position.set(unit.x - 10, 0, unit.y - 10); 
                scene.add(tank);
            }
        });
    });
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
