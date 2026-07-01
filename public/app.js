const socket = io();

// --- СОСТОЯНИЕ ИГРЫ ---
let myRole = null;          
let myId = null;            
let gameState = null;       
let currentMode = 'fire';   

const visualUnits = {};     
const particles = []; 
const burningUnitsPositions = []; 

const gltfLoader = new THREE.GLTFLoader();
let sauModelTemplate = null; // Шаблон модели в памяти для мгновенного клонирования

// --- ПРОВЕРКА НА МОБИЛЬНОЕ УСТРОЙСТВО ---
function isMobileDevice() {
    return (window.innerWidth < window.innerHeight) || 
           (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
}

let isMobile = isMobileDevice();

// --- НАСТРОЙКА THREE.JS ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xF5F2EB);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);

function updateCameraPosition() {
    if (isMobile) {
        camera.position.set(0, 18, 11); 
        camera.lookAt(0, 0, 0);
    } else {
        camera.position.set(0, 12, 14); 
        camera.lookAt(0, 1, 0);
    }
}
updateCameraPosition();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Настройка правильного военного освещения
const ambientLight = new THREE.AmbientLight(0xffffff, 0.85); 
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
dirLight.position.set(15, 30, 10);
scene.add(dirLight);

// --- СОЗДАНИЕ СЕТОК (РАЗМЕТКА) ---
const gridHelperLeft = new THREE.GridHelper(8, 8, 0x888888, 0x888888);
const gridHelperRight = new THREE.GridHelper(8, 8, 0x888888, 0x888888);

function positionGridHelpers() {
    if (isMobile) {
        gridHelperLeft.position.set(0, 0.06, 5);
        gridHelperRight.position.set(0, 0.06, -5);
    } else {
        gridHelperLeft.position.set(-5, 0.06, 0);
        gridHelperRight.position.set(5, 0.06, 0);
    }
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

            if (isMobile) {
                cell1.position.set(x - 3.5, 0, z - 3.5 + 5);
                cell2.position.set(x - 3.5, 0, z - 3.5 - 5);
            } else {
                cell1.position.set(x - 3.5 - 5, 0, z - 3.5);
                cell2.position.set(x - 3.5 + 5, 0, z - 3.5);
            }

            cell1.userData = { gridX: x, gridY: z, isEnemy: false };
            cell2.userData = { gridX: x, gridY: z, isEnemy: true };

            scene.add(cell1);
            scene.add(cell2);
            clickableCells.push(cell1, cell2);
        }
    }
}
createGridPlatforms();

// --- ИДЕАЛЬНОЕ ЦЕНТРИРОВАНИЕ ГЕОМЕТРИИ МОДЕЛИ ОДИН РАЗ ПРИ ЗАГРУЗКЕ ---
gltfLoader.load('/models/sau.glb', (gltf) => {
    sauModelTemplate = gltf.scene;
    
    // Сначала принудительно сбрасываем локальные позиции мешей, центрируя их геометрию внутренне
    sauModelTemplate.traverse((child) => {
        if (child.isMesh && child.geometry) {
            child.geometry.center(); // Сдвигает Pivot Point геометрии строго в её центр!
        }
    });

    // Теперь измеряем чистые габариты получившейся отцентрированной модели
    const box = new THREE.Box3().setFromObject(sauModelTemplate);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // Наш увеличенный гигантский размер
    const targetSize = 2.0; 
    const scaleFactor = targetSize / maxDim;
    sauModelTemplate.scale.set(scaleFactor, scaleFactor, scaleFactor);
    
    // Обнуляем позиции шаблона. Теперь модель гарантированно вращается вокруг своей оси симметрии!
    sauModelTemplate.position.set(0, 0, 0);

    // Приподнимем её чуть-чуть, чтобы гусеницы стояли ровно на земле, зная высоту
    const updatedBox = new THREE.Box3().setFromObject(sauModelTemplate);
    sauModelTemplate.position.y = -updatedBox.min.y;

    console.log("Мастер-модель с идеальным центром закеширована.");
    if (gameState) renderUnits();
}, undefined, (error) => {
    console.error('Критическая ошибка предзагрузки модели:', error);
});

// --- СИНХРОННОЕ ОТОБРАЖЕНИЕ ВОЕННЫХ САУ СТРОГО ПО ЦЕНТРУ ЯЧЕЕК ---
function createVisualUnit(id, gridX, gridY, ringColor, isDestroyed, owner) {
    const group = new THREE.Group();
    
    let worldX, worldZ;
    if (isMobile) {
        const offsetZ = (owner === 'p1') ? 5 : -5;
        worldX = gridX - 3.5;
        worldZ = gridY - 3.5 + offsetZ;
        group.rotation.y = (owner === 'p1') ? Math.PI : 0;
    } else {
        const offsetX = (owner === 'p1') ? -5 : 5;
        worldX = gridX - 3.5 + offsetX;
        worldZ = gridY - 3.5;
        // Поворот теперь будет работать идеально, так как ось вращения строго по центру танка
        group.rotation.y = (owner === 'p1') ? Math.PI / 2 : -Math.PI / 2;
    }

    group.position.set(worldX, 0, worldZ);
    scene.add(group);
    visualUnits[id] = group;

    // Цветной маркер команды на земле
    const ringGeo = new THREE.RingGeometry(0.38, 0.45, 32);
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
        
        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                if (!isDestroyed) {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x4B5320, // Хаки брони
                        roughness: 0.7,   
                        metalness: 0.15
                    });
                } else {
                    child.material = new THREE.MeshStandardMaterial({
                        color: 0x2b2e18, 
                        roughness: 0.95,
                        transparent: true,
                        opacity: 0.45
                    });
                }
            }
        });
        
        group.add(model);
    } else {
        const placeholderGeo = new THREE.BoxGeometry(0.7, 0.4, 0.7);
        const placeholderMat = new THREE.MeshStandardMaterial({ 
            color: isDestroyed ? 0x2b2e18 : 0x4B5320 
        });
        const placeholder = new THREE.Mesh(placeholderGeo, placeholderMat);
        placeholder.position.y = 0.2;
        group.add(placeholder);
    }
}

function createSplash(gridX, gridY, targetRole, type) {
    const color = (type === 'hit') ? 0xffa500 : 0x5c4033; 
    const particleCount = 15;

    let worldX, worldZ;
    if (isMobile) {
        const offsetZ = (targetRole === 'p1') ? 5 : -5;
        worldX = gridX - 3.5;
        worldZ = gridY - 3.5 + offsetZ;
    } else {
        const offsetX = (targetRole === 'p1') ? -5 : 5;
        worldX = gridX - 3.5 + offsetX;
        worldZ = gridY - 3.5;
    }

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

// --- ОБРАБОТКА КЛИКОВ (ТАПОВ) ---
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

            const aliveUnits = targetUnits.filter(u => !u.destroyed);
            if (aliveUnits.length === 0) return;

            let targetUnitIndex = targetUnits.findIndex(u => u === aliveUnits[0]);
            if (aliveUnits.length > 1) {
                const dist0 = Math.abs(aliveUnits[0].x - gridX) + Math.abs(aliveUnits[0].y - gridY);
                const dist1 = Math.abs(aliveUnits[1].length === 0 ? 0 : aliveUnits[1].x - gridX) + Math.abs(aliveUnits[1].y - gridY);
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
    createSplash(data.x, data.y, data.targetRole, data.result);
});

socket.on('gameOver', (data) => {
    alert(data.winner === myId ? "ПОБЕДА! Все САУ врага уничтожены!" : "ПОРАЖЕНИЕ! Ваши САУ уничтожены.");
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
    burningUnitsPositions.length = 0; 
    
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    if (p1 && p1.units) {
        p1.units.forEach((unit, index) => {
            createVisualUnit(`p1_${index}`, unit.x, unit.y, 0x1e90ff, unit.destroyed, 'p1');
            
            if (unit.destroyed) {
                let worldX, worldZ;
                if (isMobile) {
                    worldX = unit.x - 3.5; worldZ = unit.y - 3.5 + 5;
                } else {
                    worldX = unit.x - 3.5 - 5; worldZ = unit.y - 3.5;
                }
                burningUnitsPositions.push({ x: worldX, z: worldZ });
            }
        });
    }

    if (p2 && p2.units) {
        p2.units.forEach((unit, index) => {
            createVisualUnit(`p2_${index}`, unit.x, unit.y, 0xff4757, unit.destroyed, 'p2');
            
            if (unit.destroyed) {
                let worldX, worldZ;
                if (isMobile) {
                    worldX = unit.x - 3.5; worldZ = unit.y - 3.5 - 5;
                } else {
                    worldX = unit.x - 3.5 + 5; worldZ = unit.y - 3.5;
                }
                burningUnitsPositions.push({ x: worldX, z: worldZ });
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
    const currentMobileState = isMobileDevice();
    if (currentMobileState !== isMobile) {
        isMobile = currentMobileState;
        positionGridHelpers();
        createGridPlatforms();
        if (gameState) renderUnits();
    }
    
    updateCameraPosition();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});
