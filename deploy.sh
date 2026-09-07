#!/bin/bash
# Smart Calendar - Production Update & Deployment Script
set -e

echo "🚀 Starting deployment..."

# Navigate to project directory
cd "$(dirname "$0")"

# Pull latest code
echo "📥 Pulling latest code from Git..."
git pull origin main

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --legacy-peer-deps || npm install

# Generate Prisma client
echo "🔄 Generating Prisma Client..."
npx prisma generate

# Build Next.js application
echo "🏗️ Building Next.js application..."
npm run build

# Reload PM2 process
echo "♻️ Reloading PM2 process..."
pm2 reload smart-calendar || pm2 start ecosystem.config.cjs

echo "✅ Deployment successful and live!"
