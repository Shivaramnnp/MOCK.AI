from flask import Flask, request, jsonify
import re
import os
import urllib.request
import json as jsonlib

# Install required packages:
# pip install supadata youtube-transcript-api flask

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

    print(f"Fetching transcript for video_id: {video_id}")

    # ─── Method 1: Supadata.ai (Primary) ───────────────────────────────────
    supadata_key = os.environ.get('SUPADATA_API_KEY', '')
    if supadata_key:
        try:
            from supadata import Supadata
            client = Supadata(api_key=supadata_key)
            # Use the full URL as it's more universally supported by Supadata
            transcript = client.transcript(url=video_url, text=True)
            content = transcript.content if hasattr(transcript, 'content') else None
            if content and isinstance(content, str) and content.strip():
                print(f"✅ Supadata success: {len(content)} chars")
                return jsonify({
                    "transcript": content.strip(),
                    "title": get_title(video_id),
                    "language": getattr(transcript, 'lang', 'en'),
                    "source": "supadata"
                })
        except Exception as e:
            print(f"Supadata error: {e}")

    # ─── Method 2: youtube-transcript-api (Fallback) ───────────────────────
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        
        full_text = None
        lang_used = None

        try:
            # 1. Try a basic fetch first (most robust)
            data = YouTubeTranscriptApi.get_transcript(video_id)
            full_text = " ".join([entry.get('text', '').strip() for entry in data if entry.get('text', '').strip()])
            lang_used = 'en'
            print(f"Standard fetch success: {len(full_text)} chars")
        except Exception as e1:
            print(f"Standard fetch failed: {e1}, trying alternative languages...")
            try:
                # 2. Try to get ANY available transcript (handles non-English/Auto-generated)
                # list_transcripts is the correct method name in latest version
                # If it's missing, we use a different approach
                if hasattr(YouTubeTranscriptApi, 'list_transcripts'):
                    transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                    found = next(iter(transcript_list))
                    fetched = found.fetch()
                    full_text = " ".join([entry.get('text', '').strip() for entry in fetched if entry.get('text', '').strip()])
                    lang_used = found.language_code
                    print(f"Alternative fetch success: {len(full_text)} chars, lang={lang_used}")
            except Exception as e2:
                print(f"Alternative fetch also failed: {e2}")

        if full_text and full_text.strip():
            return jsonify({
                "transcript": full_text.strip(),
                "title": get_title(video_id),
                "language": lang_used or "en",
                "chars": len(full_text),
                "source": "youtube-transcript-api"
            })

    except Exception as e:
        print(f"Method 2 critical exception: {e}")

    # ─── All methods failed ──────────────────────────────────────────────────
    return jsonify({
        "error": "no_captions",
        "message": "Could not fetch transcript. Try a video with English captions like Khan Academy or TED Talks."
    }), 400

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    app.run(debug=False, host='0.0.0.0', port=port)
