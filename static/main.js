// Main Application Code
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
    
    // Video.js player reference
    let player = null;
    
    // Zoom and tracking state
    let zoomLevel = 1; // Current zoom level
    let zoomMode = 'none'; // Current zoom mode: 'none', 'simple', or 'drag'
    let zoomPoint = { x: 0.5, y: 0.5 }; // Center point for zooming
    let isDragging = false; // Is the user currently dragging the video
    let dragStart = { x: 0, y: 0 }; // Starting position for drag
    
    // Zoom recording state
    let zoomEvents = []; // Array to store zoom events
    let isRecordingZoom = false; // Is currently recording zoom events
    let recordingStartTime = null; // When did the current recording start
    let currentZoomEvent = null; // Current zoom event being recorded
    
    // DOM Elements
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const uploadSection = document.getElementById('upload-section');
    const editorSection = document.getElementById('editor-section');
    const videoWrapper = document.getElementById('video-wrapper');
    const mouseIndicator = document.getElementById('mouse-indicator');
    const transcriptContainer = document.getElementById('transcript-container');
    const transcriptContent = document.getElementById('transcript-content');
    const selectBtn = document.getElementById('select-btn');
    const clearBtn = document.getElementById('clear-btn');
    const downloadBtn = document.getElementById('download-btn');
    const cleanupBtn = document.getElementById('cleanup-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    const progressBar = document.getElementById('progress-bar');
    const selectionsContainer = document.getElementById('selections-container');
    const selectionsList = document.getElementById('selections-list');
    const contextMenu = document.getElementById('custom-context-menu');
    const contextMenuCut = document.getElementById('context-menu-cut');
    
    // Zoom control elements
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    const zoomModeSelect = document.getElementById('zoom-mode-select');
    const recordZoomBtn = document.getElementById('record-zoom-btn');
    const zoomRecordStatus = document.getElementById('zoom-record-status');
    const zoomTimeline = document.getElementById('zoom-timeline');
    const timelineScale = document.querySelector('.timeline-scale');
    const zoomEventsContainer = document.getElementById('zoom-events-container');
    const timelineCursor = document.getElementById('timeline-cursor');
    const zoomEventsList = document.getElementById('zoom-events-list');
    const zoomEventsEditor = document.getElementById('zoom-events-editor');
    
    // Event Listeners
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    dropArea.addEventListener('dragover', handleDragOver);
    dropArea.addEventListener('dragleave', handleDragLeave);
    dropArea.addEventListener('drop', handleDrop);
    selectBtn.addEventListener('click', toggleSelectionMode);
    clearBtn.addEventListener('click', clearSelections);
    downloadBtn.addEventListener('click', processAndDownloadVideo);
    cleanupBtn.addEventListener('click', cleanupServerData);
    
    // Context menu setup
    transcriptContainer.addEventListener('contextmenu', handleContextMenu);
    contextMenuCut.addEventListener('click', markSelectionForCut);
    document.addEventListener('click', hideContextMenu);
    
    // Keyboard shortcut for marking text to cut
    document.addEventListener('keydown', handleKeyboardShortcut);
    
    // Zoom and tracking event listeners
    zoomInBtn.addEventListener('click', () => changeZoom(0.25));
    zoomOutBtn.addEventListener('click', () => changeZoom(-0.25));
    zoomResetBtn.addEventListener('click', resetZoom);
    zoomModeSelect.addEventListener('change', handleZoomModeChange);
    videoWrapper.addEventListener('mousemove', handleMouseMove);
    videoWrapper.addEventListener('click', handleVideoClick);
    videoWrapper.addEventListener('mousedown', handleMouseDown);
    videoWrapper.addEventListener('mouseup', handleMouseUp);
    videoWrapper.addEventListener('mouseleave', () => {
        if (isDragging) handleMouseUp();
        if (mouseIndicator) mouseIndicator.style.display = 'none';
    });
    
    // Zoom recording event listeners
    recordZoomBtn.addEventListener('click', toggleZoomRecording);
    
    // Video.js integration
    function initPlayer(url) {
        // If a Video.js player already exists, dispose it first
        if (player) {
            player.dispose();
        }
        
        // Initialize Video.js
        player = videojs('video-player', {
            controls: true,
            autoplay: false,
            fluid: true,
            playbackRates: [0.5, 1, 1.5, 2]
        });
        
        // Set the source
        player.src({
            src: url,
            type: getVideoType(url)
        });
        
        // Add custom event handlers
        player.on('timeupdate', handleTimeUpdate);
        player.on('loadedmetadata', updateTimelineScale);
        player.on('play', handleVideoPlay);
        player.on('pause', handleVideoPause);
        player.on('seeking', handleVideoSeeking);
        
        return player;
    }
    
    // Helper to determine video type from URL
    function getVideoType(url) {
        if (url.endsWith('.mp4')) return 'video/mp4';
        if (url.endsWith('.webm')) return 'video/webm';
        if (url.endsWith('.ogv')) return 'video/ogg';
        if (url.endsWith('.mkv')) return 'video/x-matroska';
        return 'video/mp4'; // Default
    }
    
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
                } else if (word.end > selection.start && word.start < selection.end) {
                    // This word overlaps with the cut segment, mark it
                    word.removed = true;
                } else if (word.end > selection.end && word.start <= selection.start) {
                    // This word contains the entire cut segment
                    word.end -= selectionDuration;
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
        // For silence, we match on start time
        if (adjustedWord.is_silence) {
            for (let i = 0; i < transcriptData.length; i++) {
                if (transcriptData[i].is_silence && 
                    Math.abs(parseFloat(transcriptData[i].start) - parseFloat(adjustedWord.start)) < 0.1) {
                    return i;
                }
            }
        }
        
        // For words, match on the word text and approximate start time
        for (let i = 0; i < transcriptData.length; i++) {
            if (!transcriptData[i].is_silence && 
                transcriptData[i].word === adjustedWord.word) {
                // If multiple matches, use the one with closest timing
                return i;
            }
        }
        
        // Fallback to matching just the word
        for (let i = 0; i < transcriptData.length; i++) {
            if (!transcriptData[i].is_silence && 
                transcriptData[i].word === adjustedWord.word) {
                return i;
            }
        }
        
        return -1; // Not found
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
                
                // Initialize the Video.js player
                const videoSrc = `/video/${sessionId}/${originalFilename}`;
                initPlayer(videoSrc);
                
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
                    // Jump to this silence in the video
                    if (player) {
                        player.currentTime(parseFloat(word.start));
                        player.play();
                    }
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
                    // Jump to this word in the video
                    if (player) {
                        player.currentTime(parseFloat(word.start));
                        player.play();
                    }
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
            
            selections.forEach((selection, index) => {
                const selectionItem = document.createElement('div');
                selectionItem.className = 'selection-item';
                
                const textSpan = document.createElement('span');
                textSpan.textContent = `"${selection.text}" (${formatTime(selection.start)} - ${formatTime(selection.end)})`;
                
                const removeBtn = document.createElement('button');
                removeBtn.className = 'btn btn-outline-danger btn-sm';
                removeBtn.innerHTML = '&times;';
                removeBtn.addEventListener('click', () => removeSelection(index));
                
                selectionItem.appendChild(textSpan);
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
        
        // Reset video if there was an edited version
        if (editedVideoUrl || previewVideoUrl) {
            const videoSrc = `/video/${sessionId}/${originalFilename}`;
            initPlayer(videoSrc);
            
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
        
        if (selections.length === 0 && zoomEvents.length === 0) {
            alert('Please select at least one segment to remove or add a zoom effect.');
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
        
        let loadingMessage = '🧙‍♂️ Casting magical spells on your video...';
        if (selections.length > 0) {
            loadingMessage += '\n✂️ Cutting ' + selections.length + ' segments';
        }
        if (zoomEvents.length > 0) {
            loadingMessage += '\n🔍 Adding ' + zoomEvents.length + ' zoom effects';
        }
        
        showLoading(loadingMessage);
        
        // Sort selections by start time
        const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
        
        // Calculate adjusted timestamps for transcript after editing
        if (selections.length > 0) {
            adjustedTranscriptData = calculateAdjustedTimestamps(transcriptData, sortedSelections);
        }
        
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
                initPlayer(previewVideoUrl);
                
                setTimeout(() => {
                    if (player) player.play();
                }, 500);
                
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
    
    function highlightCurrentWord() {
        // Remove current highlight from all words and silence markers
        const currentElements = document.querySelectorAll('.word.current, .silence-marker.current');
        currentElements.forEach(el => el.classList.remove('current'));
        
        // Get current time in the video
        const currentTime = player ? player.currentTime() : 0;
        
        // Use adjusted timestamps if showing edited video
        const dataToUse = isShowingEditedVideo ? adjustedTranscriptData : transcriptData;
        if (!dataToUse || dataToUse.length === 0) return;
        
        // Find the word or silence that corresponds to the current time
        for (let i = 0; i < dataToUse.length; i++) {
            const start = parseFloat(dataToUse[i].start);
            const end = parseFloat(dataToUse[i].end);
            
            if (currentTime >= start && currentTime <= end) {
                // Find the corresponding original index
                const originalIndex = isShowingEditedVideo 
                    ? findOriginalIndex(dataToUse[i]) 
                    : i;
                
                // Add current class to the element
                const element = document.querySelector(`[data-index="${originalIndex}"]`);
                if (element) {
                    element.classList.add('current');
                    
                    // Scroll the element into view if it's not visible
                    const container = document.getElementById('transcript-container');
                    const elementRect = element.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();
                    
                    if (elementRect.top < containerRect.top || elementRect.bottom > containerRect.bottom) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
                break;
            }
        }
    }
    
    function handleTimeUpdate() {
        highlightCurrentWord();
        updateTimelineCursor();
    }
    
    // Video Controls Functions
    
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
    
    // Keyboard shortcut handling
    function handleKeyboardShortcut(e) {
        // If focused on an input, don't capture shortcuts
        if (e.target.tagName.toLowerCase() === 'input' || 
            e.target.tagName.toLowerCase() === 'textarea') {
            return;
        }
        
        // 'x' key for marking text to cut
        if (e.key === 'x' || e.key === 'X') {
            // Get the current text selection
            const selection = window.getSelection();
            if (selection.toString().trim() !== '') {
                markSelectionForCut();
                e.preventDefault(); // Prevent default 'x' action
            }
        }
        
        // 'z' key for toggling zoom mode
        if (e.key === 'z' || e.key === 'Z') {
            // Cycle through zoom modes
            if (zoomMode === 'none') {
                zoomModeSelect.value = 'drag';
            } else if (zoomMode === 'drag') {
                zoomModeSelect.value = 'simple';
            } else {
                zoomModeSelect.value = 'none';
            }
            handleZoomModeChange();
            e.preventDefault();
        }
        
        // 'r' key for toggling zoom recording
        if (e.key === 'r' || e.key === 'R') {
            toggleZoomRecording();
            e.preventDefault();
        }
        
        // Space for play/pause (if not in Video.js controls)
        if (e.key === ' ' && !e.target.closest('.video-js')) {
            if (player) {
                if (player.paused()) {
                    player.play();
                } else {
                    player.pause();
                }
                e.preventDefault();
            }
        }
    }
    
    // Zoom and Mouse Tracking Functions
    function changeZoom(increment) {
        // Update the zoom level
        zoomLevel += increment;
        
        // Limit zoom level between 1 and 3
        zoomLevel = Math.min(Math.max(zoomLevel, 1), 3);
        
        applyZoom();
    }
    
    function resetZoom() {
        zoomLevel = 1;
        
        // Get the actual video element inside Video.js
        const videoElement = getVideoElement();
        if (videoElement) {
            videoElement.style.transform = 'scale(1)';
            videoElement.style.transformOrigin = '50% 50%';
        }
    }
    
    function getVideoElement() {
        // If using Video.js, get the actual video element
        if (player) {
            return player.el().querySelector('video');
        }
        return null;
    }
    
    function applyZoom() {
        // Get the actual video element
        const videoElement = getVideoElement();
        if (!videoElement) return;
        
        // Apply the zoom level to the video
        videoElement.style.transform = `scale(${zoomLevel})`;
        
        // If we're in a zoom mode, adjust the video position to center on the zoom point
        if (zoomLevel > 1 && zoomMode !== 'none') {
            // Set the transform origin based on the focus point
            videoElement.style.transformOrigin = `${zoomPoint.x * 100}% ${zoomPoint.y * 100}%`;
        } else {
            // Reset position if we're at zoom level 1 or no zoom mode
            videoElement.style.transformOrigin = '50% 50%';
        }
        
        // If recording, update the current zoom event zoom level
        if (isRecordingZoom && currentZoomEvent) {
            currentZoomEvent.endZoomLevel = zoomLevel;
        }
    }
    
    function handleZoomModeChange() {
        // Get the selected mode
        zoomMode = zoomModeSelect.value;
        
        // Reset zoom if switching to 'none' mode
        if (zoomMode === 'none') {
            resetZoom();
            if (mouseIndicator) mouseIndicator.style.display = 'none';
            videoWrapper.style.cursor = 'default';
        }
        
        // Apply zoom if already zoomed in
        if (zoomLevel > 1) {
            applyZoom();
        }
        
        // Update cursor style based on mode
        if (zoomMode === 'simple') {
            videoWrapper.classList.add('zoom-active');
            videoWrapper.style.cursor = 'zoom-in';
        } else if (zoomMode === 'drag') {
            videoWrapper.classList.remove('zoom-active');
            videoWrapper.style.cursor = 'grab';
        } else {
            videoWrapper.classList.remove('zoom-active');
            videoWrapper.style.cursor = 'default';
        }
        
        // Hide the mouse indicator
        if (mouseIndicator) {
            mouseIndicator.style.display = 'none';
        }
    }
    
    function handleMouseDown(e) {
        if (zoomMode !== 'drag' || zoomLevel <= 1) return;
        
        isDragging = true;
        dragStart = { x: e.clientX, y: e.clientY };
        
        // Change cursor to indicate dragging
        videoWrapper.style.cursor = 'grabbing';
        e.preventDefault();
    }
    
    function handleMouseUp() {
        if (isDragging) {
            isDragging = false;
            videoWrapper.style.cursor = 'grab';
            
            // If recording, update the current zoom event focus point
            if (isRecordingZoom && currentZoomEvent) {
                currentZoomEvent.focusPoint = { ...zoomPoint };
            }
        }
    }
    
    function handleMouseMove(e) {
        // For drag mode, handle dragging the zoomed video
        if (isDragging && zoomMode === 'drag') {
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
        }
    }
    
    function handleVideoClick(e) {
        if (zoomMode !== 'simple') return;
        
        // Get the position within the video wrapper
        const rect = videoWrapper.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        
        // Set the zoom point
        zoomPoint = { x, y };
        
        // Toggle between zoomed and normal
        if (zoomLevel > 1) {
            resetZoom();
        } else {
            zoomLevel = 2; // Set to medium zoom level
            applyZoom();
        }
    }
    
    // Zoom Recording Functions
    function toggleZoomRecording() {
        isRecordingZoom = !isRecordingZoom;
        
        if (isRecordingZoom) {
            // Start recording
            recordZoomBtn.classList.remove('btn-outline-primary');
            recordZoomBtn.classList.add('btn-danger');
            recordZoomBtn.textContent = '⏹ Stop Recording';
            zoomRecordStatus.textContent = 'Recording Zoom';
            zoomRecordStatus.classList.add('recording');
            
            // Initialize a new zoom event
            recordingStartTime = player ? player.currentTime() : 0;
            currentZoomEvent = {
                id: 'zoom-' + Date.now(),
                startTime: recordingStartTime,
                endTime: recordingStartTime, // Will be updated when recording stops
                startZoomLevel: zoomLevel,
                endZoomLevel: zoomLevel,
                focusPoint: { ...zoomPoint }
            };
            
            // Set to correct zoom mode for recording
            if (zoomMode === 'none') {
                zoomModeSelect.value = 'drag';
                handleZoomModeChange();
            }
            
        } else {
            // Stop recording and add the zoom event
            recordZoomBtn.classList.remove('btn-danger');
            recordZoomBtn.classList.add('btn-outline-primary');
            recordZoomBtn.textContent = '📹 Record Zoom';
            zoomRecordStatus.textContent = '';
            zoomRecordStatus.classList.remove('recording');
            
            if (currentZoomEvent) {
                // Finalize the zoom event
                currentZoomEvent.endTime = player ? player.currentTime() : currentZoomEvent.startTime + 1;
                
                // Only add if duration is meaningful
                if (currentZoomEvent.endTime > currentZoomEvent.startTime) {
                    zoomEvents.push(currentZoomEvent);
                    addZoomMarkerToTranscript(currentZoomEvent);
                    addZoomEventToTimeline(currentZoomEvent);
                    updateZoomEventsList();
                    zoomEventsList.classList.remove('d-none');
                }
                
                currentZoomEvent = null;
            }
        }
    }
    
    function addZoomMarkerToTranscript(zoomEvent) {
        // Find the correct position in the transcript based on the start time
        const startTime = zoomEvent.startTime;
        
        // Find the word in transcript that corresponds to this time
        let insertAfterIndex = -1;
        for (let i = 0; i < transcriptData.length; i++) {
            if (parseFloat(transcriptData[i].start) <= startTime && 
                parseFloat(transcriptData[i].end) >= startTime) {
                insertAfterIndex = i;
                break;
            }
            
            if (parseFloat(transcriptData[i].start) > startTime) {
                if (i > 0) {
                    insertAfterIndex = i - 1;
                } else {
                    insertAfterIndex = 0;
                }
                break;
            }
        }
        
        if (insertAfterIndex === -1 && transcriptData.length > 0) {
            insertAfterIndex = transcriptData.length - 1;
        }
        
        // Create the zoom marker element
        const zoomMarker = document.createElement('div');
        zoomMarker.className = 'zoom-marker';
        zoomMarker.dataset.zoomId = zoomEvent.id;
        zoomMarker.dataset.startTime = zoomEvent.startTime;
        zoomMarker.dataset.endTime = zoomEvent.endTime;
        
        const zoomLabel = document.createElement('span');
        zoomLabel.className = 'zoom-label';
        zoomLabel.innerHTML = `🔍 ZOOM (${zoomEvent.startZoomLevel.toFixed(1)}x → ${zoomEvent.endZoomLevel.toFixed(1)}x)`;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-zoom-btn';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', () => removeZoomEvent(zoomEvent.id));
        
        zoomMarker.appendChild(zoomLabel);
        zoomMarker.appendChild(removeBtn);
        
        // Insert the zoom marker at the appropriate position
        if (insertAfterIndex >= 0) {
            const wordEl = document.querySelector(`[data-index="${insertAfterIndex}"]`);
            if (wordEl && wordEl.nextSibling) {
                wordEl.parentNode.insertBefore(zoomMarker, wordEl.nextSibling);
            } else if (wordEl) {
                wordEl.parentNode.appendChild(zoomMarker);
            } else {
                transcriptContent.appendChild(zoomMarker);
            }
        } else {
            transcriptContent.insertBefore(zoomMarker, transcriptContent.firstChild);
        }
    }
    
    function updateTimelineScale() {
        if (!timelineScale || !player) return;
        
        // Clear existing markers
        timelineScale.innerHTML = '';
        
        // Add time markers
        const duration = player.duration() || 60; // fallback to 60s if duration not available
        const interval = Math.max(1, Math.floor(duration / 10)); // Create at most 10 markers
        
        for (let i = 0; i <= duration; i += interval) {
            const marker = document.createElement('span');
            marker.className = 'timeline-marker';
            marker.textContent = formatTime(i);
            timelineScale.appendChild(marker);
        }
    }
    
    function addZoomEventToTimeline(zoomEvent) {
        if (!zoomEventsContainer || !player) return;
        
        const duration = player.duration() || 60;
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
    
    function updateTimelineCursor() {
        if (!timelineCursor || !player || !player.duration()) return;
        
        // Show cursor when video is loaded
        timelineCursor.style.display = 'block';
        
        // Calculate position based on current time
        const percent = (player.currentTime() / player.duration()) * 100;
        timelineCursor.style.left = `${percent}%`;
    }
    
    function updateZoomEventsList() {
        if (!zoomEventsEditor) return;
        
        zoomEventsEditor.innerHTML = '';
        
        if (zoomEvents.length === 0) {
            zoomEventsList.classList.add('d-none');
            return;
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
                if (player) {
                    player.currentTime(event.startTime);
                    player.play();
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
        
        // Remove from transcript
        const markerEl = document.querySelector(`.zoom-marker[data-zoom-id="${id}"]`);
        if (markerEl) markerEl.remove();
        
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
        if (event && player) {
            player.currentTime(event.startTime);
        }
    }
    
    function handleVideoPlay() {
        updateTimelineScale();
    }
    
    function handleVideoPause() {
        if (isRecordingZoom) {
            toggleZoomRecording(); // Stop recording when video is paused
        }
    }
    
    function handleVideoSeeking() {
        if (isRecordingZoom) {
            toggleZoomRecording(); // Stop recording when seeking
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
});
