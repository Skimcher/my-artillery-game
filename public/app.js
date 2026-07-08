// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    upgrade: true,
    forceNew: true
});

// --- СТИЛИ (ВСТРОЕННЫЕ) ---
const style = document.createElement('style');
style.innerHTML = `
    /* Фиксированный блок кнопок снизу по центру */
    #controls { 
        position: fixed; 
        bottom: 30px; 
        left: 50%; 
        transform: translateX(-50%); 
        z-index: 1000; 
        display: flex; 
        gap: 15px; 
    }
    #controls button { 
        padding: 12px 25px; 
        font-size: 16px; 
        cursor: pointer; 
        background: #333; 
        color: white; 
        border: 2px solid #fff; 
        border-radius: 5px; 
    }
    #controls button.active { background: #2ed573; }

    /* Полоски HP */
    .hp-bar-container { 
        position: absolute; 
        width: 60px; 
        height: 8px; 
        background: rgba(0,0,0,0.6); 
        border: 1px solid #fff; 
        z-index: 900; 
        pointer-events: none; 
    }
    .hp-bar-fill { height: 100%; background: #2ed573; transition: width 0.2s; }
`;
document.head.appendChild(style);

// --- ОСНОВНЫЕ ПЕРЕМЕННЫЕ ---
let myRole = null, myId = null, gameState = null, currentMode = 'fire';
let selectedUnitId = null, selectionRing = null;
const visualUnits = {}, particles = [], burningUnitsPositions = [];
const FIELD_SIZE = 25, FIELD_OFFSET_Z = 13.5;

// --- THREE.JS ИНИЦИАЛИЗАЦИЯ ---
const container = document.getElementById('canvas-container') || document.body;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(41, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// --- ФУНКЦИЯ СОЗДАНИЯ ЮНИТА И HP ---
function createVisualUnit(id, serverX, serverY, ringColor, isDestroyed, owner, hp) {
    const group = new THREE.Group();
    const offsetZ = (owner === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    group.position.set(serverX - (FIELD_SIZE / 2), 0, serverY - (FIELD_SIZE / 2) + offsetZ);
    scene.add(group);
    visualUnits[id] = group;

    // Создаем DOM-элемент полоски HP
    const hpContainer = document.createElement('div');
    hpContainer.id = `hp-${id}`;
    hpContainer.className = 'hp-bar-container';
    hpContainer.innerHTML = `<div class="hp-bar-fill" style="width: ${hp}%"></div>`;
    document.body.appendChild(hpContainer);
    
    group.userData = { domId: `hp-${id}` };
}

// --- ОБНОВЛЕНИЕ ПОЗИЦИЙ HP ---
function updateHpBarsPositions() {
    const vector = new THREE.Vector3();
    Object.keys(visualUnits).forEach(id => {
        const group = visualUnits[id];
        const domEl = document.getElementById(group.userData.domId);
        if (domEl) {
            group.getWorldPosition(vector);
            vector.y += 3.5;
            vector.project(camera);
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
            domEl.style.left = `${x - 30}px`; // Центрируем полоску
            domEl.style.top = `${y}px`;
        }
    });
}

// --- ОБРАБОТКА ДЕЙСТВИЙ (сокет, анимация и т.д.) ---
// (Остальная часть вашей логики остается без изменений, 
// главное — используйте этот метод createVisualUnit и updateHpBarsPositions)

function animate() {
    requestAnimationFrame(animate);
    updateHpBarsPositions();
    renderer.render(scene, camera);
}
animate();
