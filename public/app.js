// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- СТИЛИ (ВСТРОЕННЫЕ) ---
const style = document.createElement('style');
style.innerHTML = `
    /* Кнопки управления */
    #controls { position: absolute; bottom: 20px; left: 20px; z-index: 100; display: flex; gap: 10px; }
    #controls button { padding: 15px 30px; font-size: 18px; cursor: pointer; }
    
    /* Полоски HP */
    .hp-bar-container { position: absolute; width: 60px; height: 8px; background: rgba(0,0,0,0.5); border: 1px solid white; z-index: 50; }
    .hp-bar-fill { height: 100%; background: #2ed573; transition: width 0.2s; }
`;
document.head.appendChild(style);

// --- ОТРИСОВКА HP (ВОЗВРАЩАЕМ КАК БЫЛО) ---
function createVisualUnit(id, serverX, serverY, ringColor, isDestroyed, owner, hp) {
    // ... логика THREE.js объектов ...
    
    // Создаем DOM-элемент для HP
    const hpContainer = document.createElement('div');
    hpContainer.id = `hp-${id}`;
    hpContainer.className = 'hp-bar-container';
    hpContainer.innerHTML = `<div class="hp-bar-fill" style="width: ${hp}%"></div>`;
    document.body.appendChild(hpContainer);
}

// --- ФУНКЦИЯ ОБНОВЛЕНИЯ ПОЗИЦИЙ HP ---
function updateHpBarsPositions() {
    Object.keys(visualUnits).forEach(id => {
        const group = visualUnits[id];
        const domEl = document.getElementById(`hp-${id}`);
        if (domEl) {
            // Проецируем 3D координаты в 2D экран
            const vector = new THREE.Vector3();
            group.getWorldPosition(vector);
            vector.y += 3.5; 
            vector.project(camera);
            const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (vector.y * -0.5 + 0.5) * window.innerHeight;
            domEl.style.left = `${x}px`;
            domEl.style.top = `${y}px`;
        }
    });
}
