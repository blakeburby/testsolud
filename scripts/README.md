# Git Auto-Sync Scripts

This directory contains scripts for automatically syncing your local changes to GitHub.

## Overview

The auto-sync system automatically commits your changes and optionally pushes them to GitHub, ensuring your work in Cursor/antigravity stays synchronized with your GitHub repository.

## Scripts

### `git-auto-sync.sh`

Main script that handles automatic committing and pushing of changes.

**Features:**
- Automatically stages and commits changes
- Respects `.gitignore` rules
- Cooldown periods to prevent excessive commits
- Optional auto-push to GitHub
- Safety checks via pre-commit hooks

**Usage:**
```bash
./scripts/git-auto-sync.sh
```

**Environment Variables:**
- `GIT_AUTO_COMMIT=true/false` - Override auto-commit setting
- `GIT_AUTO_PUSH=true/false` - Override auto-push setting

### `watch-and-commit.sh`

File watcher that monitors the repository for changes and triggers auto-sync.

**Features:**
- Monitors all files in the repository
- Automatically triggers `git-auto-sync.sh` on file changes
- Excludes common build/cache directories
- Works on macOS (fswatch) and Linux (inotifywait)

**Usage:**
```bash
# Start the file watcher (runs until Ctrl+C)
./scripts/watch-and-commit.sh
```

**Requirements:**
- macOS: `brew install fswatch`
- Linux: `sudo apt-get install inotify-tools`

## Configuration

Configuration is stored in `.auto-sync-config.json` at the repository root.

### Configuration Options

- `autoCommitEnabled` (boolean) - Master switch for auto-commit
- `autoPushEnabled` (boolean) - Enable/disable auto-push to GitHub
- `commitCooldown` (seconds) - Minimum time between commits (default: 5)
- `pushCooldown` (seconds) - Minimum time between pushes (default: 60)
- `safetyChecks` (object) - Safety check settings
  - `checkEnvFiles` - Block .env files from being committed
  - `checkApiKeys` - Detect and warn about API keys in code
  - `checkLargeFiles` - Block files larger than maxFileSize
  - `maxFileSize` - Maximum file size in bytes (default: 10MB)

### Example Configuration

```json
{
  "autoCommitEnabled": true,
  "autoPushEnabled": false,
  "commitCooldown": 5,
  "pushCooldown": 60,
  "safetyChecks": {
    "checkEnvFiles": true,
    "checkApiKeys": true,
    "checkLargeFiles": true,
    "maxFileSize": 10485760
  }
}
```

## Safety Features

### Pre-commit Hook

The pre-commit hook (`.git/hooks/pre-commit`) automatically runs before each commit and checks for:

1. **Environment Files** - Prevents committing `.env` files
2. **API Keys** - Detects potential hardcoded API keys
3. **Large Files** - Blocks files larger than the configured limit
4. **Private Keys** - Prevents committing `.pem`, `.key`, or private key files

If any safety check fails, the commit is blocked and you'll see an error message.

## Workflow

### Option 1: Manual Sync

Run the sync script manually when you want to commit:

```bash
./scripts/git-auto-sync.sh
```

### Option 2: Continuous Watching

Start the file watcher to automatically sync on every change:

```bash
./scripts/watch-and-commit.sh
```

This will run in the foreground and watch for file changes. Press Ctrl+C to stop.

### Option 3: IDE Integration

You can configure your IDE (Cursor, VS Code, etc.) to run the sync script:
- On file save
- On file change
- Via a keyboard shortcut

## Enabling Auto-Push

**⚠️ Warning:** Auto-push will automatically push your commits to GitHub. Only enable this if you're comfortable with automatic pushes.

To enable auto-push:

1. Edit `.auto-sync-config.json`:
   ```json
   {
     "autoPushEnabled": true
   }
   ```

2. Or set environment variable:
   ```bash
   export GIT_AUTO_PUSH=true
   ```

3. Or temporarily enable for one session:
   ```bash
   GIT_AUTO_PUSH=true ./scripts/git-auto-sync.sh
   ```

## Troubleshooting

### Scripts not executable

If you get "Permission denied" errors:

```bash
chmod +x scripts/*.sh
```

### File watcher not found

Install the required tool:

**macOS:**
```bash
brew install fswatch
```

**Linux:**
```bash
sudo apt-get install inotify-tools
```

### Too many commits

If you're getting too many commits, increase the `commitCooldown` in `.auto-sync-config.json`:

```json
{
  "commitCooldown": 30  // Wait 30 seconds between commits
}
```

### Pre-commit hook blocking commits

The pre-commit hook is designed to prevent mistakes. If it's blocking a legitimate commit:

1. Check the error message to see what's wrong
2. Fix the issue (remove sensitive data, etc.)
3. Try committing again

If you need to bypass the hook temporarily (not recommended):

```bash
git commit --no-verify -m "your message"
```

## Best Practices

1. **Start with auto-push disabled** - Test the auto-commit feature first
2. **Review commits regularly** - Check `git log` to ensure commits look correct
3. **Use meaningful commit messages** - The auto-commit messages include timestamps and file lists
4. **Keep safety checks enabled** - They prevent accidental commits of sensitive data
5. **Monitor the repository** - Check GitHub to ensure changes are syncing correctly

## Integration with Antigravity

If you're using antigravity as your development environment:

1. The scripts will work the same way
2. You can run the file watcher in a terminal within antigravity
3. Changes made in antigravity will be automatically detected and committed
4. Ensure your antigravity environment has access to the git repository

## Disabling Auto-Sync

To disable auto-sync:

1. Edit `.auto-sync-config.json`:
   ```json
   {
     "autoCommitEnabled": false
   }
   ```

2. Or set environment variable:
   ```bash
   export GIT_AUTO_COMMIT=false
   ```

3. Or stop the file watcher (if running) with Ctrl+C
