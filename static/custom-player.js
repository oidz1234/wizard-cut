// Custom Video Player Controls
document.addEventListener('DOMContentLoaded', function() {
    // Get elements
    const videoPlayer = document.getElementById('video-player');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const muteBtn = document.getElementById('mute-btn');
    const volumeSlider = document.getElementById('volume-slider');
    const videoProgress = document.getElementById('video-progress');
    const progressBarFill = document.getElementById('progress-bar-fill');
    const currentTimeDisplay = document.getElementById('current-time');
    const totalTimeDisplay = document.getElementById('total-time');
    
    // Initialize player
    function initPlayer() {
        // Set initial volume
        videoPlayer.volume = volumeSlider.value;
        
        // Add event listeners
        videoPlayer.addEventListener('loadedmetadata', updateTotalTime);
        videoPlayer.addEventListener('timeupdate', updateProgress);
        videoPlayer.addEventListener('play', updatePlayPauseButton);
        videoPlayer.addEventListener('pause', updatePlayPauseButton);
        videoPlayer.addEventListener('volumechange', updateVolumeControls);
        
        playPauseBtn.addEventListener('click', togglePlayPause);
        muteBtn.addEventListener('click', toggleMute);
        volumeSlider.addEventListener('input', updateVolume);
        videoProgress.addEventListener('click', seekVideo);
        
        // Update total time when first loaded
        if (videoPlayer.readyState >= 1) {
            updateTotalTime();
        }
    }
    
    // Toggle play/pause
    function togglePlayPause() {
        if (videoPlayer.paused || videoPlayer.ended) {
            videoPlayer.play();
        } else {
            videoPlayer.pause();
        }
    }
    
    // Update play/pause button
    function updatePlayPauseButton() {
        if (videoPlayer.paused || videoPlayer.ended) {
            playPauseBtn.textContent = '▶';
        } else {
            playPauseBtn.textContent = '⏸';
        }
    }
    
    // Toggle mute
    function toggleMute() {
        videoPlayer.muted = !videoPlayer.muted;
    }
    
    // Update volume
    function updateVolume() {
        videoPlayer.volume = volumeSlider.value;
        videoPlayer.muted = false;
    }
    
    // Update volume controls
    function updateVolumeControls() {
        if (videoPlayer.muted || videoPlayer.volume === 0) {
            muteBtn.textContent = '🔇';
            volumeSlider.value = 0;
        } else {
            muteBtn.textContent = '🔊';
            volumeSlider.value = videoPlayer.volume;
        }
    }
    
    // Format time as MM:SS
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    // Update progress bar
    function updateProgress() {
        if (!videoPlayer.duration) return;
        
        // Update progress bar
        const progress = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        progressBarFill.style.width = `${progress}%`;
        
        // Update current time display
        currentTimeDisplay.textContent = formatTime(videoPlayer.currentTime);
    }
    
    // Update total time display
    function updateTotalTime() {
        if (videoPlayer.readyState >= 1) {
            totalTimeDisplay.textContent = formatTime(videoPlayer.duration);
        }
    }
    
    // Seek video when progress bar is clicked
    function seekVideo(e) {
        const rect = videoProgress.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        videoPlayer.currentTime = pos * videoPlayer.duration;
    }
    
    // Keyboard controls
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName.toLowerCase() === 'input') return;
        
        switch(e.key) {
            case ' ':
                togglePlayPause();
                e.preventDefault();
                break;
            case 'ArrowLeft':
                videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5);
                e.preventDefault();
                break;
            case 'ArrowRight':
                videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 5);
                e.preventDefault();
                break;
            case 'ArrowUp':
                videoPlayer.volume = Math.min(1, videoPlayer.volume + 0.1);
                e.preventDefault();
                break;
            case 'ArrowDown':
                videoPlayer.volume = Math.max(0, videoPlayer.volume - 0.1);
                e.preventDefault();
                break;
            case 'm':
            case 'M':
                toggleMute();
                e.preventDefault();
                break;
        }
    });
    
    // Double click to fullscreen
    videoPlayer.addEventListener('dblclick', function() {
        if (!document.fullscreenElement) {
            videoPlayer.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    });
    
    // Initialize player when loaded
    if (document.readyState === "complete") {
        initPlayer();
    } else {
        window.addEventListener('load', initPlayer);
    }
});
