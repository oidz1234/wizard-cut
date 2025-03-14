# app.py
from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import tempfile
import uuid
import json
import whisper
import subprocess
import threading
import re
import time
from werkzeug.utils import secure_filename
import shutil
from datetime import timedelta

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['PROCESSED_FOLDER'] = 'processed'

# Ensure upload and processed directories exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs(app.config['PROCESSED_FOLDER'], exist_ok=True)

# Load Whisper model (can choose size based on accuracy needs vs. performance)
# Options: "tiny", "base", "small", "medium", "large"
model = whisper.load_model("medium")  # Good balance of accuracy and speed

# Check for available hardware acceleration options
def check_gpu_availability():
    """Detect available GPU acceleration for FFmpeg"""
    try:
        # Check for NVIDIA GPU support (NVENC)
        nvidia_check = subprocess.run(
            ['ffmpeg', '-hide_banner', '-encoders'],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        if 'h264_nvenc' in nvidia_check.stdout:
            print("NVIDIA GPU acceleration available")
            return 'nvidia'
            
        # Check for AMD GPU support (AMF)
        if 'h264_amf' in nvidia_check.stdout:
            print("AMD GPU acceleration available")
            return 'amd'
            
        # Check for Intel QuickSync support
        if 'h264_qsv' in nvidia_check.stdout:
            print("Intel QuickSync acceleration available")
            return 'intel'
    
    except Exception as e:
        print(f"Error checking GPU availability: {e}")
    
    print("No GPU acceleration detected, using CPU")
    return 'cpu'

# Determine available GPU acceleration
gpu_type = check_gpu_availability()

# Configure video codec based on available hardware
def get_encoder_settings(quality='high'):
    """Get encoder settings based on available hardware and quality target"""
    if gpu_type == 'nvidia':
        # NVIDIA GPU
        if quality == 'high':
            return {
                'c:v': 'h264_nvenc',
                'preset': 'p4',  # Higher quality preset
                'extra': ['-b:v', '5M']
            }
        else:  # preview/low quality
            return {
                'c:v': 'h264_nvenc',
                'preset': 'p7',  # Faster/lower quality preset
                'extra': ['-b:v', '1M']
            }
    elif gpu_type == 'amd':
        # AMD GPU
        if quality == 'high':
            return {
                'c:v': 'h264_amf',
                'quality': 'quality',
                'extra': ['-b:v', '5M']
            }
        else:  # preview/low quality
            return {
                'c:v': 'h264_amf',
                'quality': 'speed',
                'extra': ['-b:v', '1M']
            }
    elif gpu_type == 'intel':
        # Intel QuickSync
        if quality == 'high':
            return {
                'c:v': 'h264_qsv',
                'preset': 'medium',
                'extra': ['-b:v', '5M']
            }
        else:  # preview/low quality
            return {
                'c:v': 'h264_qsv',
                'preset': 'faster',
                'extra': ['-b:v', '1M']
            }
    else:
        # CPU fallback
        if quality == 'high':
            return {
                'c:v': 'libx264',
                'preset': 'medium',
                'extra': []
            }
        else:  # preview/low quality
            return {
                'c:v': 'libx264',
                'preset': 'veryfast',
                'crf': '28',
                'extra': []
            }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'video' not in request.files:
        return jsonify({'error': 'No video file provided'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': 'No video file selected'}), 400
    
    # Generate unique ID for this edit session
    session_id = str(uuid.uuid4())
    session_folder = os.path.join(app.config['PROCESSED_FOLDER'], session_id)
    os.makedirs(session_folder, exist_ok=True)
    
    # Save the uploaded file
    filename = secure_filename(file.filename)
    file_path = os.path.join(session_folder, filename)
    file.save(file_path)
    
    # Extract audio from video
    audio_path = os.path.join(session_folder, "audio.wav")
    
    # Run audio extraction
    ffmpeg_cmd = [
        'ffmpeg', '-y', '-i', file_path, '-vn', '-acodec', 'pcm_s16le', 
        '-ar', '16000', '-ac', '1', audio_path
    ]
    
    subprocess.run(ffmpeg_cmd, check=True)
    
    # Transcribe audio with timestamps
    result = model.transcribe(
        audio_path, 
        word_timestamps=True,
        language="en"  # Can be modified or auto-detected
    )
    
    # Process words with timestamps and detect silence
    transcript_data = []
    prev_end_time = 0
    silence_threshold = 1.0  # Silence threshold in seconds
    
    # Get video duration
    video_duration = get_video_duration(file_path)
    
    for segment in result["segments"]:
        for word_info in segment["words"]:
            current_start_time = word_info['start']
            
            # Check for silence between words
            silence_duration = current_start_time - prev_end_time
            if silence_duration >= silence_threshold:
                transcript_data.append({
                    'word': '[silence]',
                    'start': prev_end_time,
                    'end': current_start_time,
                    'is_silence': True,
                    'duration': round(silence_duration, 1)
                })
            
            # Add the actual word
            transcript_data.append({
                'word': word_info['word'],
                'start': word_info['start'],
                'end': word_info['end'],
                'is_silence': False
            })
            
            prev_end_time = word_info['end']
    
    # Check for silence at the end of the video
    if video_duration - prev_end_time >= silence_threshold:
        transcript_data.append({
            'word': '[silence]',
            'start': prev_end_time,
            'end': video_duration,
            'is_silence': True,
            'duration': round(video_duration - prev_end_time, 1)
        })
    
    # Save transcript data
    transcript_path = os.path.join(session_folder, "transcript.json")
    with open(transcript_path, 'w') as f:
        json.dump(transcript_data, f)
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'filename': filename,
        'transcript': transcript_data
    })

@app.route('/edit', methods=['POST'])
def edit_video():
    data = request.json
    session_id = data.get('session_id')
    filename = data.get('filename')
    selections = data.get('selections', [])  # Text selections to remove
    preview_only = data.get('preview_only', False)  # Whether to only generate a preview
    
    if not session_id or not filename or not selections:
        return jsonify({'error': 'Missing required data'}), 400
    
    session_folder = os.path.join(app.config['PROCESSED_FOLDER'], session_id)
    original_file = os.path.join(session_folder, filename)
    transcript_path = os.path.join(session_folder, "transcript.json")
    
    # Check if files exist
    if not os.path.exists(original_file) or not os.path.exists(transcript_path):
        return jsonify({'error': 'Session files not found'}), 404
    
    # Load transcript data
    with open(transcript_path, 'r') as f:
        transcript_data = json.load(f)
    
    # Create a list of segments to keep (inverse of what to cut)
    segments_to_keep = []
    current_start = 0
    
    # Sort selections by start time to process in order
    sorted_selections = sorted(selections, key=lambda x: x['start'])
    
    for selection in sorted_selections:
        # Keep segment from current_start to selection start
        if selection['start'] > current_start:
            segments_to_keep.append({
                'start': current_start,
                'end': selection['start']
            })
        
        # Update current_start to after this selection
        current_start = selection['end']
    
    # Add final segment if needed
    video_duration = get_video_duration(original_file)
    if current_start < video_duration:
        segments_to_keep.append({
            'start': current_start,
            'end': video_duration
        })
    
    # Create temporary file for filter complex script
    filter_file = os.path.join(session_folder, "filter_complex.txt")
    with open(filter_file, 'w') as f:
        for i, segment in enumerate(segments_to_keep):
            f.write(f"[0:v]trim={segment['start']}:{segment['end']},setpts=PTS-STARTPTS[v{i}];\n")
            f.write(f"[0:a]atrim={segment['start']}:{segment['end']},asetpts=PTS-STARTPTS[a{i}];\n")
        
        # Concatenate video and audio streams
        v_stream = ''.join(f'[v{i}]' for i in range(len(segments_to_keep)))
        a_stream = ''.join(f'[a{i}]' for i in range(len(segments_to_keep)))
        
        f.write(f"{v_stream}concat=n={len(segments_to_keep)}:v=1:a=0[outv];\n")
        f.write(f"{a_stream}concat=n={len(segments_to_keep)}:v=0:a=1[outa]")
    
    # Generate filenames
    preview_filename = f"preview_{filename}"
    preview_file = os.path.join(session_folder, preview_filename)
    
    if preview_only:
        # Get encoder settings for preview quality
        encoder = get_encoder_settings(quality='low')
        
        # Build the FFmpeg command
        ffmpeg_cmd = [
            'ffmpeg', '-y', '-i', original_file, 
            '-filter_complex_script', filter_file,
            '-map', '[outv]', '-map', '[outa]',
            '-vf', 'scale=640:-1', 
            '-c:v', encoder['c:v']
        ]
        
        # Add encoder-specific settings
        if 'preset' in encoder:
            ffmpeg_cmd.extend(['-preset', encoder['preset']])
        if 'crf' in encoder:
            ffmpeg_cmd.extend(['-crf', encoder['crf']])
        if 'quality' in encoder:
            ffmpeg_cmd.extend(['-quality', encoder['quality']])
        
        # Add extra parameters
        ffmpeg_cmd.extend(encoder['extra'])
        
        # Add audio codec and output file
        ffmpeg_cmd.extend(['-c:a', 'aac', '-b:a', '64k', preview_file])
        
        # Run FFmpeg
        subprocess.run(ffmpeg_cmd, check=True)
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'preview_file': preview_filename
        })
    else:
        # Generate the full quality edited file
        edited_filename = f"edited_{filename}"
        output_file = os.path.join(session_folder, edited_filename)
        
        # Get encoder settings for high quality
        encoder_high = get_encoder_settings(quality='high')
        
        # Build the FFmpeg command for high quality
        ffmpeg_cmd1 = [
            'ffmpeg', '-y', '-i', original_file, 
            '-filter_complex_script', filter_file,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', encoder_high['c:v']
        ]
        
        # Add encoder-specific settings
        if 'preset' in encoder_high:
            ffmpeg_cmd1.extend(['-preset', encoder_high['preset']])
        if 'quality' in encoder_high:
            ffmpeg_cmd1.extend(['-quality', encoder_high['quality']])
        
        # Add extra parameters
        ffmpeg_cmd1.extend(encoder_high['extra'])
        
        # Add audio codec and output file
        ffmpeg_cmd1.extend(['-c:a', 'aac', output_file])
        
        # Run FFmpeg for high quality
        subprocess.run(ffmpeg_cmd1, check=True)
        
        # Get encoder settings for low quality (preview)
        encoder_low = get_encoder_settings(quality='low')
        
        # Build the FFmpeg command for preview
        ffmpeg_cmd2 = [
            'ffmpeg', '-y', '-i', output_file,
            '-vf', 'scale=640:-1', 
            '-c:v', encoder_low['c:v']
        ]
        
        # Add encoder-specific settings
        if 'preset' in encoder_low:
            ffmpeg_cmd2.extend(['-preset', encoder_low['preset']])
        if 'crf' in encoder_low:
            ffmpeg_cmd2.extend(['-crf', encoder_low['crf']])
        if 'quality' in encoder_low:
            ffmpeg_cmd2.extend(['-quality', encoder_low['quality']])
        
        # Add extra parameters
        ffmpeg_cmd2.extend(encoder_low['extra'])
        
        # Add audio codec and output file
        ffmpeg_cmd2.extend(['-c:a', 'aac', '-b:a', '64k', preview_file])
        
        # Run FFmpeg for preview
        subprocess.run(ffmpeg_cmd2, check=True)
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'edited_file': edited_filename,
            'preview_file': preview_filename
        })

@app.route('/video/<session_id>/<filename>')
def serve_video(session_id, filename):
    session_folder = os.path.join(app.config['PROCESSED_FOLDER'], session_id)
    return send_from_directory(session_folder, filename)

@app.route('/download/<session_id>/<filename>')
def download_video(session_id, filename):
    session_folder = os.path.join(app.config['PROCESSED_FOLDER'], session_id)
    return send_from_directory(
        session_folder, 
        filename, 
        as_attachment=True
    )

def get_video_duration(file_path):
    """Get video duration in seconds using FFprobe"""
    result = subprocess.run([
        'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', file_path
    ], capture_output=True, text=True, check=True)
    
    return float(result.stdout.strip())

# Clean up old sessions (could be run periodically)
@app.route('/cleanup', methods=['POST'])
def cleanup_old_sessions():
    # In a production app, you'd want this to run on a schedule
    # This is a simple endpoint for manual cleanup
    sessions = os.listdir(app.config['PROCESSED_FOLDER'])
    count = 0
    
    for session_id in sessions:
        session_path = os.path.join(app.config['PROCESSED_FOLDER'], session_id)
        if os.path.isdir(session_path):
            shutil.rmtree(session_path)
            count += 1
    
    return jsonify({'success': True, 'sessions_removed': count})

if __name__ == '__main__':
    app.run(debug=True)
