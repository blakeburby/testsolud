#!/bin/bash

# File Watcher Script
# Monitors repository for changes and triggers auto-commit

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SYNC_SCRIPT="$SCRIPT_DIR/git-auto-sync.sh"

# Check if fswatch is installed (macOS)
if command -v fswatch &> /dev/null; then
    WATCHER="fswatch"
elif command -v inotifywait &> /dev/null; then
    WATCHER="inotifywait"
else
    echo -e "${YELLOW}Warning: fswatch (macOS) or inotifywait (Linux) not found${NC}"
    echo -e "${YELLOW}Install fswatch: brew install fswatch${NC}"
    echo -e "${YELLOW}Or install inotifywait: sudo apt-get install inotify-tools${NC}"
    exit 1
fi

cd "$REPO_ROOT"

echo -e "${BLUE}Starting file watcher...${NC}"
echo -e "${GREEN}Watching: $REPO_ROOT${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Exclude patterns
EXCLUDE_PATTERNS=(
    ".git"
    "node_modules"
    "dist"
    "build"
    "*.log"
    ".DS_Store"
    "__pycache__"
    "venv"
    "env"
    ".env"
)

# Build exclude flags for fswatch
EXCLUDE_FLAGS=""
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    EXCLUDE_FLAGS="$EXCLUDE_FLAGS -e $pattern"
done

# Watch for changes
if [ "$WATCHER" = "fswatch" ]; then
    fswatch -o -r -l 1 $EXCLUDE_FLAGS "$REPO_ROOT" | while read num; do
        echo -e "${BLUE}Change detected, running auto-sync...${NC}"
        "$SYNC_SCRIPT" || true
    done
elif [ "$WATCHER" = "inotifywait" ]; then
    while inotifywait -r -e modify,create,delete,move --exclude '\.(git|log|tmp)' "$REPO_ROOT" 2>/dev/null; do
        echo -e "${BLUE}Change detected, running auto-sync...${NC}"
        sleep 1  # Small delay to batch multiple rapid changes
        "$SYNC_SCRIPT" || true
    done
fi
