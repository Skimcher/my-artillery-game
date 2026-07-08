// --- ИНИЦИАЛИЗАЦИЯ ---
const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

// --- СЦЕНА И КАМЕРА ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.set(0, 50, 50);
camera.lookAt(0, 0, 0);

// --- СОЗДАНИЕ ПОЛЕЙ ---
const fieldGeo = new THREE.PlaneGeometry(20, 20);
const fieldMat = new THREE.MeshBasicMaterial({ color: 0x8b4513, side: THREE.DoubleSide });
const field1 = new THREE.Mesh(fieldGeo, fieldMat);
const field2 = new THREE.Mesh(fieldGeo, fieldMat);
field1.position.set(0, 0, 12);
field2.position.set(0, 0, -12);
field1.rotation.x = field2.rotation.x = Math.PI / 2;
scene.add(field1, field2);

// --- ЦИКЛ АНИМАЦИИ ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

// --- ЛОГИКА ---
socket.on('connect', () => {
    console.log("Соединение стабильно, запрашиваем игру...");
    socket.emit('joinGame');
});

socket.on('gameStart', (data) => {
    console.log("Игра началась!", data);
});
