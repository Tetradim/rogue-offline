# Pokerogue Pokemon Creator

A comprehensive GUI tool for creating and customizing Pokemon for Pokerogue.

## Downloads

### Windows Installer (Recommended)
- **[Pokerogue Pokemon Creator 1.0.0.exe](Pokerogue%20Pokemon%20Creator%201.0.0.exe)** (100 MB) - Portable executable, double-click to run
- Creates desktop shortcut automatically on first run

### Alternative
- **[Pokerogue Pokemon Creator Setup 1.0.0.exe](Pokerogue%20Pokemon%20Creator%20Setup%201.0.0.exe)** (185 KB) - NSIS installer with custom install location

## Features

- **Full Pokemon Customization**: Edit all attributes (stats, abilities, types, evolutions, moves, held items, etc.)
- **Create New Pokemon**: Generate custom Pokemon with unique IDs (1026+)
- **Quick Navigation**: Press A-Z to jump to Pokemon by name, 1-9 for tabs
- **Export Code**: Generate TypeScript ready for Pokerogue integration

## Quick Start (Development)

```bash
npm install
npm run dev    # Development
npm run build  # Production build
```

## Usage

1. Run the .exe file
2. Click a Pokemon to view/edit
3. Click "Edit" to modify values
4. Click "Export" to download TypeScript code

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| A-Z | Jump to Pokemon starting with letter |
| 1-9 | Switch editor tabs |
| Esc | Clear filters |

## Tech Stack

React 18 + TypeScript + Vite + Electron