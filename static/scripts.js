// Enhanced Main Script for WizardCut Video Editor
document.addEventListener('DOMContentLoaded', function() {
    // State
    let sessionId = null;
    let originalFilename = null;
    let transcriptData = [];
    let adjustedTranscriptData = []; // For edited timing
    let selections = [];
    let isSelecting = false;
    let selectionStart = null;
    let selectionStartIdx = null;
    let selectionEndIdx = null;
    let editedVideoUrl = null;
    let previewVideoUrl = null;
    let isShowingEditedVideo = false;
    let isProcessing = false;
    let hasShownKeyboardShortcutTip = false;
    let previewPlayerInitialized = false;
    let activeTab = 'original'; // Which tab is currently active: 'original' or 'preview'
    
    // Zoom and tracking state
    let zoomEvents = []; // Array to store zoom events
    
    // DOM Elements
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const uploadSection = document.getElementById('upload-section');
    const editorSection = document.getElementById('editor-section');
    const videoWrapper = document.getElementById('video-wrapper');
    const previewWrapper = document.getElementById('preview-wrapper');
    const mouseIndicator = document.getElementById('mouse-indicator');
    const previewMouseIndicator = document.getElementById('preview-mouse-indicator');
    const transcriptContainer = document.getElementById('transcript-container');
    const transcriptContent = document.getElementById('transcript-content');
    const selectBtn = document.getElementById('select-btn');
    const clearBtn = document.getElementById('clear-btn');
    const previewBtn = document.getElementById('preview-btn');
    const autoPreviewToggle = document.getElementById('auto-preview-toggle');
    const originalTab = document.getElementById('original-tab');
    const previewTab = document.getElementById('preview-tab');
    const downloadBtn = document.getElementById('download-btn');
    const cleanupBtn = document.getElementById('cleanup-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    const progressBar = document.getElementById('progress-bar');
    const selectionsContainer = document.getElementById('selections-container');
    const selectionsList = document.getElementById('selections-list');
    const contextMenu = document.getElementById('custom-context-menu');
    const contextMenuCut = document.getElementById('context-menu-cut');
    const customPlayBtn = document.getElementById('custom-play-btn');
    const customPauseBtn = document.getElementById('custom-pause-btn');
    const previewStatus = document.getElementById('preview-status');
    const previewStatusText = document.getElementById('preview-status-text');
    
    // Zoom control elements
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    const recordZoomBtn = document.getElementById('record-zoom-btn');
    const zoomRecordStatus = document.getElementById('zoom-record-status');
    const zoomTimeline = document.getElementById('zoom-timeline');
    const timelineScale = document.querySelector('.timeline-scale');
    const zoomEventsContainer = document.getElementById('zoom-events-container');
    const timelineCursor = document.getElementById('timeline-cursor');
    const zoomEventsList = document.getElementById('zoom-events-list');
    const zoomEventsEditor = document.getElementById('zoom-events-editor');
    
    // State for preview functionality
    let isAutoPreviewEnabled = false;
    let previewDebounceTimer = null;
    let isPreviewGenerating = false;
    
    // Event Listeners
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    dropArea.addEventListener('dragover', handleDragOver);
    dropArea.addEventListener('dragleave', handleDragLeave);
    dropArea.addEventListener('drop', handleDrop);
    selectBtn.addEventListener('click', toggleSelectionMode);
    clearBtn.addEventListener('click', clearSelections);
    previewBtn.addEventListener('click', generatePreview);
    autoPreviewToggle.addEventListener('change', toggleAutoPreview);
    // Modified event listeners using the complete modal approach
    originalTab.addEventListener('click', () => modalSwitchTab('original'));
    previewTab.addEventListener('click', () => modalSwitchTab('preview'));
    
    // Switch between original and preview tabs with modal approach
    function modalSwitchTab(tab) {
        // If trying to switch to preview but no preview available yet
        if (tab === 'preview' && !previewVideoUrl) {
            // Generate preview if not already in progress
            if (!isPreviewGenerating) {
                generatePreview();
            }
            return;
        }
        
        // If tab is disabled, do nothing
        if (tab === 'preview' && previewTab.disabled) return;
        
        console.log(`Switching from ${activeTab} mode to ${tab} mode`);
        
        // COMPLETE MODAL APPROACH: Fully separate the two modes
        // Stop everything in the current mode before switching
        
        // First, pause both players
        if (window.videoJsIntegration && window.videoJsIntegration.getPlayer()) {
            window.videoJsIntegration.pause();
        }
        if (window.previewPlayer) {
            window.previewPlayer.pause();
        }
        
        // Clear any current highlights
        const currentElements = document.querySelectorAll('.word.current, .silence-marker.current');
        currentElements.forEach(el => el.classList.remove('current'));
        
        // Update active tab state
        activeTab = tab;
        
        // Update tab styles
        originalTab.classList.toggle('active', tab === 'original');
        previewTab.classList.toggle('active', tab === 'preview');
        
        // Show/hide the corresponding video wrapper
        videoWrapper.style.display = tab === 'original' ? 'block' : 'none';
        previewWrapper.style.display = tab === 'preview' ? 'block' : 'none';
        
        // MODAL STRATEGY: Update timeline visualization based on mode
        if (tab === 'preview') {
            // Preview mode: update cut segments visualization
            // Make the cut segments visually full-height with more opacity
            const cutSegments = document.querySelectorAll('.timeline-cut-segment');
            cutSegments.forEach(segment => {
                segment.classList.add('preview-mode');
            });
            
            // Only when switching to preview mode, ensure the transcript is up-to-date
            if (window.previewPlayer) {
                // Get current time of preview player
                const previewTime = window.previewPlayer.currentTime();
                
                // Explicitly update only for this player's current time
                // Map to original time for word highlighting
                if (window.videoJsIntegration && selections.length > 0) {
                    const originalTime = window.videoJsIntegration.mapTimeFromPreview(
                        previewTime, selections);
                    
                    // Find and highlight the closest non-cut word
                    setTimeout(() => {
                        highlightClosestNonCutWord(originalTime);
                    }, 50);
                }
                
                // Update cursor position for preview player
                setTimeout(() => {
                    updateTimelineCursor(previewTime);
                }, 50);
                
                // Update timeline scale to match preview duration
                setTimeout(() => {
                    updateTimelineScaleForPreview();
                }, 100);
            }
        } else {
            // Original mode: restore cut segments visualization
            const cutSegments = document.querySelectorAll('.timeline-cut-segment');
            cutSegments.forEach(segment => {
                segment.classList.remove('preview-mode');
            });
            
            // Only when switching to original mode, ensure the transcript is up-to-date
            if (window.videoJsIntegration) {
                // Get current time of original player
                const originalTime = window.videoJsIntegration.getCurrentTime();
                
                // Update transcript highlighting for original player
                setTimeout(() => {
                    // For original player, don't use adjusted timestamps
                    highlightCurrentWord(originalTime, false);
                    updateTimelineCursor(originalTime); 
                }, 50);
                
                // Update timeline scale to match original duration
                setTimeout(() => {
                    const duration = window.videoJsIntegration.getDuration() || 0;
                    updateTimelineScale(duration);
                }, 100);
            }
        }
        
        console.log(`Successfully switched to ${tab} mode`);
    }
    downloadBtn.addEventListener('click', processAndDownloadVideo);
    cleanupBtn.addEventListener('click', cleanupServerData);
    
    // Custom play/pause controls
    customPlayBtn.addEventListener('click', () => {
        if (window.videoJsIntegration) {
            const player = window.videoJsIntegration.getPlayer();
            if (player && player.bigPlayButton && player.bigPlayButton.el_) {
                // Handle the first play (big play button is visible)
                if (player.paused() && player.bigPlayButton.el_.style.display !== 'none') {
                    // Simulate a click on the big play button to start initial playback
                    player.bigPlayButton.hide();
                }
            }
            window.videoJsIntegration.play();
        }
    });
    
    customPauseBtn.addEventListener('click', () => {
        if (window.videoJsIntegration) {
            window.videoJsIntegration.pause();
        }
    });
    
    // Context menu setup
    transcriptContainer.addEventListener('contextmenu', handleContextMenu);
    contextMenuCut.addEventListener('click', markSelectionForCut);
    document.addEventListener('click', hideContextMenu);
    
    // Keyboard shortcut for marking text to cut
    document.addEventListener('keydown', function(e) {
        // Let the videoJsIntegration handle video-related shortcuts
        if (e.target.closest('#video-wrapper')) return;
        
        // 'x' key for marking text to cut
        if (e.key === 'x' || e.key === 'X') {
            // Get the current text selection
            const selection = window.getSelection();
            if (selection.toString().trim() !== '') {
                markSelectionForCut();
                e.preventDefault(); // Prevent default 'x' action
            }
        }
    });
    
    // Zoom control buttons
    zoomInBtn.addEventListener('click', () => {
        if (window.videoJsIntegration) {
            // Get current zoom level and add 0.25
            const currentZoom = parseFloat(getComputedStyle(document.querySelector('.video-js video')).transform.split(',')[0].slice(7)) || 1;
            window.videoJsIntegration.applyZoom(Math.min(5, currentZoom + 0.25));
        }
    });
    
    zoomOutBtn.addEventListener('click', () => {
        if (window.videoJsIntegration) {
            // Get current zoom level and subtract 0.25
            const currentZoom = parseFloat(getComputedStyle(document.querySelector('.video-js video')).transform.split(',')[0].slice(7)) || 1;
            window.videoJsIntegration.applyZoom(Math.max(1, currentZoom - 0.25));
        }
    });
    
    zoomResetBtn.addEventListener('click', () => {
        if (window.videoJsIntegration) {
            window.videoJsIntegration.resetZoom();
        }
    });
    
    // Zoom recording
    recordZoomBtn.addEventListener('click', function() {
        if (window.videoJsIntegration) {
            // Cache the original button dimensions and position
            const rect = this.getBoundingClientRect();
            const width = this.offsetWidth;
            const height = this.offsetHeight;
            
            // Toggle zoom recording state
            const isRecording = this.classList.contains('btn-danger');
            
            if (!isRecording) {
                // Start recording
                this.classList.remove('btn-outline-primary');
                this.classList.add('btn-danger');
                this.innerHTML = '<i class="fas fa-stop"></i> Stop Zoom';
                
                // Maintain the button dimensions
                this.style.width = width + 'px';
                this.style.minWidth = width + 'px';
                
                if (zoomRecordStatus) {
                    zoomRecordStatus.textContent = 'Recording Zoom';
                    zoomRecordStatus.classList.add('recording');
                }
            } else {
                // Stop recording
                this.classList.remove('btn-danger');
                this.classList.add('btn-outline-primary');
                this.innerHTML = '<i class="fas fa-video"></i> Record Zoom';
                
                // Maintain the button dimensions
                this.style.width = width + 'px';
                this.style.minWidth = width + 'px';
                
                if (zoomRecordStatus) {
                    zoomRecordStatus.textContent = '';
                    zoomRecordStatus.classList.remove('recording');
                }
            }
            
            window.videoJsIntegration.toggleZoomRecording();
        }
    });
    
    // Listen for zoom recording events from videoJsIntegration
    document.addEventListener('zoom-recording-started', function() {
        if (recordZoomBtn) {
            recordZoomBtn.classList.remove('btn-outline-primary');
            recordZoomBtn.classList.add('btn-danger');
            recordZoomBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Zoom';
            
            if (zoomRecordStatus) {
                zoomRecordStatus.textContent = 'Recording Zoom';
                zoomRecordStatus.classList.add('recording');
            }
        }
    });
    
    document.addEventListener('zoom-recording-stopped', function() {
        if (recordZoomBtn) {
            recordZoomBtn.classList.remove('btn-danger');
            recordZoomBtn.classList.add('btn-outline-primary');
            recordZoomBtn.innerHTML = '<i class="fas fa-video"></i> Record Zoom';
            
            if (zoomRecordStatus) {
                zoomRecordStatus.textContent = '';
                zoomRecordStatus.classList.remove('recording');
            }
        }
    });
    
    // Timeline click with modal approach
    zoomTimeline.addEventListener('click', modalTimelineClick);
    
    // Modal timeline click handler
    function modalTimelineClick(e) {
        if (!zoomTimeline) return;
        
        // If the click is on a cut segment or zoom event, let their own handlers work
        if (e.target.classList.contains('timeline-cut-segment') || 
            e.target.classList.contains('zoom-event') ||
            e.target.classList.contains('zoom-event-label')) {
            return;
        }
        
        // Get click position relative to timeline
        const rect = zoomTimeline.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        
        try {
            // MODAL APPROACH: Only affect the active player
            if (activeTab === 'preview') {
                // PREVIEW MODE - completely independent from original player
                if (window.previewPlayer) {
                    // Pause the preview player first
                    window.previewPlayer.pause();
                    
                    // Get the duration of the preview video
                    const duration = window.previewPlayer.duration() || 0;
                    if (duration) {
                        // Calculate time in preview timeline
                        const previewTime = clickPosition * duration;
                        console.log(`Timeline click in PREVIEW MODE: setting time to ${previewTime}s`);
                        
                        // Set the preview player time
                        window.previewPlayer.currentTime(previewTime);
                        
                        // After the seek completes, do preview-specific highlighting
                        setTimeout(() => {
                            if (activeTab === 'preview') { // Double-check mode hasn't changed
                                const actualTime = window.previewPlayer.currentTime();
                                // Map to original time for word highlighting
                                if (window.videoJsIntegration && selections.length > 0) {
                                    const mappedTime = window.videoJsIntegration.mapTimeFromPreview(
                                        actualTime, selections);
                                    highlightClosestNonCutWord(mappedTime);
                                }
                                // Update cursor position
                                updateTimelineCursor(actualTime);
                            }
                        }, 100);
                    }
                }
            } else {
                // ORIGINAL MODE - completely independent from preview player
                if (window.videoJsIntegration) {
                    // Pause the original player first
                    window.videoJsIntegration.pause();
                    
                    // Get the duration
                    const duration = window.videoJsIntegration.getDuration();
                    if (duration) {
                        // Calculate time in original timeline
                        const originalTime = clickPosition * duration;
                        console.log(`Timeline click in ORIGINAL MODE: setting time to ${originalTime}s`);
                        
                        // Set the time
                        window.videoJsIntegration.seekTo(originalTime);
                        
                        // After seek completes, update original-specific highlighting
                        setTimeout(() => {
                            if (activeTab === 'original') { // Double-check mode hasn't changed
                                const actualTime = window.videoJsIntegration.getCurrentTime();
                                highlightCurrentWord(actualTime, false);
                                updateTimelineCursor(actualTime);
                            }
                        }, 100);
                    }
                }
            }
        } catch (error) {
            console.error('Error in modal timeline click handler:', error);
        }
    }
    
    // Timeline click handler - uses active tab to determine which player to control
    function handleTimelineClick(e) {
        if (!zoomTimeline) return;
        
        // If the click is on a cut segment or zoom event, let their own handlers work
        if (e.target.classList.contains('timeline-cut-segment') || 
            e.target.classList.contains('zoom-event') ||
            e.target.classList.contains('zoom-event-label')) {
            return;
        }
        
        // Get click position relative to timeline
        const rect = zoomTimeline.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        
        try {
            console.log(`Timeline click at position ${(clickPosition * 100).toFixed(1)}% in ${activeTab} mode`);
            
            // COMPLETE MODAL APPROACH: Use only the active player
            if (activeTab === 'preview') {
                // PREVIEW MODE: Only control the preview player
                if (window.previewPlayer) {
                    // First ensure the player is paused
                    window.previewPlayer.pause();
                    
                    const duration = window.previewPlayer.duration() || 0;
                    if (duration) {
                        // Calculate time in preview timeline
                        const previewTime = clickPosition * duration;
                        console.log(`Timeline click: setting preview player time to ${previewTime.toFixed(2)}s`);
                        
                        // Perform the seek on the preview player only
                        window.previewPlayer.currentTime(previewTime);
                        
                        // After seek completes, update the transcript using the adjusted time
                        setTimeout(() => {
                            const actualPreviewTime = window.previewPlayer.currentTime();
                            console.log(`Seek completed. Actual preview time: ${actualPreviewTime.toFixed(2)}s`);
                            
                            // Convert preview time to original time for word highlighting
                            if (window.videoJsIntegration && selections.length > 0) {
                                const mappedOriginalTime = window.videoJsIntegration.mapTimeFromPreview(
                                    actualPreviewTime, selections);
                                
                                console.log(`Mapped preview time ${actualPreviewTime.toFixed(2)}s to original time ${mappedOriginalTime.toFixed(2)}s`);
                                
                                // Find and highlight the closest non-cut word
                                highlightClosestNonCutWord(mappedOriginalTime);
                            }
                        }, 100);
                    }
                }
            } else {
                // ORIGINAL MODE: Only control the original player
                if (window.videoJsIntegration) {
                    // First ensure the player is paused
                    window.videoJsIntegration.pause();
                    
                    const duration = window.videoJsIntegration.getDuration();
                    if (duration) {
                        // Calculate time in original timeline
                        const originalTime = clickPosition * duration;
                        console.log(`Timeline click: setting original player time to ${originalTime.toFixed(2)}s`);
                        
                        // Perform the seek on the original player only
                        window.videoJsIntegration.seekTo(originalTime);
                        
                        // Update transcript highlighting with original timestamps
                        setTimeout(() => {
                            const actualTime = window.videoJsIntegration.getCurrentTime();
                            console.log(`Seek completed. Actual original time: ${actualTime.toFixed(2)}s`);
                            highlightCurrentWord(actualTime, false);
                        }, 100);
                    }
                }
            }
        } catch (error) {
            console.error('Error in timeline click handler:', error);
        }
    }
    
    // Function to find and highlight the closest non-cut word
    function highlightClosestNonCutWord(originalTime) {
        // Remove current highlight from all words and silence markers
        const currentElements = document.querySelectorAll('.word.current, .silence-marker.current');
        currentElements.forEach(el => el.classList.remove('current'));
        
        // First try to find an exact match (a word that spans the time)
        let foundExactMatch = false;
        for (let i = 0; i < transcriptData.length; i++) {
            const start = parseFloat(transcriptData[i].start);
            const end = parseFloat(transcriptData[i].end);
            
            // Skip words that have been marked for cutting
            const element = document.querySelector(`[data-index="${i}"]`);
            if (element && element.classList.contains('marked-for-cut')) {
                continue; // Skip cut words
            }
            
            // Check if time is within this word's range
            if (originalTime >= start && originalTime <= end) {
                if (element) {
                    element.classList.add('current');
                    scrollElementIntoViewIfNeeded(element);
                    foundExactMatch = true;
                    break;
                }
            }
        }
        
        // If no exact match found, find the closest non-cut word
        if (!foundExactMatch) {
            let closestIndex = -1;
            let minDistance = Infinity;
            
            for (let i = 0; i < transcriptData.length; i++) {
                // Skip words that have been marked for cutting
                const element = document.querySelector(`[data-index="${i}"]`);
                if (element && element.classList.contains('marked-for-cut')) {
                    continue;
                }
                
                const start = parseFloat(transcriptData[i].start);
                const distance = Math.abs(start - originalTime);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    closestIndex = i;
                }
            }
            
            if (closestIndex >= 0) {
                const element = document.querySelector(`[data-index="${closestIndex}"]`);
                if (element) {
                    element.classList.add('current');
                    scrollElementIntoViewIfNeeded(element);
                    console.log(`Highlighted closest non-cut word at index ${closestIndex}`);
                }
            }
        }
    }
    
    // Video player time update
    document.addEventListener('video-time-update', handleVideoTimeUpdate);
    
    // Video metadata loaded
    document.addEventListener('video-metadata-loaded', handleVideoMetadataLoaded);
    
    // Zoom event recorded
    document.addEventListener('zoom-event-recorded', handleZoomEventRecorded);
    
    // Functions
    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.add('dragover');
    }
    
    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove('dragover');
    }
    
    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dropArea.classList.remove('dragover');
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        }
    }
    
    function handleVideoTimeUpdate(e) {
        const { currentTime, source, isSeeked } = e.detail;
        
        // COMPLETE MODAL APPROACH: Only process events for the active player
        // Be very explicit about checking the source against the active tab
        const isSourceMatching = (activeTab === 'preview' && source === 'preview') || 
                                (activeTab === 'original' && source === 'original');
        
        if (!isSourceMatching) {
            // Simply ignore events from the inactive player
            return;
        }
        
        // Events from the active player continue processing
        if (isSeeked) {
            // Seek operations get priority treatment and extra logging
            console.log(`Seek operation in ${source} mode: ${currentTime.toFixed(2)}s`);
        }
        
        // Process the word highlighting based on the active tab
        if (activeTab === 'preview') {
            // Preview mode - need to map time back to original for highlighting
            if (window.videoJsIntegration && selections.length > 0) {
                const mappedOriginalTime = window.videoJsIntegration.mapTimeFromPreview(
                    currentTime, selections);
                
                // Find and highlight the closest non-cut word using original time
                highlightClosestNonCutWord(mappedOriginalTime);
            }
        } else {
            // Original mode - simple word highlighting
            highlightCurrentWord(currentTime, false);
        }
        
        // Always update timeline cursor for visual feedback
        updateTimelineCursor(currentTime);
    }
    
    function handleVideoMetadataLoaded(e) {
        const { duration } = e.detail;
        updateTimelineScale(duration);
    }
    
    function handleZoomEventRecorded(e) {
        const { zoomEvent } = e.detail;
        zoomEvents.push(zoomEvent);
        addZoomMarkerToTranscript(zoomEvent);
        addZoomEventToTimeline(zoomEvent);
        updateZoomEventsList();
        zoomEventsList.classList.remove('d-none');
    }
    
    // Calculate adjusted timestamps based on what's been cut
    function calculateAdjustedTimestamps(originalTranscript, selections) {
        // Create a deep copy of the original transcript
        const adjustedTranscript = JSON.parse(JSON.stringify(originalTranscript));
        
        // Track how much time has been removed at each point
        let timeShift = 0;
        
        // Sort selections by start time
        const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
        
        // For each selection (segment to remove)
        for (const selection of sortedSelections) {
            const selectionDuration = selection.end - selection.start;
            
            // Update all timestamps after this selection
            for (let i = 0; i < adjustedTranscript.length; i++) {
                const word = adjustedTranscript[i];
                
                if (word.start > selection.end) {
                    // This word comes completely after the cut segment
                    word.start -= timeShift + selectionDuration;
                    word.end -= timeShift + selectionDuration;
                    
                    // Store the original index for direct mapping
                    word.originalIndex = i;
                } else if (word.end > selection.start && word.start < selection.end) {
                    // This word overlaps with the cut segment, mark it
                    word.removed = true;
                } else if (word.end > selection.end && word.start <= selection.start) {
                    // This word contains the entire cut segment
                    word.end -= selectionDuration;
                    
                    // Store the original index for direct mapping
                    word.originalIndex = i;
                } else {
                    // Word is before the cut - keep original index for mapping
                    word.originalIndex = i;
                }
            }
            
            // Increase the total time shift
            timeShift += selectionDuration;
        }
        
        // Filter out removed words
        return adjustedTranscript.filter(word => !word.removed);
    }
    
    // Find the original index of a word based on its content and timestamps
    function findOriginalIndex(adjustedWord) {
        if (!adjustedWord) return -1;
        
        // For silence, we match on start time
        if (adjustedWord.is_silence) {
            // Try to find the closest matching silence in original transcript
            let bestMatch = -1;
            let minTimeDiff = Infinity;
            
            for (let i = 0; i < transcriptData.length; i++) {
                if (transcriptData[i].is_silence) {
                    // Convert adjusted time back to original time
                    const originalTime = window.videoJsIntegration ? 
                        window.videoJsIntegration.mapTimeFromPreview(parseFloat(adjustedWord.start), selections) : 
                        parseFloat(adjustedWord.start);
                    
                    const timeDiff = Math.abs(parseFloat(transcriptData[i].start) - originalTime);
                    if (timeDiff < minTimeDiff) {
                        minTimeDiff = timeDiff;
                        bestMatch = i;
                    }
                }
            }
            
            if (bestMatch >= 0 && minTimeDiff < 2.0) { // 2 second threshold for silence matching
                return bestMatch;
            }
        } else {
            // For words, first try to match on both word text and approximate time
            let bestWordMatch = -1;
            let minWordTimeDiff = Infinity;
            
            for (let i = 0; i < transcriptData.length; i++) {
                if (!transcriptData[i].is_silence && 
                    transcriptData[i].word === adjustedWord.word) {
                    
                    // Convert adjusted time back to original time
                    const originalTime = window.videoJsIntegration ? 
                        window.videoJsIntegration.mapTimeFromPreview(parseFloat(adjustedWord.start), selections) : 
                        parseFloat(adjustedWord.start);
                    
                    const timeDiff = Math.abs(parseFloat(transcriptData[i].start) - originalTime);
                    if (timeDiff < minWordTimeDiff) {
                        minWordTimeDiff = timeDiff;
                        bestWordMatch = i;
                    }
                }
            }
            
            if (bestWordMatch >= 0 && minWordTimeDiff < 5.0) { // 5 second threshold for word matching
                return bestWordMatch;
            }
            
            // If we still can't find a good match, just match on the word text
            for (let i = 0; i < transcriptData.length; i++) {
                if (!transcriptData[i].is_silence && 
                    transcriptData[i].word === adjustedWord.word) {
                    return i;
                }
            }
        }
        
        // As a last resort, find closest time match regardless of word content
        let bestTimeMatch = -1;
        let minOverallTimeDiff = Infinity;
        
        // Convert adjusted time back to original time
        const originalTime = window.videoJsIntegration ? 
            window.videoJsIntegration.mapTimeFromPreview(parseFloat(adjustedWord.start), selections) : 
            parseFloat(adjustedWord.start);
        
        for (let i = 0; i < transcriptData.length; i++) {
            const timeDiff = Math.abs(parseFloat(transcriptData[i].start) - originalTime);
            if (timeDiff < minOverallTimeDiff) {
                minOverallTimeDiff = timeDiff;
                bestTimeMatch = i;
            }
        }
        
        if (bestTimeMatch >= 0) {
            return bestTimeMatch;
        }
        
        return -1; // Not found
    }
    
    // Find the adjusted word for a given original word index
    function findAdjustedWord(originalIndex) {
        if (!adjustedTranscriptData.length) return null;
        
        // Get the original word
        const originalWord = transcriptData[originalIndex];
        if (!originalWord) return null;
        
        // Convert original time to adjusted time using our mapping function
        const originalTime = parseFloat(originalWord.start);
        const adjustedTime = window.videoJsIntegration ? 
            window.videoJsIntegration.mapTimeToPreview(originalTime, selections) : 
            originalTime;
        
        // For silence, try to find a close match by time
        if (originalWord.is_silence) {
            let bestMatch = null;
            let minTimeDiff = Infinity;
            
            for (const adjustedWord of adjustedTranscriptData) {
                if (adjustedWord.is_silence) {
                    // Compare with adjusted time
                    const adjustedStart = parseFloat(adjustedWord.start);
                    const timeDiff = Math.abs(adjustedStart - adjustedTime);
                    
                    if (timeDiff < minTimeDiff) {
                        minTimeDiff = timeDiff;
                        bestMatch = adjustedWord;
                    }
                }
            }
            
            if (bestMatch && minTimeDiff < 2.0) { // 2 second threshold for silence
                return bestMatch;
            }
        }
        
        // For regular words, first try to match on both content and approximate adjusted time
        let bestWordMatch = null;
        let minWordTimeDiff = Infinity;
        
        for (const adjustedWord of adjustedTranscriptData) {
            if (!adjustedWord.is_silence && adjustedWord.word === originalWord.word) {
                const adjustedStart = parseFloat(adjustedWord.start);
                const timeDiff = Math.abs(adjustedStart - adjustedTime);
                
                if (timeDiff < minWordTimeDiff) {
                    minWordTimeDiff = timeDiff;
                    bestWordMatch = adjustedWord;
                }
            }
        }
        
        if (bestWordMatch && minWordTimeDiff < 5.0) { // 5 second threshold for words
            return bestWordMatch;
        }
        
        // If still no match by word content and adjusted time, try just by word content
        for (const adjustedWord of adjustedTranscriptData) {
            if (!adjustedWord.is_silence && adjustedWord.word === originalWord.word) {
                return adjustedWord;
            }
        }
        
        // If no match by content, look for closest time match
        let closestWord = null;
        let minTimeDiff = Infinity;
        
        // Find the word with the closest adjusted start time
        for (const adjustedWord of adjustedTranscriptData) {
            const adjustedStart = parseFloat(adjustedWord.start);
            const timeDiff = Math.abs(adjustedStart - adjustedTime);
            
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestWord = adjustedWord;
            }
        }
        
        return closestWord;
    }
    
    function handleFileSelect() {
        if (fileInput.files.length === 0) return;
        
        const file = fileInput.files[0];
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file.');
            return;
        }
        
        showLoading('🪄 Transcribing your video\n (btw the loading bar is fake, it\'s actually a super hard problem to solve...)');
        uploadVideo(file);
    }
    
    function uploadVideo(file) {
        const formData = new FormData();
        formData.append('video', file);
        
        // Simulate upload progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 5;
            if (progress > 90) {
                clearInterval(progressInterval);
            }
            updateProgressBar(progress);
        }, 1000);
        
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            clearInterval(progressInterval);
            updateProgressBar(100);
            
            if (data.success) {
                sessionId = data.session_id;
                originalFilename = data.filename;
                transcriptData = data.transcript;
                
                // Show editor and load video
                uploadSection.style.display = 'none';
                editorSection.style.display = 'block';
                
                // Initialize video player using our enhanced integration
                const src = `/video/${sessionId}/${originalFilename}`;
                if (window.videoJsIntegration) {
                    try {
                        const playerInstance = window.videoJsIntegration.initPlayer(src);
                        if (!playerInstance) {
                            console.error("Failed to initialize video player. Retrying in 1 second...");
                            // Try again after a short delay - sometimes the DOM isn't ready
                            setTimeout(() => {
                                window.videoJsIntegration.initPlayer(src);
                            }, 1000);
                        }
                    } catch (err) {
                        console.error("Error initializing video player:", err);
                    }
                }
                
                // Reset zoom state
                if (window.videoJsIntegration) {
                    window.videoJsIntegration.resetZoom();
                    window.videoJsIntegration.setZoomMode('drag'); // Always set to drag mode
                }
                
                // Render transcript
                renderTranscript();
                hideLoading();
            } else {
                alert('Error: ' + data.error);
                hideLoading();
            }
        })
        .catch(error => {
            clearInterval(progressInterval);
            console.error('Error:', error);
            alert('An error occurred while uploading the video.');
            hideLoading();
        });
    }
    
    function renderTranscript() {
        transcriptContent.innerHTML = '';
        
        // Group words into sentences for better readability
        let currentSentence = [];
        let sentenceEnd = false;
        
        transcriptData.forEach((word, index) => {
            // Handle silence differently
            if (word.is_silence) {
                const silenceEl = document.createElement('span');
                silenceEl.className = 'silence-marker';
                silenceEl.innerHTML = `<i>🔇</i> ${word.duration}s silence`;
                silenceEl.dataset.index = index;
                silenceEl.dataset.start = word.start;
                silenceEl.dataset.end = word.end;
                
                silenceEl.addEventListener('click', function() {
                    // Get the timestamp for this silence
                    const silenceStart = parseFloat(word.start);
                    
                    // Navigate to this point based on active tab
                    modalNavigateToTimestamp(silenceStart, index);
                });
                
                // Add the silence marker to the DOM
                transcriptContent.appendChild(silenceEl);
                
                // If this was a long silence, consider it a paragraph break
                if (word.duration >= 2.0) {
                    transcriptContent.appendChild(document.createElement('br'));
                    transcriptContent.appendChild(document.createElement('br'));
                    currentSentence = [];
                }
                
                return;
            }
            
            // Normal word handling
            const wordEl = document.createElement('span');
            wordEl.className = 'word';
            wordEl.textContent = word.word;
            wordEl.dataset.index = index;
            wordEl.dataset.start = word.start;
            wordEl.dataset.end = word.end;
            
            wordEl.addEventListener('click', function() {
                if (isSelecting) {
                    handleWordSelection(this, index);
                } else {
                    // Get the timestamp for this word
                    const wordStart = parseFloat(word.start);
                    
                    // Navigate to this point based on active tab
                    modalNavigateToTimestamp(wordStart, index);
                }
            });
            
            currentSentence.push(wordEl);
            
            // Check if this might be the end of a sentence
            if (word.word.match(/[.!?]\s*$/)) {
                sentenceEnd = true;
            }
            
            // Add words to the DOM
            transcriptContent.appendChild(wordEl);
            
            // Add a space after each word unless it's punctuation
            if (!word.word.match(/^[,.:;?!-]/)) {
                transcriptContent.appendChild(document.createTextNode(' '));
            }
            
            // Add paragraph breaks at the end of sentences
            if (sentenceEnd && (index < transcriptData.length - 1)) {
                if (Math.random() < 0.3) { // Randomly add paragraph breaks for better readability
                    transcriptContent.appendChild(document.createElement('br'));
                    transcriptContent.appendChild(document.createElement('br'));
                    currentSentence = [];
                }
                sentenceEnd = false;
            }
        });
    }
    
    function toggleSelectionMode() {
        isSelecting = !isSelecting;
        
        if (isSelecting) {
            selectBtn.classList.remove('btn-outline-primary');
            selectBtn.classList.add('btn-primary');
            selectBtn.textContent = '🪄 Cancel Selection';
            transcriptContainer.style.cursor = 'crosshair';
        } else {
            selectBtn.classList.remove('btn-primary');
            selectBtn.classList.add('btn-outline-primary');
            selectBtn.textContent = '🪄 Select Text';
            transcriptContainer.style.cursor = 'auto';
            selectionStart = null;
        }
    }
    
    function handleWordSelection(wordEl, index) {
        if (selectionStart === null) {
            // Start a new selection
            selectionStart = wordEl;
            selectionStartIdx = index;
            wordEl.classList.add('selected');
        } else {
            // Complete the selection
            const startIdx = Math.min(selectionStartIdx, index);
            const endIdx = Math.max(selectionStartIdx, index);
            selectionEndIdx = endIdx;
            
            // Highlight all words in the selection
            const words = document.querySelectorAll('.word, .silence-marker');
            for (let i = startIdx; i <= endIdx; i++) {
                const el = document.querySelector(`[data-index="${i}"]`);
                if (el) {
                    el.classList.add('selected');
                    el.classList.add('marked-for-cut');
                }
            }
            
            // Add to selections
            const startTime = parseFloat(transcriptData[startIdx].start);
            const endTime = parseFloat(transcriptData[endIdx].end);
            
            // Get the text of the selection
            let selectionText = '';
            for (let i = startIdx; i <= endIdx; i++) {
                if (transcriptData[i].is_silence) {
                    selectionText += `[${transcriptData[i].duration}s silence] `;
                } else {
                    selectionText += transcriptData[i].word + ' ';
                }
            }
            
            const selection = {
                start: startTime,
                end: endTime,
                text: selectionText.trim(),
                startIdx: startIdx,
                endIdx: endIdx
            };
            
            selections.push(selection);
            updateSelectionsList();
            
            // Reset selection
            selectionStart = null;
            toggleSelectionMode();
        }
    }
    
    function updateSelectionsList() {
        if (selections.length > 0) {
            selectionsList.classList.remove('d-none');
            selectionsContainer.innerHTML = '';
            
            // Hide keyboard shortcut tip after first selection
            if (!hasShownKeyboardShortcutTip) {
                const keyboardShortcuts = document.querySelector('.keyboard-shortcuts');
                if (keyboardShortcuts) {
                    keyboardShortcuts.style.display = 'none';
                }
                hasShownKeyboardShortcutTip = true;
            }
            
            // Update timeline to show cut segments
            updateTimelineCutSegments();
            
            // Generate preview if auto-preview is enabled
            if (isAutoPreviewEnabled) {
                debouncePreviewGeneration();
            }
            
            selections.forEach((selection, index) => {
                const selectionItem = document.createElement('div');
                selectionItem.className = 'selection-item';
                
                const textSpan = document.createElement('span');
                textSpan.textContent = `"${selection.text}" (${formatTime(selection.start)} - ${formatTime(selection.end)})`;
                
                const playBtn = document.createElement('button');
                playBtn.className = 'btn btn-outline-primary btn-sm';
                playBtn.innerHTML = '▶';
                playBtn.title = 'Play this segment';
                playBtn.style.marginRight = '5px';
                playBtn.addEventListener('click', () => playSelection(selection));
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn btn-outline-danger btn-sm';
                removeBtn.innerHTML = '&times;';
                removeBtn.title = 'Remove this selection';
                removeBtn.addEventListener('click', () => removeSelection(index));
                
                selectionItem.appendChild(textSpan);
                selectionItem.appendChild(playBtn);
                selectionItem.appendChild(removeBtn);
                selectionsContainer.appendChild(selectionItem);
            });
        } else {
            selectionsList.classList.add('d-none');
            
            // Show keyboard shortcut tip again if all selections are removed
            if (hasShownKeyboardShortcutTip) {
                const keyboardShortcuts = document.querySelector('.keyboard-shortcuts');
                if (keyboardShortcuts) {
                    keyboardShortcuts.style.display = 'block';
                }
                hasShownKeyboardShortcutTip = false;
            }
        }
    }
    
    function playSelection(selection) {
        if (window.videoJsIntegration) {
            const player = window.videoJsIntegration.getPlayer();
            if (player) {
                // Set up one-time event handler for when playback reaches end time
                const endTimeHandler = function() {
                    if (player.currentTime() >= selection.end) {
                        player.pause();
                        player.off('timeupdate', endTimeHandler);
                    }
                };
                
                player.on('timeupdate', endTimeHandler);
                window.videoJsIntegration.seekTo(selection.start);
                window.videoJsIntegration.play();
            }
        }
    }
    
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    function removeSelection(index) {
        // Remove highlighting from words and silence markers
        const selection = selections[index];
        for (let i = selection.startIdx; i <= selection.endIdx; i++) {
            const el = document.querySelector(`[data-index="${i}"]`);
            if (el) {
                el.classList.remove('selected');
                el.classList.remove('marked-for-cut');
            }
        }
        
        // Remove from selections array
        selections.splice(index, 1);
        updateSelectionsList();
    }
    
    function clearSelections() {
        selections = [];
        const elements = document.querySelectorAll('.word, .silence-marker');
        elements.forEach(el => {
            el.classList.remove('selected');
            el.classList.remove('marked-for-cut');
        });
        updateSelectionsList();
        
        // Clear timeline cut segments
        clearTimelineCutSegments();
        
        // Clear any pending preview generation
        if (previewDebounceTimer) {
            clearTimeout(previewDebounceTimer);
            previewDebounceTimer = null;
            
            // Hide the preview status
            if (previewStatus) {
                previewStatus.classList.add('hidden');
            }
        }
        
        // Reset video players if preview or edited video exists
        if (editedVideoUrl || previewVideoUrl) {
            // Switch back to original tab
            modalSwitchTab('original');
            
            // Disable preview tab
            previewTab.disabled = true;
            
            // Cleanup preview player if it exists
            if (window.previewPlayer) {
                try {
                    window.previewPlayer.dispose();
                    window.previewPlayer = null;
                    previewPlayerInitialized = false;
                } catch (e) {
                    console.error("Error disposing preview player:", e);
                }
            }
            
            downloadBtn.disabled = false;
            downloadBtn.textContent = "✂️ Create & Download Edited Video";
            editedVideoUrl = null;
            previewVideoUrl = null;
            isShowingEditedVideo = false;
            adjustedTranscriptData = [];
        }
    }
    
    function processAndDownloadVideo() {
        if (isProcessing) return;
        
        // Allow processing with only zoom events
        if (selections.length === 0 && zoomEvents.length === 0) {
            alert('Please select at least one text segment to remove or add a zoom event.');
            return;
        }
        
        // If we already have an edited video, just download it
        if (editedVideoUrl) {
            window.location.href = editedVideoUrl.replace('/video/', '/download/');
            return;
        }
        
        isProcessing = true;
        downloadBtn.disabled = true;
        downloadBtn.textContent = "Processing...";
        
        let loadingMessage = '🧙‍♂️ Casting remove text  (a 5th level spell) on your video...';
        if (zoomEvents.length > 0) {
            loadingMessage += '\n📹 Adding ' + zoomEvents.length + ' zoom effects!';
        }
        showLoading(loadingMessage);
        
        // Sort selections by start time
        const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
        
        // Calculate adjusted timestamps for transcript after editing
        // This now includes direct mapping from original indices
        adjustedTranscriptData = calculateAdjustedTimestamps(transcriptData, sortedSelections);
        
        // Log the mapping for debugging
        console.log('Adjusted transcript data with original indices:', adjustedTranscriptData);
        
        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 3;
            if (progress > 90) {
                clearInterval(progressInterval);
            }
            updateProgressBar(progress);
        }, 1000);
        
        fetch('/edit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                filename: originalFilename,
                selections: sortedSelections,
                zoom_events: zoomEvents,
                preview_only: false
            })
        })
        .then(response => response.json())
        .then(data => {
            clearInterval(progressInterval);
            updateProgressBar(100);
            
            if (data.success) {
                editedVideoUrl = `/video/${sessionId}/${data.edited_file}`;
                previewVideoUrl = `/video/${sessionId}/${data.preview_file}`;
                
                // Update video player with preview
                if (window.videoJsIntegration) {
                    try {
                        const playerInstance = window.videoJsIntegration.initPlayer(previewVideoUrl);
                        if (!playerInstance) {
                            console.error("Failed to initialize preview player. Retrying in 1 second...");
                            // Try again after a short delay
                            setTimeout(() => {
                                window.videoJsIntegration.initPlayer(previewVideoUrl);
                            }, 1000);
                        }
                    } catch (err) {
                        console.error("Error initializing preview player:", err);
                    }
                }
                
                isShowingEditedVideo = true;
                
                // Enable download button
                downloadBtn.disabled = false;
                downloadBtn.textContent = "📥 Download Edited Video";
                
                hideLoading();
                isProcessing = false;
                
                // Auto-download after a slight delay
                setTimeout(() => {
                    window.location.href = editedVideoUrl.replace('/video/', '/download/');
                    
                    // Show the cleanup button once download has started
                    cleanupBtn.classList.remove('d-none');
                }, 1000);
                
            } else {
                alert('Error: ' + data.error);
                hideLoading();
                isProcessing = false;
                downloadBtn.disabled = false;
                downloadBtn.textContent = "✂️ Create & Download Edited Video";
            }
        })
        .catch(error => {
            clearInterval(progressInterval);
            console.error('Error:', error);
            alert('An error occurred while processing the video.');
            hideLoading();
            isProcessing = false;
            downloadBtn.disabled = false;
            downloadBtn.textContent = "✂️ Create & Download Edited Video";
        });
    }
    
    /**
     * Navigate to a specific timestamp, handling the differences between original and preview videos
     * @param {number} timestamp - The timestamp to navigate to
     * @param {number} wordIndex - The index of the word in the transcript (optional)
     */
    function navigateToTimestamp(timestamp, wordIndex) {
        // Ensure timestamp is a number
        timestamp = parseFloat(timestamp);
        if (isNaN(timestamp)) {
            console.warn('Invalid timestamp in navigateToTimestamp:', timestamp);
            return;
        }
        
        // Check if the word is marked for cutting in preview mode
        if (wordIndex !== undefined && activeTab === 'preview') {
            const element = document.querySelector(`[data-index="${wordIndex}"]`);
            if (element && element.classList.contains('marked-for-cut')) {
                console.log(`Word at index ${wordIndex} is marked for cutting, finding next non-cut word`);
                
                // Find the next non-cut word
                let nextNonCutIndex = -1;
                for (let i = 0; i < transcriptData.length; i++) {
                    const el = document.querySelector(`[data-index="${i}"]`);
                    if (el && !el.classList.contains('marked-for-cut') && 
                        parseFloat(transcriptData[i].start) >= timestamp) {
                        nextNonCutIndex = i;
                        break;
                    }
                }
                
                // If found a non-cut word after this one, use its timestamp
                if (nextNonCutIndex >= 0) {
                    timestamp = parseFloat(transcriptData[nextNonCutIndex].start);
                    console.log(`Using next non-cut word at time ${timestamp}`);
                }
            }
        }
        
        console.log(`Text click: navigating to ${timestamp.toFixed(2)}s in ${activeTab} mode`);
        
        try {
            // COMPLETE MODAL APPROACH: Use only the active player
            if (activeTab === 'preview') {
                // PREVIEW MODE: Only control the preview player
                if (window.videoJsIntegration && window.previewPlayer) {
                    // First ensure the player is paused
                    window.previewPlayer.pause();
                    
                    // Map the original timestamp to the preview video timeline
                    const previewTime = window.videoJsIntegration.mapTimeToPreview(timestamp, selections);
                    console.log(`Mapped original time ${timestamp.toFixed(2)}s to preview time ${previewTime.toFixed(2)}s`);
                    
                    // Perform the seek on the preview player only
                    window.previewPlayer.currentTime(previewTime);
                    
                    // After a slight delay, update word highlighting
                    setTimeout(() => {
                        const actualPreviewTime = window.previewPlayer.currentTime();
                        console.log(`Seek completed. Actual preview time: ${actualPreviewTime.toFixed(2)}s`);
                        
                        // Convert back to original time for word highlighting
                        if (selections.length > 0) {
                            const mappedOriginalTime = window.videoJsIntegration.mapTimeFromPreview(
                                actualPreviewTime, selections);
                            console.log(`Re-mapped to original time: ${mappedOriginalTime.toFixed(2)}s for highlighting`);
                            
                            // Find and highlight the closest non-cut word
                            highlightClosestNonCutWord(mappedOriginalTime);
                        }
                    }, 100);
                }
            } else {
                // ORIGINAL MODE: Only control the original player
                if (window.videoJsIntegration) {
                    // First ensure the player is paused
                    window.videoJsIntegration.pause();
                    
                    console.log(`Seeking original player to ${timestamp.toFixed(2)}s`);
                    
                    // Perform the seek on the original player only
                    window.videoJsIntegration.seekTo(timestamp);
                    
                    // After a slight delay, update word highlighting
                    setTimeout(() => {
                        const actualTime = window.videoJsIntegration.getCurrentTime();
                        console.log(`Seek completed. Actual original time: ${actualTime.toFixed(2)}s`);
                        highlightCurrentWord(actualTime, false);
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Error in navigateToTimestamp:', error);
        }
    }

    function highlightCurrentWord(currentTime, useAdjustedTimestamps = false) {
        try {
            // For preview mode
            if (useAdjustedTimestamps) {
                // Simple approach for preview mode: Convert preview time back to original time
                let originalTime = currentTime;
                
                if (window.videoJsIntegration && selections.length > 0) {
                    // Use the mapping function to get the original time
                    originalTime = window.videoJsIntegration.mapTimeFromPreview(currentTime, selections);
                }
                
                // Use the specialized function that skips cut words
                highlightClosestNonCutWord(originalTime);
            } else {
                // Original transcript logic - uncut video
                // Remove current highlight from all words and silence markers
                const currentElements = document.querySelectorAll('.word.current, .silence-marker.current');
                currentElements.forEach(el => el.classList.remove('current'));
                
                for (let i = 0; i < transcriptData.length; i++) {
                    const start = parseFloat(transcriptData[i].start);
                    const end = parseFloat(transcriptData[i].end);
                    
                    if (currentTime >= start && currentTime <= end) {
                        // Add current class to the element
                        const element = document.querySelector(`[data-index="${i}"]`);
                        if (element) {
                            element.classList.add('current');
                            scrollElementIntoViewIfNeeded(element);
                        }
                        break;
                    }
                }
            }
        } catch (error) {
            console.error('Error in highlightCurrentWord:', error);
        }
    }
    
    // Helper function to scroll an element into view if needed
    function scrollElementIntoViewIfNeeded(element) {
        if (!element) return;
        
        const container = document.getElementById('transcript-container');
        if (!container) return;
        
        const elementRect = element.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    
    // Context menu handling
    function handleContextMenu(e) {
        e.preventDefault();
        
        // Get the current text selection
        const selection = window.getSelection();
        if (selection.toString().trim() !== '') {
            // Position the context menu
            contextMenu.style.left = `${e.pageX}px`;
            contextMenu.style.top = `${e.pageY}px`;
            contextMenu.style.display = 'block';
        }
    }
    
    function hideContextMenu() {
        contextMenu.style.display = 'none';
    }
    
    function markSelectionForCut() {
        // Get the current text selection
        const selection = window.getSelection();
        if (selection.toString().trim() === '') return;
        
        // Find the start and end word elements
        let startNode = selection.anchorNode;
        let endNode = selection.focusNode;
        
        // If we're on text nodes, get their parent elements
        if (startNode.nodeType === Node.TEXT_NODE) {
            startNode = startNode.parentElement;
        }
        if (endNode.nodeType === Node.TEXT_NODE) {
            endNode = endNode.parentElement;
        }
        
        // Find the word elements that contain the start and end points
        let startWordEl = startNode.closest('.word') || startNode.closest('.silence-marker');
        let endWordEl = endNode.closest('.word') || endNode.closest('.silence-marker');
        
        // If we didn't find valid word elements, exit
        if (!startWordEl || !endWordEl) return;
        
        // Get the indices
        const startIdx = parseInt(startWordEl.dataset.index);
        const endIdx = parseInt(endWordEl.dataset.index);
        
        // Make sure we have the start and end in the right order
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        
        // Mark all words in the range
        const words = document.querySelectorAll('.word, .silence-marker');
        for (let i = minIdx; i <= maxIdx; i++) {
            const el = document.querySelector(`[data-index="${i}"]`);
            if (el) {
                el.classList.add('marked-for-cut');
            }
        }
        
        // Add to selections
        const startTime = parseFloat(transcriptData[minIdx].start);
        const endTime = parseFloat(transcriptData[maxIdx].end);
        
        // Get the text of the selection
        let selectionText = '';
        for (let i = minIdx; i <= maxIdx; i++) {
            if (transcriptData[i].is_silence) {
                selectionText += `[${transcriptData[i].duration}s silence] `;
            } else {
                selectionText += transcriptData[i].word + ' ';
            }
        }
        
        const selectionObj = {
            start: startTime,
            end: endTime,
            text: selectionText.trim(),
            startIdx: minIdx,
            endIdx: maxIdx
        };
        
        selections.push(selectionObj);
        updateSelectionsList();
        
        // Clear the selection
        selection.removeAllRanges();
        
        // Hide the context menu
        hideContextMenu();
    }
    
    function updateTimelineScale(duration) {
        if (!timelineScale) return;
        
        // Clear existing markers
        timelineScale.innerHTML = '';
        
        // Add time markers
        duration = duration || 60; // fallback to 60s if duration not available
        
        // In preview mode, use adjusted timeline to account for deleted parts
        if (activeTab === 'preview' && selections.length > 0 && window.previewPlayer) {
            const previewDuration = window.previewPlayer.duration() || duration;
            console.log(`Using preview duration for timeline: ${previewDuration}s`);
            
            // Create markers based on preview duration
            const interval = Math.max(1, Math.floor(previewDuration / 10)); // Create at most 10 markers
            
            for (let i = 0; i <= previewDuration; i += interval) {
                const marker = document.createElement('span');
                marker.className = 'timeline-marker';
                
                // Show the original time (mapped from preview time)
                const originalTime = window.videoJsIntegration.mapTimeFromPreview(i, selections);
                const displayTime = formatTime(originalTime);
                marker.innerHTML = `<span class="preview-time">${formatTime(i)}</span><br><span class="original-time">${displayTime}</span>`;
                
                // Position based on preview timeline
                marker.style.left = `${(i / previewDuration) * 100}%`;
                timelineScale.appendChild(marker);
            }
        } else {
            // Original timeline (unchanged)
            const interval = Math.max(1, Math.floor(duration / 10)); // Create at most 10 markers
            
            for (let i = 0; i <= duration; i += interval) {
                const marker = document.createElement('span');
                marker.className = 'timeline-marker';
                marker.textContent = formatTime(i);
                marker.style.left = `${(i / duration) * 100}%`;
                timelineScale.appendChild(marker);
            }
        }
    }
    
    function addZoomMarkerToTranscript(zoomEvent) {
        // Find the correct position in the transcript based on the start time
        const startTime = zoomEvent.startTime;
        const endTime = zoomEvent.endTime;
        
        // Find the words in transcript that are within this time range
        let startIndex = -1;
        let endIndex = -1;
        
        for (let i = 0; i < transcriptData.length; i++) {
            const wordStart = parseFloat(transcriptData[i].start);
            const wordEnd = parseFloat(transcriptData[i].end);
            
            // Find the first word that starts within or just before the zoom range
            if (startIndex === -1 && wordStart <= startTime && wordEnd >= startTime) {
                startIndex = i;
            }
            
            // Find the last word that ends within or just after the zoom range
            if (wordEnd <= endTime) {
                endIndex = i;
            }
        }
        
        // If we didn't find exact matches, make a best effort
        if (startIndex === -1 && transcriptData.length > 0) {
            // Find the closest word before the start time
            for (let i = 0; i < transcriptData.length; i++) {
                if (parseFloat(transcriptData[i].start) > startTime) {
                    startIndex = Math.max(0, i - 1);
                    break;
                }
            }
            if (startIndex === -1) startIndex = 0;
        }
        
        if (endIndex === -1 && transcriptData.length > 0) {
            // Find the closest word after the end time
            for (let i = transcriptData.length - 1; i >= 0; i--) {
                if (parseFloat(transcriptData[i].end) < endTime) {
                    endIndex = Math.min(transcriptData.length - 1, i + 1);
                    break;
                }
            }
            if (endIndex === -1) endIndex = transcriptData.length - 1;
        }
        
        // Apply zoom class to all words in the range
        for (let i = startIndex; i <= endIndex; i++) {
            const el = document.querySelector(`[data-index="${i}"]`);
            if (el) {
                el.classList.add('zoom-highlight');
                el.dataset.zoomId = zoomEvent.id;
                
                // Add the zoom level as a data attribute to be displayed on hover
                el.dataset.zoomLevel = zoomEvent.endZoomLevel.toFixed(1);
            }
        }
        
        // Add a small zoom indicator at the start of the range
        const firstEl = document.querySelector(`[data-index="${startIndex}"]`);
        if (firstEl) {
            // Add a subtle zoom icon before the first word
            const zoomIconEl = document.createElement('span');
            zoomIconEl.className = 'zoom-icon';
            zoomIconEl.innerHTML = `🔍${zoomEvent.endZoomLevel.toFixed(1)}x`;
            zoomIconEl.dataset.zoomId = zoomEvent.id;
            
            // Clicking the zoom icon jumps to that point in the video
            zoomIconEl.addEventListener('click', () => {
                if (window.videoJsIntegration) {
                    window.videoJsIntegration.seekTo(zoomEvent.startTime);
                    window.videoJsIntegration.play();
                }
            });
            
            // Add a remove button
            const removeButton = document.createElement('span');
            removeButton.className = 'zoom-remove';
            removeButton.innerHTML = '×';
            removeButton.title = 'Remove zoom';
            removeButton.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent jumping to video point
                removeZoomEvent(zoomEvent.id);
            });
            
            zoomIconEl.appendChild(removeButton);
            
            // Insert before the first word
            firstEl.parentNode.insertBefore(zoomIconEl, firstEl);
        }
    }
    
    function addZoomEventToTimeline(zoomEvent) {
        if (!zoomEventsContainer) return;
        
        const duration = window.videoJsIntegration ? window.videoJsIntegration.getDuration() : 60;
        const startPercent = (zoomEvent.startTime / duration) * 100;
        const endPercent = (zoomEvent.endTime / duration) * 100;
        const width = endPercent - startPercent;
        
        const eventEl = document.createElement('div');
        eventEl.className = 'zoom-event';
        eventEl.dataset.zoomId = zoomEvent.id;
        eventEl.style.left = `${startPercent}%`;
        eventEl.style.width = `${width}%`;
        
        const labelEl = document.createElement('span');
        labelEl.className = 'zoom-event-label';
        labelEl.textContent = `${zoomEvent.startZoomLevel.toFixed(1)}x → ${zoomEvent.endZoomLevel.toFixed(1)}x`;
        
        eventEl.appendChild(labelEl);
        eventEl.addEventListener('click', () => selectZoomEvent(zoomEvent.id));
        
        zoomEventsContainer.appendChild(eventEl);
    }
    
    function updateTimelineCursor(currentTime) {
        if (!timelineCursor) return;
        
        // COMPLETE MODAL APPROACH: Get time from the appropriate player only
        // This ensures we never mix times from different players
        let time, duration;
        
        if (activeTab === 'preview') {
            // Preview mode - use only preview player time
            if (!window.previewPlayer) return;
            
            time = currentTime !== undefined ? currentTime : window.previewPlayer.currentTime();
            duration = window.previewPlayer.duration() || 0;
            
            // Keep extra logging for debugging
            if (currentTime !== undefined) {
                console.log(`Updating timeline cursor for preview: ${time.toFixed(2)}s / ${duration.toFixed(2)}s`);
            }
        } else {
            // Original mode - use only original player time
            if (!window.videoJsIntegration) return;
            
            time = currentTime !== undefined ? currentTime : window.videoJsIntegration.getCurrentTime();
            duration = window.videoJsIntegration.getDuration() || 0;
        }
        
        // Show cursor when duration is available
        if (duration > 0) {
            timelineCursor.style.display = 'block';
            
            // Calculate position based on current time
            const percent = (time / duration) * 100;
            timelineCursor.style.left = `${percent}%`;
        } else {
            timelineCursor.style.display = 'none';
        }
    }
    
    function handleTimelineClick(e) {
        if (!window.videoJsIntegration) return;
        
        const rect = zoomTimeline.getBoundingClientRect();
        const clickPosition = (e.clientX - rect.left) / rect.width;
        
        // Set video time based on click position
        const duration = window.videoJsIntegration.getDuration();
        if (duration) {
            window.videoJsIntegration.seekTo(clickPosition * duration);
        }
    }
    
    function updateZoomEventsList() {
        if (!zoomEventsEditor) return;
        
        zoomEventsEditor.innerHTML = '';
        
        if (zoomEvents.length === 0) {
            zoomEventsList.classList.add('d-none');
            return;
        }
        
        // Generate preview if auto-preview is enabled and we have zoom events
        if (isAutoPreviewEnabled) {
            debouncePreviewGeneration();
        }
        
        zoomEvents.forEach((event, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'zoom-event-item';
            
            const infoEl = document.createElement('div');
            infoEl.innerHTML = `
                <strong>Zoom ${index + 1}:</strong> ${formatTime(event.startTime)} - ${formatTime(event.endTime)}<br>
                <small>${event.startZoomLevel.toFixed(1)}x → ${event.endZoomLevel.toFixed(1)}x at position (${Math.round(event.focusPoint.x * 100)}%, ${Math.round(event.focusPoint.y * 100)}%)</small>
            `;
            
            const btnContainer = document.createElement('div');
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-outline-danger btn-sm';
            removeBtn.innerHTML = '&times;';
            removeBtn.addEventListener('click', () => removeZoomEvent(event.id));
            
            const jumpBtn = document.createElement('button');
            jumpBtn.className = 'btn btn-outline-primary btn-sm';
            jumpBtn.innerHTML = '▶';
            jumpBtn.style.marginRight = '5px';
            jumpBtn.addEventListener('click', () => {
                if (window.videoJsIntegration) {
                    window.videoJsIntegration.seekTo(event.startTime);
                    window.videoJsIntegration.play();
                }
            });
            
            btnContainer.appendChild(jumpBtn);
            btnContainer.appendChild(removeBtn);
            
            itemEl.appendChild(infoEl);
            itemEl.appendChild(btnContainer);
            
            zoomEventsEditor.appendChild(itemEl);
        });
    }
    
    function removeZoomEvent(id) {
        // Remove from the array
        zoomEvents = zoomEvents.filter(event => event.id !== id);
        
        // Remove highlighting from transcript words
        const highlightedWords = document.querySelectorAll(`.word[data-zoom-id="${id}"], .silence-marker[data-zoom-id="${id}"]`);
        highlightedWords.forEach(el => {
            el.classList.remove('zoom-highlight');
            delete el.dataset.zoomId;
            delete el.dataset.zoomLevel;
        });
        
        // Remove the zoom icon
        const zoomIcon = document.querySelector(`.zoom-icon[data-zoom-id="${id}"]`);
        if (zoomIcon) zoomIcon.remove();
        
        // Remove from timeline
        const timelineEl = document.querySelector(`.zoom-event[data-zoom-id="${id}"]`);
        if (timelineEl) timelineEl.remove();
        
        // Update the list
        updateZoomEventsList();
        
        // Hide the list if there are no events
        if (zoomEvents.length === 0) {
            zoomEventsList.classList.add('d-none');
        }
    }
    
    function selectZoomEvent(id) {
        // Remove selection from all events
        const allEvents = document.querySelectorAll('.zoom-event');
        allEvents.forEach(el => el.classList.remove('selected'));
        
        // Add selection to the clicked event
        const eventEl = document.querySelector(`.zoom-event[data-zoom-id="${id}"]`);
        if (eventEl) eventEl.classList.add('selected');
        
        // Jump to the event time
        const event = zoomEvents.find(e => e.id === id);
        if (event && window.videoJsIntegration) {
            window.videoJsIntegration.seekTo(event.startTime);
        }
    }
    
    function showLoading(message) {
        loadingMessage.textContent = message || 'Performing magical transformation...';
        loadingOverlay.style.display = 'flex';
        updateProgressBar(0);
    }
    
    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }
    
    function updateProgressBar(percent) {
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${percent}%`;
        progressBar.setAttribute('aria-valuenow', percent);
    }
    
    // Toggle auto-preview feature
    function toggleAutoPreview(e) {
        isAutoPreviewEnabled = e.target.checked;
        
        if (isAutoPreviewEnabled && selections.length > 0) {
            // Generate a preview immediately if there are selections
            debouncePreviewGeneration();
        }
    }
    
    // Debounce preview generation to avoid too many requests
    function debouncePreviewGeneration() {
        // Clear any existing timer
        if (previewDebounceTimer) {
            clearTimeout(previewDebounceTimer);
        }
        
        // Show status that preview will be generated soon
        showPreviewStatus('Preview will be generated in 2 seconds...');
        
        // Set a new timer
        previewDebounceTimer = setTimeout(() => {
            generatePreview();
        }, 2000); // Wait 2 seconds before generating preview
    }
    
    // Generate a preview of the edited video
    function generatePreview() {
        if (isPreviewGenerating || !sessionId || selections.length === 0 && zoomEvents.length === 0) {
            return;
        }
        
        isPreviewGenerating = true;
        showPreviewStatus('Generating preview...');
        
        // Sort selections by start time
        const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
        
        fetch('/preview_cuts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                session_id: sessionId,
                filename: originalFilename,
                selections: sortedSelections,
                zoom_events: zoomEvents
            })
        })
        .then(response => response.json())
        .then(data => {
            isPreviewGenerating = false;
            
            if (data.success) {
                // Check if the preview was from cache
                if (data.cached) {
                    showPreviewStatus('Using cached preview', 3000);
                } else {
                    showPreviewStatus('Preview ready!', 3000);
                }
                
                // Update video player with preview
                const previewUrl = `/video/${sessionId}/${data.preview_file}`;
                previewVideoUrl = previewUrl;
                isShowingEditedVideo = true;
                
                // Enable the preview tab
                previewTab.disabled = false;
                
                // Initialize the preview player if it hasn't been initialized yet
                if (!previewPlayerInitialized) {
                    // Make sure the preview wrapper container is properly set up
                    if (previewWrapper) {
                        // Create a videojs instance for the preview if needed
                        if (window.videoJsIntegration) {
                            try {
                                // We need to modify the integration to support multiple players
                                // For now, we'll use standard VideoJS API directly
                                if (!window.previewPlayer) {
                                    window.previewPlayer = videojs('preview-player', {
                                        controls: true,
                                        autoplay: false,
                                        preload: 'auto',
                                        fluid: true
                                    });
                                }
                                
                                // Set the source
                                window.previewPlayer.src({
                                    src: previewUrl,
                                    type: 'video/mp4'
                                });
                                
                                // Set up custom time update handling for the preview player
                                window.previewPlayer.on('timeupdate', function() {
                                    // Only process events if this is the active tab (MODAL APPROACH)
                                    if (activeTab !== 'preview') {
                                        return; // Ignore events when not in preview mode
                                    }
                                    
                                    const currentTime = window.previewPlayer.currentTime();
                                    
                                    // Dispatch event for the app
                                    const timeUpdateEvent = new CustomEvent('video-time-update', {
                                        detail: {
                                            currentTime: currentTime,
                                            duration: window.previewPlayer.duration() || 0,
                                            source: 'preview'
                                        }
                                    });
                                    document.dispatchEvent(timeUpdateEvent);
                                });
                                
                                // Also set up a seeked event handler for immediate updates after seeking
                                window.previewPlayer.on('seeked', function() {
                                    // Only process events if this is the active tab (MODAL APPROACH)
                                    if (activeTab !== 'preview') {
                                        return; // Ignore events when not in preview mode
                                    }
                                    
                                    const currentTime = window.previewPlayer.currentTime();
                                    console.log(`Preview player seeked to ${currentTime.toFixed(2)}s`);
                                    
                                    // Dispatch event for the app with seeked flag
                                    const timeUpdateEvent = new CustomEvent('video-time-update', {
                                        detail: {
                                            currentTime: currentTime,
                                            duration: window.previewPlayer.duration() || 0,
                                            source: 'preview',
                                            isSeeked: true
                                        }
                                    });
                                    document.dispatchEvent(timeUpdateEvent);
                                });
                                
                                previewPlayerInitialized = true;
                                showPreviewStatus('Preview ready! Click Preview tab to view', 3000);
                                
                                // Update preview tab with duration info
                                updatePreviewTabInfo();
                                
                                // Auto-switch to preview tab
                                modalSwitchTab('preview');
                                
                            } catch (err) {
                                console.error("Error initializing preview player:", err);
                                showPreviewStatus('Error loading preview player', 3000);
                            }
                        }
                    } else {
                        showPreviewStatus('Preview container not found', 3000);
                    }
                } else {
                    // Just update the source if player already exists
                    if (window.previewPlayer) {
                        window.previewPlayer.src({
                            src: previewUrl,
                            type: 'video/mp4'
                        });
                        
                        // Update preview tab info when metadata loads
                        updatePreviewTabInfo();
                        
                        showPreviewStatus('Preview updated! Click Preview tab to view', 3000);
                        
                        // Auto-switch to preview tab if already initialized
                        modalSwitchTab('preview');
                    }
                }
                
            } else {
                showPreviewStatus('Error generating preview', 3000);
                console.error('Preview generation error:', data.error);
            }
        })
        .catch(error => {
            isPreviewGenerating = false;
            showPreviewStatus('Error generating preview', 3000);
            console.error('Preview request error:', error);
        });
    }
    
    // Show preview status indicator
    function showPreviewStatus(message, autoHideAfter = 0) {
        if (!previewStatus || !previewStatusText) return;
        
        previewStatusText.textContent = message;
        previewStatus.classList.remove('hidden');
        
        if (autoHideAfter > 0) {
            setTimeout(() => {
                previewStatus.classList.add('hidden');
            }, autoHideAfter);
        }
    }
    
    // Function to ensure mouse indicator exists in the video wrapper
    function ensureMouseIndicator() {
        const existingIndicator = document.getElementById('mouse-indicator');
        if (!existingIndicator) {
            const videoWrapper = document.getElementById('video-wrapper');
            if (videoWrapper) {
                const indicator = document.createElement('div');
                indicator.id = 'mouse-indicator';
                indicator.className = 'mouse-indicator';
                videoWrapper.appendChild(indicator);
            }
        }
    }
    
    // Switch between original and preview tabs - COMPLETE MODAL APPROACH
    function switchTab(tab) {
        // If trying to switch to preview but no preview available yet
        if (tab === 'preview' && !previewVideoUrl) {
            // Generate preview if not already in progress
            if (!isPreviewGenerating) {
                generatePreview();
            }
            return;
        }
        
        // If tab is disabled, do nothing
        if (tab === 'preview' && previewTab.disabled) return;
        
        console.log(`Switching from ${activeTab} tab to ${tab} tab`);
        
        // STEP 1: Completely stop the currently active player
        if (activeTab === 'original' && window.videoJsIntegration) {
            // Stop the original player
            window.videoJsIntegration.pause();
            console.log('Original player paused');
        } else if (activeTab === 'preview' && window.previewPlayer) {
            // Stop the preview player
            window.previewPlayer.pause();
            console.log('Preview player paused');
        }

        // STEP 2: Update the active tab state AFTER stopping the current player
        activeTab = tab;
        
        // STEP 3: Update the UI to reflect the new active tab
        originalTab.classList.toggle('active', tab === 'original');
        previewTab.classList.toggle('active', tab === 'preview');
        
        // Show/hide the corresponding video wrapper
        videoWrapper.style.display = tab === 'original' ? 'block' : 'none';
        previewWrapper.style.display = tab === 'preview' ? 'block' : 'none';
        
        // STEP 4: Initialize the newly active player if needed
        if (tab === 'preview' && window.previewPlayer) {
            // Ensure the timeline cursor is updated for the preview player
            updateTimelineCursor(window.previewPlayer.currentTime());
            console.log('Timeline cursor updated for preview player');
        } else if (tab === 'original' && window.videoJsIntegration) {
            // Ensure the timeline cursor is updated for the original player
            updateTimelineCursor(window.videoJsIntegration.getCurrentTime());
            console.log('Timeline cursor updated for original player');
        }
        
        console.log(`Switched to ${tab} tab`);
    }
    
    // Update preview tab with information about the edited video
    function updatePreviewTabInfo() {
        if (!window.previewPlayer || !previewTab) return;
        
        // Wait for the preview player to load metadata
        window.previewPlayer.one('loadedmetadata', function() {
            try {
                // Get durations
                const originalDuration = window.videoJsIntegration ? 
                    window.videoJsIntegration.getDuration() : 0;
                const previewDuration = window.previewPlayer.duration() || 0;
                
                // Calculate time saved
                const savedTime = Math.max(0, originalDuration - previewDuration);
                const savedPercent = originalDuration > 0 ? 
                    Math.round((savedTime / originalDuration) * 100) : 0;
                
                // Update the preview tab with timing information
                if (savedTime > 0) {
                    // Create or update the small info element in the tab
                    let infoElement = previewTab.querySelector('small');
                    if (!infoElement) {
                        infoElement = document.createElement('small');
                        previewTab.appendChild(infoElement);
                    }
                    
                    // Update the text with the time saved
                    infoElement.textContent = `Cuts: ${formatTime(savedTime)} (${savedPercent}%)`;
                }
            } catch (err) {
                console.error("Error updating preview tab info:", err);
            }
        });
    }
    
    // Function to clean up server-side data
    function cleanupServerData() {
        if (!sessionId) return;
        
        // Confirm before deleting
        if (!confirm('Are you sure you want to delete all data for this video from the server?')) {
            return;
        }
        
        cleanupBtn.disabled = true;
        cleanupBtn.textContent = "Cleaning up...";
        
        fetch(`/cleanup_session/${sessionId}`, {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Server data cleaned up successfully!');
                cleanupBtn.textContent = "🗑️ Data Cleared";
                cleanupBtn.classList.add('btn-outline-danger');
                cleanupBtn.classList.remove('btn-danger');
                cleanupBtn.disabled = true;
            } else {
                alert('Error: ' + data.error);
                cleanupBtn.disabled = false;
                cleanupBtn.textContent = "🗑️ Clear Server Data";
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while cleaning up the server data.');
            cleanupBtn.disabled = false;
            cleanupBtn.textContent = "🗑️ Clear Server Data";
        });
    }
    
    function updateTimelineCutSegments() {
        // First, clear existing cut segments
        clearTimelineCutSegments();
        
        if (!zoomTimeline || selections.length === 0) return;
        
        const duration = window.videoJsIntegration ? window.videoJsIntegration.getDuration() : 60;
        if (!duration) return;
        
        // Create a container for cut segments if it doesn't exist
        let cutSegmentsContainer = document.querySelector('.timeline-cut-segments');
        if (!cutSegmentsContainer) {
            cutSegmentsContainer = document.createElement('div');
            cutSegmentsContainer.className = 'timeline-cut-segments';
            zoomTimeline.appendChild(cutSegmentsContainer);
        }
        
        // Sort selections by start time
        const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
        
        // Add each cut segment to the timeline
        sortedSelections.forEach((selection, index) => {
            const startPercent = (selection.start / duration) * 100;
            const endPercent = (selection.end / duration) * 100;
            const width = endPercent - startPercent;
            
            const cutSegment = document.createElement('div');
            cutSegment.className = 'timeline-cut-segment';
            cutSegment.style.left = `${startPercent}%`;
            cutSegment.style.width = `${width}%`;
            cutSegment.title = `Cut: ${formatTime(selection.start)} - ${formatTime(selection.end)}`;
            
            // Add click handler to jump to this cut
            cutSegment.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent timeline click from triggering
                if (window.videoJsIntegration) {
                    window.videoJsIntegration.seekTo(selection.start);
                }
            });
            
            cutSegmentsContainer.appendChild(cutSegment);
        });
    }
    
    function clearTimelineCutSegments() {
        const cutSegmentsContainer = document.querySelector('.timeline-cut-segments');
        if (cutSegmentsContainer) {
            cutSegmentsContainer.innerHTML = '';
        }
    }
    
    /**
     * Modal approach to navigate to a specific timestamp
     * @param {number} timestamp - The timestamp to navigate to
     * @param {number} wordIndex - The index of the word in the transcript (optional)
     */
    function modalNavigateToTimestamp(timestamp, wordIndex) {
        // Ensure timestamp is a number
        timestamp = parseFloat(timestamp);
        if (isNaN(timestamp)) {
            console.warn('Invalid timestamp in modalNavigateToTimestamp:', timestamp);
            return;
        }
        
        try {
            // MODAL APPROACH: Only operate on the active player
            if (activeTab === 'preview') {
                // PREVIEW MODE: Check for cut words
                if (wordIndex !== undefined) {
                    const element = document.querySelector(`[data-index="${wordIndex}"]`);
                    if (element && element.classList.contains('marked-for-cut')) {
                        console.log(`Word at index ${wordIndex} is marked for cutting - finding next non-cut word`);
                        
                        // Find the next non-cut word
                        let nextNonCutIndex = -1;
                        for (let i = 0; i < transcriptData.length; i++) {
                            const el = document.querySelector(`[data-index="${i}"]`);
                            if (el && !el.classList.contains('marked-for-cut') && 
                                parseFloat(transcriptData[i].start) >= timestamp) {
                                nextNonCutIndex = i;
                                break;
                            }
                        }
                        
                        // If found a non-cut word after this one, use its timestamp
                        if (nextNonCutIndex >= 0) {
                            timestamp = parseFloat(transcriptData[nextNonCutIndex].start);
                            console.log(`Using next non-cut word at time ${timestamp}`);
                        }
                    }
                }
                
                // Only affect preview player
                if (window.previewPlayer) {
                    console.log(`Preview mode: navigating to ${timestamp}s`);
                    
                    // Pause the player first
                    window.previewPlayer.pause();
                    
                    // Convert original timestamp to preview timeline
                    const previewTime = window.videoJsIntegration ? 
                        window.videoJsIntegration.mapTimeToPreview(timestamp, selections) : timestamp;
                    
                    console.log(`Mapped original time ${timestamp}s to preview time ${previewTime}s`);
                    
                    // Set the time
                    window.previewPlayer.currentTime(previewTime);
                    
                    // After seek completes, update highlighting
                    setTimeout(() => {
                        if (activeTab === 'preview') { // Check we're still in preview mode
                            const actualTime = window.previewPlayer.currentTime();
                            
                            // Map preview time back to original for highlighting words
                            if (window.videoJsIntegration && selections.length > 0) {
                                const mappedTime = window.videoJsIntegration.mapTimeFromPreview(
                                    actualTime, selections);
                                highlightClosestNonCutWord(mappedTime);
                            }
                            
                            // Update timeline cursor
                            updateTimelineCursor(actualTime);
                        }
                    }, 100);
                }
            } else {
                // ORIGINAL MODE: Simple case, only affect original player
                if (window.videoJsIntegration) {
                    console.log(`Original mode: navigating to ${timestamp}s`);
                    
                    // Pause the player first
                    window.videoJsIntegration.pause();
                    
                    // Set the time
                    window.videoJsIntegration.seekTo(timestamp);
                    
                    // After seek completes, update highlighting
                    setTimeout(() => {
                        if (activeTab === 'original') { // Check we're still in original mode
                            const actualTime = window.videoJsIntegration.getCurrentTime();
                            highlightCurrentWord(actualTime, false);
                            updateTimelineCursor(actualTime);
                        }
                    }, 100);
                }
            }
        } catch (error) {
            console.error('Error in modalNavigateToTimestamp:', error);
        }
    }
});