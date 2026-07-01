const socket = io();

// --- GAME STATE ---
let myRole = null;          
let myId = null;            
let gameState = null;       
let currentMode = 'fire';   
let hasDoneActionThisTurn = false; // ФЛАГ: совершил ли игрок действие в этом ходу

const visualUnits = {};     
const particles = []; 
const burningUnitsPositions = []; 

const gltfLoader = new THREE.GLTFLoader();
let sauModelTemplate = null; 
let sauCenterOffset = new THREE.Vector3(); 

// --- THREE.JS SETUP ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xF5F2EB);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);

function updateCameraPosition() {
    camera.position.set(0, 18, 13); 
    camera.lookAt(0, 0, 0);
}
updateCameraPosition();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.85); 
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
dirLight.position.set(15, 30, 10);
scene.add(dirLight);

// --- GRID PLATFORMS ---
const gridHelperLeft = new THREE.GridHelper(8, 8, 0x888888, 0x888888);
const gridHelperRight = new THREE.GridHelper(8, 8, 0x888888, 0x888888);

function positionGridHelpers() {
    gridHelperLeft.position.set(0, 0.06, 5);
    gridHelperRight.position.set(0, 0.06, -5);
}
scene.add(gridHelperLeft);
scene.add(gridHelperRight);
positionGridHelpers();

let clickableCells = [];

function createDirtTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5c4033';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 800; i++) {
        const x = Math.random() * 128;
        const y = Math.random() * 128;
        const size = 1 + Math.random() * 2;
        ctx.fillStyle = Math.random() > 0.5 ? '#4a3329' : '#6e4e3f';
        ctx.fillRect(x, y, size, size);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

const dirtTexture = createDirtTexture();

function createGridPlatforms() {
    clickableCells.forEach(cell => scene.remove(cell));
    clickableCells = [];

    const size = 1; 
    for (let x = 0; x < 8; x++) {
        for (let z = 0; z < 8; z++) {
            const geo1 = new THREE.BoxGeometry(size - 0.02, 0.1, size - 0.02);
            const mat1 = new THREE.MeshStandardMaterial({ map: dirtTexture, color: 0xffffff, roughness: 0.9 });
            const cell1 = new THREE.Mesh(geo1, mat1);
            
            const geo2 = new THREE.BoxGeometry(size - 0.02, 0.1, size - 0.02);
            const mat2 = new THREE.MeshStandardMaterial({ map: dirtTexture, color: 0xcccccc, roughness: 0.9 });
            const cell2 = new THREE.Mesh(geo2, mat2);

            cell1.position.set(x - 3.5, 0, z - 3.5 + 5);
            cell2.position.set(x - 3.5, 0, z - 3.5 - 5);

            cell1.userData = { gridX: x, gridY: z, isEnemy: false };
            cell2.userData = { gridX: x, gridY: z, isEnemy: true };

            scene.add(cell1);
            scene.add(cell2);
            clickableCells.push(cell1, cell2);
        }
    }
}
createGridPlatforms();

// --- MODEL LOADING & CENTERING ---
gltfLoader.load('/models/sau.glb', (gltf) => {
    sauModelTemplate = gltf.scene;
    
    const box = new THREE.Box3().setFromObject(sauModelTemplate);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 1.5; 
    const scaleFactor = targetSize / maxDim;
    sauModelTemplate.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    sauCenterOffset.x = -center.x * scaleFactor;
    sauCenterOffset.z = -center.z * scaleFactor;
    sauCenterOffset.y = -box.min.y * scaleFactor;

    if (gameState) renderUnits();
}, undefined, (error) => {
    console.error('Error loading model:', error);
});

// --- RENDER VISUAL UNITS ---
function createVisualUnit(id, gridX, gridY, ringColor, isDestroyed, owner) {
    const group = new THREE.Group();
    
    const offsetZ = (owner === 'p1') ? 5 : -5;
    const worldX = gridX - 3.5;
    const worldZ = gridY - 3.5 + offsetZ;
    
    group.rotation.y = (owner === 'p1') ? Math.PI / 2 : -Math.PI / 2;
    group.position.set(worldX, 0, worldZ);
    scene.add(group);
    visualUnits[id] = group;

    const ringGeo = new THREE.RingGeometry(0.30, 0.36, 32); 
    ringGeo.rotateX(-Math.PI / 2); 
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: isDestroyed ? 0x222222 : ringColor, 
        side: THREE.DoubleSide 
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.02; 
    group.add(ring);

    if (sauModelTemplate) {
        const model = sauModelTemplate.clone();
        model.position.set(sauCenterOffset.x, sauCenterOffset.y, sauCenterOffset.z);
        
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (!isDestroyed) {
                    child.material = new THREE.MeshStandardMaterial({ color: 0x4B5320, roughness: 0.7, metalness: 0.15 });
                } else {
                    child.material = new THREE.MeshStandardMaterial({ color: 0x2b2e18, roughness: 0.95, transparent: true, opacity: 0.45 });
                }
            }
        });
        group.add(model);
    } else {
        const placeholderGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5);
        const placeholderMat = new THREE.MeshStandardMaterial({ color: isDestroyed ? 0x2b2e18 : 0x4B5320 });
        const placeholder = new THREE.Mesh(placeholderGeo, placeholderMat);
        placeholder.position.y = 0.15;
        group.add(placeholder);
    }
}

function createSplash(gridX, gridY, targetRole, type) {
    const color = (type === 'hit') ? 0xffa500 : 0x5c4033; 
    const particleCount = 15;

    const offsetZ = (targetRole === 'p1') ? 5 : -5;
    const worldX = gridX - 3.5;
    const worldZ = gridY - 3.5 + offsetZ;

    for (let i = 0; i < particleCount; i++) {
        const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);

        mesh.position.set(worldX + (Math.random() - 0.5) * 0.3, 0.2, worldZ + (Math.random() - 0.5) * 0.3);
        scene.add(mesh);

        particles.push({
            mesh: mesh,
            vX: (Math.random() - 0.5) * 0.1,
            vY: 0.1 + Math.random() * 0.1, 
            vZ: (Math.random() - 0.5) * 0.1,
            life: 30 
        });
    }
}

function spawnFireAndSmoke() {
    burningUnitsPositions.forEach(pos => {
        const colors = [0xff4500, 0xff8c00, 0xffd700, 0x444444]; 
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
        const mat = new THREE.MeshBasicMaterial({ color: randomColor });
        const mesh = new THREE.Mesh(geo, mat);
        
        mesh.position.set(pos.x + (Math.random() - 0.5) * 0.3, 0.4, pos.z + (Math.random() - 0.5) * 0.3);
        scene.add(mesh);
        
        particles.push({
            mesh: mesh,
            vX: (Math.random() - 0.5) * 0.02,
            vY: 0.03 + Math.random() * 0.03, 
            vZ: (Math.random() - 0.5) * 0.02,
            life: 20 + Math.random() * 15
        });
    });
}

// --- UI BUTTONS & EVENT LISTENERS ---
const btnFire = document.getElementById('btn-fire');
const btnMove = document.getElementById('btn-move');
const turnIndicator = document.getElementById('turn-indicator');
const timerDisplay = document.getElementById('timer');
const controls = document.getElementById('controls');

btnFire.addEventListener('click', (e) => {
    e.stopPropagation(); 
    if (hasDoneActionThisTurn) return;
    currentMode = 'fire';
    btnFire.classList.add('active');
    btnMove.classList.remove('active');
});

btnMove.addEventListener('click', (e) => {
    e.stopPropagation(); 
    if (hasDoneActionThisTurn) return;
    currentMode = 'move';
    btnMove.classList.add('active');
    btnFire.classList.remove('active');
});

// --- RAYCASTING (CLICKS) ---
window.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.id === 'controls') return;
    if (!gameState) return;
    
    // Если сейчас не ваш ход ИЛИ вы уже сделали действие в этом ходу — блокируем клик
    if (gameState.turn !== myId || hasDoneActionThisTurn) return;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(clickableCells);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        const { gridX, gridY, isEnemy } = clickedMesh.userData;

        if (currentMode === 'fire') {
            if (!isEnemy) return;
            
            hasDoneActionThisTurn = true; // Запоминаем, что действие совершено
            controls.classList.add('hidden'); // Моментально прячем кнопки ходов

            socket.emit('playerAction', { 
                type: 'fire', 
                x: gridX, 
                y: gridY,
                forcedRole: myRole 
            });
        } 
        else if (currentMode === 'move') {
            const targetRole = isEnemy ? 'p2' : 'p1';
            
            // Маневрировать можно только своими юнитами на своем поле
            if (targetRole !== myRole) return; 

            const targetUnits = gameState.players[targetRole].units;
            if (!targetUnits || targetUnits.length === 0) return;

            const aliveUnits = targetUnits.filter(u => !u.destroyed);
            if (aliveUnits.length === 0) return;

            let targetUnitIndex = targetUnits.findIndex(u => u === aliveUnits[0]);
            if (aliveUnits.length > 1) {
                const dist0 = Math.abs(aliveUnits[0].x - gridX) + Math.abs(aliveUnits[0].y - gridY);
                const dist1 = Math.abs(aliveUnits[1].x - gridX) + Math.abs(aliveUnits[1].y - gridY);
                if (dist1 < dist0) {
                    targetUnitIndex = targetUnits.findIndex(u => u === aliveUnits[1]);
                }
            }
            
            hasDoneActionThisTurn = true; // Запоминаем, что действие совершено
            controls.classList.add('hidden'); // Моментально прячем кнопки ходов

            socket.emit('playerAction', { 
                type: 'move', 
                x: gridX, 
                y: gridY, 
                unitIndex: targetUnitIndex,
                forcedRole: targetRole 
            });
        }
    }
});

// --- NETWORK LOGIC ---
socket.emit('joinGame');
socket.on('waiting', (msg) => { turnIndicator.innerText = "Waiting for opponent..."; });

socket.on('gameStart', (data) => {
    myRole = data.role;
    myId = socket.id;
    gameState = data.state;
    updateTurnUI();
    renderUnits();
});

socket.on('timerUpdate', (time) => { timerDisplay.innerText = time; });

socket.on('turnChanged', (data) => {
    if (!gameState) return;
    gameState.turn = data.turn;
    timerDisplay.innerText = data.timer;
    
    // Передаем ход -> СБРАСЫВАЕМ флаг действия для нового раунда
    hasDoneActionThisTurn = false; 
    
    updateTurnUI();
});

socket.on('gameStateUpdate', (newState) => {
    gameState = newState;
    renderUnits();
});

socket.on('fireResult', (data) => {
    createSplash(data.x, data.y, data.targetRole, data.result);
});

socket.on('gameOver', (data) => {
    alert(data.winner === myId ? "VICTORY! All enemy artillery destroyed!" : "DEFEAT! Your artillery was wiped out.");
    window.location.reload();
});

function updateTurnUI() {
    if (gameState.turn === myId) {
        turnIndicator.innerText = "YOUR TURN!";
        turnIndicator.style.color = "#2ed573";
        
        // Если в этом ходу действие еще НЕ совершалось — показываем кнопки управления
        if (!hasDoneActionThisTurn) {
            controls.classList.remove('hidden');
            currentMode = 'fire';
            btnFire.classList.add('active');
            btnMove.classList.remove('active');
        }
    } else {
        turnIndicator.innerText = "OPPONENT'S TURN...";
        turnIndicator.style.color = "#ff4757";
        controls.classList.add('hidden'); // Прячем во время чужого хода
    }
}

function renderUnits() {
    Object.keys(visualUnits).forEach(id => scene.remove(visualUnits[id]));
    burningUnitsPositions.length = 0; 
    
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    if (p1 && p1.units) {
        p1.units.forEach((unit, index) => {
            createVisualUnit(`p1_${index}`, unit.x, unit.y, 0x1e90ff, unit.destroyed, 'p1');
            if (unit.destroyed) {
                burningUnitsPositions.push({ x: unit.x - 3.5, z: unit.y - 3.5 + 5 });
            }
        });
    }

    if (p2 && p2.units) {
        p2.units.forEach((unit, index) => {
            createVisualUnit(`p2_${index}`, unit.x, unit.y, 0xff4757, unit.destroyed, 'p2');
            if (unit.destroyed) {
                burningUnitsPositions.push({ x: unit.x - 3.5, z: unit.y - 3.5 - 5 });
            }
        });
    }
}

function animate() {
    requestAnimationFrame(animate);
    spawnFireAndSmoke();

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.x += p.vX;
        p.mesh.position.y += p.vY;
        p.mesh.position.z += p.vZ;
        p.vY -= 0.003; 
        p.life--;
        if (p.life <= 0) {
            scene.remove(p.mesh);
            particles.splice(i, 1);
        }
    }
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    updateCameraPosition();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
