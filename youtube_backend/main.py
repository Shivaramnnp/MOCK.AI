from flask import Flask, request, jsonify
from youtube_transcript_api import YouTubeTranscriptApi

app = Flask(__name__)

@app.route('/transcript')
def get_transcript():
    try:
        video_url = request.args.get('url', '')
        if not video_url:
            return jsonify({"error": "No URL provided"}), 400
            
        # Safely extract video ID from standard or youtu.be format
        if 'v=' in video_url:
            video_id = video_url.split('v=')[-1].split('&')[0]
        elif 'youtu.be/' in video_url:
            video_id = video_url.split('youtu.be/')[-1].split('?')[0]
        else:
            return jsonify({"error": "Invalid YouTube URL format"}), 400
            
        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['en', 'hi'])
        full_text = ' '.join([t['text'] for t in transcript])
        return jsonify({"transcript": full_text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
