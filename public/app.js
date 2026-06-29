const socket = io();

// --- СОСТОЯНИЕ ИГРЫ ---
let myRole = null;          // 'p1' или 'p2'
let myId = null;            // Socket ID игрока
let gameState = null;       // Текущий объект игры от сервера
let currentMode = 'fire';   // Режим: 'fire' или 'move'
let selectedUnitIndex = 0;  // Индекс управляемой пушки (0 или 1)

const visualUnits = {};     // Хранилище 3D-моделей пушек

// --- НАСТРОЙКА THREE.JS (2.5D MOBA-вид) ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x141414);

// Камера под углом сверху и сбоку
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 12, 14); 
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Освещение сцены
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Визуальные сетки поверх полей
const gridHelperLeft = new THREE.GridHelper(8, 8, 0x1e90ff, 0x444444);
gridHelperLeft.position.set(-5, 0.06, 0);
scene.add(gridHelperLeft);

const gridHelperRight = new THREE.GridHelper(8, 8, 0xff4757, 0x444444);
gridHelperRight.position.set(5, 0.06, 0);
scene.add(gridHelperRight);

// --- СОЗДАНИЕ ПЛАТФОРМ ПОЛЕЙ (8х8) ---
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
            
            // Записываем данные клетки в userData для Raycasting
            cell.userData = { gridX: x, gridY: z, isEnemy: isEnemy };
            scene.add(cell);
        }
    }
}

createGridPlatform(-5, false); // Моё поле (слева)
createGridPlatform(5, true);   // Поле соперника (справа)

// --- СОЗДАНИЕ 3D МОДЕЛЕЙ АРТИЛЛЕРИИ ---
function createVisualUnit(id, x, z, color) {
    const group = new THREE.Group();
    
    // Основание (гусеницы/платформа)
    const baseGeo = new THREE.BoxGeometry(0.7, 0.2, 0.7);
    const baseMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.4 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.1;
    group.add(base);

    // Башня пушки
    const cabinGeo = new THREE.BoxGeometry(0.4, 0.25, 0.4);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.y = 0.325;
    group.add(cabin);

    // Дуло (направлено вперед)
    const barrelGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.5);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 0.4, 0.25);
    barrel.rotation.x = Math.PI / 3; // Угол наклона артиллерии
    group.add(barrel);

    group.position.set(x, 0, z);
    scene.add(group);
    visualUnits[id] = group;
}

// --- ИНТЕРФЕЙС И КНОПКИ УПРАВЛЕНИЯ ---
const btnFire = document.getElementById('btn-fire');
const btnMove = document.getElementById('btn-move');
const turnIndicator = document.getElementById('turn-indicator');
const timerDisplay = document.getElementById('timer');
const controls = document.getElementById('controls');

btnFire.addEventListener('click', () => {
    currentMode = 'fire';
    btnFire.classList.add('active');
    btnMove.classList.remove('active');
});

btnMove.addEventListener('click', () => {
    currentMode = 'move';
    btnMove.classList.add('active');
    btnFire.classList.remove('active');
});

// --- ОБРАБОТКА КЛИКОВ (RAYCASTING) ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

window.addEventListener('click', (event) => {
    // Если игра не началась или сейчас не наш ход — клики заблокированы
    if (!gameState || gameState.turn !== myId) return;

    // Нормализация координат мыши
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;

        if (clickedMesh.userData && clickedMesh.userData.gridX !== undefined) {
            const { gridX, gridY, isEnemy } = clickedMesh.userData;

            if (currentMode === 'fire') {
                if (!isEnemy) return; // Стрелять можно только по чужому полю
                socket.emit('playerAction', { type: 'fire', x: gridX, y: gridY });
            } 
            else if (currentMode === 'move') {
                if (isEnemy) return; // Двигаться можно только по своему полю
                socket.emit('playerAction', { type: 'move', x: gridX, y: gridY, unitIndex: selectedUnitIndex });
            }
        }
    }
});

// --- СЕТЕВАЯ ЛОГИКА (SOCKET.IO) ---

// Автоматический поиск комнаты при старте
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

// Обновление состояния полей после выстрела или движения
socket.on('gameStateUpdate', (newState) => {
    gameState = newState;
    renderUnits();
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

// Отрисовка пушек игроков на базе серверных координат
function renderUnits() {
    // Очищаем старые модели со сцены
    Object.keys(visualUnits).forEach(id => scene.remove(visualUnits[id]));
    
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    // Смещение полей: p1 слева (-5), p2 справа (+5)
    // Если игрок является p2, мы можем инвертировать отображение, но для простоты 
    // оставим фиксированные стороны: Синие слева, Красные справа.
    const p1Offset = -5;
    const p2Offset = 5;

    // Отрисовка Игрока 1 (Синий цвет)
    p1.units.forEach((unit, index) => {
        const uId = `p1_${index}`;
        createVisualUnit(uId, unit.x - 3.5 + p1Offset, unit.y - 3.5, 0x1e90ff);
    });

    // Отрисовка Игрока 2 (Красный цвет)
    p2.units.forEach((unit, index) => {
        const uId = `p2_${index}`;
        createVisualUnit(uId, unit.x - 3.5 + p2Offset, unit.y - 3.5, 0xff4757);
    });
}

// --- ИГРОВОЙ ЦИКЛ ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

// Ресайз под размеры экрана
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
socket.on('gameOver', (data) => {
    if (data.winner === myId) {
        alert("ПОБЕДА! Вы уничтожили всю артиллерию противника!");
    } else {
        alert("ПОРАЖЕНИЕ! Все ваши пушки уничтожены.");
    }
    window.location.reload(); // Перезагружаем страницу для поиска новой игры
});
