 // Hide loading animation when iframe is ready
        const iframeElement = document.getElementById('vimeo-player');
        const loading = document.querySelector('.loading');

        // Use Vimeo Player API
        const player = new Vimeo.Player(iframeElement);

        iframeElement.addEventListener('load', function() {
            loading.style.display = 'none';
        });

        // Set a timeout to hide loading after 3 seconds anyway (in case load event doesn't fire)
        setTimeout(function() {
            loading.style.display = 'none';
        }, 3000);

        // Track video end and navigate to index.html
        player.on('ended', function() {
            window.location.href = 'index.html';
        });