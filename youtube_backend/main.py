from flask import Flask, request, jsonify
import yt_dlp
import re
import json

app = Flask(__name__)

def extract_video_id(url):
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11}).*',
        r'(?:youtu\.be\/)([0-9A-Za-z_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return url

@app.route('/health')
def health():
    return jsonify({"status": "ok"})

@app.route('/transcript')
def get_transcript():
    video_url = request.args.get('url', '')
    if not video_url:
        return jsonify({"error": "no_url", "message": "No URL provided"}), 400

    try:
        ydl_opts = {
            'writeautomaticsub': True,
            'writesubtitles': True,
            'subtitleslangs': ['en', 'hi', 'en-IN'],
            'skip_download': True,
            'quiet': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)
            
            # Try manual subtitles first
            subtitles = info.get('subtitles', {})
            auto_captions = info.get('automatic_captions', {})
            title = info.get('title', 'Unknown')

            transcript_data = None
            lang_used = None

            # Check manual subs first
            for lang in ['en', 'hi', 'en-IN', 'hi-IN']:
                if lang in subtitles:
                    transcript_data = subtitles[lang]
                    lang_used = lang
                    break

            # Fall back to auto-generated
            if not transcript_data:
                for lang in ['en', 'hi', 'en-IN', 'hi-IN']:
                    if lang in auto_captions:
                        transcript_data = auto_captions[lang]
                        lang_used = lang
                        break

            # Last resort — any language available
            if not transcript_data:
                all_langs = list(subtitles.keys()) + list(auto_captions.keys())
                if all_langs:
                    lang_used = all_langs[0]
                    transcript_data = subtitles.get(lang_used) or auto_captions.get(lang_used)

            if not transcript_data:
                return jsonify({
                    "error": "no_captions",
                    "message": "This video has no subtitles available. Try Khan Academy, NPTEL or TED Talk videos!"
                }), 400

            # Extract text from subtitle data
            full_text = ""
            for entry in transcript_data:
                if isinstance(entry, dict) and 'data' in entry:
                    for segment in entry['data']:
                        if 'utf8' in segment:
                            full_text += segment['utf8'] + " "

            if not full_text.strip():
                return jsonify({
                    "error": "no_captions",
                    "message": "Could not extract text from subtitles."
                }), 400

            return jsonify({
                "transcript": full_text.strip(),
                "title": title,
                "language": lang_used
            })

    except Exception as e:
        return jsonify({
            "error": "server_error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
