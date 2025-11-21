// Game State
const state = {
    scene: null,
    camera: null,
    renderer: null,
    player: null,
    isPlaying: false,
    score: 0,
    regionData: null,
    currentProblem: null,
    trashBins: [],
    obstacles: [],
    animationId: null,
    keys: {},
    playerSpeed: 0.5,
    playerLane: 1, // 0: left, 1: center, 2: right
    lanes: [-3, 0, 3],
    roadSegments: [],
    roadLength: 100,
    lastObstacleZ: -50,
    gameSpeed: 0.2,
    playerZ: 0
};

// Initialize Three.js
function initThreeJS() {
    // Create scene
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0x87CEEB); // Sky blue
    
    // Camera setup
    state.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    state.camera.position.set(0, 5, 10);
    
    // Renderer
    const container = document.getElementById('gameContainer');
    state.renderer = new THREE.WebGLRenderer({ antialias: true });
    state.renderer.setSize(container.clientWidth, container.clientHeight);
    state.renderer.shadowMap.enabled = true;
    container.appendChild(state.renderer.domElement);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    state.scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    state.scene.add(dirLight);
}

// Create road
function createRoad() {
    const roadGeometry = new THREE.PlaneGeometry(10, state.roadLength);
    const roadMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        side: THREE.DoubleSide
    });
    
    // Create multiple road segments for infinite effect
    for (let i = 0; i < 3; i++) {
        const road = new THREE.Mesh(roadGeometry, roadMaterial);
        road.rotation.x = -Math.PI / 2;
        road.position.y = -0.4;
        road.position.z = -state.roadLength * i;
        road.receiveShadow = true;
        state.scene.add(road);
        state.roadSegments.push(road);
    }
    
    // Add road markings
    for (let i = -50; i < 200; i += 2) {
        const lineGeometry = new THREE.PlaneGeometry(0.5, 2);
        const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.rotation.x = -Math.PI / 2;
        line.position.set(0, -0.3, i * 5);
        state.scene.add(line);
    }
}

// Create player
function createPlayer() {
    const geometry = new THREE.BoxGeometry(0.5, 1, 1);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x00a8ff,
        metalness: 0.7,
        roughness: 0.3
    });
    state.player = new THREE.Mesh(geometry, material);
    state.player.position.set(0, 0.5, 3);
    state.player.castShadow = true;
    state.scene.add(state.player);
}

// Load region data
async function loadRegionData() {
    const regionSelect = document.getElementById('regionSelect');
    const regionFile = regionSelect.value;
    
    try {
        const response = await fetch(regionFile);
        state.regionData = await response.json();
    } catch (error) {
        console.error('Failed to load region data:', error);
        state.regionData = {
            bins: [
                { id: 'general', name: '일반쓰레기', color: 0x4CAF50 },
                { id: 'recycle', name: '재활용', color: 0x2196F3 },
                { id: 'food', name: '음식물', color: 0xFFC107 }
            ],
            problems: [
                { 
                    question: "어떤 쓰레기를 버려야 할까요? (플라스틱 병)",
                    answer: "recycle",
                    explanation: "플라스틱 병은 재활용으로 분류됩니다."
                }
            ]
        };
    }
}

// Create trash bins
function createTrashBins() {
    if (!state.regionData?.bins) return;
    
    state.trashBins = state.regionData.bins.map((bin, index) => {
        const geometry = new THREE.CylinderGeometry(0.5, 0.6, 1, 8);
        const material = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color(bin.color),
            transparent: true,
            opacity: 0.8
        });
        
        const binMesh = new THREE.Mesh(geometry, material);
        binMesh.position.set(state.lanes[index], 0.5, -15);
        binMesh.rotation.x = Math.PI / 2;
        binMesh.castShadow = true;
        binMesh.receiveShadow = true;
        binMesh.userData = { id: bin.id, name: bin.name };
        
        // Add question panel above bin
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 128;
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.font = '16px Noto Sans KR';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.fillText(bin.name, canvas.width/2, 30);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material2D = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true
        });
        const sprite = new THREE.Sprite(material2D);
        sprite.scale.set(3, 1.5, 1);
        sprite.position.set(binMesh.position.x, 2, binMesh.position.z);
        state.scene.add(sprite);
        
        return binMesh;
    });
    
    state.trashBins.forEach(bin => state.scene.add(bin));
}

// Game loop
function animate() {
    if (!state.isPlaying) return;
    
    state.animationId = requestAnimationFrame(animate);
    
    // Move player between lanes
    const targetX = state.lanes[state.playerLane];
    state.player.position.x += (targetX - state.player.position.x) * 0.1;
    
    // Move road and obstacles
    state.roadSegments.forEach(segment => {
        segment.position.z = (segment.position.z + state.gameSpeed) % (state.roadLength * 2);
        if (segment.position.z > state.roadLength) {
            segment.position.z -= state.roadLength * 2;
        }
    });
    
    // Move obstacles towards player
    state.obstacles.forEach(obstacle => {
        obstacle.position.z += state.gameSpeed * 5;
        
        // Check collision with player
        const distance = state.player.position.distanceTo(obstacle.position);
        if (distance < 1) {
            // Handle collision
            state.scene.remove(obstacle);
            state.obstacles = state.obstacles.filter(o => o !== obstacle);
            
            // Check if correct bin was selected
            const selectedBin = state.trashBins[state.playerLane];
            if (selectedBin && selectedBin.userData.id === state.currentProblem.answer) {
                state.score += 10;
                showFeedback('정답입니다! +10점', true);
            } else {
                state.score = Math.max(0, state.score - 5);
                showFeedback('틀렸습니다! -5점', false);
            }
            
            document.getElementById('score').textContent = state.score;
            spawnProblem();
        }
    });
    
    // Spawn new obstacles
    if (Math.random() < 0.02) {
        spawnObstacle();
    }
    
    // Update camera to follow player
    state.camera.position.x += (state.player.position.x - state.camera.position.x) * 0.05;
    state.camera.position.z = state.player.position.z + 10;
    state.camera.lookAt(state.player.position.x, state.player.position.y, state.player.position.z - 5);
    
    state.renderer.render(state.scene, state.camera);
}

// Spawn a new obstacle
function spawnObstacle() {
    if (!state.regionData?.problems?.length) return;
    
    const problem = state.regionData.problems[Math.floor(Math.random() * state.regionData.problems.length)];
    state.currentProblem = problem;
    
    const geometry = new THREE.SphereGeometry(0.3, 8, 8);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xff0000,
        metalness: 0.7,
        roughness: 0.3
    });
    
    const obstacle = new THREE.Mesh(geometry, material);
    obstacle.position.set(
        state.lanes[Math.floor(Math.random() * 3)],
        0.5,
        -50
    );
    obstacle.castShadow = true;
    obstacle.receiveShadow = true;
    
    state.scene.add(obstacle);
    state.obstacles.push(obstacle);
    
    // Update question panel
    const questionPanel = document.getElementById('questionText');
    questionPanel.textContent = problem.question;
}

// Show feedback message
function showFeedback(message, isCorrect) {
    const feedback = document.createElement('div');
    feedback.textContent = message;
    feedback.style.position = 'fixed';
    feedback.style.top = '50%';
    feedback.style.left = '50%';
    feedback.style.transform = 'translate(-50%, -50%)';
    feedback.style.padding = '20px';
    feedback.style.background = isCorrect ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)';
    feedback.style.color = 'white';
    feedback.style.borderRadius = '10px';
    feedback.style.zIndex = '1000';
    document.body.appendChild(feedback);
    
    setTimeout(() => {
        document.body.removeChild(feedback);
    }, 1000);
}

// Setup keyboard controls
function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
            state.playerLane = Math.max(0, state.playerLane - 1);
        } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
            state.playerLane = Math.min(2, state.playerLane + 1);
        }
    });
}

// Start game
async function startGame() {
    // Initialize Three.js
    initThreeJS();
    
    // Load region data
    await loadRegionData();
    
    // Reset game state
    state.isPlaying = true;
    state.score = 0;
    state.playerLane = 1;
    state.obstacles = [];
    
    // Clear scene
    while(state.scene.children.length > 0) { 
        state.scene.remove(state.scene.children[0]); 
    }
    
    // Setup game
    createRoad();
    createPlayer();
    createTrashBins();
    setupKeyboardControls();
    
    // Start with first problem
    spawnObstacle();
    
    // Start game loop
    animate();
    
    // Hide intro screen
    document.getElementById('intro').style.display = 'none';
    document.getElementById('scoreBox').style.display = 'block';
}

// Handle window resize
function handleResize() {
    if (state.camera && state.renderer) {
        state.camera.aspect = window.innerWidth / window.innerHeight;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Start button
    document.getElementById('startBtn').addEventListener('click', () => {
        const playerName = document.getElementById('playerName').value.trim();
        if (!playerName) {
            alert('이름을 입력해주세요!');
            return;
        }
        state.playerName = playerName;
        startGame();
    });
    
    // Restart button
    document.getElementById('restartBtn').addEventListener('click', () => {
        location.reload();
    });
    
    // Handle window resize
    window.addEventListener('resize', handleResize);
    
    // Initial resize to set correct dimensions
    handleResize();
});