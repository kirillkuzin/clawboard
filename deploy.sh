#!/bin/bash
set -e

REPO_DIR="/var/lib/openclaw/clawboard"
COMPOSE_ENV="CLAWBOARD_PORT=4200 OPENCLAW_API_URL=http://172.22.0.1:18789"

cd "$REPO_DIR"

git fetch origin main --quiet

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "No changes, skipping deploy."
  exit 0
fi

echo "New commits detected, deploying..."
git pull origin main

eval "$COMPOSE_ENV docker compose up -d --build"
echo "Deploy done: $REMOTE"
