const socket = io('https://artillery-game2.onrender.com', { transports: ['websocket'] });

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('canvas-container').appendChild(renderer.domElement);

camera.position.set(0, 50, 50);
camera.lookAt(0, 0, 0);

const loader = new THREE.GLTFLoader();
let tankTemplate = null;

socket.on('connect', () => {
    console.log("Соединение установлено");
    socket.emit('joinGame');
});

socket.on('gameStart', (data) => {
    document.getElementById('loader').style.display = 'none';
    console.log("Игра началась", data);
});

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();
