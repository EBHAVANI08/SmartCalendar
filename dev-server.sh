#!/bin/bash
# DPS Smart Calendar - Dev Server Startup Script
# Uses Turbopack for fast page compilation

cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=4096"

echo "Starting DPS Smart Calendar dev server..."
npx next dev -p 3001
