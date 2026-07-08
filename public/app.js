// НАСТРОЙКА КЛИЕНТА: Принудительный запуск чистого веб-сокета для обхода защиты фреймов Itch.io
const socket = io('https://artillery-game2.onrender.com', {
    transports: ['websocket'],
    upgrade: false,
    forceNew: true
});

// --- GAME STATE ---
let myRole = null;          
let myId = null;            
let gameState = null;       
let currentMode = 'fire';   
let hasDoneActionThisTurn = false; 

let selectedUnitId = null;  // ID выбранной САУ для перемещения (например, 'p1_0')
let selectionRing = null;   // Объект визуального круга подсветки выбора

const visualUnits = {};     
const particles = []; 
const burningUnitsPositions = []; 

const gltfLoader = new THREE.GLTFLoader();
let sauModelTemplate = null; 
let sauCenterOffset = new THREE.Vector3(); 

// Константы размеров игры
const FIELD_SIZE = 25;       
const DIRECT_RADIUS = 0.97;  // Итоговый критический радиус
const SPLASH_RADIUS = 4.13;  // Итоговый радиус осколков
const FIELD_OFFSET_Z = 13.5; // Смещение полей от центра

// --- СВЯЗЫВАНИЕ ИНТЕРФЕЙСА С ВАШИМ HTML ---
const turnIndicator = document.getElementById('turn-indicator');
const timerDisplay = document.getElementById('timer');
const controlsBlock = document.getElementById('controls');
const btnFire = document.getElementById('btn-fire');
const btnMove = document.getElementById('btn-move');

// --- THREE.JS SETUP ---
const container = document.getElementById('canvas-container') || document.body;
const scene = new THREE.Scene();

// Загрузка бэкграунда
const textureLoader = new THREE.TextureLoader();
textureLoader.load('/assets/background.jpg', (bgTexture) => {
    scene.background = bgTexture;
});

// Базовый FOV для ПК
const BASE_FOV = 41;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.1, 1000);

// Балансируем камеру, чтобы поля умещались точно между кнопками и нижним краем экрана
function updateCameraPosition() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;

    if (aspect < 1) {
        // --- МОБИЛЬНАЯ ВЕРСИЯ ---
        camera.fov = BASE_FOV / aspect * 0.85; 
        camera.updateProjectionMatrix();
        camera.position.set(0, 42, 38); 
        camera.lookAt(0, -2, -5); 
    } else {
        // --- ПК ВЕРСИЯ ---
        camera.fov = BASE_FOV;
        camera.updateProjectionMatrix();
        
        // Отодвинули назад по Z (47.5) и подняли (54.5)
        camera.position.set(0, 54.5, 47.5); 
        
        // Идеальное центрирование взгляда: снизу виден фон травы, сверху поля не залезают под кнопки
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

// --- ГРАНИЦЫ ПОЛЕЙ ---
function createFieldOutline() {
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
    
    const line1 = new THREE.LineSegments(geometry, mat); line1.computeLineDistances();
    const line2 = new THREE.LineSegments(geometry, mat); line2.computeLineDistances();
    return { line1, line2 };
}
const outlines = createFieldOutline();
outlines.line1.position.set(0, 0.06, FIELD_OFFSET_Z); 
outlines.line2.position.set(0, 0.06, -FIELD_OFFSET_Z); 
scene.add(outlines.line1, outlines.line2);

let fieldClickPlanes = [];

// --- СОЗДАНИЕ ПЛАТФОРМ ---
const battlefieldTexture = textureLoader.load('/assets/battlefield.jpg');

function createBattlefields() {
    const fieldGeometry = new THREE.BoxGeometry(FIELD_SIZE, 0.1, FIELD_SIZE);
    const fieldMaterial = new THREE.MeshStandardMaterial({ map: battlefieldTexture, roughness: 0.8 });

    const visualField1 = new THREE.Mesh(fieldGeometry, fieldMaterial);
    const visualField2 = new THREE.Mesh(fieldGeometry, fieldMaterial);

    visualField1.position.set(0, 0, FIELD_OFFSET_Z);
    visualField2.position.set(0, 0, -FIELD_OFFSET_Z);
    scene.add(visualField1, visualField2);

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

// --- ЗАГРУЗКА МОДЕЛИ САУ ---
gltfLoader.load('/models/sau.glb', (gltf) => {
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

// --- ПОДСВЕТКА ВЫБРАННОЙ САУ ---
function updateSelectionRing(unitGroup) {
    if (selectionRing) {
        if (selectionRing.parent) selectionRing.parent.remove(selectionRing);
        selectionRing = null;
    }
    if (!unitGroup) return;

    const ringGeo = new THREE.RingGeometry(0, 3.0, 32); 
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0xffffff, 
        transparent: true, 
        opacity: 0.3, 
        side: THREE.DoubleSide 
    });
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
        if (unit && !unit.destroyed && unit.x !== -1000) {
            aliveUnitIndices.push(index);
        }
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

// --- ОТРИСОВКА ЮНИТОВ И HP-БАРА ---
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
            if (child.isMesh) {
                if (!isDestroyed) {
                    child.material.needsUpdate = true;
                } else {
                    child.material = child.material.clone();
                    if (child.material.color) child.material.color.setHex(0x222222);
                    child.material.transparent = true;
                    child.material.opacity = 0.45;
                }
            }
        });
        group.add(model);
    }

    // Привязываемся к классам из вашего HTML
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
            tempV.y += 3.2; 
            tempV.project(camera);
            
            const x = (tempV.x * .5 + .5) * window.innerWidth;
            const y = (tempV.y * -.5 + .5) * window.innerHeight;
            
            // Используем только смещение, размеры контролирует CSS (.hp-bar-container)
            domEl.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
        }
    });
}

// --- СПЛЭШ ЭФФЕКТЫ ---
function createSplash(serverX, serverY, targetRole, type) {
    const color = 0x5c4033; 
    const particleCount = 25;

    const offsetZ = (targetRole === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    const worldX = serverX - (FIELD_SIZE / 2);
    const worldZ = serverY - (FIELD_SIZE / 2) + offsetZ;

    for (let i = 0; i < particleCount; i++) {
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(worldX + (Math.random() - 0.5) * 1.5, 0.2, worldZ + (Math.random() - 0.5) * 1.5);
        scene.add(mesh);

        particles.push({
            mesh: mesh,
            vX: (Math.random() - 0.5) * 0.2,
            vY: 0.15 + Math.random() * 0.2, 
            vZ: (Math.random() - 0.5) * 0.2,
            life: 40 
        });
    }
}

function spawnFireAndSmoke() {
    burningUnitsPositions.forEach(pos => {
        const colors = [0xff4500, 0xff8c00, 0x444444]; 
        const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)] }));
        mesh.position.set(pos.x + (Math.random() - 0.5) * 1.0, 0.5, pos.z + (Math.random() - 0.5) * 1.0);
        scene.add(mesh);
        particles.push({ mesh: mesh, vX: (Math.random() - 0.5) * 0.03, vY: 0.04 + Math.random() * 0.04, vZ: (Math.random() - 0.5) * 0.03, life: 30 });
    });
}

// --- УПРАВЛЕНИЕ АКТИВНЫМИ КЛАССАМИ КНОПОК ---
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
    e.stopPropagation(); 
    if (hasDoneActionThisTurn) return; 
    currentMode = 'fire'; 
    if (selectionRing) updateSelectionRing(null);
    selectedUnitId = null;
    updateButtonVisuals();
});

btnMove.addEventListener('click', (e) => { 
    e.stopPropagation(); 
    if (hasDoneActionThisTurn) return; 
    currentMode = 'move'; 
    updateButtonVisuals();
    selectRandomAliveUnit();
});

window.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.id === 'controls' || event.target.closest('.hp-bar-container')) return;
    if (!gameState || gameState.turn !== myId || hasDoneActionThisTurn) return;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const unitIntersects = raycaster.intersectObjects(Object.values(visualUnits), true);
    
    if (unitIntersects.length > 0) {
        let clickedMesh = unitIntersects[0].object;
        let currentObj = clickedMesh;
        let foundId = null;

        while (currentObj && currentObj !== scene) {
            foundId = Object.keys(visualUnits).find(id => visualUnits[id] === currentObj);
            if (foundId) break;
            currentObj = currentObj.parent;
        }

        if (currentMode === 'move' && foundId && foundId.startsWith(myRole)) {
            const unitIndex = parseInt(foundId.split('_')[1]);
            const targetUnit = gameState.players[myRole].units[unitIndex];

            if (targetUnit && !targetUnit.destroyed) {
                selectedUnitId = foundId;
                updateSelectionRing(visualUnits[foundId]); 
                return; 
            }
        }
    }

    const intersects = raycaster.intersectObjects(fieldClickPlanes);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const planeX = hit.point.x;
        const planeZ = hit.point.z;
        const clickedPlaneRole = hit.object.userData.targetRole;

        const offsetZ = (clickedPlaneRole === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
        const serverX = planeX + (FIELD_SIZE / 2);
        const serverY = planeZ + (FIELD_SIZE / 2) - offsetZ;

        if (currentMode === 'fire') {
            hasDoneActionThisTurn = true; 
            controlsBlock.classList.add('hidden');
            socket.emit('playerAction', { type: 'fire', x: serverX, y: serverY, forcedRole: myRole });
        } 
        else if (currentMode === 'move') {
            if (selectedUnitId && clickedPlaneRole === myRole) {
                const unitIndex = parseInt(selectedUnitId.split('_')[1]);
                
                hasDoneActionThisTurn = true; 
                controlsBlock.classList.add('hidden');
                updateSelectionRing(null); 
                
                socket.emit('playerAction', { type: 'move', x: serverX, y: serverY, unitIndex: unitIndex, forcedRole: myRole });
                selectedUnitId = null;
            }
        }
    }
});

// --- NETWORK ---
socket.emit('joinGame');
socket.on('waiting', () => { 
    turnIndicator.innerText = "ОЖИДАНИЕ СОПЕРНИКА..."; 
    turnIndicator.style.color = "#ffa500";
    updateControlsVisibility(); 
});
socket.on('gameStart', (data) => { 
    myRole = data.role; 
    myId = socket.id; 
    gameState = data.state; 
    updateTurnUI(); 
    renderUnits(); 
});
socket.on('timerUpdate', (time) => { timerDisplay.innerText = time; });
socket.on('turnChanged', (data) => { 
    gameState = data.state || gameState; 
    gameState.turn = data.turn; 
    timerDisplay.innerText = data.timer; 
    hasDoneActionThisTurn = false; 
    selectedUnitId = null;
    updateSelectionRing(null);
    updateTurnUI(); 
});
socket.on('gameStateUpdate', (newState) => { gameState = newState; renderUnits(); });

socket.on('fireResult', (data) => {
    createSplash(data.x, data.y, data.targetRole, data.result);

    const offsetZ = (data.targetRole === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    const worldX = data.x - (FIELD_SIZE / 2);
    const worldZ = data.y - (FIELD_SIZE / 2) + offsetZ;

    const explosionGroup = new THREE.Group();
    explosionGroup.position.set(worldX, 0.07, worldZ);
    scene.add(explosionGroup);

    const directGeo = new THREE.RingGeometry(0, DIRECT_RADIUS, 32);
    directGeo.rotateX(-Math.PI / 2);
    const directMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    const directMesh = new THREE.Mesh(directGeo, directMat);
    explosionGroup.add(directMesh);

    const splashGeo = new THREE.RingGeometry(0, SPLASH_RADIUS, 32);
    splashGeo.rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({ color: 0x888888, side: THREE.DoubleSide, transparent: true, opacity: 0.3 });
    const splashMesh = new THREE.Mesh(splashGeo, splashMat);
    splashMesh.position.y = -0.01; 
    explosionGroup.add(splashMesh);

    setTimeout(() => {
        scene.remove(explosionGroup);
        directGeo.dispose(); directMat.dispose();
        splashGeo.dispose(); splashMat.dispose();
    }, 2000);
});

socket.on('gameOver', (data) => { 
    document.querySelectorAll('.hp-bar-container').forEach(el => el.remove());
    alert(data.winner === myId ? "ПОБЕДА!" : "ПОРАЖЕНИЕ!"); 
    window.location.reload(); 
});

function updateTurnUI() {
    if (!gameState) return;

    if (gameState.turn === myId) {
        turnIndicator.innerText = "ВАШ ХОД!"; 
        turnIndicator.style.color = "#2ed573";
        if (!hasDoneActionThisTurn) { 
            currentMode = 'fire'; 
        }
    } else {
        turnIndicator.innerText = "ХОД ПРОТИВНИКА..."; 
        turnIndicator.style.color = "#ff4757"; 
    }
    updateControlsVisibility();
}

function renderUnits() {
    const activeIdBeforeRender = selectedUnitId;

    Object.keys(visualUnits).forEach(id => scene.remove(visualUnits[id]));
    burningUnitsPositions.length = 0; 
    
    if (!gameState || !gameState.players) return;

    const p1 = gameState.players.p1; const p2 = gameState.players.p2;

    if (p1 && p1.units) {
        p1.units.forEach((unit, index) => {
            if (unit.x === -1000 || unit.y === -1000) {
                const el = document.getElementById(`hp-container-p1_${index}`);
                if (el) el.style.display = 'none';
                return;
            }
            createVisualUnit(`p1_${index}`, unit.x, unit.y, 0x1e90ff, unit.destroyed, 'p1', unit.hp);
            if (unit.destroyed) burningUnitsPositions.push({ x: unit.x - (FIELD_SIZE / 2), z: unit.y - (FIELD_SIZE / 2) + FIELD_OFFSET_Z });
        });
    }
    if (p2 && p2.units) {
        p2.units.forEach((unit, index) => {
            if (unit.x === -1000 || unit.y === -1000) {
                const el = document.getElementById(`hp-container-p2_${index}`);
                if (el) el.style.display = 'none';
                return;
            }
            createVisualUnit(`p2_${index}`, unit.x, unit.y, 0xff4757, unit.destroyed, 'p2', unit.hp);
            if (unit.destroyed) burningUnitsPositions.push({ x: unit.x - (FIELD_SIZE / 2), z: unit.y - (FIELD_SIZE / 2) - FIELD_OFFSET_Z });
        });
    }

    if (activeIdBeforeRender && visualUnits[activeIdBeforeRender]) {
        selectedUnitId = activeIdBeforeRender;
        updateSelectionRing(visualUnits[selectedUnitId]);
    }
}

function animate() {
    requestAnimationFrame(animate);
    spawnFireAndSmoke();
    updateHpBarsPositions();

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.x += p.vX; p.mesh.position.y += p.vY; p.mesh.position.z += p.vZ;
        p.vY -= 0.005; p.life--;
        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    updateCameraPosition();
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateControlsVisibility(); 
});

setTimeout(updateControlsVisibility, 100);
