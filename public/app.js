const socket = io();

let myRole = null, myId = null, gameState = null;
let currentMode = 'fire', hasDoneActionThisTurn = false, selectedUnitId = null;

const visualUnits = {};
let selectionRing = null;
const activeParticles = []; 

const gltfLoader = new THREE.GLTFLoader();
const textureLoader = new THREE.TextureLoader();
let sauModelTemplate = null;

const FIELD_SIZE = 25;
const FIELD_OFFSET_Z = 13.5; 
const DIRECT_RADIUS = 1.25;  
const SPLASH_RADIUS = 4.0;   

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

// --- УМНАЯ КАМЕРА С АВТОРАСЧЕТОМ ДЛЯ ЛЮБЫХ ЭКРАНОВ ---
const camera = new THREE.PerspectiveCamera(41, window.innerWidth / window.innerHeight, 0.1, 1000);

function adjustCamera() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / height;
    
    camera.aspect = aspect;

    if (aspect < 1) {
        // СМАРТФОНЫ И ВЕРТИКАЛЬНЫЕ ЭКРАНЫ
        // Вычисляем коэффициент сужения экрана
        const multiplier = 1 / aspect; 
        
        // Динамически подбираем высоту и удаление, чтобы поля идеально вписались
        const dynamicY = 38.0 * multiplier;
        const dynamicZ = 33.0 * multiplier;
        
        // Ставим жесткие рамки-ограничители, чтобы камера не улетала в космос
        camera.position.set(0, Math.min(dynamicY, 56), Math.min(dynamicZ, 50));
        
        // Центрируем взгляд камеры с легким наклоном для полного обзора нижней кромки
        camera.lookAt(0, -4.5, 2.0);
    } else {
        // ПК И ПЛАНШЕТЫ (Широкий экран)
        // Идеальные стандартные настройки десктопа
        camera.position.set(0, 51.0, 44.5);
        camera.lookAt(0, -2, 3.2);
    }
    
    camera.updateProjectionMatrix();
}

// Запускаем расчет при загрузке страницы
adjustCamera();

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
dirLight.position.set(30, 60, 20);
scene.add(dirLight);

textureLoader.load('assets/background.jpg', (tex) => { scene.background = tex; });

let fieldClickPlanes = [];
function initFields() {
    const fieldGeometry = new THREE.BoxGeometry(FIELD_SIZE, 0.1, FIELD_SIZE);
    
    textureLoader.load('assets/battlefield.jpg', (battleTex) => {
        const fieldMaterial = new THREE.MeshStandardMaterial({ map: battleTex, roughness: 0.8 });
        
        const f1 = new THREE.Mesh(fieldGeometry, fieldMaterial);
        f1.position.set(0, 0, FIELD_OFFSET_Z);
        scene.add(f1);

        const f2 = new THREE.Mesh(fieldGeometry, fieldMaterial);
        f2.position.set(0, 0, -FIELD_OFFSET_Z);
        scene.add(f2);
    });

    const clickGeo = new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE).rotateX(-Math.PI / 2);
    const clickMat = new THREE.MeshBasicMaterial({ visible: false });

    const p1Plane = new THREE.Mesh(clickGeo, clickMat);
    p1Plane.position.set(0, 0.05, FIELD_OFFSET_Z);
    p1Plane.userData = { role: 'p1' };
    scene.add(p1Plane);
    fieldClickPlanes.push(p1Plane);

    const p2Plane = new THREE.Mesh(clickGeo, clickMat);
    p2Plane.position.set(0, 0.05, -FIELD_OFFSET_Z);
    p2Plane.userData = { role: 'p2' };
    scene.add(p2Plane);
    fieldClickPlanes.push(p2Plane);
}
initFields();

gltfLoader.load('models/sau.glb', (gltf) => {
    sauModelTemplate = gltf.scene;
    const box = new THREE.Box3().setFromObject(sauModelTemplate);
    const size = new THREE.Vector3(); box.getSize(size);
    const scale = 3.0 / Math.max(size.x, size.y, size.z); 
    sauModelTemplate.scale.set(scale, scale, scale);
    if (gameState) renderUnits();
});

const info = document.getElementById('status-text');
const timerEl = document.getElementById('timer-text');
const controls = document.getElementById('controls-panel');
const btnFire = document.getElementById('btn-fire');
const btnMove = document.getElementById('btn-move');

function updateButtonsUI() {
    if (!btnFire || !btnMove) return;
    if (currentMode === 'fire') {
        btnFire.className = 'btn-action btn-fire-active';
        btnMove.className = 'btn-action btn-inactive';
    } else {
        btnMove.className = 'btn-action btn-move-active';
        btnFire.className = 'btn-action btn-inactive';
    }
}

if (btnFire) btnFire.addEventListener('click', (e) => { e.stopPropagation(); currentMode = 'fire'; removeSelectionRing(); selectedUnitId = null; updateButtonsUI(); });
if (btnMove) btnMove.addEventListener('click', (e) => { e.stopPropagation(); currentMode = 'move'; updateButtonsUI(); autoSelectUnit(); });

function autoSelectUnit() {
    if (!gameState || !myRole) return;
    const units = gameState.players[myRole].units;
    const firstAliveIndex = units.findIndex(u => !u.destroyed);
    if (firstAliveIndex !== -1) {
        selectedUnitId = `${myRole}_${firstAliveIndex}`;
        drawSelectionRing(visualUnits[selectedUnitId]);
    }
}

function drawSelectionRing(parentMesh) {
    removeSelectionRing();
    if (!parentMesh) return;
    const ringGeo = new THREE.RingGeometry(0, 2.0, 32).rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    selectionRing = new THREE.Mesh(ringGeo, ringMat);
    selectionRing.position.y = 0.06;
    parentMesh.add(selectionRing);
}

function removeSelectionRing() {
    if (selectionRing && selectionRing.parent) { selectionRing.parent.remove(selectionRing); }
    selectionRing = null;
}

function createDirtSplash(x, z) {
    const pCount = 40; 
    const geom = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const mat = new THREE.MeshBasicMaterial({ color: 0x5c4033 }); 

    for (let i = 0; i < pCount; i++) {
        const mesh = new THREE.Mesh(geom, mat);
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * DIRECT_RADIUS;
        mesh.position.set(x + Math.cos(angle) * radius, 0.3, z + Math.sin(angle) * radius);
        
        scene.add(mesh);

        activeParticles.push({
            mesh: mesh,
            type: 'dirt',
            velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                Math.random() * 6 + 3, 
                (Math.random() - 0.5) * 4
            ),
            gravity: -9.8,
            life: 2.0 
        });
    }
}

function createFireEffect(parentGroup) {
    const pCount = 15;
    const geom = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true }); 

    setInterval(() => {
        if (!parentGroup.parent) return; 
        
        const mesh = new THREE.Mesh(geom, mat.clone());
        mesh.position.set(
            parentGroup.position.x + (Math.random() - 0.5) * 2,
            parentGroup.position.y + 0.5,
            parentGroup.position.z + (Math.random() - 0.5) * 2
        );
        scene.add(mesh);

        activeParticles.push({
            mesh: mesh,
            type: 'fire',
            velocity: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 3 + 1, (Math.random() - 0.5) * 1.5),
            gravity: 1.5, 
            life: 0.8
        });
    }, 150); 
}

function createVisualUnit(id, mX, mY, role, hp, isDestroyed) {
    const group = new THREE.Group();
    const offsetZ = (role === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    
    const wX = mX - (FIELD_SIZE / 2);
    const wZ = mY - (FIELD_SIZE / 2) + offsetZ;
    
    group.position.set(wX, 0, wZ);
    group.rotation.y = (role === 'p1') ? Math.PI / 2 : -Math.PI / 2;
    scene.add(group);
    visualUnits[id] = group;

    if (sauModelTemplate) {
        const model = sauModelTemplate.clone(); model.traverse((child) => {
            if (child.isMesh && isDestroyed) {
                child.material = child.material.clone();
                child.material.color.setHex(0x111111); 
                child.material.transparent = true;
                child.material.opacity = 0.7;
            }
        });
        group.add(model);
    }

    if (isDestroyed) {
        createFireEffect(group); 
    }

    let hpBar = document.getElementById(`hp-${id}`);
    if (!hpBar) {
        hpBar = document.createElement('div');
        hpBar.id = `hp-${id}`;
        hpBar.className = 'hp-bar';
        hpBar.innerHTML = '<div class="fill"></div>';
        document.body.appendChild(hpBar);
    }
    
    if (isDestroyed) hpBar.style.display = 'none';
    else {
        hpBar.style.display = 'block';
        hpBar.querySelector('.fill').style.width = `${hp}%`;
    }
    group.userData = { hpDom: hpBar };
}

function updateHpBarPositions() {
    const tempV = new THREE.Vector3();
    Object.keys(visualUnits).forEach(id => {
        const g = visualUnits[id];
        const dom = g.userData.hpDom;
        if (dom && dom.style.display !== 'none') {
            g.getWorldPosition(tempV);
            tempV.y += 2.8; 
            tempV.project(camera);
            const x = (tempV.x * .5 + .5) * window.innerWidth;
            const y = (tempV.y * -.5 + .5) * window.innerHeight;
            dom.style.transform = `translate(-50%, -50%) translate(${x}px,${y}px)`;
        }
    });
}

function renderUnits() {
    Object.keys(visualUnits).forEach(id => {
        if (visualUnits[id].userData.hpDom) visualUnits[id].userData.hpDom.remove();
        scene.remove(visualUnits[id]);
    });
    removeSelectionRing();

    if (!gameState) return;

    ['p1', 'p2'].forEach(role => {
        gameState.players[role].units.forEach((u, i) => {
            if (u.x === -1000) return; 
            createVisualUnit(`${role}_${i}`, u.x, u.y, role, u.hp, u.destroyed);
        });
    });

    if (selectedUnitId && visualUnits[selectedUnitId] && currentMode === 'move') {
        drawSelectionRing(visualUnits[selectedUnitId]);
    }
}

window.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON' || !gameState || gameState.turn !== myRole || hasDoneActionThisTurn) return;

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(mouse, camera);

    if (currentMode === 'move') {
        const meshes = Object.values(visualUnits);
        const hits = raycaster.intersectObjects(meshes, true);
        if (hits.length > 0) {
            let obj = hits[0].object;
            while (obj.parent && obj.parent !== scene) obj = obj.parent;
            const foundId = Object.keys(visualUnits).find(k => visualUnits[k] === obj);
            if (foundId && foundId.startsWith(myRole)) {
                const idx = parseInt(foundId.split('_')[1]);
                if (!gameState.players[myRole].units[idx].destroyed) {
                    selectedUnitId = foundId;
                    drawSelectionRing(obj);
                    return;
                }
            }
        }
    }

    const intersects = raycaster.intersectObjects(fieldClickPlanes);
    if (intersects.length > 0) {
        const hit = intersects[0];
        const planeRole = hit.object.userData.role;
        const offsetZ = (planeRole === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;

        const serverX = hit.point.x + (FIELD_SIZE / 2);
        const serverY = hit.point.z + (FIELD_SIZE / 2) - offsetZ;

        if (currentMode === 'fire' && planeRole !== myRole) {
            hasDoneActionThisTurn = true;
            if (btnFire) btnFire.style.display = 'none';
            if (btnMove) btnMove.style.display = 'none';
            socket.emit('playerAction', { type: 'fire', x: serverX, y: serverY });
        } 
        else if (currentMode === 'move' && planeRole === myRole && selectedUnitId) {
            const idx = parseInt(selectedUnitId.split('_')[1]);
            hasDoneActionThisTurn = true;
            if (btnFire) btnFire.style.display = 'none';
            if (btnMove) btnMove.style.display = 'none';
            removeSelectionRing();
            socket.emit('playerAction', { type: 'move', unitIndex: idx, x: serverX, y: serverY });
            selectedUnitId = null;
        }
    }
});

socket.on('waiting', (time) => { 
    if (info) { info.innerText = 'WAITING FOR OPPONENT...'; info.style.color = '#ff9f43'; }
    if (controls) controls.style.display = 'flex'; 
    if (btnFire) btnFire.style.display = 'none';
    if (btnMove) btnMove.style.display = 'none';
    if (timerEl) { timerEl.style.display = 'block'; timerEl.innerText = `${time}s`; }
});

socket.on('lobbyTimerUpdate', (time) => {
    if (timerEl) { timerEl.style.display = 'block'; timerEl.innerText = `${time}s`; }
});

socket.on('gameStart', (data) => { 
    myRole = data.role; 
    myId = socket.id; 
    gameState = data.state; 
    updateTurnUI(); 
    renderUnits(); 
});

socket.on('timerUpdate', (t) => { 
    if (timerEl) { timerEl.style.display = 'block'; timerEl.innerText = `${t}s`; }
});

socket.on('turnChanged', (data) => { 
    gameState = data.state; 
    hasDoneActionThisTurn = false; 
    if (timerEl) { timerEl.style.display = 'block'; timerEl.innerText = `${data.timer}s`; }
    updateTurnUI(); 
    renderUnits(); 
});

socket.on('gameStateUpdate', (state) => { gameState = state; renderUnits(); });

socket.on('fireResult', (data) => {
    const offsetZ = (data.targetRole === 'p1') ? FIELD_OFFSET_Z : -FIELD_OFFSET_Z;
    const wX = data.x - (FIELD_SIZE / 2);
    const wZ = data.y - (FIELD_SIZE / 2) + offsetZ;

    const splashGeo = new THREE.RingGeometry(0, SPLASH_RADIUS, 32).rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const splashMesh = new THREE.Mesh(splashGeo, splashMat);
    splashMesh.position.set(wX, 0.3, wZ); 
    scene.add(splashMesh);

    const directGeo = new THREE.RingGeometry(0, DIRECT_RADIUS, 32).rotateX(-Math.PI / 2);
    const directMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const directMesh = new THREE.Mesh(directGeo, directMat);
    directMesh.position.set(wX, 0.31, wZ); 
    scene.add(directMesh);

    createDirtSplash(wX, wZ);

    setTimeout(() => {
        scene.remove(splashMesh);
        scene.remove(directMesh);
    }, 2000);
});

socket.on('gameOver', (data) => {
    document.querySelectorAll('.hp-bar').forEach(el => el.remove());
    if (data.winner === 'timeout_no_opponent') alert('Lobby closed: No opponent connected within 300 seconds.');
    else if (data.winner === 'opponent_disconnected') alert('Opponent disconnected. You win!');
    else alert(data.winnerRole === myRole ? 'VICTORY!' : 'DEFEAT!');
    window.location.reload();
});

function updateTurnUI() {
    if (controls) controls.style.display = 'flex'; 
    if (timerEl) timerEl.style.display = 'block'; 

    if (gameState && gameState.turn === myRole) {
        if (info) info.innerText = ''; 
        if (btnFire) btnFire.style.display = 'block'; 
        if (btnMove) btnMove.style.display = 'block';
        currentMode = 'fire';
        updateButtonsUI();
    } else {
        if (info) { info.innerText = "OPPONENT'S TURN..."; info.style.color = '#ff4757'; }
        if (btnFire) btnFire.style.display = 'none'; 
        if (btnMove) btnMove.style.display = 'none';
    }
}

const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        p.life -= delta;

        if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            if(p.mesh.material.dispose) p.mesh.material.dispose();
            activeParticles.splice(i, 1);
        } else {
            if (p.type === 'dirt') {
                p.velocity.y += p.gravity * delta;
                p.mesh.position.addScaledVector(p.velocity, delta);
                if (p.mesh.position.y < 0.3) {
                    p.mesh.position.y = 0.3; 
                    p.velocity.set(0,0,0);
                }
            } else if (p.type === 'fire') {
                p.mesh.position.y += p.velocity.y * delta;
                p.mesh.position.x += p.velocity.x * delta;
                p.mesh.position.z += p.velocity.z * delta;
                p.mesh.material.opacity = p.life / 0.8; 
            }
        }
    }

    updateHpBarPositions();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    adjustCamera();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
