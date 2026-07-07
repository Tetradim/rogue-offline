# Pokerogue Pokemon Creator

**Quick Start:**
1. Run **Launch.bat**
2. App auto-updates and opens at http://localhost:5173

## Features

- **Auto-Updater**: Checks GitHub for updates on every launch
- **Lightweight**: Downloads only changed files
- **Offline Mode**: Works without internet connection

## Structure

```
Tool/
├── dist/                  (application files)
├── Launch.bat             (launcher with auto-update)
├── Launch.bat.ps1         (HTTP server)
├── Updater.ps1            (auto-updater script)
└── README.md
```

## Auto-Updater

The tool automatically checks for updates from:
`https://github.com/Tetradim/rogue-offline/tree/move-audio-to-tetradim/Tool`

On each launch:
1. Compares local version with GitHub
2. Downloads only changed files
3. Launches the application

## Troubleshooting

**Updater fails?**
- Check your internet connection
- Try running as Administrator
- The app will still work offline with current files