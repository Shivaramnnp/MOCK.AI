# 🧪 Quick Test Backend (Local Testing)

## Option 1: Run Backend Locally (Fastest Way to Test)

1. **Install dependencies**:
   ```bash
   cd youtube_backend
   pip install -r requirements.txt
   ```

2. **Get Supadata.ai API Key**:
   - Go to [supadata.ai](https://supadata.ai)
   - Sign up for free account
   - Get API key from dashboard

3. **Run local backend**:
   ```bash
   export SUPADATA_API_KEY="your_api_key_here"
   python main.py
   ```

4. **Test with curl**:
   ```bash
   curl "http://localhost:5000/transcript?url=https://youtu.be/jXsQ_0vA4ps"
   ```

5. **Update Android app** to use localhost:
   ```kotlin
   val backendUrl = "http://10.0.2.2:5000" // For Android emulator
   // OR
   val backendUrl = "http://192.168.1.100:5000" // Your computer's IP
   ```

## Option 2: Deploy to Render (Production)

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add Supadata.ai integration"
   git push origin main
   ```

2. **Deploy to Render**:
   - Go to [render.com](https://render.com)
   - Connect GitHub repo
   - Set environment variable: `SUPADATA_API_KEY=your_key`
   - Deploy

3. **Update Android app** with Render URL:
   ```kotlin
   val backendUrl = "https://your-app-name.onrender.com"
   ```

## Expected Success Response

```json
{
  "transcript": "Hello everyone, welcome to Khan Academy...",
  "title": "Video Title",
  "language": "en",
  "chars": 1234,
  "source": "supadata"
}
```

## Expected Android Logs

```
YOUTUBE_FLOW: ✅ Transcript fetched successfully!
YOUTUBE_FLOW:   source   : supadata
YOUTUBE_FLOW:   title    : Video Title
YOUTUBE_FLOW:   lang     : en
YOUTUBE_FLOW:   chars    : 1234
```

---

**Start with local testing to verify everything works, then deploy to production!** 🚀
