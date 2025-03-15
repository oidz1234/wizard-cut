# WizardCut: Text-Based Video Editor

![WizardCut Logo](static/images/wizard.png)

Select text to remove it from your video

It's basically a wrapper around whisper and ffmpeg but looks pretty wizard.

## ✨ Features

- **Automatic Transcription**: Upload your video and get an accurate transcript with timestamps
- **Intuitive Selection**: Click and highlight text segments you want to remove
- **Keyboard Shortcuts**: Press 'X' to mark selected text for deletion
- **One-Click Processing**: Create and download your edited video with a single click
- **Silence Detection**: Automatically detects and marks silent sections in your video
- **GPU Acceleration**: Utilizes available hardware acceleration for faster processing

## 🚀 Getting Started

### Prerequisites

- Python 3.8+
- Flask
- FFmpeg
- OpenAI Whisper

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/wizardcut.git
   cd wizardcut
   ```

2. Install the required packages:
   ```bash
   pip install -r requirements.txt
   ```

3. Install FFmpeg

```
figure this one out yourself, on linux you can install from package but on
windows ya gotta get it in your $PATH somehow, good luck
```

4. Run the application:
   ```bash
   python app.py
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:5000
   ```

## 📋 How to Use

1. **Upload a Video**:
   - Drag and drop a video into the upload area, or click "Select Video File"

2. **Review the Transcript**:
   - After uploading, the video will be transcribed automatically
   - The transcript appears on the right side of the screen

3. **Mark Segments to Remove**:
   - Method 1: Click the "Select Text" button, then click on start and end words
   - Method 2: Select text with your cursor and press "X" 
   - Method 3: Right-click on selected text and choose "Mark for Cutting"

4. **Process Your Edits**:
   - Click "Create & Download Edited Video" to process and download your edited video

5. **Clear Selections**:
   - To start over, click "Clear Selections"

## 🧙‍♂️ Technical Details

### Architecture

- **Backend**: Flask (Python)
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Transcription**: OpenAI Whisper
- **Video Processing**: FFmpeg

### Files and Directory Structure

- `app.py`: Flask server and backend logic
- `static/`
  - `scripts.js`: Frontend JavaScript functionality
  - `styles.css`: CSS styling
  - `images/`: Image assets
- `templates/`
  - `index.html`: Main HTML template
- `uploads/`: Temporary storage for uploaded videos
- `processed/`: Storage for processed videos and transcripts

### API Endpoints

- **GET `/`**: Serves the main application page
- **POST `/upload`**: Handles video uploads and transcription
- **POST `/edit`**: Processes video edits
- **GET `/video/<session_id>/<filename>`**: Serves videos for playback
- **GET `/download/<session_id>/<filename>`**: Serves videos for download
- **POST `/cleanup`**: Removes old session data

## 🔧 Configuration

The application can be configured by modifying the following variables in `app.py`:

- `app.config['UPLOAD_FOLDER']`: Directory for uploaded files
- `app.config['PROCESSED_FOLDER']`: Directory for processed files
- Whisper model size: Change `whisper.load_model("medium")` to one of "tiny", "base", "small", "medium", or "large" to adjust the balance between transcription speed and accuracy

## 📝 License

GPLv3

## 🙏 Acknowledgements

- [OpenAI Whisper](https://github.com/openai/whisper) for transcription
- [FFmpeg](https://ffmpeg.org/) for video processing
- [Flask](https://flask.palletsprojects.com/) for the web framework

---

Crafted with a bit of magic ✨ by the team at [SWMG Labs](https://swmglabs.com)
