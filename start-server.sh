#!/bin/bash
# DPS Smart Calendar - Server Startup Script
# Uses production build for better memory management

cd /home/z/my-project/.next/standalone

export DATABASE_URL="file:/home/z/my-project/db/custom.db"
export NODE_OPTIONS="--max-old-space-size=2048"

# Keep trying to restart the server if it crashes
while true; do
  echo "[$(date)] Starting server..."
  node server.js
  EXIT_CODE=$?
  echo "[$(date)] Server exited with code $EXIT_CODE"
  if [ $EXIT_CODE -ne 0 ]; then
    echo "[$(date)] Restarting in 3 seconds..."
    sleep 3
  else
    break
  fi
done
