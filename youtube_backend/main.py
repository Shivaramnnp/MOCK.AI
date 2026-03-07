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
            
        try:
            # METHOD 1: specific languages including auto-generated prefixes
            transcript = YouTubeTranscriptApi.get_transcript(
                video_id, 
                languages=['en', 'hi', 'en-IN', 'hi-IN', 'a.en', 'a.hi']
            )
        except Exception as e1:
            try:
                # Try fetching list of all transcripts
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                available_langs = [t.language_code for t in transcript_list]
                
                try:
                    # Look for specific languages again
                    t = transcript_list.find_transcript(['en', 'hi', 'en-IN', 'hi-IN'])
                    transcript = t.fetch()
                except Exception as e2:
                    try:
                        # METHOD 2: Get first available and translate to English
                        t = next(iter(transcript_list))
                        transcript = t.translate('en').fetch()
                    except Exception as e3:
                        try:
                            # METHOD 3: Just fetch raw in whatever language it is
                            t = next(iter(transcript_list))
                            transcript = t.fetch()
                        except Exception as e4:
                            return jsonify({
                                "error": "no_captions",
                                "message": "No subtitles found",
                                "available_languages": available_langs
                            }), 400
            except Exception as list_err:
                # Transcripts are disabled completely or entirely missing
                return jsonify({
                    "error": "no_captions",
                    "message": "No subtitles found",
                    "available_languages": []
                }), 400
            
        full_text = ' '.join([t['text'] for t in transcript])
        return jsonify({"transcript": full_text})
    except Exception as e:
        return jsonify({"error": str(e), "message": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
