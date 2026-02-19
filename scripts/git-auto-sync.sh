#!/bin/bash

# Git Auto-Sync Script
# Automatically commits and optionally pushes changes to GitHub

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$REPO_ROOT/.auto-sync-config.json"

# Load configuration
if [ -f "$CONFIG_FILE" ]; then
    AUTO_COMMIT_ENABLED=$(grep -o '"autoCommitEnabled": *[^,}]*' "$CONFIG_FILE" | grep -o '[^:]*$' | tr -d ' ')
    AUTO_PUSH_ENABLED=$(grep -o '"autoPushEnabled": *[^,}]*' "$CONFIG_FILE" | grep -o '[^:]*$' | tr -d ' ')
    COMMIT_COOLDOWN=$(grep -o '"commitCooldown": *[^,}]*' "$CONFIG_FILE" | grep -o '[^:]*$' | tr -d ' ')
    PUSH_COOLDOWN=$(grep -o '"pushCooldown": *[^,}]*' "$CONFIG_FILE" | grep -o '[^:]*$' | tr -d ' ')
else
    AUTO_COMMIT_ENABLED=true
    AUTO_PUSH_ENABLED=false
    COMMIT_COOLDOWN=5
    PUSH_COOLDOWN=60
fi

# Override with environment variables if set
[ -n "$GIT_AUTO_COMMIT" ] && AUTO_COMMIT_ENABLED="$GIT_AUTO_COMMIT"
[ -n "$GIT_AUTO_PUSH" ] && AUTO_PUSH_ENABLED="$GIT_AUTO_PUSH"

# State files for cooldown tracking
COMMIT_STATE_FILE="$REPO_ROOT/.git/.auto-commit-state"
PUSH_STATE_FILE="$REPO_ROOT/.git/.auto-push-state"

# Check if auto-sync is enabled
if [ "$AUTO_COMMIT_ENABLED" != "true" ]; then
    echo -e "${YELLOW}Auto-commit is disabled${NC}"
    exit 0
fi

cd "$REPO_ROOT"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

# Check cooldown period
if [ -f "$COMMIT_STATE_FILE" ]; then
    LAST_COMMIT=$(cat "$COMMIT_STATE_FILE")
    CURRENT_TIME=$(date +%s)
    TIME_DIFF=$((CURRENT_TIME - LAST_COMMIT))
    
    if [ $TIME_DIFF -lt $COMMIT_COOLDOWN ]; then
        REMAINING=$((COMMIT_COOLDOWN - TIME_DIFF))
        echo -e "${YELLOW}Cooldown active. Waiting ${REMAINING}s before next commit${NC}"
        exit 0
    fi
fi

# Check if there are changes to commit
if git diff --quiet && git diff --cached --quiet; then
    echo -e "${GREEN}No changes to commit${NC}"
    exit 0
fi

# Run pre-commit hook if it exists
if [ -f "$REPO_ROOT/.git/hooks/pre-commit" ]; then
    if ! "$REPO_ROOT/.git/hooks/pre-commit"; then
        echo -e "${RED}Pre-commit checks failed${NC}"
        exit 1
    fi
fi

# Get list of changed files
CHANGED_FILES=$(git diff --name-only --cached 2>/dev/null || git diff --name-only 2>/dev/null | head -10)
FILE_COUNT=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')

# Create commit message
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
if [ $FILE_COUNT -le 3 ]; then
    FILES_LIST=$(echo "$CHANGED_FILES" | tr '\n' ', ' | sed 's/, $//')
    COMMIT_MSG="Auto-commit: $TIMESTAMP - $FILES_LIST"
else
    COMMIT_MSG="Auto-commit: $TIMESTAMP - $FILE_COUNT files changed"
fi

# Stage all changes (respecting .gitignore)
git add -A

# Commit changes
if git commit -m "$COMMIT_MSG" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Committed: $COMMIT_MSG${NC}"
    echo $(date +%s) > "$COMMIT_STATE_FILE"
    
    # Auto-push if enabled
    if [ "$AUTO_PUSH_ENABLED" = "true" ]; then
        # Check push cooldown
        if [ -f "$PUSH_STATE_FILE" ]; then
            LAST_PUSH=$(cat "$PUSH_STATE_FILE")
            CURRENT_TIME=$(date +%s)
            TIME_DIFF=$((CURRENT_TIME - LAST_PUSH))
            
            if [ $TIME_DIFF -ge $PUSH_COOLDOWN ]; then
                if git push origin main > /dev/null 2>&1 || git push origin master > /dev/null 2>&1; then
                    echo -e "${GREEN}✓ Pushed to GitHub${NC}"
                    echo $(date +%s) > "$PUSH_STATE_FILE"
                else
                    echo -e "${YELLOW}⚠ Push failed (this is normal if remote is ahead)${NC}"
                fi
            else
                REMAINING=$((PUSH_COOLDOWN - TIME_DIFF))
                echo -e "${YELLOW}Push cooldown active. Next push in ${REMAINING}s${NC}"
            fi
        else
            # First push, no cooldown
            if git push origin main > /dev/null 2>&1 || git push origin master > /dev/null 2>&1; then
                echo -e "${GREEN}✓ Pushed to GitHub${NC}"
                echo $(date +%s) > "$PUSH_STATE_FILE"
            else
                echo -e "${YELLOW}⚠ Push failed (this is normal if remote is ahead)${NC}"
            fi
        fi
    fi
else
    echo -e "${YELLOW}No changes to commit${NC}"
fi

exit 0
