const socket = io();

// --- GAME STATE ---
let myRole = null;          
let myId = null;            
let gameState = null;       
let currentMode = 'fire';   
let hasDoneActionThisTurn = false; 

const visualUnits = {};     
const particles = []; 
const burningUnitsPositions = []; 

const gltfLoader = new THREE.GLTFLoader();
let sauModelTemplate = null; 
let sauCenterOffset = new THREE.Vector3(); 

const FIELD_SIZE = 25;       
const DIRECT_RADIUS = 3;    // Радиус ямки при промахе теперь 3 метра

// --- THREE.JS SETUP ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xF5F2EB);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);

function updateCameraPosition() {
    camera.position.set(0, 45, 35); 
    camera.lookAt(0, 0, 0);
}
updateCameraPosition();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
outlines.line1.position.set(0, 0.06, 15); 
outlines.line2.position.set(0, 0.06, -15); 
scene.add(outlines.line1, outlines.line2);

let fieldClickPlanes = [];

// --- СОЗДАНИЕ ПЛАТФОРМ ---
const textureLoader = new THREE.TextureLoader();
const battlefieldTexture = textureLoader.load('/assets/battlefield.jpg');
battlefieldTexture.wrapS = THREE.RepeatWrapping;
battlefieldTexture.wrapT = THREE.RepeatWrapping;
battlefieldTexture.repeat.set(3, 3);

function createBattlefields() {
    const fieldGeometry = new THREE.BoxGeometry(FIELD_SIZE, 0.1, FIELD_SIZE);
    const fieldMaterial = new THREE.MeshStandardMaterial({ map: battlefieldTexture, roughness: 0.8 });

    const visualField1 = new THREE.Mesh(fieldGeometry, fieldMaterial);
    const visualField2 = new THREE.Mesh(fieldGeometry, fieldMaterial);

    visualField1.position.set(0, 0, 15);
    visualField2.position.set(0, 0, -15);
    scene.add(visualField1, visualField2);

    const clickGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE);
    clickGeo.rotateX(-Math.PI / 2);
    const clickMat = new THREE.MeshBasicMaterial({ visible: false });

    const plane1 = new THREE.Mesh(clickGeo, clickMat);
    plane1.position.set(0, 0.05, 15);
    plane1.userData = { targetRole: 'p1' };

    const plane2 = new THREE.Mesh(clickGeo, clickMat);
    plane2.position.set(0, 0.05, -15);
    plane2.userData = { targetRole: 'p2' };

    scene.add(plane1, plane2);
    fieldClickPlanes.push(plane1, plane2);
}
createBattlefields();

// --- ЗАГРУЗКА МОДЕЛИ (+15% К РАЗМЕРУ = 3.45 МЕТРА) ---
gltfLoader.load('/models/sau.glb', (gltf) => {
    sauModelTemplate = gltf.scene;
    const box = new THREE.Box3().setFromObject(sauModelTemplate);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 3.45; // МОДЕЛЬ УВЕЛИЧЕНА НА 15%
    const scaleFactor = targetSize / maxDim;
    sauModelTemplate.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    sauCenterOffset.x = -center.x * scaleFactor;
    sauCenterOffset.z = -center.z * scaleFactor;
    sauCenterOffset.y = -box.min.y * scaleFactor;

    if (gameState) renderUnits();
});

// --- ОТРИСОВКА ЮНИТОВ И HP-БАРА ---
function createVisualUnit(id, serverX, serverY, ringColor, isDestroyed, owner, hp) {
    const group = new THREE.Group();
    
    const offsetZ = (owner === 'p1') ? 15 : -15;
    const worldX = serverX - (FIELD_SIZE / 2);
    const worldZ = serverY - (FIELD_SIZE / 2) + offsetZ;
    
    group.rotation.y = (owner === 'p1') ? Math.PI / 2 : -Math.PI / 2;
    group.position.set(worldX, 0, worldZ);
    scene.add(group);
    visualUnits[id] = group;

    // Подстраиваем размер кольца под увеличенную пушку
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
                    child.material = new THREE.MeshStandardMaterial({ color: 0xbfa37a, roughness: 0.75 });
                } else {
                    child.material = new THREE.MeshStandardMaterial({ color: 0x423829, roughness: 0.95, transparent: true, opacity: 0.45 });
                }
            }
        });
        group.add(model);
    }

    // СОЗДАНИЕ ДИНАМИЧЕСКОГО ИНТЕРФЕЙСА ЖИЗНИ (HP-БАР) В HTML DOM
    let hpContainer = document.getElementById(`hp-container-${id}`);
    if (!hpContainer) {
        hpContainer = document.createElement('div');
        hpContainer.id = `hp-container-${id}`;
        hpContainer.className = 'hp-bar-container';
        hpContainer.innerHTML = `<div class="hp-bar-fill"></div><span class="hp-bar-text"></span>`;
        document.body.appendChild(hpContainer);
    }

    if (isDestroyed) {
        hpContainer.style.display = 'none'; // Скрываем плашку, если юнит мертв
    } else {
        hpContainer.style.display = 'block';
        const fill = hpContainer.querySelector('.hp-bar-fill');
        const text = hpContainer.querySelector('.hp-bar-text');
        fill.style.width = `${hp}%`;
        text.innerText = `${hp} HP`;
    }

    group.userData = { domId: `hp-container-${id}` };
}

// Обновление позиций HTML-плашек поверх 3D объектов
function updateHpBarsPositions() {
    const tempV = new THREE.Vector3();
    Object.keys(visualUnits).forEach(id => {
        const group = visualUnits[id];
        const domId = group.userData.domId;
        const domEl = document.getElementById(domId);
        
        if (domEl && domEl.style.display !== 'none') {
            // Получаем центр САУ и поднимаем точку чуть выше модели
            group.getWorldPosition(tempV);
            tempV.y += 2.2; 
            
            // Проецируем 3D-точку на 2D-экран камеры
            tempV.project(camera);
            
            // Превращаем нормализованные координаты (-1..1) в пиксели
            const x = (tempV.x *  .5 + .5) * window.innerWidth;
            const y = (tempV.y * -.5 + .5) * window.innerHeight;
            
            domEl.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
        }
    });
}

function createSplash(serverX, serverY, targetRole, type) {
    const color = (type === 'hit' || type === 'splash') ? 0xffa500 : 0x5c4033; 
    const particleCount = 25;

    const offsetZ = (targetRole === 'p1') ? 15 : -15;
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

// --- UI CONTROLS ---
const btnFire = document.getElementById('btn-fire');
const btnMove = document.getElementById('btn-move');
const turnIndicator = document.getElementById('turn-indicator');
const timerDisplay = document.getElementById('timer');
const controls = document.getElementById('controls');

btnFire.addEventListener('click', (e) => { e.stopPropagation(); if (hasDoneActionThisTurn) return; currentMode = 'fire'; btnFire.classList.add('active'); btnMove.classList.remove('active'); });
btnMove.addEventListener('click', (e) => { e.stopPropagation(); if (hasDoneActionThisTurn) return; currentMode = 'move'; btnMove.classList.add('active'); btnFire.classList.remove('active'); });

window.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.id === 'controls' || event.target.closest('.hp-bar-container')) return;
    if (!gameState || gameState.turn !== myId || hasDoneActionThisTurn) return;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(fieldClickPlanes);

    if (intersects.length > 0) {
        const hit = intersects[0];
        const planeX = hit.point.x;
        const planeZ = hit.point.z;
        const clickedPlaneRole = hit.object.userData.targetRole;

        const offsetZ = (clickedPlaneRole === 'p1') ? 15 : -15;
        const serverX = planeX + (FIELD_SIZE / 2);
        const serverY = planeZ + (FIELD_SIZE / 2) - offsetZ;

        if (currentMode === 'fire') {
            hasDoneActionThisTurn = true; controls.classList.add('hidden');
            socket.emit('playerAction', { type: 'fire', x: serverX, y: serverY, forcedRole: myRole });
        } 
        else if (currentMode === 'move') {
            if (clickedPlaneRole !== myRole) return; 

            const targetUnits = gameState.players[myRole].units;
            const aliveUnits = targetUnits.filter(u => !u.destroyed);
            if (aliveUnits.length === 0) return;

            let targetUnitIndex = targetUnits.findIndex(u => u === aliveUnits[0]);
            if (aliveUnits.length > 1) {
                const d0 = Math.hypot(aliveUnits[0].x - serverX, aliveUnits[0].y - serverY);
                const d1 = Math.hypot(aliveUnits[1].x - serverX, aliveUnits[1].y - serverY);
                if (d1 < d0) targetUnitIndex = targetUnits.findIndex(u => u === aliveUnits[1]);
            }
            
            hasDoneActionThisTurn = true; controls.classList.add('hidden');
            socket.emit('playerAction', { type: 'move', x: serverX, y: serverY, unitIndex: targetUnitIndex, forcedRole: myRole });
        }
    }
});

// --- NETWORK ---
socket.emit('joinGame');
socket.on('waiting', () => { turnIndicator.innerText = "Waiting for opponent..."; });
socket.on('gameStart', (data) => { myRole = data.role; myId = socket.id; gameState = data.state; updateTurnUI(); renderUnits(); });
socket.on('timerUpdate', (time) => { timerDisplay.innerText = time; });
socket.on('turnChanged', (data) => { if (!gameState) return; gameState.turn = data.turn; timerDisplay.innerText = data.timer; hasDoneActionThisTurn = false; updateTurnUI(); });
socket.on('gameStateUpdate', (newState) => { gameState = newState; renderUnits(); });

// Воронка на поле только при полном промахе (result === 'miss')
socket.on('fireResult', (data) => {
    createSplash(data.x, data.y, data.targetRole, data.result);

    if (data.result === 'miss') {
        const offsetZ = (data.targetRole === 'p1') ? 15 : -15;
        const worldX = data.x - (FIELD_SIZE / 2);
        const worldZ = data.y - (FIELD_SIZE / 2) + offsetZ;

        // Размер ямки равен новому радиусу прямого попадания (3 метра)
        const holeGeo = new THREE.RingGeometry(0, DIRECT_RADIUS * 0.5, 32); 
        holeGeo.rotateX(-Math.PI / 2); 
        const holeMat = new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
        const holeMesh = new THREE.Mesh(holeGeo, holeMat);
        
        holeMesh.position.set(worldX, 0.07, worldZ);
        scene.add(holeMesh);

        setTimeout(() => { scene.remove(holeMesh); holeGeo.dispose(); holeMat.dispose(); }, 2000);
    }
});

socket.on('gameOver', (data) => { 
    // Скрываем все полоски HP перед выходом
    document.querySelectorAll('.hp-bar-container').forEach(el => el.remove());
    alert(data.winner === myId ? "VICTORY!" : "DEFEAT!"); 
    window.location.reload(); 
});

function updateTurnUI() {
    if (gameState.turn === myId) {
        turnIndicator.innerText = "YOUR TURN!"; turnIndicator.style.color = "#2ed573";
        if (!hasDoneActionThisTurn) { controls.classList.remove('hidden'); currentMode = 'fire'; btnFire.classList.add('active'); btnMove.classList.remove('active'); }
    } else {
        turnIndicator.innerText = "OPPONENT'S TURN..."; turnIndicator.style.color = "#ff4757"; controls.classList.add('hidden'); 
    }
}

function renderUnits() {
    // Чистим старые группы перед перерисовкой
    Object.keys(visualUnits).forEach(id => scene.remove(visualUnits[id]));
    burningUnitsPositions.length = 0; 
    
    const p1 = gameState.players.p1; const p2 = gameState.players.p2;

    if (p1 && p1.units) {
        p1.units.forEach((unit, index) => {
            if (unit.x === -1000 || unit.y === -1000) {
                // Прячем HP-бар вражеского юнита, если он в тумане войны
                const el = document.getElementById(`hp-container-p1_${index}`);
                if (el) el.style.display = 'none';
                return;
            }
            createVisualUnit(`p1_${index}`, unit.x, unit.y, 0x1e90ff, unit.destroyed, 'p1', unit.hp);
            if (unit.destroyed) burningUnitsPositions.push({ x: unit.x - (FIELD_SIZE / 2), z: unit.y - (FIELD_SIZE / 2) + 15 });
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
            if (unit.destroyed) burningUnitsPositions.push({ x: unit.x - (FIELD_SIZE / 2), z: unit.y - (FIELD_SIZE / 2) - 15 });
        });
    }
}

function animate() {
    requestAnimationFrame(animate);
    spawnFireAndSmoke();
    
    // Пересчитываем положение HTML-плашек поверх экрана
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
});
