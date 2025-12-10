import { FontLoader } from '/node_modules/three/src/loaders/FontLoader.js';
import { TextGeometry } from '/node_modules/three/src/geometries/TextGeometry.js';

document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('webcam');
    const canvasElement = document.getElementById('canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const statusElement = document.getElementById('status');
    const threeContainer = document.getElementById('three-canvas');
    
    // CSV Parser function
    async function loadJobsFromCSV() {
        try {
            const response = await fetch('/static/assets/jobs.csv');
            if (!response.ok) {
                throw new Error(`Failed to load CSV: ${response.statusText}`);
            }
            const csvText = await response.text();
            const jobs = parseCSV(csvText);
            console.log('Jobs loaded:', jobs);
            return jobs;
        } catch (error) {
            console.error('Error loading jobs CSV:', error);
            return [];
        }
    }
    
    // Parse CSV text into array of objects
    function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        if (lines.length < 2) return [];
        
        // Extract headers from first line
        const headers = lines[0].split(',').map(h => h.trim());
        
        // Parse each row into an object
        const jobs = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim());
            const job = {};
            
            headers.forEach((header, index) => {
                job[header] = values[index] || '';
            });
            
            return job;
        }).filter(job => Object.values(job).some(val => val !== '')); // Filter out empty rows
        
        return jobs;
    }
    
    // Three.js variables
    let scene, camera, renderer;
    let sphere, solidMesh, wireframeMesh;
    let textSprite;
    
    // Hand tracking variables
    let rightHandActive = false;
    let leftHandActive = false;
    let lastColorChangeTime = 0;
    const colorChangeDelay = 500; // milliseconds
    let currentSphereSize = 1.0; // Default/starting size
    let targetSphereSize = 1.0;  // Target size based on hand gesture
    const smoothingFactor = 0.15; // Adjust this value between 0-1 (lower = smoother but slower)
    
    // Floating job rectangles variables
    let floatingJobs = [];
    let jobsLoaded = [];
    const jobRectWidth = 200;
    const jobRectHeight = 80;
    const jobAnimationDuration = 800; // milliseconds for ease-in animation
    let totalJobsSpawned = 0; // Track total spawned

    // Keep canvas size in sync with window size
    function updateCanvasSize() {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
    }
    
    // Initialize and properly set element sizes
    function initializeLayout() {
        updateCanvasSize();
    }
    
    // Update layout when window is resized
    window.addEventListener('resize', () => {
        initializeLayout();
        if (renderer) {
            renderer.setSize(window.innerWidth, window.innerHeight);
        }
        if (camera) {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }
    });
    
    // Set initial layout
    initializeLayout();
    
    // Initialize webcam
    async function initWebcam() {
        try {
            // Try to get a high resolution stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    facingMode: 'user'
                }
            });
            
            videoElement.srcObject = stream;
            
            return new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    // Ensure layout is updated when video loads
                    initializeLayout();
                    resolve(videoElement);
                };
            });
        } catch (error) {
            statusElement.textContent = `Error accessing webcam: ${error.message}`;
            console.error('Error accessing webcam:', error);
            throw error;
        }
    }
    
    // Helper function to generate random neon colors
    function getRandomNeonColor() {
        const neonColors = [
            0xFF00FF, // Magenta
            0x00FFFF, // Cyan
            0xFF3300, // Neon Orange
            0x39FF14, // Neon Green
            0xFF0099, // Neon Pink
            0x00FF00, // Lime
            0xFF6600, // Neon Orange-Red
            0xFFFF00  // Yellow
        ];
        return neonColors[Math.floor(Math.random() * neonColors.length)];
    }

    // Create a text sprite to display inside the sphere
    function createTextSprite(text) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 256;

        // Set up text style
        context.fillStyle = 'white';
        context.font = 'bold 80px Arial';
        context.textAlign = 'center';
        context.textBaseline = 'middle';

        // Draw text on canvas
        context.fillText(text, canvas.width / 2, canvas.height / 2);

        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);

        // Create sprite material
        const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0
        });

        // Create sprite
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(2, 1, 1); // Adjust scale to make text readable

        return sprite;
    }

    async function createTextgen(text){
        const loader = new FontLoader();
        const font = await loader.loadAsync( '/src/assets/fonts/SpaceMono-Regular.json' );
        const geometry = new TextGeometry( text, {
            font: font,
            size: 0.8,
            height: 1,
            curveSegments: 12
        } );

        // Center the text geometry
        geometry.computeBoundingBox();
        const centerOffset = -0.5 * (geometry.boundingBox.max.x - geometry.boundingBox.min.x);

        // Create material for the text
        const textMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0
        });

        // Create mesh from geometry and material
        const textMesh = new THREE.Mesh(geometry, textMaterial);
        textMesh.position.x = centerOffset;

        // Add to sphere instead of scene
        scene.add(textMesh);

        return textMesh;
    }
    
    // Initialize Three.js
    function initThreeJS() {
        // Create scene
        scene = new THREE.Scene();
        
        // Create camera
        camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        camera.position.z = 5;
        
        // Create renderer with transparent background
        renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true  // Enable transparency
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0); // Transparent background
        threeContainer.appendChild(renderer.domElement);
        
        // Create a sphere with vibrant neon color fill and white wireframe
        const geometry = new THREE.SphereGeometry(2, 32, 32);
        
        // Create a group to hold both the solid and wireframe meshes
        sphere = new THREE.Group();
        
        // Create solid mesh with neon color and slight transparency
        const solidMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff00ff,  // Initial color
            transparent: true,
            opacity: 0.5
        });
        solidMesh = new THREE.Mesh(geometry, solidMaterial);
        sphere.add(solidMesh);
        
        // Create wireframe mesh with white color
        const wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            wireframe: true,
            transparent: false,
        });
        wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
        sphere.add(wireframeMesh);

        // Create and add text sprite inside the sphere
        createTextgen("Helloooo!!");
       // textSprite = createTextgen("Helloooo!!");//createTextSprite('Hello');
        //console.log('Added text');
        //scene.add(textSprite);

        //scene.add(sphere);

        // Add some ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);
        
        // Start animation loop
        animate();
    }
    
    // Animation loop for Three.js
    function animate() {
        requestAnimationFrame(animate);
        
        // Rotate the sphere continuously, regardless of hand interaction
        // if (sphere) {
        //     // Remove the condition that stops rotation during hand interaction
        //     sphere.rotation.x += 0.003;
        //     sphere.rotation.y += 0.008;
        //     
        //     // Add pulsing glow effect to the neon fill
        //     const time = Date.now() * 0.001; // Convert to seconds
        //     const pulseIntensity = 0.1 * Math.sin(time * 2) + 0.9; // Oscillate between 0.8 and 1.0
        //     
        //     // Apply pulse to opacity
        //     if (solidMesh && solidMesh.material) {
        //         solidMesh.material.opacity = 0.4 + 0.1 * pulseIntensity;
        //     }
        // }
        
        // Render the scene
        renderer.render(scene, camera);
    }
    
    // Create a floating job rectangle
    function createFloatingJobRect(job) {
        const startX = Math.random() * (canvasElement.width - jobRectWidth);
        const startY = canvasElement.height + jobRectHeight; // Start below canvas
        
        return {
            job: job,
            x: startX,
            y: startY,
            vx: (Math.random() - 0.5) * 0.5, // Reduced horizontal velocity
            vy: -0.3, // Much slower upward velocity (was -(Math.random() * 1 + 1))
            opacity: 0,
            createdAt: Date.now(),
            lifetime: 20000 // Much longer lifetime (was 10000)
        };
    }
    
    // Spawn a random job rectangle
    function spawnJobRect() {
        if (jobsLoaded.length === 0) return;
        
        const randomJob = jobsLoaded[Math.floor(Math.random() * jobsLoaded.length)];
        const floatingJob = createFloatingJobRect(randomJob);
        floatingJobs.push(floatingJob);
        totalJobsSpawned++;
        console.log(`Spawned job #${totalJobsSpawned}. Current in array: ${floatingJobs.length}`);
    }
    
    // Draw a single job rectangle
    function drawJobRect(floatJob) {
        const { x, y, opacity, job } = floatJob;
        
        // Use full opacity for debugging
        const debugOpacity = 1; // Changed from opacity to see them clearly
        
        // Draw white rectangle with border
        canvasCtx.fillStyle = `rgba(255, 255, 255, ${debugOpacity})`;
        canvasCtx.fillRect(x, y, jobRectWidth, jobRectHeight);
        
        // Draw black border
        canvasCtx.strokeStyle = `rgba(0, 0, 0, ${debugOpacity})`;
        canvasCtx.lineWidth = 2;
        canvasCtx.strokeRect(x, y, jobRectWidth, jobRectHeight);
        
        // Draw text (title and extra)
        canvasCtx.fillStyle = `rgba(0, 0, 0, ${debugOpacity})`;
        canvasCtx.font = 'bold 14px Arial';
        canvasCtx.textAlign = 'left';
        canvasCtx.textBaseline = 'top';
        
        const padding = 8;
        const lineHeight = 18;
        
        // Draw title
        canvasCtx.fillText(
            job.title ? job.title.substring(0, 20) : 'Title',
            x + padding,
            y + padding + 5
        );
        
        // Draw extra text
        canvasCtx.font = '12px Arial';
        canvasCtx.fillText(
            job.extra ? job.extra.substring(0, 25) : 'Wild card',
            x + padding,
            y + padding + lineHeight
        );
    }
    
    // Calculate distance between two 3D points
    function calculateDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        const dz = point1.z - point2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    // Detect if a point is inside/near the sphere
    function isPointInSphere(point) {
        // Convert normalized coordinates to world space
        const worldX = (point.x - 0.5) * 10;
        const worldY = (0.5 - point.y) * 10; // Invert Y to match Three.js coordinate system
        const worldZ = 0; // Assume point is on Z=0 plane
        
        // Get sphere position in world space
        const spherePos = new THREE.Vector3();
        sphere.getWorldPosition(spherePos);
        
        // Calculate distance between point and sphere center
        const distance = Math.sqrt(
            Math.pow(worldX - spherePos.x, 2) + 
            Math.pow(worldY - spherePos.y, 2) + 
            Math.pow(worldZ - spherePos.z, 2)
        );
        
        // Consider interaction if point is within or near the sphere surface
        // Using the current sphere size for detection
        const currentSize = sphere.scale.x * 2;
        return distance < currentSize * 1; // Add some buffer for easier interaction
    }
    
    // Initialize MediaPipe Hands
    async function initMediaPipeHands() {
        statusElement.textContent = 'Initializing MediaPipe Hands...';
        
        const hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });
        
        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        await hands.initialize();
        statusElement.textContent = 'Hand tracking ready!';
        
        return hands;
    }
    
    // Draw hand landmarks on canvas with dynamic sizing
    function drawLandmarks(landmarks, isLeft) {
        // Adjust line width and point size based on screen dimension
        const screenSize = Math.min(window.innerWidth, window.innerHeight);
        const lineWidth = Math.max(2, Math.min(5, screenSize / 300));
        const pointSize = Math.max(2, Math.min(8, screenSize / 250));
        
        // Define connections between landmarks
        const connections = [
            // Thumb
            [0, 1], [1, 2], [2, 3], [3, 4],
            // Index finger
            [0, 5], [5, 6], [6, 7], [7, 8],
            // Middle finger
            [0, 9], [9, 10], [10, 11], [11, 12],
            // Ring finger
            [0, 13], [13, 14], [14, 15], [15, 16],
            // Pinky
            [0, 17], [17, 18], [18, 19], [19, 20],
            // Palm
            [0, 5], [5, 9], [9, 13], [13, 17]
        ];
        
        // Choose a different color for each hand
        const handColor = isLeft ? '#00FF00' : '#00FFFF';
        
        // Draw connections
        canvasCtx.lineWidth = lineWidth;
        canvasCtx.strokeStyle = handColor;
        
        connections.forEach(([i, j]) => {
            const start = landmarks[i];
            const end = landmarks[j];
            
            canvasCtx.beginPath();
            canvasCtx.moveTo(start.x * canvasElement.width, start.y * canvasElement.height);
            canvasCtx.lineTo(end.x * canvasElement.width, end.y * canvasElement.height);
            canvasCtx.stroke();
        });
        
        // Draw landmarks
        landmarks.forEach((landmark, index) => {
            // Special color for thumb tip (index 4) and index finger tip (index 8)
            let pointColor = handColor;
            if (index === 4 || index === 8) {
                pointColor = '#FF0000';
            }
            
            canvasCtx.fillStyle = pointColor;
            canvasCtx.beginPath();
            canvasCtx.arc(
                landmark.x * canvasElement.width,
                landmark.y * canvasElement.height,
                pointSize * 1.2,  // Make thumb and index fingertips slightly larger
                0,
                2 * Math.PI
            );
            canvasCtx.fill();
        });
    }
    
    // Process video frames
    function onResults(results) {
        // Clear canvas
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        // Make sure canvas size matches window
        if (canvasElement.width !== window.innerWidth || 
            canvasElement.height !== window.innerHeight) {
            updateCanvasSize();
        }
        
        // Draw floating jobs first (before hand landmarks)
        const now = Date.now();
        floatingJobs = floatingJobs.filter(floatJob => {
            const age = now - floatJob.createdAt;
            
            // Remove if expired
            if (age > floatJob.lifetime) {
                return false;
            }
            
            // Calculate opacity with ease-in effect
            const easedProgress = age / jobAnimationDuration;
            if (easedProgress < 1) {
                // Ease-in cubic: t^3
                floatJob.opacity = Math.pow(easedProgress, 3);
            } else {
                floatJob.opacity = 1;
            }
            
            // Update position
            floatJob.x += floatJob.vx * 0.016; // Assuming 60fps (~16ms per frame)
            floatJob.y += floatJob.vy * 0.016;
            
            // Draw the rectangle
            drawJobRect(floatJob);
            
            return true; // Keep in array
        });
        
        // Reset the tracking flags for this frame
        rightHandActive = false;
        leftHandActive = false;
        
        // Process hand landmarks if detected
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            // Update status text
            statusElement.textContent = 
                results.multiHandLandmarks.length === 1 ? '1 hand detected' :
                `${results.multiHandLandmarks.length} hands detected`;
            
            // Process each hand
            for (let handIndex = 0; handIndex < results.multiHandLandmarks.length; handIndex++) {
                const landmarks = results.multiHandLandmarks[handIndex];
                const handedness = results.multiHandedness[handIndex].label;
                const isLeftHand = handedness === 'Left';
                
                // Draw the hand landmarks with appropriate color
                drawLandmarks(landmarks, isLeftHand);
                
                if (!isLeftHand) {
                    // RIGHT HAND: Control sphere size with thumb-index distance
                    // Get thumb tip and index finger tip positions
                    const thumbTip = landmarks[4];
                    const indexTip = landmarks[8];
                    
                    // Calculate the distance between thumb and index finger
                    const pinchDistance = calculateDistance(thumbTip, indexTip);
                    
                    // Map the pinch distance to a sphere size (adjusted for better UX)
                    // Smaller distance = smaller sphere, larger distance = larger sphere
                    
                    // Calibrate distance range based on reasonable hand movement
                    // Normal pinch is around 0.05-0.1, open hand is 0.2-0.3
                    if (pinchDistance < 0.05) {
                        targetSphereSize = 0.2; // Minimum size when pinched
                        console.log('Small enough. Should show extra and disappear.');
                    } else if (pinchDistance > 0.25) {
                        targetSphereSize = 2.0; // Maximum size when fully open
                    } else {
                        // Linear mapping from pinch distance to sphere size
                        targetSphereSize = 0.2 + (pinchDistance - 0.05) * (2.0 - 0.2) / (0.25 - 0.05);
                    }
                    
                    // Apply smooth interpolation toward the target size
                    currentSphereSize = currentSphereSize + (targetSphereSize - currentSphereSize) * smoothingFactor;
                    
                    // Apply the smoothed size to the sphere
                    if (sphere) {
                        sphere.scale.set(currentSphereSize, currentSphereSize, currentSphereSize);
                    }
                    
                    rightHandActive = true;
                } else {
                    // LEFT HAND: Change color when index finger touches sphere
                    // Get index finger tip position (landmark 8)
                    const indexTip = landmarks[8];
                    
                    // Check if index finger is touching the sphere
                    if (isPointInSphere(indexTip)) {
                        // Change color with a cooldown to prevent rapid changes
                        const currentTime = Date.now();
                        if (currentTime - lastColorChangeTime > colorChangeDelay) {
                            // Change to a random neon color
                            const newColor = getRandomNeonColor();
                            if (solidMesh && solidMesh.material) {
                                solidMesh.material.color.setHex(newColor);
                            }
                            lastColorChangeTime = currentTime;
                        }
                        
                        leftHandActive = true;
                    }
                }
            }
        } else {
            statusElement.textContent = 'No hands detected';
        }
    }
    
    // Initialize and start the app
    async function startApp() {
        try {
            await initWebcam();
            initThreeJS(); // Initialize Three.js
            const hands = await initMediaPipeHands();
            
            // Load jobs from CSV
            jobsLoaded = await loadJobsFromCSV();
            if (jobsLoaded.length > 0) {
                console.log(`Loaded ${jobsLoaded.length} jobs from CSV`);
            }
            
            hands.onResults(onResults);
            
            const camera = new Camera(videoElement, {
                onFrame: async () => {
                    await hands.send({image: videoElement});
                },
                width: 1920,
                height: 1080
            });
            
            camera.start();
            
        } catch (error) {
            statusElement.textContent = `Error: ${error.message}`;
            console.error('Error starting application:', error);
        }
    }
    
    // Start the application
    startApp();
});