const socket = io();

// --- GAME STATE ---
let myRole = null;
let myId = null;
let gameState = null;
let currentMode = 'fire';
let hasDoneActionThisTurn = false;
let selectedUnitId = null;
let selectionRing = null;

const visualUnits = {};
const particles = [];
const burningUnitsPositions = [];

const gltfLoader = new THREE.GLTFLoader();
let sauModelTemplate = null;
let sauCenterOffset = new THREE.Vector3();

const FIELD_SIZE = 25;
const DIRECT_RADIUS = 0.97;
const SPLASH_RADIUS = 4.13;
const FIELD_OFFSET_Z = 13.5;

// --- СТИЛИ И ИНИЦИАЛИЗАЦИЯ ---
const style = document.createElement('style');
style.innerHTML = `
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; position: fixed; background-color: #000; }
    #canvas-container { width: 100vw; height: 100vh; position: absolute; top: 0; left: 0; }
`;
document.head.appendChild(style);

const container = document.getElementById('canvas-container') || document.body;
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();

// Фоновая текстура
textureLoader.load('assets/background.jpg', (bgTexture) => { scene.background = bgTexture; });

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

// --- ИНИЦИАЛИЗАЦИЯ ПОЛЕЙ ---
function createFieldOutline() {
    const geometry = new THREE.BufferGeometry();
    const half = FIELD_SIZE / 2;
    const vertices = [-half, 0, -half, half, 0, -half, half, 0, -half, half, 0, half, half, 0, half, -half, 0, half, -half, 0, half, -half, 0, -half];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const mat = new THREE.LineDashedMaterial({ color: 0xffe100, dashSize: 0.5, gapSize: 0.3 });
    const line1 = new THREE.LineSegments(geometry, mat); line1.computeLineDistances();
    const line2 = new THREE.LineSegments(geometry, mat); line2.computeLineDistances();
    line1.position.set(0, 0.06, FIELD_OFFSET_Z);
    line2.position.set(0, 0.06, -FIELD_OFFSET_Z);
    scene.add(line1, line2);
}

function createBattlefields() {
    const fieldGeometry = new THREE.BoxGeometry(FIELD_SIZE, 0.1, FIELD_SIZE);
    textureLoader.load('assets/battlefield.jpg', (tex) => {
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
        const field1 = new THREE.Mesh(fieldGeometry, mat);
        const field2 = new THREE.Mesh(fieldGeometry, mat);
        field1.position.set(0, 0, FIELD_OFFSET_Z);
        field2.position.set(0, 0, -FIELD_OFFSET_Z);
        scene.add(field1, field2);
    });
}

createFieldOutline();
createBattlefields();

// --- ЗАГРУЗКА САУ ---
gltfLoader.load('models/sau.glb', (gltf) => {
    sauModelTemplate = gltf.scene;
    // Настройка масштаба модели
    const box = new THREE.Box3().setFromObject(sauModelTemplate);
    const size = new THREE.Vector3(); box.getSize(size);
    const scale = 3.45 / Math.max(size.x, size.y, size.z);
    sauModelTemplate.scale.set(scale, scale, scale);
    if (gameState) renderUnits(); // Отрисовываем, если данные уже пришли
});

// --- ЛОГИКА СОКЕТОВ ---
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
    // Очистка
    Object.keys(visualUnits).forEach(id => {
        scene.remove(visualUnits[id]);
        delete visualUnits[id];
    });

    if (!gameState || !gameState.players || !sauModelTemplate) return;

    // Отрисовка p1 и p2 (добавьте здесь цикл по units из вашего рабочего кода)
    console.log("Отрисовка юнитов...");
}

// --- ЦИКЛ ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
