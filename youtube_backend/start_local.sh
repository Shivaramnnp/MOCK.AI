#!/bin/bash
# Optimized backend starter with background (persistent) support
cd "$(dirname "$0")"

# 1. Kill any existing process on port 5002
PORT=5002
EXISTING_PID=$(lsof -t -i:$PORT)
if [ -n "$EXISTING_PID" ]; then
    echo "Stopping existing process on port $PORT (PID: $EXISTING_PID)..."
    kill -9 $EXISTING_PID
fi

# 2. Load API key from local.properties (one level up)
if [ -f "../local.properties" ]; then
    SUPADATA_KEY=$(grep "SUPADATA_API_KEY" ../local.properties | cut -d'=' -f2 | tr -d ' "' )
    export SUPADATA_API_KEY=$SUPADATA_KEY
fi

# 3. Activate venv
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# 4. Determine if we should run in background
RUN_DETACHED=false
if [[ "$1" == "--detach" || "$1" == "-d" ]]; then
    RUN_DETACHED=true
fi

export PORT=$PORT
echo "🚀 Starting YouTube Backend on port $PORT..."

if [ "$RUN_DETACHED" = true ]; then
    # Run with nohup to survive terminal close
    nohup python3 main.py > backend.log 2>&1 &
    echo "✅ Backend started in BACKGROUND (PID: $!)."
    echo "📝 Logs are being written to: youtube_backend/backend.log"
    echo "💡 You can safely close this terminal now."
else
    # Run in foreground
    python3 main.py
fi
