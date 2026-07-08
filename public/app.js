// --- ИНИЦИАЛИЗАЦИЯ СОКЕТОВ ---
const socket = io('https://artillery-game2.onrender.com', {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    upgrade: true,
    forceNew: true
});

// --- АВТОМАТИЧЕСКОЕ ДОБАВЛЕНИЕ СТИЛЕЙ ДЛЯ HP БАРОВ ---
// Внедряем CSS прямо в документ, чтобы itch.io не блокировал внешние стили
const hpStyles = document.createElement('style');
hpStyles.innerHTML = `
    .hp-bar-container {
        position: absolute;
        z-index: 9999;
        width: 60px;
        height: 8px;
        background-color: rgba(0, 0, 0, 0.6);
        border: 1px solid #fff;
        border-radius: 4px;
        padding: 1px;
        pointer-events: none;
        display: none;
        box-shadow: 0 0 5px rgba(0,0,0,0.5);
    }
    .hp-bar-fill {
        height: 100%;
        background-color: #2ed573;
        border-radius: 2px;
        transition: width 0.2s ease;
    }
    .hp-bar-text {
        position: absolute;
        width: 100%;
        top: -14px;
        left: 0;
        text-align: center;
        font-family: Arial, sans-serif;
        font-size: 10px;
        font-weight: bold;
        color: #ffffff;
        text-shadow: 1px 1px 2px #000, -1px -1px 2px #000;
    }
`;
document.head.appendChild(hpStyles);

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

// --- DOM INTERACTION ---
const turnIndicator = document.getElementById('turn-indicator');
const timerDisplay = document.getElementById('timer');
const controlsBlock = document.getElementById('controls');
const btnFire = document.getElementById('btn-fire');
const btnMove = document.getElementById('btn-move');

// --- THREE.JS SETUP ---
const container = document.getElementById('canvas-container') || document.body;
const scene = new THREE.Scene();

const textureLoader = new THREE.TextureLoader();
// Абсолютный путь для заднего фона
textureLoader.load('https://artillery-game2.onrender.com/assets/background.jpg', (bgTexture) => {
    scene.background = bgTexture;
});

const BASE_FOV = 41;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);

function updateCameraPosition() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect < 1) {
        camera.fov = (BASE_FOV / aspect) * 0.85; 
        camera.updateProjectionMatrix();
        camera.position.set(0, 42, 38); 
        camera.lookAt(0, -2, -5); 
    } else {
        camera.fov = BASE_FOV;
        camera.updateProjectionMatrix();
        camera.position.set(0, 54.5, 47.5); 
        camera.lookAt(0, -2, 2.5); 
    }
}
updateCameraPosition();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace; 
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.85); 
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
dirLight.position.set(30, 60, 20);
scene.add(dirLight);

let fieldClickPlanes = [];
let visualField1, visualField2;
let outline1, outline2;

// Абсолютный путь для текстуры земли
const battlefieldTexture = textureLoader.load('https://artillery-game2.onrender.com/assets/battlefield.jpg');

function createBattlefields() {
    const fieldGeometry = new THREE.BoxGeometry(FIELD_SIZE, 0.1, FIELD_SIZE);
    const fieldMaterial = new THREE.MeshStandardMaterial({ map: battlefieldTexture, roughness: 0.8 });

    visualField1 = new THREE.Mesh(fieldGeometry, fieldMaterial);
    visualField1.position.set(0, 0, FIELD_OFFSET_Z);
    visualField2 = new THREE.Mesh(fieldGeometry, fieldMaterial);
    visualField2.position.set(0, 0, -FIELD_OFFSET_Z);
    scene.add(visualField1, visualField2);

    const geometry = new THREE.BufferGeometry();
    const half = FIELD_SIZE / 2;
    const vertices = [
        -half, 0, -half,   half, 0, -half,
         half, 0, -half,   half, 0,  half,
         half, 0,  half,  -half, 0,  half,
        -half, 0,  half,  -half, 0, -half
    ];
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const mat = new THREE.LineDashedMaterial({ color: 0xffe100, dashSize: 0.5, gapSize: 0.3 });
    
    outline1 = new THREE.LineSegments(geometry, mat); outline1.computeLineDistances();
    outline2 = new THREE.LineSegments(geometry, mat); outline2.computeLineDistances();
    outline1.position.set(0, 0.06, FIELD_OFFSET_Z);
    outline2.position.set(0, 0.06, -FIELD_OFFSET_Z);
    scene.add(outline1, outline2);

    const clickGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE);
    clickGeo.rotateX(-Math.PI / 2);
    const clickMat = new THREE.MeshBasicMaterial({ visible: false });

    const plane1 = new THREE.Mesh(clickGeo, clickMat);
    plane1.position.set(0, 0.05, FIELD_OFFSET_Z);
    plane1.userData = { targetRole: 'p1' };

    const plane2 = new THREE.Mesh(clickGeo, clickMat);
    plane2.position.set(0, 0.05, -FIELD_OFFSET_Z);
    plane2.userData = { targetRole: 'p2' };

    scene.add(plane1, plane2);
    fieldClickPlanes.push(plane1, plane2);
}
createBattlefields();

// --- MODEL LOADING ---
// Абсолютный путь к 3D-модели
gltfLoader.load('https://artillery-game2.onrender.com/models/sau.glb', (gltf) => {
    sauModelTemplate = gltf.scene;
    const box = new THREE.Box3().setFromObject(sauModelTemplate);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 3.45; 
    const scaleFactor = targetSize / maxDim;
    sauModelTemplate.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    sauCenterOffset.x = -center.x * scaleFactor;
    sauCenterOffset.z = -center.z * scaleFactor;
    sauCenterOffset.y = -box.min.y * scaleFactor;

    if (gameState) renderUnits();
});

function updateSelectionRing(unitGroup) {
    if (selectionRing) {
        if (selectionRing.parent) selectionRing.parent.remove(selectionRing);
        selectionRing = null;
    }
    if (!unitGroup) return;

    const ringGeo = new THREE.RingGeometry(0, 3.0, 32); 
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.position.y = 0.05; 
    unitGroup.add(selectionRing);
}

function selectRandomAliveUnit() {
    if (!gameState || !myRole || !gameState.players || !gameState.players[myRole]) return;
    const units = gameState.players[myRole].units;
    if (!units) return;

    const aliveUnitIndices = [];
    units.forEach((unit, index) => {
        if (unit && !unit.destroyed) aliveUnitIndices.push(index);
    });
    
    if (aliveUnitIndices.length > 0) {
        const randomIndex = aliveUnitIndices[Math.floor(Math.random() * aliveUnitIndices.length)];
        const targetId = `${myRole}_${randomIndex}`;
        if (visualUnits[targetId]) {
            selectedUnitId = targetId;
            updateSelectionRing(visualUnits[targetId]);
        }
    }
}

// --- UNITS AND HP BARS ---
function createVisualUnit(id, serverX, serverY, ringColor, isDestroyed, owner, hp) {
    const group = new THREE.Group();
    const offsetZ = (owner === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    const worldX = serverX - (FIELD_SIZE / 2);
    const worldZ = serverY - (FIELD_SIZE / 2) + offsetZ;
    
    group.rotation.y = (owner === 'p1') ? Math.PI / 2 : -Math.PI / 2;
    group.position.set(worldX, 0, worldZ);
    scene.add(group);
    visualUnits[id] = group;

    const ringGeo = new THREE.RingGeometry(0.9, 1.0, 32); 
    ringGeo.rotateX(-Math.PI / 2); 
    const ringMat = new THREE.MeshBasicMaterial({ color: isDestroyed ? 0x222222 : ringColor, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.02; 
    group.add(ring);

    if (sauModelTemplate) {
        const model = sauModelTemplate.clone();
        model.position.set(sauCenterOffset.x, sauCenterOffset.y, sauCenterOffset.z);
        model.traverse((child) => {
            if (child.isMesh && isDestroyed) {
                child.material = child.material.clone();
                if (child.material.color) child.material.color.setHex(0x222222);
                child.material.transparent = true;
                child.material.opacity = 0.45;
            }
        });
        group.add(model);
    }

    let hpContainer = document.getElementById(`hp-container-${id}`);
    if (!hpContainer) {
        hpContainer = document.createElement('div');
        hpContainer.id = `hp-container-${id}`;
        hpContainer.className = 'hp-bar-container';
        hpContainer.innerHTML = `<div class="hp-bar-fill"></div><span class="hp-bar-text"></span>`;
        document.body.appendChild(hpContainer);
    }

    const fill = hpContainer.querySelector('.hp-bar-fill');
    const text = hpContainer.querySelector('.hp-bar-text');

    if (isDestroyed) {
        hpContainer.style.display = 'none'; 
    } else {
        hpContainer.style.display = 'block'; 
        if (fill) fill.style.width = `${hp}%`;
        if (text) text.innerText = `${hp} HP`;
    }

    group.userData = { domId: `hp-container-${id}` };
}

function updateHpBarsPositions() {
    const tempV = new THREE.Vector3();
    Object.keys(visualUnits).forEach(id => {
        const group = visualUnits[id];
        const domId = group.userData.domId;
        const domEl = document.getElementById(domId);
        
        if (domEl && domEl.style.display !== 'none') {
            group.getWorldPosition(tempV);
            tempV.y += 3.5; 
            tempV.project(camera);
            const x = (tempV.x * 0.5 + 0.5) * window.innerWidth;
            const y = (tempV.y * -0.5 + 0.5) * window.innerHeight;
            domEl.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
        }
    });
}

// --- EFFECTS ---
function createSplash(serverX, serverY, targetRole, type) {
    const color = 0x5c4033; 
    const offsetZ = (targetRole === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    const worldX = serverX - (FIELD_SIZE / 2);
    const worldZ = serverY - (FIELD_SIZE / 2) + offsetZ;

    for (let i = 0; i < 25; i++) {
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: color }));
        mesh.position.set(worldX + (Math.random() - 0.5) * 1.5, 0.2, worldZ + (Math.random() - 0.5) * 1.5);
        scene.add(mesh);
        particles.push({ mesh: mesh, vX: (Math.random() - 0.5) * 0.2, vY: 0.15 + Math.random() * 0.2, vZ: (Math.random() - 0.5) * 0.2, life: 40 });
    }
}

function spawnFireAndSmoke() {
    burningUnitsPositions.forEach(pos => {
        const colors = [0xff4500, 0xff8c00, 0x444444]; 
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)] }));
        mesh.position.set(pos.x + (Math.random() - 0.5) * 1.0, 0.5, pos.z + (Math.random() - 0.5) * 1.0);
        scene.add(mesh);
        particles.push({ mesh: mesh, vX: (Math.random() - 0.5) * 0.03, vY: 0.04 + Math.random() * 0.04, vZ: (Math.random() - 0.5) * 0.03, life: 30 });
    });
}

// --- UI CONTROLS ---
function updateButtonVisuals() {
    if (currentMode === 'fire') {
        btnFire.classList.add('active');
        btnMove.classList.remove('active');
    } else {
        btnMove.classList.add('active');
        btnFire.classList.remove('active');
    }
}

function updateControlsVisibility() {
    const isMyTurn = gameState && gameState.turn === myId;
    if (!gameState || hasDoneActionThisTurn || !isMyTurn) {
        controlsBlock.classList.add('hidden');
    } else {
        controlsBlock.classList.remove('hidden');
    }
    updateButtonVisuals();
}

btnFire.addEventListener('click', (e) => { 
    e.stopPropagation(); if (hasDoneActionThisTurn) return; 
    currentMode = 'fire'; if (selectionRing) updateSelectionRing(null);
    selectedUnitId = null; updateButtonVisuals();
});

btnMove.addEventListener('click', (e) => { 
    e.stopPropagation(); if (hasDoneActionThisTurn) return; 
    currentMode = 'move'; updateButtonVisuals(); selectRandomAliveUnit();
});

window.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.id === 'controls' || event.target.closest('.hp-bar-container')) return;
    if (!gameState || gameState.turn !== myId || hasDoneActionThisTurn) return;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    pointer.x = (event
