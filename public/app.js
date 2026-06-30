const socket = io();

// --- СОСТОЯНИЕ ИГРЫ ---
let myRole = null;          
let myId = null;            
let gameState = null;       
let currentMode = 'fire';   

const visualUnits = {};     
const particles = []; 
const burningUnitsPositions = []; // Хранилище координат горящих пушек для постоянного спавна огня

// --- НАСТРОЙКА THREE.JS ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141414);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 12, 14); 
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const gridHelperLeft = new THREE.GridHelper(8, 8, 0x1e90ff, 0x444444);
gridHelperLeft.position.set(-5, 0.06, 0);
scene.add(gridHelperLeft);

const gridHelperRight = new THREE.GridHelper(8, 8, 0xff4757, 0x444444);
gridHelperRight.position.set(5, 0.06, 0);
scene.add(gridHelperRight);

const clickableCells = [];

function createGridPlatform(offsetX, isEnemy) {
    const size = 1; 
    for (let x = 0; x < 8; x++) {
        for (let z = 0; z < 8; z++) {
            const geometry = new THREE.BoxGeometry(size - 0.02, 0.1, size - 0.02);
            const material = new THREE.MeshStandardMaterial({ 
                color: isEnemy ? 0x2b2b2b : 0x1f1f1f,
                roughness: 0.6 
            });
            const cell = new THREE.Mesh(geometry, material);
            cell.position.set(x - 3.5 + offsetX, 0, z - 3.5);
            
            cell.userData = { gridX: x, gridY: z, isEnemy: isEnemy };
            scene.add(cell);
            clickableCells.push(cell); 
        }
    }
}

createGridPlatform(-5, false); 
createGridPlatform(5, true);   

function createVisualUnit(id, x, z, color, isDestroyed) {
    const group = new THREE.Group();
    
    // Если пушка уничтожена — красим основание в обугленный серый/черный цвет
    const baseColor = isDestroyed ? 0x222222 : color;
    const cabinColor = isDestroyed ? 0x111111 : 0x333333;

    const baseGeo = new THREE.BoxGeometry(0.7, 0.2, 0.7);
    const baseMat = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.8 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.1;
    group.add(base);

    const cabinGeo = new THREE.BoxGeometry(0.4, 0.25, 0.4);
    const cabinMat = new THREE.MeshStandardMaterial({ color: cabinColor, roughness: 0.9 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.y = 0.325;
    group.add(cabin);

    const barrelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.5);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 0.4, 0.25);
    // Опустим дуло подбитой техники вниз
    barrel.rotation.x = isDestroyed ? Math.PI / 6 : Math.PI / 3; 
    group.add(barrel);

    group.position.set(x, 0, z);
    scene.add(group);
    visualUnits[id] = group;
}

// Эффект мгновенного всплеска при ударе
function createSplash(worldX, worldZ, type) {
    const color = (type === 'hit') ? 0xffa500 : 0x8b4513;
    const particleCount = 15;

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

// Постоянный спавн огня и дыма над уничтоженными пушками
function spawnFireAndSmoke() {
    burningUnitsPositions.forEach(pos => {
        // Спавним огонек (красный/оранжевый/желтый)
        const colors = [0xff4500, 0xff8c00, 0xffd700, 0x555555]; // Последний — серый дым
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        
        const geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
        const mat = new THREE.MeshBasicMaterial({ color: randomColor });
        const mesh = new THREE.Mesh(geo, mat);
        
        mesh.position.set(pos.x + (Math.random() - 0.5) * 0.2, 0.4, pos.z + (Math.random() - 0.5) * 0.2);
        scene.add(mesh);
        
        particles.push({
            mesh: mesh,
            vX: (Math.random() - 0.5) * 0.02,
            vY: 0.03 + Math.random() * 0.03, // Летит вверх
            vZ: (Math.random() - 0.5) * 0.02,
            life: 20 + Math.random() * 15
        });
    });
}

// --- UI И КНОПКИ ---
const btnFire = document.getElementById('btn-fire');
const btnMove = document.getElementById('btn-move');
const turnIndicator = document.getElementById('turn-indicator');
const timerDisplay = document.getElementById('timer');
const controls = document.getElementById('controls');

btnFire.addEventListener('click', (e) => {
    e.stopPropagation(); 
    currentMode = 'fire';
    btnFire.classList.add('active');
    btnMove.classList.remove('active');
});

btnMove.addEventListener('click', (e) => {
    e.stopPropagation(); 
    currentMode = 'move';
    btnMove.classList.add('active');
    btnFire.classList.remove('active');
});

// --- ОБРАБОТКА КЛИКОВ ---
window.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.id === 'controls') return;

    if (!gameState) return;

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
            const firingRole = (gameState.turn === myId) ? myRole : (myRole === 'p1' ? 'p2' : 'p1');
            
            socket.emit('playerAction', { 
                type: 'fire', 
                x: gridX, 
                y: gridY,
                forcedRole: firingRole 
            });
        } 
        else if (currentMode === 'move') {
            const targetRole = isEnemy ? 'p2' : 'p1';
            const targetUnits = gameState.players[targetRole].units;
            
            if (!targetUnits || targetUnits.length === 0) return;

            // Находим ближайшую ЖИВУЮ пушку
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

// --- СЕТЕВАЯ ЛОГИКА ---
socket.emit('joinGame');

socket.on('waiting', (msg) => { turnIndicator.innerText = msg; });

socket.on('gameStart', (data) => {
    myRole = data.role;
    myId = socket.id;
    gameState = data.state;
    controls.classList.remove('hidden');
    updateTurnUI();
    renderUnits();
});

socket.on('timerUpdate', (time) => { timerDisplay.innerText = time; });

socket.on('turnChanged', (data) => {
    if (!gameState) return;
    gameState.turn = data.turn;
    timerDisplay.innerText = data.timer;
    updateTurnUI();
});

socket.on('gameStateUpdate', (newState) => {
    gameState = newState;
    renderUnits();
});

socket.on('fireResult', (data) => {
    const offset = data.targetRole === 'p2' ? 5 : -5;
    const worldX = data.x - 3.5 + offset;
    const worldZ = data.y - 3.5;

    createSplash(worldX, worldZ, data.result);
});

socket.on('gameOver', (data) => {
    alert(data.winner === myId ? "ПОБЕДА! Все пушки врага уничтожены!" : "ПОРАЖЕНИЕ! Ваши пушки уничтожены.");
    window.location.reload();
});

function updateTurnUI() {
    if (gameState.turn === myId) {
        turnIndicator.innerText = "ТВОЙ ХОД!";
        turnIndicator.style.color = "#2ed573";
    } else {
        turnIndicator.innerText = "ХОД СОПЕРНИКА...";
        turnIndicator.style.color = "#ff4757";
    }
}

function renderUnits() {
    Object.keys(visualUnits).forEach(id => scene.remove(visualUnits[id]));
    burningUnitsPositions.length = 0; // Сбрасываем старые точки горения перед перерисовкой
    
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;
    const p1Offset = -5;
    const p2Offset = 5;

    if (p1 && p1.units) {
        p1.units.forEach((unit, index) => {
            const worldX = unit.x - 3.5 + p1Offset;
            const worldZ = unit.y - 3.5;
            createVisualUnit(`p1_${index}`, worldX, worldZ, 0x1e90ff, unit.destroyed);
            
            if (unit.destroyed) burningUnitsPositions.push({ x: worldX, z: worldZ });
        });
    }

    if (p2 && p2.units) {
        p2.units.forEach((unit, index) => {
            const worldX = unit.x - 3.5 + p2Offset;
            const worldZ = unit.y - 3.5;
            createVisualUnit(`p2_${index}`, worldX, worldZ, 0xff4757, unit.destroyed);
            
            if (unit.destroyed) burningUnitsPositions.push({ x: worldX, z: worldZ });
        });
    }
}

// --- ИГРОВОЙ ЦИКЛ С ОБНОВЛЕНИЕМ ЧАСТИЦ ---
function animate() {
    requestAnimationFrame(animate);

    // Спавним огонек над уничтоженными объектами каждый кадр
    spawnFireAndSmoke();

    // Обновление физики частиц
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.mesh.position.x += p.vX;
        p.mesh.position.y += p.vY;
        p.mesh.position.z += p.vZ;

        p.vY -= 0.003; // Небольшая гравитация
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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
