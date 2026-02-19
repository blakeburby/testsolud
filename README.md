# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Git Auto-Sync Setup

This repository includes an automatic Git sync system that keeps your local changes synchronized with GitHub. This is especially useful when working in Cursor or antigravity development environments.

### Quick Start

**Option 1: Manual Sync**
```bash
./scripts/git-auto-sync.sh
```

**Option 2: Continuous Watching (Recommended)**
```bash
./scripts/watch-and-commit.sh
```

This will automatically commit your changes as you work. Press `Ctrl+C` to stop.

### Features

- ✅ **Automatic Commits** - Changes are automatically committed with descriptive messages
- ✅ **Safety Checks** - Pre-commit hooks prevent committing sensitive data (.env files, API keys, etc.)
- ✅ **Configurable** - Adjust settings via `.auto-sync-config.json`
- ✅ **Cooldown Periods** - Prevents excessive commits with configurable delays
- ✅ **Optional Auto-Push** - Can automatically push to GitHub (disabled by default for safety)

### Configuration

Edit `.auto-sync-config.json` to customize behavior:

```json
{
  "autoCommitEnabled": true,
  "autoPushEnabled": false,
  "commitCooldown": 5,
  "pushCooldown": 60
}
```

### Safety Features

The system includes pre-commit hooks that automatically check for:
- `.env` files (environment variables)
- API keys and secrets in code
- Large files (>10MB by default)
- Private key files (`.pem`, `.key`)

If any safety check fails, the commit is blocked.

### Enabling Auto-Push

⚠️ **Warning:** Auto-push will automatically push commits to GitHub. Only enable if you're comfortable with this.

To enable:
1. Edit `.auto-sync-config.json` and set `"autoPushEnabled": true`
2. Or set `GIT_AUTO_PUSH=true` environment variable

### Requirements

For file watching, you need:
- **macOS**: `brew install fswatch`
- **Linux**: `sudo apt-get install inotify-tools`

### Documentation

For detailed documentation, see [scripts/README.md](./scripts/README.md)

### Disabling Auto-Sync

To disable:
1. Set `"autoCommitEnabled": false` in `.auto-sync-config.json`
2. Or set `GIT_AUTO_COMMIT=false` environment variable
3. Or stop the file watcher with `Ctrl+C`
