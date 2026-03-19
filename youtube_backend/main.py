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

    print(f"Fetching transcript for video_id: {video_id}")

    # ─── Method 1: youtube-transcript-api ───────────────────────────
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import (
            TranscriptsDisabled, NoTranscriptFound,
            VideoUnavailable
        )

        ytt_api = YouTubeTranscriptApi()
        full_text = None
        lang_used = None

        try:
            fetched = ytt_api.fetch(video_id)
            raw_data = fetched.to_raw_data()
            full_text = " ".join([
                entry.get('text', '').strip()
                for entry in raw_data
                if entry.get('text', '').strip()
            ])
            lang_used = 'en'
            print(f"Method 1 success: {len(full_text)} chars")
        except Exception as e1:
            print(f"Method 1 fetch failed: {e1}, trying list...")
            try:
                available = ytt_api.list(video_id)
                for transcript in available:
                    try:
                        fetched = transcript.fetch()
                        raw_data = fetched.to_raw_data()
                        full_text = " ".join([
                            entry.get('text', '').strip()
                            for entry in raw_data
                            if entry.get('text', '').strip()
                        ])
                        lang_used = transcript.language_code
                        if full_text:
                            print(f"Method 1 list success: {len(full_text)} chars, lang={lang_used}")
                            break
                    except Exception:
                        continue
            except Exception as e2:
                print(f"Method 1 list also failed: {e2}")

        if full_text and full_text.strip():
            title = get_title(video_id)
            return jsonify({
                "transcript": full_text.strip(),
                "title": title,
                "language": lang_used or "en",
                "chars": len(full_text)
            })

    except VideoUnavailable:
        return jsonify({
            "error": "unavailable",
            "message": "This video is unavailable or private."
        }), 400
    except Exception as e:
        print(f"Method 1 exception: {e}")

    # ─── Method 2: Supadata SDK ─────────────────────────────────────
    supadata_key = os.environ.get('SUPADATA_API_KEY', '')
    print(f"Supadata key present: {bool(supadata_key)}")

    if supadata_key:
        try:
            from supadata import Supadata, SupadataError

            client = Supadata(api_key=supadata_key)

            # Use youtube.transcript with video_id for best results
            transcript = client.youtube.transcript(
                video_id=video_id,
                lang="en",
                text=True   # returns plain text string instead of chunks
            )

            content = transcript.content if hasattr(transcript, 'content') else None
            print(f"Supadata response content type: {type(content)}")
            print(f"Supadata content preview: {str(content)[:200]}")

            if content:
                # text=True returns a plain string
                if isinstance(content, str) and content.strip():
                    title = get_title(video_id)
                    return jsonify({
                        "transcript": content.strip(),
                        "title": title,
                        "language": getattr(transcript, 'lang', 'en'),
                        "chars": len(content)
                    })
                # Fallback: content might be list of chunks
                elif isinstance(content, list):
                    full_text = " ".join([
                        chunk.get('text', '') if isinstance(chunk, dict) else str(chunk)
                        for chunk in content
                    ]).strip()
                    if full_text:
                        title = get_title(video_id)
                        return jsonify({
                            "transcript": full_text,
                            "title": title,
                            "language": getattr(transcript, 'lang', 'en'),
                            "chars": len(full_text)
                        })

        except Exception as e:
            print(f"Supadata error: {e}")
    else:
        print("No SUPADATA_API_KEY set in environment")

    # ─── All methods failed ──────────────────────────────────────────────────
    return jsonify({
        "error": "no_captions",
        "message": "Could not fetch transcript. Try a video with English captions like Khan Academy or TED Talks."
    }), 400

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
