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
        return jsonify({"error": "invalid_url", "message": "Invalid YouTube URL."}), 400

    # Try Method 1: youtube-transcript-api (compatible with v0.6.2 and v1.x)
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        from youtube_transcript_api._errors import (
            TranscriptsDisabled, NoTranscriptFound,
            VideoUnavailable, IpBlocked
        )

        full_text = None
        lang_used = None

        try:
            # Try v0.6.2 static method first (more reliable)
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
            full_text = " ".join([
                entry.get('text', '').strip() if isinstance(entry, dict) else str(entry).strip()
                for entry in transcript_list
                if (entry.get('text', '').strip() if isinstance(entry, dict) else str(entry).strip())
            ])
            lang_used = 'en'

        except (NoTranscriptFound, TranscriptsDisabled, IpBlocked) as e:
            # Try listing available transcripts
            try:
                available = YouTubeTranscriptApi.list_transcripts(video_id)
                for transcript in available:
                    try:
                        transcript_list = transcript.fetch()
                        full_text = " ".join([
                            entry.get('text', '').strip() if isinstance(entry, dict) else str(entry).strip()
                            for entry in transcript_list
                            if (entry.get('text', '').strip() if isinstance(entry, dict) else str(entry).strip())
                        ])
                        lang_used = transcript.language_code
                        if full_text:
                            break
                    except Exception:
                        continue
            except Exception:
                pass

        if full_text and full_text.strip():
            title = get_title(video_id)
            return jsonify({
                "transcript": full_text.strip(),
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
        print(f"youtube-transcript-api error: {e}")

    # Method 2: Supadata fallback (works from cloud IPs, correct endpoint)
    supadata_key = os.environ.get('SUPADATA_API_KEY', '')
    if supadata_key:
        try:
            import urllib.parse
            encoded_url = urllib.parse.quote(video_url)
            # ✅ Correct endpoint: /v1/youtube/transcript with text=true
            api_url = f"https://api.supadata.ai/v1/youtube/transcript?url={encoded_url}&text=true"
            req = urllib.request.Request(
                api_url,
                headers={"x-api-key": supadata_key}
            )
            print(f"Trying Supadata: {api_url}")
            with urllib.request.urlopen(req, timeout=30) as response:
                data = jsonlib.loads(response.read())
                print(f"Supadata response: {str(data)[:200]}")
                
                # With text=true, content is a plain string
                content = data.get('content', '')
                if isinstance(content, str) and content.strip():
                    title = get_title(video_id)
                    return jsonify({
                        "transcript": content.strip(),
                        "title": title,
                        "language": data.get('lang', 'en'),
                        "chars": len(content)
                    })
                # Fallback: content might be array format
                elif isinstance(content, list):
                    full_text = " ".join([
                        item.get('text', '').strip()
                        for item in content
                        if isinstance(item, dict) and item.get('text', '').strip()
                    ])
                    if full_text:
                        title = get_title(video_id)
                        return jsonify({
                            "transcript": full_text,
                            "title": title,
                            "language": data.get('lang', 'en'),
                            "chars": len(full_text)
                        })
        except Exception as e:
            print(f"Supadata error: {e}")

    # All methods failed
    return jsonify({
        "error": "no_captions",
        "message": "Could not fetch transcript. Try a video with English captions like Khan Academy or TED Talks."
    }), 400

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port)
