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
    
    // DOM Elements
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const selectFileBtn = document.getElementById('select-file-btn');
    const uploadSection = document.getElementById('upload-section');
    const editorSection = document.getElementById('editor-section');
    const videoPlayer = document.getElementById('video-player');
    const transcriptContainer = document.getElementById('transcript-container');
    const transcriptContent = document.getElementById('transcript-content');
    const selectBtn = document.getElementById('select-btn');
    const clearBtn = document.getElementById('clear-btn');
    const previewBtn = document.getElementById('preview-btn');
    const cutBtn = document.getElementById('cut-btn');
    const downloadBtn = document.getElementById('download-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingMessage = document.getElementById('loading-message');
    const progressBar = document.getElementById('progress-bar');
    const selectionsContainer = document.getElementById('selections-container');
    const selectionsList = document.getElementById('selections-list');
    const contextMenu = document.getElementById('custom-context-menu');
    const contextMenuCut = document.getElementById('context-menu-cut');
    
    // Event Listeners
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    dropArea.addEventListener('dragover', handleDragOver);
    dropArea.addEventListener('dragleave', handleDragLeave);
    dropArea.addEventListener('drop', handleDrop);
    selectBtn.addEventListener('click', toggleSelectionMode);
    clearBtn.addEventListener('click', clearSelections);
    previewBtn.addEventListener('click', previewEdits);
    cutBtn.addEventListener('click', processVideoEdit);
    downloadBtn.addEventListener('click', downloadEditedVideo);
    videoPlayer.addEventListener('timeupdate', highlightCurrentWord);
    
    // Context menu setup
    transcriptContainer.addEventListener('contextmenu', handleContextMenu);
    contextMenuCut.addEventListener('click', markSelectionForCut);
    document.addEventListener('click', hideContextMenu);
    
    // Keyboard shortcut for marking text to cut
    document.addEventListener('keydown', handleKeyboardShortcut);
    
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
                
                // Set video source
                videoPlayer.src = `/video/${sessionId}/${originalFilename}`;
                videoPlayer.load();
                
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
                    videoPlayer.currentTime = parseFloat(word.start);
                    videoPlayer.play();
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
                    videoPlayer.currentTime = parseFloat(word.start);
                    videoPlayer.play();
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
            videoPlayer.src = `/video/${sessionId}/${originalFilename}`;
            videoPlayer.load();
            downloadBtn.disabled = true;
            editedVideoUrl = null;
            previewVideoUrl = null;
            isShowingEditedVideo = false;
            adjustedTranscriptData = [];
        }
    }
    
    function previewEdits() {
        if (selections.length === 0) {
            alert('Please select at least one segment to remove.');
            return;
        }
        
        showLoading('✨ Conjuring your preview...');
        
        // Sort selections by start time
        const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
        
        // Calculate adjusted timestamps for transcript after editing
        adjustedTranscriptData = calculateAdjustedTimestamps(transcriptData, sortedSelections);
        
        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 5;
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
                preview_only: true
            })
        })
        .then(response => response.json())
        .then(data => {
            clearInterval(progressInterval);
            updateProgressBar(100);
            
            if (data.success) {
                previewVideoUrl = `/video/${sessionId}/${data.preview_file}`;
                
                // Update video player with preview
                videoPlayer.src = previewVideoUrl;
                videoPlayer.load();
                videoPlayer.play();
                
                isShowingEditedVideo = true;
                
                hideLoading();
            } else {
                alert('Error: ' + data.error);
                hideLoading();
            }
        })
        .catch(error => {
            clearInterval(progressInterval);
            console.error('Error:', error);
            alert('An error occurred while generating the preview.');
            hideLoading();
        });
    }
    
    function processVideoEdit() {
        if (selections.length === 0) {
            alert('Please select at least one segment to remove.');
            return;
        }
        
        showLoading('🧙‍♂️ Casting powerful editing spells on your video...');
        
        // Sort selections by start time
        const sortedSelections = [...selections].sort((a, b) => a.start - b.start);
        
        // Calculate adjusted timestamps for transcript after editing
        adjustedTranscriptData = calculateAdjustedTimestamps(transcriptData, sortedSelections);
        
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
                videoPlayer.src = previewVideoUrl;
                videoPlayer.load();
                videoPlayer.play();
                
                isShowingEditedVideo = true;
                
                // Enable download button
                downloadBtn.disabled = false;
                
                hideLoading();
            } else {
                alert('Error: ' + data.error);
                hideLoading();
            }
        })
        .catch(error => {
            clearInterval(progressInterval);
            console.error('Error:', error);
            alert('An error occurred while processing the video.');
            hideLoading();
        });
    }
    
    function downloadEditedVideo() {
        if (editedVideoUrl) {
            window.location.href = editedVideoUrl.replace('/video/', '/download/');
        }
    }
    
    function highlightCurrentWord() {
        // Remove current highlight from all words and silence markers
        const currentElements = document.querySelectorAll('.word.current, .silence-marker.current');
        currentElements.forEach(el => el.classList.remove('current'));
        
        // Get current time in the video
        const currentTime = videoPlayer.currentTime;
        
        // Use adjusted timestamps if showing edited video
        const dataToUse = isShowingEditedVideo ? adjustedTranscriptData : transcriptData;
        
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
        // 'x' key for marking text to cut
        if (e.key === 'x' || e.key === 'X') {
            // Get the current text selection
            const selection = window.getSelection();
            if (selection.toString().trim() !== '') {
                markSelectionForCut();
                e.preventDefault(); // Prevent default 'x' action
            }
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
});
