const socket = io();

// Переменные состояния игры
let myRole = null; 
let myId = null;
let gameState = null;
let currentMode = 'fire'; // Режим по умолчанию

// Словарь для хранения 3D-объектов пушек, чтобы мы могли их двигать
const visualUnits = {};

// --- НАСТРОЙКА THREE.JS (2.5D вид) ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);

// Изометрическая камера (MOBA-стиль)
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 12, 14); 
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Свет
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Сетки полей (для визуального разделения клеток)
const gridHelperLeft = new THREE.GridHelper(8, 8, 0xff4757, 0x444444);
gridHelperLeft.position.set(-5, 0.06, 0);
scene.add(gridHelperLeft);

const gridHelperRight = new THREE.GridHelper(8, 8, 0x2ed573, 0x444444);
gridHelperRight.position.set(5, 0.06, 0);
scene.add(gridHelperRight);

// --- СОЗДАНИЕ ПЛАТФОРМ ПОЛЕЙ (8х8) ---
function createGridPlatform(offsetX, isEnemy) {
    const size = 1; 
    for (let x = 0; x < 8; x++) {
        for (let z = 0; z < 8; z++) {
            const geometry = new THREE.BoxGeometry(size - 0.02, 0.1, size - 0.02);
            // Своё поле сделаем чуть темнее, вражеское — посветлее
            const material = new THREE.MeshStandardMaterial({ 
                color: isEnemy ? 0x2b2b2b : 0x1f1f1f,
                roughness: 0.5 
            });
            const cell = new THREE.Mesh(geometry, material);
            // Сдвигаем координаты, чтобы центр поля 8х8 был в (offsetX, 0, 0)
            cell.position.set(x - 3.5 + offsetX, 0, z - 3.5);
            
            cell.userData = { gridX: x, gridY: z, isEnemy: isEnemy };
            scene.add(cell);
        }
    }
}

createGridPlatform(-5, false); // Моё поле (слева)
createGridPlatform(5, true);   // Поле соперника (справа)

// --- ФУНКЦИЯ СОЗДАНИЯ 3D АРТИЛЛЕРposition ---
function createVisualUnit(id, x, z, color) {
    const group = new THREE.Group();
    
    // Основание пушки (куб)
    const baseGeo = new THREE.BoxGeometry(0.6, 0.3, 0.6);
    const baseMat = new THREE.MeshStandardMaterial({ color: color });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.15;
    group.add(base);

    // Ствол (цилиндр)
    const barrelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.5);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0, 0.4, 0.2);
    barrel.rotation.x = Math.PI / 4; // Наклонен вперед
    group.add(barrel);

    group.position.set(x, 0, z);
    scene.add(group);
    visualUnits[id] = group;
}

// --- УПРАВЛЕНИЕ UI И КНОПКАМИ ---
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

// --- СЕТЕВАЯ ЛОГИКА (SOCKET.IO) ---

// Автоматически отправляем запрос на поиск игры при загрузке страницы
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

function updateTurnUI() {
    if (gameState.turn === myId) {
        turnIndicator.innerText = "ТВОЙ ХОД!";
        turnIndicator.style.color = "#2ed573";
    } else {
        turnIndicator.innerText = "Ход соперника...";
        turnIndicator.style.color = "#ff4757";
    }
}

// Отрисовка пушек на поле на основе данных с сервера
function renderUnits() {
    // Удаляем старые модельки, если они были
    Object.keys(visualUnits).forEach(id => scene.remove(visualUnits[id]));
    
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    // Считаем смещение полей (у нас p1 всегда слева (-5), p2 справа (+5))
    const p1Offset = -5;
    const p2Offset = 5;

    // Рисуем пушки Игрока 1 (Синие)
    p1.units.forEach((unit, index) => {
        const uId = `p1_${index}`;
        createVisualUnit(uId, unit.x - 3.5 + p1Offset, unit.y - 3.5, 0x1e90ff);
    });

    // Рисуем пушки Игрока 2 (Красные)
    p2.units.forEach((unit, index) => {
        const uId = `p2_${index}`;
        createVisualUnit(uId, unit.x - 3.5 + p2Offset, unit.y - 3.5, 0xff4757);
    });
}

// --- ИГРОВОЙ ЦИКЛ АНИМАЦИИ ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

// Подгонка под размеры экрана
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
