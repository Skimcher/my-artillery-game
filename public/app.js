const socket = io();

// --- НАСТРОЙКА THREE.JS (2.5D вид) ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// Камера под углом (как в MOBA)
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 15, 15); // Сверху и сбоку
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Свет
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// --- СОЗДАНИЕ ПОЛЕЙ (2 поля 8х8) ---
function createGrid(offsetX) {
    const gridGroup = new THREE.Group();
    const size = 1; // размер клеточки
    
    for (let x = 0; x < 8; x++) {
        for (let z = 0; z < 8; z++) {
            const geometry = new THREE.BoxGeometry(size - 0.05, 0.1, size - 0.05);
            const material = new THREE.MeshStandardMaterial({ color: 0x444444 });
            const cell = new THREE.Mesh(geometry, material);
            cell.position.set(x - 3.5 + offsetX, 0, z - 3.5);
            // Сохраняем координаты клетки для raycasting (кликов)
            cell.userData = { gridX: x, gridY: z, isEnemy: offsetX > 0 };
            gridGroup.add(cell);
        }
    }
    scene.add(gridGroup);
}

createGrid(-5); // Мое поле (слева)
createGrid(5);  // Поле соперника (справа)

// --- ЛОГИКА ИГРЫ И СЕТИ ---
let currentMode = 'fire'; // или 'move'

document.getElementById('btn-fire').addEventListener('click', () => currentMode = 'fire');
document.getElementById('btn-move').addEventListener('click', () => currentMode = 'move');

// Обработка кликов по клеткам (Raycasting)
window.addEventListener('click', onPointerDown);

function onPointerDown(event) {
    // Код для определения, на какую клеточку нажали
    // Если наш ход: отправляем на сервер socket.emit('playerAction', { ... })
}

// Слушаем ответы от сервера
socket.on('gameStateUpdate', (state) => {
    // Обновляем таймер на экране
    // Перерисовываем позиции артиллерии (например, в виде красных/синих 3D цилиндров)
    // Показываем эффекты взрыва или анимацию перемещения
});

// Анимационный цикл
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

// Подгонка под размеры экрана при изменении окна
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
