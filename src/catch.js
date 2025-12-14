import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.module.js';
import { FontLoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/jsm/geometries/TextGeometry.js';

//import { FontLoader } from '/node_modules/three/src/loaders/FontLoader.js';
//import { TextGeometry } from '/node_modules/three/src/geometries/TextGeometry.js';

document.addEventListener('DOMContentLoaded', () => {
    const videoElement = document.getElementById('webcam');
    const canvasElement = document.getElementById('canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const statusElement = document.getElementById('status');
    const threeContainer = document.getElementById('three-canvas');
    let steadyJob = false;
    let sj;
    
    // CSV Parser function
    async function loadJobsFromCSV() {
        try {
            const response = await fetch('./assets/jobs.csv');
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
    let textMesh;
    let isUpdatingText = false;
    
    // Hand tracking variables
    let rightHandActive = false;
    let leftHandActive = false;
    let lastColorChangeTime = 0;
    const colorChangeDelay = 500; // milliseconds
    const smoothingFactor = 0.15; // Adjust this value between 0-1 (lower = smoother but slower)
    
    // Floating job rectangles variables
    let floatingJobs = [];
    let jobsLoaded = [];
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

    async function createTextgen(text){
        const loader = new FontLoader();
        const font = await loader.loadAsync( './assets/fonts/SpaceMono-Regular.json' );

        // Replace spaces with underscores or handle them
        const displayText = text.replace(/ /g, '_');

        const geometry = new TextGeometry( displayText, {
            font: font,
            size: 0.4,
            height: 0.1,
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
        textMesh = new THREE.Mesh(geometry, textMaterial);
        textMesh.position.x = centerOffset;

        // Add to scene
        scene.add(textMesh);

        return textMesh;
    }

    // Function to update the text content
    async function updateText(newText) {
        // If already updating, skip this call
        if (isUpdatingText) {
            console.log('Skipping text update, already in progress');
            return;
        }

        isUpdatingText = true;

        try {
            // Remove old text mesh if it exists
            if (textMesh) {
                scene.remove(textMesh);
                textMesh.geometry.dispose();
                textMesh.material.dispose();
                textMesh = null;
            }

            // Create new text mesh
            await createTextgen(newText);
        } finally {
            isUpdatingText = false;
        }
    }
    
    // Function to apply a filter
    function applyRedFilter() {
        // Set the CSS filter property directly
        videoElement.style.filter = 'brightness(0.1) sepia(100%)';//'sepia(100%)';
    }

    //Function to apply bright filter
    function applyBrightFilter() {
        // Set the CSS filter property directly
        videoElement.style.filter = 'brightness(5)';
    }

    // Function to remove all filters
    function removeFilter() {
        videoElement.style.filter = 'none';
    }

    // Function to show success overlay and redirect
    function showSuccessAndRedirect() {
        const container = document.getElementById('success-overlay-container');
        container.innerHTML = '';

        const overlay = document.createElement('div');
        overlay.className = 'success-overlay';
        overlay.textContent = 'You have successfully found a job you can apply to!';

        container.appendChild(overlay);

        // Wait 5 seconds, then redirect to ds160.html
        setTimeout(() => {
            window.location.href = 'stories.html';
        }, 5000);
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

        // Create and add text sprite inside the sphere
        createTextgen("....Try to hold on to a job....");

        // Add some ambient light
        const theLight = new THREE.PointLight(0xff43bf, 1.0);
        theLight.position.set( 50, 50, 50 );
        scene.add(theLight);
        
        // Start animation loop
        animate();
    }
    
    // Animation loop for Three.js
    function animate() {
        requestAnimationFrame(animate);
        
        // Render the scene
        renderer.render(scene, camera);
    }
    
    // Spawn a random job rectangle
    function spawnJobRect() {
        if (jobsLoaded.length === 0) return;
        
        const randomJob = jobsLoaded[Math.floor(Math.random() * jobsLoaded.length)];
        console.log(`Spawned job #${totalJobsSpawned}. Current in array: ${floatingJobs.length}`);
        return randomJob;
    }
    
    // Calculate distance between two 3D points
    function calculateDistance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        const dz = point1.z - point2.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
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
        statusElement.textContent = 'Hand tracking ready.\nShow your hands to the camera.';
        
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
        
        // Reset the tracking flags for this frame
        rightHandActive = false;
        leftHandActive = false;
        
        // Process hand landmarks if detected
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {

            // Process each hand
            for (let handIndex = 0; handIndex < results.multiHandLandmarks.length; handIndex++) {
                const landmarks = results.multiHandLandmarks[handIndex];
                const handedness = results.multiHandedness[handIndex].label;
                const isLeftHand = handedness === 'Right';
                
                // Draw the hand landmarks with appropriate color
                drawLandmarks(landmarks, isLeftHand);
                
                if (!isLeftHand) {
                    // RIGHT HAND: Control sphere size with thumb-index distance
                    // Get thumb tip and index finger tip positions
                    const thumbTip = landmarks[4];
                    const indexTip = landmarks[8];
                    
                    // Calculate the distance between thumb and index finger
                    const pinchDistance = calculateDistance(thumbTip, indexTip);
                    
                    
                    // Calibrate distance range based on reasonable hand movement
                    // Normal pinch is around 0.05-0.1, open hand is 0.2-0.3
                    if (pinchDistance < 0.05) {

                        if(steadyJob == true){
                            //Change text to the Extra stuff
                            console.log('Did not catch it because...', sj.extra);
                            updateText(sj.extra);
                            if(sj.extra != 'Good to apply!'){
                                applyRedFilter();
                            }else{
                                // Successfully caught a good job!
                                applyBrightFilter();
                                showSuccessAndRedirect();
                            }
                            //And set flag Not steady
                            steadyJob = false
                        }

                    } else if (pinchDistance > 0.25) {
                        console.log("We opened our hand enough to catch another job");

                        if(steadyJob == false){
                            sj = spawnJobRect();
                            console.log('Job rendering', sj.title);
                            updateText(sj.title);
                            removeFilter();
                            steadyJob = true;
                        }
                    } else {
                        // Linear mapping from pinch distance to sphere size
                        console.log("We are empty handed");
                    }
                    
                    rightHandActive = true;
                } else {
                    // LEFT HAND: Change color when index finger touches sphere
                    // Get index finger tip position (landmark 8)
                    const indexTip = landmarks[8];
                    
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