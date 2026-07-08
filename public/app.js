const socket = io();

// Состояние
let myRole = null, myId = null, gameState = null;
let currentMode = 'fire', hasDoneActionThisTurn = false, selectedUnitId = null, selectionRing = null;

const visualUnits = {}, particles = [], burningUnitsPositions = [];
const scene = new THREE.Scene();
const gltfLoader = new THREE.GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// --- ЗАГРУЗЧИК ---
const manager = new THREE.LoadingManager();
manager.onLoad = () => { console.log("Все ресурсы загружены, запускаем рендер!"); };

// Настройка сцены
const container = document.getElementById('canvas-container');
const camera = new THREE.PerspectiveCamera(41, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 51.0, 44.5);
camera.lookAt(0, -2, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
dirLight.position.set(30, 60, 20);
scene.add(dirLight);

// --- ИНИЦИАЛИЗАЦИЯ ---
function initWorld() {
    // Поля
    textureLoader.load('assets/battlefield.jpg', (tex) => {
        const mat = new THREE.MeshStandardMaterial({ map: tex });
        const geo = new THREE.BoxGeometry(25, 0.1, 25);
        const f1 = new THREE.Mesh(geo, mat); f1.position.set(0, 0, 13.5);
        const f2 = new THREE.Mesh(geo, mat); f2.position.set(0, 0, -13.5);
        scene.add(f1, f2);
    });

    // Модель
    gltfLoader.load('models/sau.glb', (gltf) => {
        window.sauModelTemplate = gltf.scene;
    });
}

// --- СЕТЬ ---
socket.on('gameStart', (data) => {
    myRole = data.role;
    myId = socket.id;
    gameState = data.state;
    renderUnits();
});

socket.on('gameStateUpdate', (newState) => {
    gameState = newState;
    renderUnits();
});

function renderUnits() {
    if (!window.sauModelTemplate) return; // Ждем модель
    
    // Очистка старых объектов
    Object.keys(visualUnits).forEach(id => scene.remove(visualUnits[id]));
    
    // Цикл отрисовки из вашего исходника
    if (gameState && gameState.players) {
        // ... (здесь ваша логика createVisualUnit) ...
    }
}

// Запуск
initWorld();
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
