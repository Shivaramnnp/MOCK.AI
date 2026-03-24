# 🚀 Backend Deployment Guide

## Option 1: Deploy to Render (Recommended)

1. **Push to GitHub** (if not already)
   ```bash
   git add .
   git commit -m "Add Supadata.ai integration"
   git push origin main
   ```

2. **Deploy to Render**
   - Go to [render.com](https://render.com)
   - Connect your GitHub repository
   - Create a "Web Service" with:
     - Runtime: Python 3
     - Build Command: `pip install -r requirements.txt`
     - Start Command: `python main.py`
     - Environment Variable: `SUPADATA_API_KEY=your_api_key_here`

3. **Get Your Backend URL**
   - Render will give you a URL like: `https://your-app-name.onrender.com`

## Option 2: Deploy to Heroku

1. **Install Heroku CLI**
   ```bash
   # Install Heroku CLI first
   ```

2. **Deploy**
   ```bash
   heroku create your-app-name
   heroku config:set SUPADATA_API_KEY=your_api_key_here
   git push heroku main
   ```

## Option 3: Local Testing (Quick Test)

1. **Run locally**
   ```bash
   cd youtube_backend
   export SUPADATA_API_KEY="your_api_key_here"
   pip install -r requirements.txt
   python main.py
   ```

2. **Test with curl**
   ```bash
   curl "http://localhost:5000/transcript?url=https://youtu.be/jXsQ_0vA4ps"
   ```

## Update Android App

Once your backend is deployed, update the URL in `ProcessingViewModel.kt`:

```kotlin
val transcriptResult = com.shiva.magics.data.remote.YoutubeBackendService(
    backendBaseUrl = "https://your-actual-backend-url.onrender.com"  // Replace with your URL
).getTranscript(url)
```

## Test the Full Flow

1. **Deploy backend** with Supadata.ai API key
2. **Update Android app** with backend URL
3. **Install updated APK**
4. **Test with video**: https://youtu.be/jXsQ_0vA4ps

Expected logs:
```
YOUTUBE_FLOW: ✅ Transcript fetched successfully!
YOUTUBE_FLOW:   source   : supadata
YOUTUBE_FLOW:   title    : Khan Academy Video
YOUTUBE_FLOW:   lang     : en
YOUTUBE_FLOW:   chars    : 2341
```

---

**Your YouTube transcript fetching should now work reliably!** 🎯
