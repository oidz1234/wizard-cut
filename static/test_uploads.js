// Test script to check file uploads
console.log('Testing file upload functionality...');

// This function will be called when the page loads
function testUploadFunctionality() {
    // Check if all required elements exist
    const fileInput = document.getElementById('file-input');
    const dropArea = document.getElementById('drop-area');
    const videoWrapper = document.getElementById('video-wrapper');
    const videoPlayer = document.getElementById('video-player');
    const mouseIndicator = document.getElementById('mouse-indicator');
    
    console.log('File input element exists:', !!fileInput);
    console.log('Drop area element exists:', !!dropArea);
    console.log('Video wrapper element exists:', !!videoWrapper);
    console.log('Video player element exists:', !!videoPlayer);
    console.log('Mouse indicator element exists:', !!mouseIndicator);
    
    // Add extra event listeners for debugging
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            console.log('File selected:', this.files.length > 0 ? this.files[0].name : 'No file');
        });
    }
    
    if (dropArea) {
        dropArea.addEventListener('dragover', function(e) {
            console.log('Drag over event detected');
        });
        
        dropArea.addEventListener('drop', function(e) {
            console.log('Drop event detected');
            if (e.dataTransfer.files.length) {
                console.log('File dropped:', e.dataTransfer.files[0].name);
            }
        });
    }
}

// Run the test when the page loads
window.addEventListener('DOMContentLoaded', testUploadFunctionality);
