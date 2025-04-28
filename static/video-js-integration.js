// Enhanced Video.js Integration for WizardCut
// This enhanced implementation solves several issues with the current player:
// 1. Better zoom functionality with smoother transitions
// 2. Improved timeline sync with the editor
// 3. More reliable event handling
// 4. Better handling of video sources switching
// 5. Enhanced interaction with the transcript

document.addEventListener('DOMContentLoaded', function() {
    // VideoJS player instance
    let player = null;
    
    // Player state tracking
    let videoElement = null;
    let zoomLevel = 1;
    let zoomPoint = { x: 0.5, y: 0.5 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let currentZoomMode = 'drag'; // Set drag as default
    
    // Zoom event recording state
    let isRecordingZoom = false;
    let currentZoomEvent = null;
    let lastZoomPosition = null; // Track last recorded position for zoom tracking
    
    // Custom hotkeys configuration
    const HOTKEYS = {
        SPACE: ' ',          // Play/Pause
        LEFT_ARROW: 'ArrowLeft',    // Seek backward
        RIGHT_ARROW: 'ArrowRight',  // Seek forward
        UP_ARROW: 'ArrowUp',        // Volume up
        DOWN_ARROW: 'ArrowDown',    // Volume down
        M: 'm',              // Mute
        X: 'x',              // Mark selection
        Z: 'z',              // Toggle zoom mode
        R: 'r',              // Record zoom
        COMMA: ',',          // Frame backward
        PERIOD: '.'          // Frame forward
    };
    
    // Cache DOM elements
    const videoWrapper = document.getElementById('video-wrapper');
    const mouseIndicator = document.getElementById('mouse-indicator');
    const timelineCursor = document.getElementById('timeline-cursor');
    
    /**
     * Initialize or reinitialize the VideoJS player
     * @param {string} src - Source URL for the video
     * @param {Object} options - Additional VideoJS options
     * @returns {Object} - VideoJS player instance
     */
    function initVideoPlayer(src, options = {}) {
        // Default options
        const defaultOptions = {
            controls: true,
            autoplay: false,
            preload: 'auto',
            fluid: true,
            playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2],
            userActions: {
                hotkeys: function(event) {
                    handleHotkeys(event);
                }
            },
            controlBar: {
                children: [
                    'playToggle',
                    'volumePanel',
                    'currentTimeDisplay',
                    'timeDivider',
                    'durationDisplay',
                    'progressControl',
                    'playbackRateMenuButton',
                    'fullscreenToggle'
                ]
            }
        };
        
        // Merge options
        const mergedOptions = { ...defaultOptions, ...options };
        
        // Check if video element exists in the DOM
        const videoEl = document.getElementById('video-player');
        if (!videoEl) {
            console.error('Video element with ID "video-player" not found');
            return null;
        }
        
        // If player already exists, dispose it first
        if (player) {
            try {
                // Store current time and playback state to restore later
                const currentTime = player.currentTime();
                const wasPlaying = !player.paused();
                
                // Remove any custom event listeners to prevent memory leaks
                removePlayerEventListeners();
                
                // Dispose the player
                player.dispose();
                player = null;
                
                // Update merged options to restore state
                mergedOptions.currentTime = currentTime;
                if (wasPlaying) {
                    mergedOptions.autoplay = true;
                }
            } catch (e) {
                console.error('Error disposing existing player:', e);
                player = null;
            }
        }
        
        // Initialize new Video.js player
        try {
            // Initialize new Video.js player with custom options to disable click-to-play
            mergedOptions.userActions = {
                ...mergedOptions.userActions,
                click: false,  // Disable click to play/pause
                doubleClick: false  // Disable double-click for fullscreen
            };
            
            player = videojs('video-player', mergedOptions);
            
            // Additional measures to disable click to play/pause EXCEPT for the initial big play button
            if (player && player.el_) {
                const clickHandler = function(e) {
                    // Check if this is the big play button in its initial state
                    const isBigPlayButton = e.target.classList.contains('vjs-big-play-button') || 
                                          e.target.closest('.vjs-big-play-button');
                    
                    // Let the big play button work naturally for the first play
                    if (isBigPlayButton && player.paused() && !player.hasStarted_) {
                        return true;
                    }
                    
                    // Otherwise prevent the default click behavior (play/pause toggle)
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                };
                
                // Add the click handler to all video-related elements
                const videoEl = player.el_.querySelector('.vjs-tech');
                if (videoEl) {
                    videoEl.addEventListener('click', clickHandler, true);
                }
                
                // Add a special handler for the big play button that only works for initial play
                const bigPlayButton = player.el_.querySelector('.vjs-big-play-button');
                if (bigPlayButton) {
                    bigPlayButton.addEventListener('click', function(e) {
                        // Only allow the first play
                        if (player.paused() && !player.hasStarted_) {
                            // Let it play naturally
                            return true;
                        } else {
                            // Prevent clicks after the initial play
                            e.preventDefault();
                            e.stopPropagation();
                            return false;
                        }
                    }, true);
                }
                
                // Disable play/pause toggle on video container
                const videoContainer = player.el_.querySelector('.vjs-tech-container');
                if (videoContainer) {
                    videoContainer.addEventListener('click', clickHandler, true);
                }
                
                // Override the play toggle method but keep it working for normal controls
                if (player.playToggle) {
                    const originalHandler = player.playToggle.handleClick;
                    player.playToggle.handleClick = function(e) {
                        // Only allow click from the actual control, not the video
                        if (e && e.target && e.target.classList && 
                            (e.target.classList.contains('vjs-play-control') || 
                             e.target.closest('.vjs-play-control'))) {
                            originalHandler.call(this, e);
                        } else if (player.paused() && !player.hasStarted_) {
                            // Allow initial play
                            originalHandler.call(this, e);
                        } else {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    };
                }
            }
        } catch (e) {
            console.error('Error initializing video player:', e);
            return null;
        }
        
        // Set the source
        if (src && player) {
            try {
                player.src({
                    src: src,
                    type: getVideoType(src)
                });
                
                // Cache reference to video element
                videoElement = player.el().querySelector('video');
                
                // Apply custom zoom styling
                if (videoElement) {
                    videoElement.style.transformOrigin = 'center center';
                    videoElement.style.transition = 'transform 0.3s ease-out';
                }
                
                // Add custom event listeners
                addPlayerEventListeners();
            } catch (e) {
                console.error('Error setting video source:', e);
                return null;
            }
        }
        
        // Return the player instance
        return player;
    }
    
    /**
     * Get video MIME type based on file extension
     * @param {string} src - Source URL for the video
     * @returns {string} - MIME type
     */
    function getVideoType(src) {
        if (src.endsWith('.mp4')) return 'video/mp4';
        if (src.endsWith('.webm')) return 'video/webm';
        if (src.endsWith('.ogv')) return 'video/ogg';
        if (src.endsWith('.mkv')) return 'video/x-matroska';
        if (src.endsWith('.mov')) return 'video/quicktime';
        if (src.endsWith('.avi')) return 'video/x-msvideo';
        if (src.endsWith('.flv')) return 'video/x-flv';
        
        // Default to mp4
        return 'video/mp4';
    }
    
    /**
     * Add custom event listeners to the player
     */
    function addPlayerEventListeners() {
        if (!player) return;
        
        // Core video events
        player.on('timeupdate', handleTimeUpdate);
        player.on('loadedmetadata', handleLoadedMetadata);
        player.on('ended', handleEnded);
        player.on('error', handleError);
        player.on('seeked', handleSeeked);
        
        // Custom event handlers for the video wrapper
        if (videoWrapper) {
            videoWrapper.addEventListener('mousedown', handleMouseDown);
            videoWrapper.addEventListener('mousemove', handleMouseMove);
            videoWrapper.addEventListener('mouseup', handleMouseUp);
            videoWrapper.addEventListener('dblclick', handleDoubleClick);
            videoWrapper.addEventListener('wheel', handleMouseWheel, { passive: false });
            videoWrapper.addEventListener('mouseleave', handleMouseLeave);
        }
        
        // Global keyboard events
        document.addEventListener('keydown', handleKeyDown);
        
        // Trigger an initial time update
        handleTimeUpdate();
    }
    
    /**
     * Remove event listeners to prevent memory leaks
     */
    function removePlayerEventListeners() {
        if (!player) return;
        
        // Remove VideoJS event listeners
        player.off('timeupdate', handleTimeUpdate);
        player.off('loadedmetadata', handleLoadedMetadata);
        player.off('ended', handleEnded);
        player.off('error', handleError);
        
        // Remove video wrapper event listeners
        if (videoWrapper) {
            videoWrapper.removeEventListener('mousedown', handleMouseDown);
            videoWrapper.removeEventListener('mousemove', handleMouseMove);
            videoWrapper.removeEventListener('mouseup', handleMouseUp);
            videoWrapper.removeEventListener('dblclick', handleDoubleClick);
            videoWrapper.removeEventListener('wheel', handleMouseWheel);
            videoWrapper.removeEventListener('mouseleave', handleMouseLeave);
        }
        
        // Remove global keyboard events
        document.removeEventListener('keydown', handleKeyDown);
    }
    
    /**
     * Handle mouse wheel events for zooming
     * @param {Event} e - Mouse wheel event
     */
    function handleMouseWheel(e) {
        // Only if zoom mode is active
        if (currentZoomMode === 'none') return;
        
        e.preventDefault();
        
        // Get mouse position relative to video
        const rect = videoWrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        
        // Set zoom point to mouse position
        zoomPoint = { x, y };
        
        // Determine zoom direction (normalized across browsers)
        const delta = e.deltaY || e.detail || e.wheelDelta;
        const zoomDirection = delta > 0 ? -1 : 1;
        
        // Calculate new zoom level (0.25 increments)
        const zoomIncrement = 0.25 * zoomDirection;
        zoomLevel = Math.max(1, Math.min(5, zoomLevel + zoomIncrement));
        
        // Apply the zoom
        applyZoom();
        
        // Update recording if active
        updateZoomRecording();
    }
    
    /**
     * Handle double-click events for toggling fullscreen
     * @param {Event} e - Double click event
     */
    function handleDoubleClick(e) {
        // Toggle fullscreen
        if (!document.fullscreenElement) {
            videoWrapper.requestFullscreen().catch(err => {
                console.error('Error attempting to enable fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }
    
    /**
     * Handle mouse down events for dragging
     * @param {MouseEvent} e - Mouse down event
     */
    function handleMouseDown(e) {
        if (currentZoomMode !== 'drag' || zoomLevel <= 1) return;
        
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        
        // Change cursor to indicate dragging
        if (videoWrapper) {
            videoWrapper.style.cursor = 'grabbing';
        }
        
        e.preventDefault();
    }
    
    /**
     * Handle mouse move events for dragging and indicator
     * @param {MouseEvent} e - Mouse move event
     */
    function handleMouseMove(e) {
        if (!videoWrapper) return;
        
        // For drag mode, handle dragging the zoomed video
        if (isDragging && currentZoomMode === 'drag') {
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            
            // Calculate the movement in normalized coordinates (0-1)
            const rect = videoWrapper.getBoundingClientRect();
            const moveX = dx / rect.width;
            const moveY = dy / rect.height;
            
            // Update zoom point (with limits to prevent moving out of bounds)
            const scale = 1 / (zoomLevel * 2);
            zoomPoint.x = Math.max(0, Math.min(1, zoomPoint.x - moveX * scale));
            zoomPoint.y = Math.max(0, Math.min(1, zoomPoint.y - moveY * scale));
            
            // Update the video position
            applyZoom();
            
            // Reset drag start point
            dragStart = { x: e.clientX, y: e.clientY };
            
            // Update zoom recording if active
            updateZoomRecording();
            return;
        }
        
        // Only show mouse indicator when zoomed and not in recording mode
        if (mouseIndicator && currentZoomMode !== 'none' && zoomLevel > 1 && !isRecordingZoom) {
            mouseIndicator.style.display = 'block';
            mouseIndicator.style.left = `${e.clientX}px`;
            mouseIndicator.style.top = `${e.clientY}px`;
            
            // Adjust indicator size based on zoom level (smaller at higher zoom)
            const indicatorSize = 30 / zoomLevel;
            mouseIndicator.style.width = `${indicatorSize}px`;
            mouseIndicator.style.height = `${indicatorSize}px`;
        } else if (mouseIndicator) {
            // Hide the indicator when not needed
            mouseIndicator.style.display = 'none';
        }
    }
    
    /**
     * Handle mouse up events to end dragging
     */
    function handleMouseUp() {
        if (isDragging) {
            isDragging = false;
            
            // Restore cursor
            if (videoWrapper) {
                videoWrapper.style.cursor = 'grab';
            }
            
            // Update zoom recording if active
            updateZoomRecording();
        }
    }
    
    /**
     * Handle mouse leave events to clean up
     */
    function handleMouseLeave() {
        // End dragging if active
        if (isDragging) handleMouseUp();
        
        // Hide mouse indicator
        if (mouseIndicator) {
            mouseIndicator.style.display = 'none';
        }
    }
    
    /**
     * Apply the current zoom level and point to the video
     */
    function applyZoom() {
        if (!videoElement) return;
        
        // If zoom level is 1, reset transform
        if (zoomLevel <= 1) {
            videoElement.style.transform = 'scale(1)';
            videoElement.style.transformOrigin = '50% 50%';
            return;
        }
        
        // Apply the zoom level
        videoElement.style.transform = `scale(${zoomLevel})`;
        
        // Set the transform origin to the zoom point
        videoElement.style.transformOrigin = `${zoomPoint.x * 100}% ${zoomPoint.y * 100}%`;
        
        // If zoom mode is active, add class to parent for styling
        if (player) {
            if (currentZoomMode !== 'none') {
                player.el().classList.add('vjs-zoom-active');
            } else {
                player.el().classList.remove('vjs-zoom-active');
            }
        }
    }
    
    /**
     * Reset zoom to default state
     */
    function resetZoom() {
        zoomLevel = 1;
        zoomPoint = { x: 0.5, y: 0.5 };
        applyZoom();
        
        // Hide mouse indicator
        if (mouseIndicator) {
            mouseIndicator.style.display = 'none';
        }
    }
    
    /**
     * Change the zoom mode
     * @param {string} mode - Zoom mode ('none', 'simple', or 'drag')
     */
    function setZoomMode(mode) {
        currentZoomMode = mode;
        
        // Update cursor and zoom state based on mode
        if (videoWrapper) {
            if (mode === 'simple') {
                videoWrapper.style.cursor = 'zoom-in';
                videoWrapper.classList.add('zoom-active');
            } else if (mode === 'drag') {
                videoWrapper.style.cursor = 'grab';
                videoWrapper.classList.remove('zoom-active');
            } else {
                videoWrapper.style.cursor = 'default';
                videoWrapper.classList.remove('zoom-active');
                resetZoom();
            }
        }
        
        // Hide mouse indicator when changing modes
        if (mouseIndicator) {
            mouseIndicator.style.display = 'none';
        }
    }
    
    /**
     * Handle keyboard hotkeys for the player
     * @param {KeyboardEvent} e - Keyboard event
     */
    function handleKeyDown(e) {
        // Ignore if focus is on an input element
        if (e.target.tagName.toLowerCase() === 'input' || 
            e.target.tagName.toLowerCase() === 'textarea') {
            return;
        }
        
        switch (e.key) {
            case HOTKEYS.LEFT_ARROW:
                // Skip back 5 seconds
                if (player) {
                    player.currentTime(Math.max(0, player.currentTime() - 5));
                    e.preventDefault();
                }
                break;
                
            case HOTKEYS.RIGHT_ARROW:
                // Skip forward 5 seconds
                if (player) {
                    player.currentTime(Math.min(player.duration(), player.currentTime() + 5));
                    e.preventDefault();
                }
                break;
                
            case HOTKEYS.SPACE:
                // Toggle play/pause
                if (player) {
                    if (player.paused()) {
                        player.play();
                    } else {
                        player.pause();
                    }
                    e.preventDefault();
                }
                break;
                
            case HOTKEYS.UP_ARROW:
                // Increase volume
                if (player) {
                    player.volume(Math.min(1, player.volume() + 0.1));
                    e.preventDefault();
                }
                break;
                
            case HOTKEYS.DOWN_ARROW:
                // Decrease volume
                if (player) {
                    player.volume(Math.max(0, player.volume() - 0.1));
                    e.preventDefault();
                }
                break;
                
            case HOTKEYS.M:
                // Toggle mute
                if (player) {
                    player.muted(!player.muted());
                    e.preventDefault();
                }
                break;
                
            case HOTKEYS.Z:
                // Only reset zoom if event occurred in video wrapper
                if (e.target.closest('#video-wrapper')) {
                    resetZoom();
                    e.preventDefault();
                }
                break;
                
            case HOTKEYS.R:
                // Toggle zoom recording
                toggleZoomRecording();
                e.preventDefault();
                // Simulate click on record button for visual feedback
                const recordBtn = document.getElementById('record-zoom-btn');
                if (recordBtn) {
                    recordBtn.click();
                }
                break;
                
            case HOTKEYS.COMMA:
                // Frame step backward (1/30 second)
                if (player) {
                    player.currentTime(Math.max(0, player.currentTime() - 0.033));
                    e.preventDefault();
                }
                break;
                
            case HOTKEYS.PERIOD:
                // Frame step forward (1/30 second)
                if (player) {
                    player.currentTime(Math.min(player.duration(), player.currentTime() + 0.033));
                    e.preventDefault();
                }
                break;
        }
    }
    
    /**
     * VideoJS hotkeys handler
     * @param {KeyboardEvent} e - Keyboard event
     */
    function handleHotkeys(e) {
        // Delegate to our custom handler
        handleKeyDown(e);
    }
    
    /**
     * Handle video time update event
     */
    function handleTimeUpdate() {
        if (!player) return;
        
        // Dispatch a custom event for the app to use
        const timeUpdateEvent = new CustomEvent('video-time-update', {
            detail: {
                currentTime: player.currentTime(),
                duration: player.duration() || 0,
                source: 'original' // Specify this is from the original player
            }
        });
        document.dispatchEvent(timeUpdateEvent);
        
        // Update timeline cursor position
        updateTimelineCursor();
    }
    
    /**
     * Handle video loaded metadata event
     */
    function handleLoadedMetadata() {
        if (!player) return;
        
        // Dispatch a custom event for the app to use
        const metadataEvent = new CustomEvent('video-metadata-loaded', {
            detail: {
                duration: player.duration() || 0,
                videoWidth: player.videoWidth() || 0,
                videoHeight: player.videoHeight() || 0
            }
        });
        document.dispatchEvent(metadataEvent);
    }
    
    /**
     * Handle video ended event
     */
    function handleEnded() {
        if (!player) return;
        
        // Dispatch a custom event for the app to use
        const endedEvent = new CustomEvent('video-ended');
        document.dispatchEvent(endedEvent);
    }
    
    /**
     * Handle video error event
     * @param {Object} error - Error object
     */
    function handleError(error) {
        console.error('Video.js error:', error);
        
        // Dispatch a custom event for the app to use
        const errorEvent = new CustomEvent('video-error', {
            detail: {
                error: error
            }
        });
        document.dispatchEvent(errorEvent);
    }
    
    /**
     * Handle video seeked event (when seeking completes)
     */
    function handleSeeked() {
        if (!player) return;
        
        const currentTime = player.currentTime();
        console.log('Original player seeked to:', currentTime);
        
        // Dispatch a custom event for the app to use
        const seekedEvent = new CustomEvent('video-time-update', {
            detail: {
                currentTime: currentTime,
                duration: player.duration() || 0,
                source: 'original',
                isSeeked: true // Indicate this is from a seek operation
            }
        });
        document.dispatchEvent(seekedEvent);
        
        // Update timeline cursor position
        updateTimelineCursor();
    }
    
    /**
     * Update timeline cursor position based on current time
     */
    function updateTimelineCursor() {
        if (!timelineCursor || !player) return;
        
        // Only update when we have duration
        if (player.duration()) {
            timelineCursor.style.display = 'block';
            
            // Calculate position based on current time
            const percent = (player.currentTime() / player.duration()) * 100;
            timelineCursor.style.left = `${percent}%`;
        }
    }
    
    /**
     * Start or stop recording zoom events
     */
    function toggleZoomRecording() {
        // Toggle recording state
        isRecordingZoom = !isRecordingZoom;
        
        // Initialize recording if started
        if (isRecordingZoom) {
            // Initialize a new zoom event
            currentZoomEvent = {
                id: 'zoom-' + Date.now(),
                startTime: player ? player.currentTime() : 0,
                endTime: player ? player.currentTime() : 0,
                startZoomLevel: zoomLevel,
                endZoomLevel: zoomLevel,
                focusPoint: { ...zoomPoint }
            };
            
            // Reset the last position tracker
            lastZoomPosition = {
                x: zoomPoint.x,
                y: zoomPoint.y,
                zoom: zoomLevel
            };
            
            // Set to drag mode for better recording
            if (currentZoomMode === 'none') {
                setZoomMode('drag');
            }
            
            // Dispatch event to update UI
            const recordStartEvent = new CustomEvent('zoom-recording-started');
            document.dispatchEvent(recordStartEvent);
        } else {
            // Recording stopped
            if (currentZoomEvent) {
                // Finalize zoom event
                currentZoomEvent.endTime = player ? player.currentTime() : 0;
                
                // Only add if duration is meaningful
                if (currentZoomEvent.endTime > currentZoomEvent.startTime) {
                    // Check for overlapping zoom events
                    const isOverlapping = window.zoomEvents && window.zoomEvents.some(existingZoom => {
                        return !(
                            existingZoom.endTime <= currentZoomEvent.startTime || 
                            existingZoom.startTime >= currentZoomEvent.endTime
                        );
                    });
                    
                    if (isOverlapping) {
                        // If we access the zoomEvents array directly, we can remove overlapping zooms
                        if (window.zoomEvents) {
                            const overlappingZooms = window.zoomEvents.filter(existingZoom => {
                                return !(
                                    existingZoom.endTime <= currentZoomEvent.startTime || 
                                    existingZoom.startTime >= currentZoomEvent.endTime
                                );
                            });
                            
                            // Remove overlapping zooms via UI events
                            for (const zoom of overlappingZooms) {
                                const removeEvent = new CustomEvent('zoom-event-remove-request', {
                                    detail: { zoomId: zoom.id }
                                });
                                document.dispatchEvent(removeEvent);
                            }
                        }
                    }
                    
                    // Dispatch event to add the zoom event
                    const zoomEvent = new CustomEvent('zoom-event-recorded', {
                        detail: {
                            zoomEvent: currentZoomEvent
                        }
                    });
                    document.dispatchEvent(zoomEvent);
                }
                
                currentZoomEvent = null;
                lastZoomPosition = null;
                
                // Dispatch event to update UI
                const recordStopEvent = new CustomEvent('zoom-recording-stopped');
                document.dispatchEvent(recordStopEvent);
            }
        }
    }
    
    /**
     * Update the current zoom recording
     */
    function updateZoomRecording() {
        if (!isRecordingZoom || !currentZoomEvent || !player) return;
        
        // Only update if position or zoom has changed significantly
        const positionChanged = !lastZoomPosition || 
            Math.abs(lastZoomPosition.x - zoomPoint.x) > 0.01 || 
            Math.abs(lastZoomPosition.y - zoomPoint.y) > 0.01 ||
            Math.abs(lastZoomPosition.zoom - zoomLevel) > 0.1;
            
        if (positionChanged) {
            // Update the zoom event properties
            currentZoomEvent.endTime = player.currentTime();
            currentZoomEvent.endZoomLevel = zoomLevel;
            currentZoomEvent.focusPoint = { ...zoomPoint };
            
            // Update last position
            lastZoomPosition = {
                x: zoomPoint.x,
                y: zoomPoint.y,
                zoom: zoomLevel
            };
        }
    }
    
    // Export public API
    window.videoJsIntegration = {
        initPlayer: initVideoPlayer,
        getPlayer: function() { return player; },
        setZoomMode: setZoomMode,
        getZoomMode: function() { return currentZoomMode; },
        resetZoom: resetZoom,
        getZoomPoint: function() { return { ...zoomPoint }; }, // Return a copy of zoomPoint
        applyZoom: function(level, point) {
            if (level) zoomLevel = level;
            if (point) zoomPoint = point;
            applyZoom();
        },
        getCurrentTime: function() {
            return player ? player.currentTime() : 0;
        },
        getDuration: function() {
            return player ? player.duration() : 0;
        },
        seekTo: function(time) {
            if (player) player.currentTime(time);
        },
        play: function() {
            if (player) player.play();
        },
        pause: function() {
            if (player) player.pause();
        },
        toggleZoomRecording: toggleZoomRecording,
        // Convert time from original video to preview video (accounting for cuts)
        mapTimeToPreview: function(originalTime, selections) {
            if (!selections || selections.length === 0) return originalTime;
            
            // Ensure originalTime is a number
            originalTime = parseFloat(originalTime);
            if (isNaN(originalTime)) return 0;
            
            // Calculate time shift based on cuts before this point
            let timeShift = 0;
            
            // Sort selections by start time
            const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
            
            // For each cut selection before or overlapping our target time
            for (const cut of sortedSelections) {
                // Ensure cut times are numbers
                const cutStart = parseFloat(cut.start);
                const cutEnd = parseFloat(cut.end);
                
                if (isNaN(cutStart) || isNaN(cutEnd)) {
                    console.warn('Invalid cut selection times:', cut);
                    continue;
                }
                
                if (cutStart >= originalTime) {
                    // This cut is entirely after our target time
                    break;
                }
                
                if (cutEnd <= originalTime) {
                    // This cut is entirely before our target time
                    // Subtract its duration from our time
                    timeShift += (cutEnd - cutStart);
                } else if (cutStart < originalTime && cutEnd > originalTime) {
                    // Our target time falls within this cut
                    // Map to the start of the cut
                    console.log(`Time ${originalTime} falls within cut at ${cutStart}-${cutEnd}, mapping to ${cutStart - timeShift}`);
                    return Math.max(0, cutStart - timeShift);
                }
            }
            
            // Adjust the time by subtracting all cuts before it
            const result = Math.max(0, originalTime - timeShift);
            console.log(`Mapped original time ${originalTime} to preview time ${result} (shift: ${timeShift})`);
            return result;
        },
        
        // Convert time from preview video to original video (accounting for cuts)
        mapTimeFromPreview: function(previewTime, selections) {
            if (!selections || selections.length === 0) return previewTime;
            
            // Ensure previewTime is a number
            previewTime = parseFloat(previewTime);
            if (isNaN(previewTime)) return 0;
            
            // Sort selections by start time
            const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
            
            // Track time in the original timeline
            let originalTime = previewTime;
            
            // Track how much time we've added so far
            let timeAdded = 0;
            
            try {
                // For each cut selection, adjust the time
                for (const cut of sortedSelections) {
                    // Ensure cut times are numbers
                    const cutStart = parseFloat(cut.start);
                    const cutEnd = parseFloat(cut.end);
                    
                    if (isNaN(cutStart) || isNaN(cutEnd)) {
                        console.warn('Invalid cut selection times:', cut);
                        continue;
                    }
                    
                    // Check if the preview time is at or after the adjusted cut start
                    if (originalTime >= cutStart - timeAdded) {
                        // Add the duration of this cut to our original time
                        const cutDuration = cutEnd - cutStart;
                        originalTime += cutDuration;
                        
                        // Keep track of time we've added so far
                        timeAdded += cutDuration;
                        console.log(`Added cut duration ${cutDuration}s, timeAdded now ${timeAdded}s`);
                    } else {
                        // This cut is after our target time, no need to adjust further
                        break;
                    }
                }
                
                console.log(`Mapped preview time ${previewTime} to original time ${originalTime} (added: ${timeAdded})`);
                return Math.max(0, originalTime);
            } catch (error) {
                console.error('Error in mapTimeFromPreview:', error);
                return previewTime; // Fallback to original time if error
            }
        }
    };
});