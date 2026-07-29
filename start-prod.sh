#!/bin/bash
cd /home/z/my-project/.next/standalone
export DATABASE_URL="file:./db/custom.db"
export NODE_OPTIONS="--max-old-space-size=2048"
exec node server.js
