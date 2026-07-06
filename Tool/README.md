# Pokerogue Pokemon Creator (Fixed)

**Quick Start:**
1. Put your `dist` folder next to this file (or inside Tool/dist)
2. Run **Launch.bat**
3. App opens in browser at http://localhost:5173

The audio files were moved — this Tool is now clean and independent.

## Final Structure

```
Tool/
├── dist/                  (your existing built folder with assets/)
├── Launch.bat
├── Launch.bat.ps1
├── index.html
└── README.md
```

## How to Apply

1. Delete old index.html, launcher.html, and any other loose junk in Tool.
2. Create the 4 files above.
3. Run Launch.bat from the Tool folder.

This version:
- Automatically falls back to dist/ if present
- Has better error handling
- Points correctly to assets
- Removes the old redundant launcher.html