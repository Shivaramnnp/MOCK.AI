from flask import Flask, request, jsonify
import yt_dlp
import re
import json

app = Flask(__name__)

def extract_video_id(url):
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'(?:youtu\.be\/)([0-9A-Za-z_-]{11})',
        r'(?:shorts\/)([0-9A-Za-z_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def extract_text_from_subtitle(subtitle_entries):
    """Handle multiple yt-dlp subtitle formats"""
    full_text = ""
    for entry in subtitle_entries:
        if not isinstance(entry, dict):
            continue
        # Format 1: {'data': [{'utf8': '...'}]}
        if 'data' in entry:
            for segment in entry['data']:
                if isinstance(segment, dict) and 'utf8' in segment:
                    text = segment['utf8'].strip()
                    if text and text != '\n':
                        full_text += text + " "
        # Format 2: direct {'utf8': '...'}
        elif 'utf8' in entry:
            text = entry['utf8'].strip()
            if text and text != '\n':
                full_text += text + " "
        # Format 3: {'text': '...', 'start': ..., 'duration': ...}
        elif 'text' in entry:
            text = entry['text'].strip()
            if text and text != '\n':
                full_text += text + " "
    return full_text.strip()

@app.route('/health')
def health():
    return jsonify({"status": "ok"})

@app.route('/transcript')
def get_transcript():
    video_url = request.args.get('url', '')
    if not video_url:
        return jsonify({"error": "no_url", "message": "No URL provided"}), 400

    video_id = extract_video_id(video_url)
    if not video_id:
        return jsonify({"error": "invalid_url", "message": "Invalid YouTube URL"}), 400

    try:
        ydl_opts = {
            'writeautomaticsub': True,
            'writesubtitles': True,
            'subtitleslangs': ['en', 'hi', 'en-IN', 'hi-IN'],
            'subtitlesformat': 'json3',   # most structured format
            'skip_download': True,
            'quiet': True,
            'no_warnings': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)

            subtitles = info.get('subtitles', {})
            auto_captions = info.get('automatic_captions', {})
            title = info.get('title', 'Unknown')
            duration = info.get('duration', 0)

            # Reject videos over 3 hours (too much text)
            if duration and duration > 10800:
                return jsonify({
                    "error": "too_long",
                    "message": "Video is too long (over 3 hours). Try a shorter video."
                }), 400

            transcript_data = None
            lang_used = None

            # Priority: manual English → manual Hindi → auto English → auto Hindi → any
            priority_langs = ['en', 'hi', 'en-IN', 'hi-IN']

            for lang in priority_langs:
                if lang in subtitles and subtitles[lang]:
                    transcript_data = subtitles[lang]
                    lang_used = f"manual:{lang}"
                    break

            if not transcript_data:
                for lang in priority_langs:
                    if lang in auto_captions and auto_captions[lang]:
                        transcript_data = auto_captions[lang]
                        lang_used = f"auto:{lang}"
                        break

            if not transcript_data:
                all_langs = list(subtitles.keys()) + list(auto_captions.keys())
                if all_langs:
                    lang_used = all_langs[0]
                    transcript_data = subtitles.get(lang_used) or auto_captions.get(lang_used)
                    lang_used = f"fallback:{lang_used}"

            if not transcript_data:
                return jsonify({
                    "error": "no_captions",
                    "message": "This video has no subtitles. Try Khan Academy, NPTEL, or TED Talk videos."
                }), 400

            full_text = extract_text_from_subtitle(transcript_data)

            if not full_text:
                return jsonify({
                    "error": "no_captions",
                    "message": "Could not extract text from subtitles. Try another video."
                }), 400

            return jsonify({
                "transcript": full_text,
                "title": title,
                "language": lang_used,
                "duration": duration,
                "chars": len(full_text)
            })

    except yt_dlp.utils.DownloadError as e:
        err = str(e)
        if 'private' in err.lower():
            return jsonify({"error": "private", "message": "This video is private."}), 400
        if 'unavailable' in err.lower():
            return jsonify({"error": "unavailable", "message": "This video is unavailable."}), 400
        return jsonify({"error": "download_error", "message": f"Could not access video: {err}"}), 400
    except Exception as e:
        return jsonify({"error": "server_error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
