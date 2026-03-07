from flask import Flask, request, jsonify
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import re

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
    
    video_id = extract_video_id(video_url)
    
    try:
        # METHOD 1: Try specific languages including auto-generated
        try:
            transcript = YouTubeTranscriptApi.get_transcript(
                video_id, 
                languages=['en', 'hi', 'en-IN', 'hi-IN', 'a.en', 'a.hi']
            )
            full_text = ' '.join([t['text'] for t in transcript])
            return jsonify({"transcript": full_text})
        except Exception:
            pass

        # METHOD 2: List all available and pick first one
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            available = []
            for t in transcript_list:
                available.append(t.language_code)
            
            # Try to find English or Hindi first
            transcript_obj = None
            try:
                transcript_obj = transcript_list.find_transcript(['en', 'hi', 'en-IN', 'hi-IN'])
            except Exception:
                # Just grab whatever is available
                transcript_obj = next(iter(transcript_list))
            
            fetched = transcript_obj.fetch()
            full_text = ' '.join([t['text'] for t in fetched])
            return jsonify({"transcript": full_text, "language": transcript_obj.language_code})
        except Exception as e2:
            return jsonify({
                "error": "no_captions",
                "message": "This video has no subtitles available. Try Khan Academy, Physics Wallah or NPTEL videos!",
            }), 400

    except Exception as e:
        return jsonify({
            "error": "server_error", 
            "message": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
