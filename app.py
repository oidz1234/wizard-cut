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

# Create dictionary for preview cache
app.config['PREVIEW_CACHE'] = {}

# Load Whisper model (can choose size based on accuracy needs vs. performance)
# Options: "tiny", "base", "small", "medium", "large"
model = whisper.load_model("tiny")  # Good balance of accuracy and speed

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
        elif quality == 'preview':
            # Ultra-fast preview settings
            return {
                'c:v': 'h264_nvenc',
                'preset': 'p7',  # Fastest preset
                'extra': ['-b:v', '500k', '-maxrate', '500k', '-bufsize', '500k']
            }
        else:  # low quality
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
        elif quality == 'preview':
            # Ultra-fast preview settings
            return {
                'c:v': 'h264_amf',
                'quality': 'speed',
                'extra': ['-b:v', '500k', '-maxrate', '500k', '-bufsize', '500k']
            }
        else:  # low quality
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
        elif quality == 'preview':
            # Ultra-fast preview settings
            return {
                'c:v': 'h264_qsv',
                'preset': 'veryfast', 
                'extra': ['-b:v', '500k', '-maxrate', '500k', '-bufsize', '500k']
            }
        else:  # low quality
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
        elif quality == 'preview':
            # Ultra-fast preview settings
            return {
                'c:v': 'libx264',
                'preset': 'ultrafast',
                'crf': '32',  # Very low quality for speed
                'extra': ['-tune', 'zerolatency'] 
            }
        else:  # low quality
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
    zoom_events = data.get('zoom_events', [])  # Zoom events to apply
    preview_only = data.get('preview_only', False)  # Whether to only generate a preview
    
    if not session_id or not filename: # Allow videos with no selections but with zoom events
        return jsonify({'error': 'Missing required data'}), 400
        
    if not selections and not zoom_events:
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
        
    # Process zoom events
    sorted_zoom_events = sorted(zoom_events, key=lambda x: x['startTime'])
    
    # Remove any overlapping zoom events - keep only the latest one in case of overlap
    non_overlapping_zoom_events = []
    for zoom in sorted_zoom_events:
        # Check if this zoom overlaps with any zoom we've already kept
        is_overlapping = False
        for i, kept_zoom in enumerate(non_overlapping_zoom_events):
            # Check for overlap
            if not (zoom['endTime'] <= kept_zoom['startTime'] or zoom['startTime'] >= kept_zoom['endTime']):
                # If this is a newer zoom (likely added later), replace the old one
                if 'id' in zoom and 'id' in kept_zoom and zoom['id'] > kept_zoom['id']:
                    non_overlapping_zoom_events[i] = zoom
                is_overlapping = True
                break
        
        if not is_overlapping:
            non_overlapping_zoom_events.append(zoom)
    
    # Use the non-overlapping zoom events for further processing
    sorted_zoom_events = sorted(non_overlapping_zoom_events, key=lambda x: x['startTime'])
    
    # Save zoom events to file for debugging and reference
    zoom_events_path = os.path.join(session_folder, "zoom_events.json")
    with open(zoom_events_path, 'w') as f:
        json.dump(sorted_zoom_events, f, indent=2)
    
    # Create temporary file for filter complex script
    filter_file = os.path.join(session_folder, "filter_complex.txt")
    with open(filter_file, 'w') as f:
        # First create segment streams
        for i, segment in enumerate(segments_to_keep):
            f.write(f"[0:v]trim={segment['start']}:{segment['end']},setpts=PTS-STARTPTS[v{i}];\n")
            f.write(f"[0:a]atrim={segment['start']}:{segment['end']},asetpts=PTS-STARTPTS[a{i}];\n")
        
        # Get streams arrays for audio concatenation
        v_stream = ''.join(f'[v{i}]' for i in range(len(segments_to_keep)))
        a_stream = ''.join(f'[a{i}]' for i in range(len(segments_to_keep)))
        
        # First concat video segments
        f.write(f"{v_stream}concat=n={len(segments_to_keep)}:v=1:a=0[vconcated];\n")
        
        # If we have zoom events, process them one by one
        if zoom_events and sorted_zoom_events:
            # Calculate how many splits we need (one for each zoom, plus gaps between zooms)
            # Maximum number of segments is 2n+1 where n is number of zooms
            max_segments = len(sorted_zoom_events) * 2 + 1
            
            # Generate split outputs
            split_outputs = [f"[split_{i}]" for i in range(max_segments)]
            f.write(f"[vconcated]split={max_segments}{(''.join(split_outputs))};\n")
            
            # For tracking which parts of the video have been processed
            processed_segments = []
            
            # For naming the video stream segments
            segment_counter = 0
            split_counter = 0
            
            current_time = 0
            
            # Calculate timing adjustments for zooms after cuts
            segment_timeline = []
            running_time = 0
            
            for segment in segments_to_keep:
                segment_duration = segment['end'] - segment['start']
                segment_timeline.append({
                    'original_start': segment['start'],
                    'original_end': segment['end'],
                    'timeline_start': running_time,
                    'timeline_end': running_time + segment_duration
                })
                running_time += segment_duration
            
            total_duration = running_time
            
            # Process each zoom event in order
            for zoom_idx, zoom in enumerate(sorted_zoom_events):
                # Get original start and end times from the zoom event
                orig_start_time = max(0, float(zoom.get('startTime', 0)))
                orig_end_time = min(video_duration, float(zoom.get('endTime', video_duration)))
                
                # Find where these times fall in the new timeline after cuts
                adj_start_time = None
                adj_end_time = None
                
                # Convert original times to timeline times
                for seg in segment_timeline:
                    # Check if zoom start is in this segment
                    if orig_start_time >= seg['original_start'] and orig_start_time <= seg['original_end']:
                        # Convert to the new timeline position
                        rel_pos = (orig_start_time - seg['original_start']) / (seg['original_end'] - seg['original_start'])
                        adj_start_time = seg['timeline_start'] + rel_pos * (seg['timeline_end'] - seg['timeline_start'])
                    
                    # Check if zoom end is in this segment
                    if orig_end_time >= seg['original_start'] and orig_end_time <= seg['original_end']:
                        # Convert to the new timeline position
                        rel_pos = (orig_end_time - seg['original_start']) / (seg['original_end'] - seg['original_start'])
                        adj_end_time = seg['timeline_start'] + rel_pos * (seg['timeline_end'] - seg['timeline_start'])
                
                # Skip this zoom if it can't be mapped to the new timeline
                if adj_start_time is None or adj_end_time is None or adj_start_time >= adj_end_time:
                    continue
                
                # Make sure zooms don't overlap
                adj_start_time = max(adj_start_time, current_time)
                if adj_start_time >= adj_end_time:
                    continue
                
                # Get zoom level exactly as recorded
                zoom_level = 2.0  # Default fallback
                if 'endZoomLevel' in zoom and zoom['endZoomLevel'] is not None:
                    # Use exactly the zoom level recorded by the user
                    zoom_level = float(zoom['endZoomLevel'])
                
                # Get focus point
                x, y = 0.5, 0.5  # Default center position
                focus_point = zoom.get('focusPoint', {})
                if isinstance(focus_point, dict):
                    if 'x' in focus_point and focus_point['x'] is not None:
                        x = min(1.0, max(0.0, float(focus_point['x'])))
                    if 'y' in focus_point and focus_point['y'] is not None:
                        y = min(1.0, max(0.0, float(focus_point['y'])))
                
                # Calculate scale and crop parameters
                scale_factor = 1.0 / zoom_level
                crop_width = f"iw*{scale_factor}"
                crop_height = f"ih*{scale_factor}"
                crop_x = f"(iw-{crop_width})*{x}"
                crop_y = f"(ih-{crop_height})*{y}"
                
                # If there's a gap before this zoom, add it as a non-zoomed segment
                if adj_start_time > current_time:
                    f.write(f"[split_{split_counter}]trim={current_time}:{adj_start_time},setpts=PTS-STARTPTS[v_before_{segment_counter}];\n")
                    processed_segments.append(f"[v_before_{segment_counter}]")
                    segment_counter += 1
                    split_counter += 1
                
                # Add the zoomed segment
                zoom_stream = f"v_zoom_{segment_counter}"
                f.write(f"[split_{split_counter}]trim={adj_start_time}:{adj_end_time},setpts=PTS-STARTPTS,")
                f.write(f"crop={crop_width}:{crop_height}:{crop_x}:{crop_y},")
                f.write(f"scale=iw*{zoom_level}:-1,scale=1920:1080,setsar=1:1[{zoom_stream}];\n")
                processed_segments.append(f"[{zoom_stream}]")
                segment_counter += 1
                split_counter += 1
                
                # Update current position
                current_time = adj_end_time
            
            # Add remaining video after last zoom
            if current_time < total_duration:
                f.write(f"[split_{split_counter}]trim={current_time}:{total_duration},setpts=PTS-STARTPTS[v_after_{segment_counter}];\n")
                processed_segments.append(f"[v_after_{segment_counter}]")
            
            # Concatenate all segments if we have multiple
            if processed_segments:
                if len(processed_segments) > 1:
                    segments_str = ''.join(processed_segments)
                    f.write(f"{segments_str}concat=n={len(processed_segments)}:v=1:a=0[outv];\n")
                else:
                    # Just one segment, use it directly
                    f.write(f"{processed_segments[0]}copy[outv];\n")
            else:
                # No segments created, just use the vconcated video directly
                f.write(f"[vconcated]copy[outv];\n")
        else:
            # No zoom, just use concatenated segments
            # No need to recreate the concatenated stream, just use it directly
            f.write(f"[vconcated]copy[outv];\n")
        
        # Add audio stream concatenation
        f.write(f"{a_stream}concat=n={len(segments_to_keep)}:v=0:a=1[outa]")
    
    # Generate filenames
    preview_filename = f"preview_{filename}"
    preview_file = os.path.join(session_folder, preview_filename)
    
    if preview_only:
        # Create a unique identifier for this edit configuration
        selection_hash = hash(str(sorted_selections) + str(sorted_zoom_events))
        
        # Check if we have a cached preview for this edit
        if session_id in app.config['PREVIEW_CACHE'] and \
           selection_hash in app.config['PREVIEW_CACHE'][session_id] and \
           os.path.exists(os.path.join(session_folder, app.config['PREVIEW_CACHE'][session_id][selection_hash])):
            # Return cached preview file
            return jsonify({
                'success': True,
                'session_id': session_id,
                'preview_file': app.config['PREVIEW_CACHE'][session_id][selection_hash],
                'zoom_events_applied': len(zoom_events) > 0,
                'cached': True
            })
        
        # Get encoder settings for preview quality (faster than low quality)
        encoder = get_encoder_settings(quality='preview')
        
        # Create a modified filter complex script with explicit scaling at the end
        with open(filter_file, 'r') as f:
            filter_content = f.read()
        
        # Replace the output label [outv] with an intermediate label [outv_unscaled]
        modified_content = filter_content.replace("[outv];", "[outv_unscaled];")
        modified_content = modified_content.replace("copy[outv];", "copy[outv_unscaled];")
        modified_content = modified_content.replace("[outv]", "[outv_unscaled]")
        
        # Add a scaling step at the end for the preview
        # This ensures we're not duplicating any stream labels or trying to use simple filter with complex filtergraph
        scaling_line = "\n[outv_unscaled]scale=480:-1[outv];"
        
        # Add scaling before the audio concat line
        audio_concat = a_stream + "concat=n=" + str(len(segments_to_keep)) + ":v=0:a=1[outa]"
        modified_content = modified_content.replace(audio_concat, scaling_line + "\n" + audio_concat)
        
        # Save the modified filter complex
        modified_filter_file = os.path.join(session_folder, "preview_filter_complex.txt")
        with open(modified_filter_file, 'w') as f:
            f.write(modified_content)
        
        # Build the FFmpeg command optimized for speed (without -vf scale)
        ffmpeg_cmd = [
            'ffmpeg', '-y', '-i', original_file, 
            '-filter_complex_script', modified_filter_file,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', encoder['c:v'],
            '-threads', '0',  # Use maximum threads
            '-g', '9999'  # Large GOP for faster encoding
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
        
        # Add audio codec and output file with very low bitrate for speed
        ffmpeg_cmd.extend(['-c:a', 'aac', '-b:a', '32k', preview_file])
        
        # Run FFmpeg
        try:
            subprocess.run(ffmpeg_cmd, check=True)
            
            # Cache the preview
            if session_id not in app.config['PREVIEW_CACHE']:
                app.config['PREVIEW_CACHE'][session_id] = {}
            app.config['PREVIEW_CACHE'][session_id][selection_hash] = preview_filename
            
            return jsonify({
                'success': True,
                'session_id': session_id,
                'preview_file': preview_filename,
                'zoom_events_applied': len(zoom_events) > 0,
                'cached': False
            })
            
        except Exception as e:
            print(f"Preview generation error: {e}")
            return jsonify({
                'success': False,
                'error': 'Failed to generate preview'
            }), 500
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
        
        # Cache the preview for future use
        selection_hash = hash(str(sorted_selections) + str(sorted_zoom_events))
        if session_id not in app.config['PREVIEW_CACHE']:
            app.config['PREVIEW_CACHE'][session_id] = {}
        app.config['PREVIEW_CACHE'][session_id][selection_hash] = preview_filename
        
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

# Clean up a specific session
@app.route('/cleanup_session/<session_id>', methods=['POST'])
def cleanup_session(session_id):
    session_path = os.path.join(app.config['PROCESSED_FOLDER'], session_id)
    if os.path.isdir(session_path):
        shutil.rmtree(session_path)
        # Also clear any cached previews for this session
        if session_id in app.config['PREVIEW_CACHE']:
            del app.config['PREVIEW_CACHE'][session_id]
        return jsonify({'success': True, 'message': 'Session data cleared successfully'})
    else:
        return jsonify({'success': False, 'error': 'Session not found'}), 404

# Preview cuts endpoint - optimized for speed
@app.route('/preview_cuts', methods=['POST'])
def preview_cuts():
    data = request.json
    
    # Add the preview_only flag and call the existing edit function
    data['preview_only'] = True
    
    # Call the main edit function with preview_only=True
    return edit_video()

if __name__ == '__main__':
    app.run(debug=True)
