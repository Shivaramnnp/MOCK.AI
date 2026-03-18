from flask import Flask, request, jsonify
import re
import os
import urllib.request
import json as jsonlib

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

def get_title(video_id):
    try:
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        with urllib.request.urlopen(oembed_url, timeout=5) as response:
            data = jsonlib.loads(response.read())
            return data.get('title', f'YouTube Video ({video_id})')
    except Exception:
        return f'YouTube Video ({video_id})'

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
            "message": "Invalid YouTube URL."
        }), 400

    # Get proxy from environment variable (set in Render dashboard)
    proxy_url = os.environ.get('PROXY_URL', None)

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import (
            TranscriptsDisabled,
            NoTranscriptFound,
            VideoUnavailable
        )

        # Build proxies dict if proxy is configured
        proxies = None
        if proxy_url:
            proxies = {
                "http": proxy_url,
                "https": proxy_url
            }

        ytt_api = YouTubeTranscriptApi()

        full_text = None
        lang_used = None

        try:
            # Try with proxy if available
            if proxies:
                fetched = ytt_api.fetch(
                    video_id,
                    languages=['en', 'hi', 'en-IN', 'hi-IN'],
                    proxies=proxies
                )
            else:
                fetched = ytt_api.fetch(
                    video_id,
                    languages=['en', 'hi', 'en-IN', 'hi-IN']
                )

            raw_data = fetched.to_raw_data()
            full_text = " ".join([
                entry.get('text', '') for entry in raw_data
                if entry.get('text', '').strip()
            ]).strip()
            lang_used = 'en'

        except (NoTranscriptFound, TranscriptsDisabled):
            # Try listing all available transcripts
            try:
                available = ytt_api.list(video_id)
                for t in available:
                    if proxies:
                        fetched = t.fetch(proxies=proxies)
                    else:
                        fetched = t.fetch()
                    raw_data = fetched.to_raw_data()
                    full_text = " ".join([
                        entry.get('text', '') for entry in raw_data
                        if entry.get('text', '').strip()
                    ]).strip()
                    lang_used = t.language_code
                    if full_text:
                        break
            except Exception as e:
                return jsonify({
                    "error": "no_captions",
                    "message": f"This video has no accessible subtitles. Error: {str(e)}"
                }), 400

        if not full_text:
            return jsonify({
                "error": "no_captions",
                "message": "Could not extract transcript text. Try another video."
            }), 400

        title = get_title(video_id)

        return jsonify({
            "transcript": full_text,
            "title": title,
            "language": lang_used or "unknown",
            "chars": len(full_text)
        })

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
