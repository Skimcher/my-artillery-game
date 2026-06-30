const socket = io();

// --- СОСТОЯНИЕ ИГРЫ ---
let myRole = null;          
let myId = null;            
let gameState = null;       
let currentMode = 'fire';   

const visualUnits = {};     

// --- НАСТРОЙКА THREE.JS (Вид сверху под углом) ---
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

// Визуальная сетка поверх полей
const gridHelperLeft = new THREE.GridHelper(8, 8, 0x1e90ff, 0x444444);
gridHelperLeft.position.set(-5, 0.06, 0);
scene.add(gridHelperLeft);

const gridHelperRight = new THREE.GridHelper(8, 8, 0xff4757, 0x444444);
gridHelperRight.position.set(5, 0.06, 0);
scene.add(gridHelperRight);

// Сюда складываем только плитки полей для Raycasting
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

createGridPlatform(-5, false); // Наше синее поле (слева)
createGridPlatform(5, true);   // Чужое красное поле (справа)

function createVisualUnit(id, x, z, color) {
    const group = new THREE.Group();
    const baseGeo = new THREE.BoxGeometry(0.7, 0.2, 0.7);
    const baseMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.1;
    group.add(base);

    const cabinGeo = new THREE.BoxGeometry(0.4, 0.25, 0.4);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.y = 0.325;
    group.add(cabin);

    const barrelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.5);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 0.4, 0.25);
    barrel.rotation.x = Math.PI / 3; 
    group.add(barrel);

    group.position.set(x, 0, z);
    scene.add(group);
    visualUnits[id] = group;
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

// --- ОБРАБОТКА КЛИКОВ (RAYCASTING ЧЕРЕЗ WINDOW) ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

window.addEventListener('click', (event) => {
    if (event.target.tagName === 'BUTTON' || event.target.id === 'controls') return;

    if (!gameState) return;

    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(clickableCells);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        const { gridX, gridY, isEnemy } = clickedMesh.userData;

        console.log(`Клик зафиксирован: Режим=${currentMode}, X=${gridX}, Y=${gridY}, Враг=${isEnemy}`);

        if (currentMode === 'fire') {
            // Выстрел: целимся по вражескому (правому/красному) полю
            if (!isEnemy) { console.log("Стрелять можно только по чужому полю!"); return; }
            
            // Стреляет тот, чье сейчас поле активное на экране (для соло-тестов)
            const firingRole = (gameState.turn === myId) ? myRole : (myRole === 'p1' ? 'p2' : 'p1');
            
            socket.emit('playerAction', { 
                type: 'fire', 
                x: gridX, 
                y: gridY,
                forcedRole: firingRole 
            });
        } 
        else if (currentMode === 'move') {
            // Перемещение: ходим СТРОГО по полю выбранного цвета плитки
            // Если кликнули по левому полю (isEnemy === false) — двигаем синих (p1)
            // Если кликнули по правому полю (isEnemy === true) — двигаем красных (p2)
            const targetRole = isEnemy ? 'p2' : 'p1';
            const targetUnits = gameState.players[targetRole].units;
            let targetUnitIndex = 0;
            
            // Находим ближайшую к клику пушку выбранного цвета
            if (targetUnits.length > 1) {
                const dist0 = Math.abs(targetUnits[0].x - gridX) + Math.abs(targetUnits[0].y - gridY);
                const dist1 = Math.abs(targetUnits[1].x - gridX) + Math.abs(targetUnits[1].y - gridY);
                if (dist1 < dist0) targetUnitIndex = 1;
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

socket.on('waiting', (msg) => {
    turnIndicator.innerText = msg;
});

socket.on('gameStart', (data) => {
    myRole = data.role;
    myId = socket.id;
    gameState = data.state;
    controls.classList.remove('hidden');
    updateTurnUI();
    renderUnits();
});

socket.on('timerUpdate', (time) => {
    timerDisplay.innerText = time;
});

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
    
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;
    const p1Offset = -5;
    const p2Offset = 5;

    p1.units.forEach((unit, index) => {
        createVisualUnit(`p1_${index}`, unit.x - 3.5 + p1Offset, unit.y - 3.5, 0x1e90ff);
    });

    p2.units.forEach((unit, index) => {
        createVisualUnit(`p2_${index}`, unit.x - 3.5 + p2Offset, unit.y - 3.5, 0xff4757);
    });
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
