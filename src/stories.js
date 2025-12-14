document.addEventListener('DOMContentLoaded', () => {
    const carousel = document.getElementById('carousel');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const STORY_URL = 'assets/json/stories.json';

    let photos = [];

    let activeCard = null;
    let animationFrameId = null;
    let currentBlur = 80; // Starting blur value
    let startTime = 0; // Time when card was activated

    // Function to calculate reading time based on text content (average reading speed: 200 words per minute)
    function calculateReadingTime(textArray) {
        const wordsPerMinute = 220;
        const totalWords = textArray.reduce((sum, text) => {
            return sum + text.split(/\s+/).filter(word => word.length > 0).length;
        }, 0);
        return (totalWords / wordsPerMinute) * 60; // Convert to seconds
    }

    // Function to generate progressive HSL color for paragraphs
    function getParagraphColor(index) {
        // Starting lightness: 96.3%, decrement by 4.9% for each subsequent paragraph
        const baseLightness = 96.3;
        const lightnessDecrement = 4.9;
        const lightness = Math.max(61.6, baseLightness - (index * lightnessDecrement));

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
            `;

            card.addEventListener('click', () => handleCardClick(card, index));
            carousel.appendChild(card);
        });
    }

    // Handle card click
    function handleCardClick(card, index) {
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

        // Calculate reading time for this story
        const readingTime = calculateReadingTime(photos[index].txt);

        // Reset blur for new photo
        currentBlur = 20;
        const photo = card.querySelector('.photo');
        photo.style.filter = `blur(${currentBlur}px)`;

        // Record start time
        startTime = performance.now();

        console.log(`Reading time: ${readingTime.toFixed(1)}s`);

        // Start automatic unblur animation
        startUnblurAnimation(card, readingTime);
    }

    // Deactivate a card
    function deactivateCard(card) {
        card.classList.remove('active');

        // Stop animation
        stopUnblurAnimation();
    }

    // Start automatic unblur animation based on reading time
    function startUnblurAnimation(card, readingTime) {
        // Convert reading time to milliseconds
        const duration = readingTime * 1000;
        const initialBlur = 20;

        function animate() {
            if (!activeCard || activeCard !== card) {
                return;
            }

            const elapsed = performance.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Calculate current blur using easing function (ease-out)
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            currentBlur = initialBlur * (1 - easedProgress);

            const photo = card.querySelector('.photo');
            photo.style.filter = `blur(${currentBlur}px)`;

            // Continue animation if not complete
            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            } else {
                console.log('Unblur animation complete');
                const storyText = card.querySelector('.story-text');
                storyText.classList.add('visible');
            }
        }

        // Start the animation
        animationFrameId = requestAnimationFrame(animate);
    }

    // Stop unblur animation
    function stopUnblurAnimation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    // Navigation buttons
    prevBtn.addEventListener('click', () => {
        const cards = Array.from(carousel.querySelectorAll('.photo-card'));
        const activeIndex = activeCard ? cards.indexOf(activeCard) : -1;

        if (activeIndex > 0) {
            // Scroll to and activate previous card
            const prevCard = cards[activeIndex - 1];
            prevCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            handleCardClick(prevCard, activeIndex - 1);
        } else if (cards.length > 0 && activeIndex === -1) {
            // If no card is active, activate the first card
            const firstCard = cards[0];
            firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            handleCardClick(firstCard, 0);
        }
    });

    nextBtn.addEventListener('click', () => {
        const cards = Array.from(carousel.querySelectorAll('.photo-card'));
        const activeIndex = activeCard ? cards.indexOf(activeCard) : -1;

        if (activeIndex < cards.length - 1) {
            // Scroll to and activate next card
            const nextCard = cards[activeIndex + 1];
            nextCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            handleCardClick(nextCard, activeIndex + 1);
        } else if (cards.length > 0 && activeIndex === -1) {
            // If no card is active, activate the first card
            const firstCard = cards[0];
            firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            handleCardClick(firstCard, 0);
        }
    });

    // Initialize - load stories from JSON
    loadStories();

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        stopUnblurAnimation();
    });
});
