const socket = io();

// Глобальный игровой статус
let myRole = null, myId = null, gameState = null;
let currentMode = 'fire', hasDoneActionThisTurn = false, selectedUnitId = null;

const visualUnits = {};
let selectionRing = null;

const gltfLoader = new THREE.GLTFLoader();
const textureLoader = new THREE.TextureLoader();
let sauModelTemplate = null;

const FIELD_SIZE = 25;
const FIELD_OFFSET_Z = 13.5; // Смещение полей от центра (свое и чужое)
const DIRECT_RADIUS = 1.25;  // 2.5м диаметр -> 1.25м радиус
const SPLASH_RADIUS = 4.13;

// Создание 3D сцены
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Камера (ракурс 2.5D: сверху и чуть сзади/сбоку)
const camera = new THREE.PerspectiveCamera(41, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 51.0, 44.5);
camera.lookAt(0, -2, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

// Освещение
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
dirLight.position.set(30, 60, 20);
scene.add(dirLight);

// Загрузка бэкграунда
textureLoader.load('assets/background.jpg', (tex) => { scene.background = tex; });

// Отрисовка полей и плоскостей для Raycast
let fieldClickPlanes = [];
function initFields() {
    const fieldGeometry = new THREE.BoxGeometry(FIELD_SIZE, 0.1, FIELD_SIZE);
    
    textureLoader.load('assets/battlefield.jpg', (battleTex) => {
        const fieldMaterial = new THREE.MeshStandardMaterial({ map: battleTex, roughness: 0.8 });
        
        const f1 = new THREE.Mesh(fieldGeometry, fieldMaterial);
        f1.position.set(0, 0, FIELD_OFFSET_Z);
        scene.add(f1);

        const f2 = new THREE.Mesh(fieldGeometry, fieldMaterial);
        f2.position.set(0, 0, -FIELD_OFFSET_Z);
        scene.add(f2);
    });

    // Невидимые плоскости для детекции кликов мышкой/тапов
    const clickGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE).rotateX(-Math.PI / 2);
    const clickMat = new THREE.MeshBasicMaterial({ visible: false });

    const p1Plane = new THREE.Mesh(clickGeo, clickMat);
    p1Plane.position.set(0, 0.05, FIELD_OFFSET_Z);
    p1Plane.userData = { role: 'p1' };
    scene.add(p1Plane);
    fieldClickPlanes.push(p1Plane);

    const p2Plane = new THREE.Mesh(clickGeo, clickMat);
    p2Plane.position.set(0, 0.05, -FIELD_OFFSET_Z);
    p2Plane.userData = { role: 'p2' };
    scene.add(p2Plane);
    fieldClickPlanes.push(p2Plane);
}
initFields();

// Загрузка шаблона САУ
gltfLoader.load('models/sau.glb', (gltf) => {
    sauModelTemplate = gltf.scene;
    const box = new THREE.Box3().setFromObject(sauModelTemplate);
    const size = new THREE.Vector3(); box.getSize(size);
    const scale = 3.0 / Math.max(size.x, size.y, size.z); // Модель ровно 3 метра
    sauModelTemplate.scale.set(scale, scale, scale);
    if (gameState) renderUnits();
});

// Генерация UI
const ui = document.createElement('div');
ui.style.cssText = 'position:absolute; top:15px; left:50%; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; width:100%; pointer-events:none; z-index:99; font-family:sans-serif; text-align:center;';
document.body.appendChild(ui);

const info = document.createElement('div');
info.style.cssText = 'font-size:24px; font-weight:bold; color:#fff; text-shadow:2px 2px 4px #000; margin-bottom:5px;';
info.innerText = 'Connecting...';
ui.appendChild(info);

const timerEl = document.createElement('div');
timerEl.style.cssText = 'font-size:18px; color:#fff; text-shadow:1px 1px 3px #000; margin-bottom:15px;';
timerEl.innerText = 'TIME: 30';
ui.appendChild(timerEl);

const controls = document.createElement('div');
controls.style.cssText = 'display:none; gap:15px; pointer-events:auto;';
ui.appendChild(controls);

const btnFire = document.createElement('button');
btnFire.innerText = 'FIRE';
btnFire.style.cssText = 'padding:12px 30px; font-size:16px; font-weight:bold; cursor:pointer; background:#2ed573; color:#fff; border:2px solid #fff; border-radius:6px;';
controls.appendChild(btnFire);

const btnMove = document.createElement('button');
btnMove.innerText = 'MOVE';
btnMove.style.cssText = 'padding:12px 30px; font-size:16px; font-weight:bold; cursor:pointer; background:#333; color:#fff; border:2px solid #555; border-radius:6px;';
controls.appendChild(btnMove);

function updateButtons() {
    if (currentMode === 'fire') {
        btnFire.style.background = '#2ed573'; btnFire.style.borderColor = '#fff';
        btnMove.style.background = '#333'; btnMove.style.borderColor = '#555';
    } else {
        btnMove.style.background = '#1e90ff'; btnMove.style.borderColor = '#fff';
        btnFire.style.background = '#333'; btnFire.style.borderColor = '#555';
    }
}

btnFire.addEventListener('click', (e) => { e.stopPropagation(); currentMode = 'fire'; removeSelectionRing(); selectedUnitId = null; updateButtons(); });
btnMove.addEventListener('click', (e) => { e.stopPropagation(); currentMode = 'move'; updateButtons(); autoSelectUnit(); });

function autoSelectUnit() {
    if (!gameState || !myRole) return;
    const units = gameState.players[myRole].units;
    const firstAliveIndex = units.findIndex(u => !u.destroyed);
    if (firstAliveIndex !== -1) {
        selectedUnitId = `${myRole}_${firstAliveIndex}`;
        drawSelectionRing(visualUnits[selectedUnitId]);
    }
}

function drawSelectionRing(parentMesh) {
    removeSelectionRing();
    if (!parentMesh) return;
    const ringGeo = new THREE.RingGeometry(0, 2.0, 32).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.position.y = 0.06;
    parentMesh.add(selectionRing);
}

function removeSelectionRing() {
    if (selectionRing && selectionRing.parent) { selectionRing.parent.remove(selectionRing); }
    selectionRing = null;
}

// Создание юнита
function createVisualUnit(id, mX, mY, role, hp, isDestroyed) {
    const group = new THREE.Group();
    const offsetZ = (role === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    
    // Перевод метров (0..25) в 3D мировые координаты сцены
    const wX = mX - (FIELD_SIZE / 2);
    const wZ = mY - (FIELD_SIZE / 2) + offsetZ;
    
    group.position.set(wX, 0, wZ);
    group.rotation.y = (role === 'p1') ? Math.PI / 2 : -Math.PI / 2;
    scene.add(group);
    visualUnits[id] = group;

    if (sauModelTemplate) {
        const model = sauModelTemplate.clone();
        model.traverse((child) => {
            if (child.isMesh && isDestroyed) {
                child.material = child.material.clone();
                child.material.color.setHex(0x222222);
                child.material.transparent = true;
                child.material.opacity = 0.5;
            }
        });
        group.add(model);
    }

    // HP полоска через DOM
    let hpBar = document.getElementById(`hp-${id}`);
    if (!hpBar) {
        hpBar = document.createElement('div');
        hpBar.id = `hp-${id}`;
        hpBar.style.cssText = 'position:absolute; width:45px; height:6px; background:rgba(0,0,0,0.5); border:1px solid #fff; pointer-events:none; z-index:10;';
        hpBar.innerHTML = '<div class="fill" style="height:100%; background:#2ed573;"></div>';
        document.body.appendChild(hpBar);
    }
    
    if (isDestroyed) hpBar.style.display = 'none';
    else {
        hpBar.style.display = 'block';
        hpBar.querySelector('.fill').style.width = `${hp}%`;
    }
    group.userData = { hpDom: hpBar };
}

function updateHpBarPositions() {
    const tempV = new THREE.Vector3();
    Object.keys(visualUnits).forEach(id => {
        const g = visualUnits[id];
        const dom = g.userData.hpDom;
        if (dom && dom.style.display !== 'none') {
            g.getWorldPosition(tempV);
            tempV.y += 2.8; 
            tempV.project(camera);
            const x = (tempV.x * .5 + .5) * window.innerWidth;
            const y = (tempV.y * -.5 + .5) * window.innerHeight;
            dom.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
        }
    });
}

function renderUnits() {
    Object.keys(visualUnits).forEach(id => {
        if (visualUnits[id].userData.hpDom) visualUnits[id].userData.hpDom.remove();
        scene.remove(visualUnits[id]);
    });
    removeSelectionRing();

    if (!gameState) return;

    ['p1', 'p2'].forEach(role => {
        gameState.players[role].units.forEach((u, i) => {
            if (u.x === -1000) return; // Скрыт туманом войны
            createVisualUnit(`${role}_${i}`, u.x, u.y, role, u.hp, u.destroyed);
        });
    });

    if (selectedUnitId && visualUnits[selectedUnitId] && currentMode === 'move') {
        drawSelectionRing(visualUnits[selectedUnitId]);
    }
}

// Обработка кликов на поля
window.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON' || !gameState || gameState.turn !== myId || hasDoneActionThisTurn) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);

    // Выбор сау вручную кликом в режиме MOVE
    if (currentMode === 'move') {
        const meshes = Object.values(visualUnits);
        const hits = raycaster.intersectObjects(meshes, true);
        if (hits.length > 0) {
            let obj = hits[0].object;
            while (obj.parent && obj.parent !== scene) obj = obj.parent;
            const foundId = Object.keys(visualUnits).find(k => visualUnits[k] === obj);
            if (foundId && foundId.startsWith(myRole)) {
                const idx = parseInt(foundId.split('_')[1]);
                if (!gameState.players[myRole].units[idx].destroyed) {
                    selectedUnitId = foundId;
                    drawSelectionRing(obj);
                    return;
                }
            }
        }
    }

    // Клики по плоскостям полей
    const intersects = raycaster.intersectObjects(fieldClickPlanes);
    if (intersects.length > 0) {
        const hit = intersects[0];
        const planeRole = hit.object.userData.role;
        const offsetZ = (planeRole === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;

        // Перевод мировых координат клика обратно в метры (0..25)
        const serverX = hit.point.x + (FIELD_SIZE / 2);
        const serverY = hit.point.z + (FIELD_SIZE / 2) - offsetZ;

        if (currentMode === 'fire' && planeRole !== myRole) {
            hasDoneActionThisTurn = true;
            controls.style.display = 'none';
            socket.emit('playerAction', { type: 'fire', x: serverX, y: serverY });
        } 
        else if (currentMode === 'move' && planeRole === myRole && selectedUnitId) {
            const idx = parseInt(selectedUnitId.split('_')[1]);
            hasDoneActionThisTurn = true;
            controls.style.display = 'none';
            removeSelectionRing();
            socket.emit('playerAction', { type: 'move', type: 'move', unitIndex: idx, x: serverX, y: serverY });
            selectedUnitId = null;
        }
    }
});

// Сокеты сети
socket.on('waiting', () => { info.innerText = 'WAITING FOR OPPONENT...'; info.style.color = '#ff9f43'; });
socket.on('gameStart', (data) => { myRole = data.role; myId = socket.id; gameState = data.state; updateTurnUI(); renderUnits(); });
socket.on('timerUpdate', (t) => { timerEl.innerText = `TIME: ${t}`; });
socket.on('turnChanged', (data) => { gameState = data.state; hasDoneActionThisTurn = false; updateTurnUI(); renderUnits(); });
socket.on('gameStateUpdate', (state) => { gameState = state; renderUnits(); });

socket.on('fireResult', (data) => {
    const offsetZ = (data.targetRole === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    const wX = data.x - (FIELD_SIZE / 2);
    const wZ = data.y - (FIELD_SIZE / 2) + offsetZ;

    const splashGeo = new THREE.RingGeometry(0, SPLASH_RADIUS, 32).rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const splashMesh = new THREE.Mesh(splashGeo, splashMat);
    splashMesh.position.set(wX, 0.02, wZ);
    scene.add(splashMesh);

    const directGeo = new THREE.RingGeometry(0, DIRECT_RADIUS, 32).rotateX(-Math.PI / 2);
    const directMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const directMesh = new THREE.Mesh(directGeo, directMat);
    directMesh.position.set(wX, 0.03, wZ);
    scene.add(directMesh);
});

socket.on('gameOver', (data) => {
    document.querySelectorAll('[id^="hp-"]').forEach(el => el.remove());
    if (data.winner === 'opponent_disconnected') alert('Opponent disconnected. You win!');
    else alert(data.winner === myId ? 'VICTORY!' : 'DEFEAT!');
    window.location.reload();
});

function updateTurnUI() {
    if (gameState.turn === myId) {
        info.innerText = 'YOUR TURN!'; info.style.color = '#2ed573';
        controls.style.display = 'flex';
        currentMode = 'fire';
        updateButtons();
    } else {
        info.innerText = "OPPONENT'S TURN..."; info.style.color = '#ff4757';
        controls.style.display = 'none';
    }
}

// Рендер цикл
function animate() {
    requestAnimationFrame(animate);
    updateHpBarPositions();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
