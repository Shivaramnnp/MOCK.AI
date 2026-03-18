from flask import Flask, request, jsonify
import re
import os

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
        return jsonify({
            "error": "invalid_url",
            "message": "Invalid YouTube URL. Use youtube.com/watch?v=... or youtu.be/..."
        }), 400

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import (
            TranscriptsDisabled,
            NoTranscriptFound,
            VideoUnavailable
        )

        # Try languages in priority order
        transcript_list = None
        lang_used = None
        priority_langs = ['en', 'hi', 'en-IN', 'hi-IN']

        try:
            # First try manual + auto in priority languages
            transcript_list = YouTubeTranscriptApi.get_transcript(
                video_id,
                languages=priority_langs
            )
            lang_used = 'en'  # approximate
        except NoTranscriptFound:
            # Fall back to any available language
            try:
                all_transcripts = YouTubeTranscriptApi.list_transcripts(video_id)
                # Try auto-generated first (more common)
                for t in all_transcripts:
                    transcript_list = t.fetch()
                    lang_used = t.language_code
                    break
            except Exception:
                pass

        if not transcript_list:
            return jsonify({
                "error": "no_captions",
                "message": "This video has no subtitles. Try Khan Academy, NPTEL, or TED Talk videos."
            }), 400

        # Join all transcript segments into full text
        full_text = " ".join([
            entry.get('text', '') if isinstance(entry, dict) else str(entry)
            for entry in transcript_list
        ]).strip()

        if not full_text:
            return jsonify({
                "error": "no_captions",
                "message": "Could not extract text from subtitles."
            }), 400

        # Try to get video title (optional, don't fail if unavailable)
        title = f"YouTube Video ({video_id})"
        try:
            import urllib.request
            import json as jsonlib
            oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
            with urllib.request.urlopen(oembed_url, timeout=5) as response:
                data = jsonlib.loads(response.read())
                title = data.get('title', title)
        except Exception:
            pass  # Title is optional

        return jsonify({
            "transcript": full_text,
            "title": title,
            "language": lang_used or "unknown",
            "chars": len(full_text)
        })

    except TranscriptsDisabled:
        return jsonify({
            "error": "disabled",
            "message": "Subtitles are disabled for this video. Try another video."
        }), 400
    except VideoUnavailable:
        return jsonify({
            "error": "unavailable",
            "message": "This video is unavailable or private."
        }), 400
    except Exception as e:
        return jsonify({
            "error": "server_error",
            "message": str(e)
        }), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
