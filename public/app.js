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

// --- СТИЛИ (Внедряются кодом) ---
const style = document.createElement('style');
style.innerHTML = `
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; position: fixed; background-color: #000; }
    #canvas-container { width: 100vw; height: 100vh; position: absolute; top: 0; left: 0; }
`;
document.head.appendChild(style);

// --- THREE.JS ---
const container = document.getElementById('canvas-container') || document.body;
const scene = new THREE.Scene();
const textureLoader = new THREE.TextureLoader();
textureLoader.load('/assets/background.jpg', (bgTexture) => { scene.background = bgTexture; });

const camera = new THREE.PerspectiveCamera(41, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 51.0, 44.5);
camera.lookAt(0, -2, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
dirLight.position.set(30, 60, 20);
scene.add(dirLight);

// --- ИНТЕРФЕЙС (Создается динамически) ---
const uiContainer = document.createElement('div');
uiContainer.id = 'ui-container';
uiContainer.style.cssText = 'position:absolute; top:15px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; width:100vw; pointer-events:none; z-index:9999;';
document.body.appendChild(uiContainer);

const turnIndicator = document.createElement('div');
turnIndicator.id = 'turn-indicator';
turnIndicator.style.cssText = 'font-family:sans-serif; font-weight:bold; color:#fff; text-shadow:2px 2px 4px #000;';
uiContainer.appendChild(turnIndicator);

const controls = document.createElement('div');
controls.id = 'controls';
controls.style.cssText = 'display:none; gap:15px; pointer-events:auto; margin-top:10px;';
uiContainer.appendChild(controls);

const btnFire = document.createElement('button');
btnFire.innerText = 'FIRE';
btnFire.style.cssText = 'padding:12px 24px; font-weight:bold; cursor:pointer; background:#2ed573; border:2px solid #fff; border-radius:6px;';
controls.appendChild(btnFire);

const btnMove = document.createElement('button');
btnMove.innerText = 'MOVE';
btnMove.style.cssText = 'padding:12px 24px; font-weight:bold; cursor:pointer; background:#333; border:2px solid #555; border-radius:6px;';
controls.appendChild(btnMove);

// --- ЛОГИКА ---
socket.emit('joinGame');

socket.on('gameStart', (data) => { 
    myRole = data.role; myId = socket.id; gameState = data.state;
    controls.style.display = 'flex'; // Показываем кнопки только при старте
    updateTurnUI(); 
    renderUnits(); 
});

socket.on('turnChanged', (data) => { 
    gameState.turn = data.turn; 
    hasDoneActionThisTurn = false; 
    updateTurnUI(); 
});

function updateTurnUI() {
    turnIndicator.innerText = (gameState.turn === myId) ? "YOUR TURN!" : "OPPONENT'S TURN...";
    controls.style.display = (gameState.turn === myId && !hasDoneActionThisTurn) ? 'flex' : 'none';
}

function renderUnits() {
    Object.keys(visualUnits).forEach(id => scene.remove(visualUnits[id]));
    if (!gameState || !gameState.players) return;
    // ... (код отрисовки юнитов из вашего исходника) ...
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
