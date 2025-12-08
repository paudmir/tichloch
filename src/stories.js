document.addEventListener('DOMContentLoaded', () => {
    const carousel = document.getElementById('carousel');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const STORY_URL = 'assets/json/stories.json';

    let photos = [];

    let activeCard = null;
    let mediaStream = null;
    let audioContext = null;
    let analyser = null;
    let animationFrameId = null;
    let currentBlur = 20; // Starting blur value

    // Function to generate progressive HSL color for paragraphs
    function getParagraphColor(index) {
        // Starting lightness: 96.3%, decrement by 4.9% for each subsequent paragraph
        const baseLightness = 96.3;
        const lightnessDecrement = 4.9;
        const lightness = Math.max(71.6, baseLightness - (index * lightnessDecrement));

        // Saturation also changes slightly
        const saturation = index === 0 ? 57.9 : 59.1 + (Math.min(index - 1, 1) * 0.3) + (Math.max(0, index - 2) * 0);

        return `hsl(60, ${saturation}%, ${lightness}%)`;
    }

    // Load stories from JSON file
    async function loadStories() {
        try {
            const response = await fetch(STORY_URL);
            const data = await response.json();

            // Transform the stories data into the photos array format
            photos = data.stories.map(item => ({
                src: item.story.src,
                txt: item.story.txt
            }));

            // Once stories are loaded, create the photo cards
            createPhotoCards();
        } catch (error) {
            console.error('Error loading stories:', error);
        }
    }

    // Create photo cards
    function createPhotoCards() {
        photos.forEach((photo, index) => {
            const card = document.createElement('div');
            card.className = 'photo-card';
            card.dataset.index = index;

            // Generate paragraph HTML with progressive colors
            const paragraphsHTML = photo.txt.map((text, pIndex) => {
                const color = getParagraphColor(pIndex);
                return `<p style="background-color: ${color}; color: black;">${text}</p>`;
            }).join('');

            card.innerHTML = `
                <div class="photo-wrapper">
                    <img class="photo" src="${photo.src}" alt="Photo ${index + 1}">
                </div>
                <div class="story-text">
                    ${paragraphsHTML}
                </div>
                <div class="mic-indicator">
                    <div class="mic-icon"></div>
                    <span class="mic-text">Listening...</span>
                    <div class="audio-level">
                        <div class="audio-level-bar"></div>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => handleCardClick(card, index));
            carousel.appendChild(card);
        });
    }

    // Handle card click
    async function handleCardClick(card, index) {
        // If clicking the same card, do nothing
        if (activeCard === card) {
            return;
        }

        // Deactivate previous card
        if (activeCard) {
            deactivateCard(activeCard);
        }

        // Activate new card
        activeCard = card;
        card.classList.add('active');

        // Show story text
        const storyText = card.querySelector('.story-text');
        storyText.classList.add('visible');

        // Reset blur for new photo
        currentBlur = 20;
        const photo = card.querySelector('.photo');
        photo.style.filter = `blur(${currentBlur}px)`;

        // Start microphone
        await startMicrophone(card);
    }

    // Deactivate a card
    function deactivateCard(card) {
        card.classList.remove('active');
        const storyText = card.querySelector('.story-text');
        storyText.classList.remove('visible');
        const micIndicator = card.querySelector('.mic-indicator');
        micIndicator.classList.remove('active');

        // Stop microphone
        stopMicrophone();
    }

    // Start microphone and audio detection
    async function startMicrophone(card) {
        try {
            // Check if mediaDevices is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('getUserMedia is not supported in this browser or context. Please use HTTPS.');
            }

            // Request microphone access
            mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Show mic indicator
            const micIndicator = card.querySelector('.mic-indicator');
            micIndicator.classList.add('active');

            // Set up audio context and analyser
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(mediaStream);

            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            microphone.connect(analyser);

            // Start analyzing audio
            analyzeAudio(card);

        } catch (error) {
            console.error('Error accessing microphone:', error);

            let errorMessage = 'Could not access microphone. ';
            if (error.message && error.message.includes('HTTPS')) {
                errorMessage += 'This feature requires HTTPS. Please access the site using https:// instead of http://';
            } else if (error.name === 'NotAllowedError') {
                errorMessage += 'Please grant microphone permission and try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage += 'No microphone found on your device.';
            } else {
                errorMessage += error.message || 'Please grant permission and try again.';
            }

            alert(errorMessage);
        }
    }

    // Stop microphone
    function stopMicrophone() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }

        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }

        analyser = null;
    }

    // Analyze audio and unblur photo
    function analyzeAudio(card) {
        if (!analyser || !activeCard) {
            return;
        }

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Normalize to 0-1 range
        const normalizedVolume = average / 255;

        // Update audio level indicator
        const audioLevelBar = card.querySelector('.audio-level-bar');
        audioLevelBar.style.width = `${normalizedVolume * 100}%`;

        // Unblur photo based on audio level
        // Only unblur if volume is above a threshold (e.g., 0.1)
        if (normalizedVolume > 0.1 && currentBlur > 0) {
            // Reduce blur gradually - higher volume = faster unblur
            const unblurRate = normalizedVolume * 0.5; // Adjust this for speed
            currentBlur = Math.max(0, currentBlur - unblurRate);

            const photo = card.querySelector('.photo');
            photo.style.filter = `blur(${currentBlur}px)`;
        }

        // Continue analyzing
        animationFrameId = requestAnimationFrame(() => analyzeAudio(card));
    }

    // Navigation buttons
    prevBtn.addEventListener('click', () => {
        carousel.scrollBy({
            left: -320,
            behavior: 'smooth'
        });
    });

    nextBtn.addEventListener('click', () => {
        carousel.scrollBy({
            left: 320,
            behavior: 'smooth'
        });
    });

    // Initialize - load stories from JSON
    loadStories();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopMicrophone();
    });
});
