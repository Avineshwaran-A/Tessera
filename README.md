# Tessera

Tessera is a desktop visual workspace for nested boards: notes, checklists, images, files, links, frames and connections on an infinite canvas. It was engineered independently from a functional study of Milanote (see `docs/`).


## Download

**[⬇ Windows (64-bit)](https://github.com/Avineshwaran-A/Tessera/releases/latest/download/Tessera-0.1.0-windows-x64.zip)** · **[⬇ Linux AppImage](https://github.com/Avineshwaran-A/Tessera/releases/latest/download/Tessera-0.1.0-linux-x86_64.AppImage)** · **[⬇ Linux .tar.gz](https://github.com/Avineshwaran-A/Tessera/releases/latest/download/Tessera-0.1.0-linux-x64.tar.gz)**

The links download the file directly. All versions and checksums are on the **[Releases page](https://github.com/Avineshwaran-A/Tessera/releases/latest)**.

| Platform | Download | How to run |
|---|---|---|
| **Windows 10/11** (64-bit) | [Tessera-0.1.0-windows-x64.zip](https://github.com/Avineshwaran-A/Tessera/releases/latest/download/Tessera-0.1.0-windows-x64.zip) (121 MB) | Unzip the whole folder and run `Tessera.exe`. SmartScreen may warn about an unsigned app: choose **More info → Run anyway**. |
| **Linux** (AppImage) | [Tessera-0.1.0-linux-x86_64.AppImage](https://github.com/Avineshwaran-A/Tessera/releases/latest/download/Tessera-0.1.0-linux-x86_64.AppImage) (118 MB) | `chmod +x Tessera-*.AppImage`, then run it. Works on most distros. If it won't start, install `libfuse2`. |
| **Linux** (archive) | [Tessera-0.1.0-linux-x64.tar.gz](https://github.com/Avineshwaran-A/Tessera/releases/latest/download/Tessera-0.1.0-linux-x64.tar.gz) (112 MB) | Extract it and run `./tessera` inside the folder. |

Your boards save automatically to `%APPDATA%\Tessera` on Windows and `~/.config/Tessera` on Linux.

## Build from source (Electron)

```bash
npm install
npm run desktop:dev     # live-reload: Vite + Electron window
npm run desktop         # production build in an Electron window
npm run dist            # Linux AppImage → release/Tessera-<version>.AppImage
```

**Windows:** `npm run dist:win-zip` builds `release/Tessera-<version>-windows-x64.zip` on any OS (no Wine needed). Unzip it and run `Tessera.exe`. The app icon and version info are stamped into the exe by `build/stamp-win-exe.cjs`. `npm run dist:win` builds a Setup installer plus a single-file portable exe. On Windows that works out of the box. On Linux it needs Wine (`sudo apt install wine64`).

`npm run dist:mac` builds a macOS dmg when run on a Mac. `npm run dist:deb` needs a `homepage` field in `package.json` first.

- **Data:** your workspace is saved automatically to `workspace.json` in the app data folder (`~/.config/Tessera` on Linux), with a `.bak` of the previous save. Writes are atomic. Images and files live in the app's IndexedDB in the same folder. **File → Show Data Folder** opens it.
- **Menus:** File (new blocks, import/export, data folder), Edit, View (palette, zoom, fit, theme, full screen), Go (home, parent board). Menu items run the same commands as the Ctrl+K palette.
- **Offline:** fonts are bundled. Only link favicons are fetched from the network.
- **Security:** context isolation, sandboxed renderer, and no Node in the page. A narrow preload bridge (`window.tesseraNative`) handles load/save/import/export. External links open in your system browser, and a strict Content-Security-Policy applies in production.

## Web build

`npm run dev` still serves the same app in a browser, saving to localStorage. The first desktop launch adopts any web-build data found in its profile.

## Docs

[functional analysis](docs/01-functional-analysis.md) · [design](docs/02-design.md) · [architecture & integration seams](docs/03-architecture.md) · [interaction & motion spec](docs/04-interaction-analysis.md)

Agents can drive the app through `window.tessera` (`dispatch`, `addBlock`, `query.board`, `query.search`, `registerBlock`, `registerCommand`, `on('action')`).
