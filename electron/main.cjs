// Tessera desktop shell (Electron main process).
// The renderer is the same Vite app; persistence is routed to files in userData via a narrow IPC bridge.
const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const DEV_URL = process.env.TESSERA_DEV_URL; // set by `npm run desktop:dev`
const isMac = process.platform === 'darwin';
const dataDir = () => app.getPath('userData');
const wsFile = () => path.join(dataDir(), 'workspace.json');
const winFile = () => path.join(dataDir(), 'window.json');

app.setName('Tessera');
if (!app.requestSingleInstanceLock()) app.quit();

// ---------- storage ----------
function readJSON(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } }
/** Atomic write: temp file + rename, keeping the previous version as a .bak. */
function writeAtomic(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.bak'); } catch {} }
  fs.renameSync(tmp, file);
}
function validWorkspace(text) {
  try { const w = JSON.parse(text); return w && w.version === 1 && w.boards && w.blocks && w.threads && w.rootId; } catch { return false; }
}

ipcMain.on('ws:load', e => {
  const t = readJSON(wsFile());
  if (t && validWorkspace(t)) return (e.returnValue = t);
  const bak = readJSON(wsFile() + '.bak');
  e.returnValue = bak && validWorkspace(bak) ? bak : null;
});
ipcMain.handle('ws:save', (_e, text) => {
  if (typeof text !== 'string' || !validWorkspace(text)) return false;
  try { writeAtomic(wsFile(), text); return true; } catch { return false; }
});
ipcMain.on('ws:saveSync', (e, text) => {
  try { if (typeof text === 'string' && validWorkspace(text)) writeAtomic(wsFile(), text); e.returnValue = true; } catch { e.returnValue = false; }
});
ipcMain.handle('ws:export', async (e, text) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showSaveDialog(win, { title: 'Export workspace', defaultPath: 'tessera-workspace.json', filters: [{ name: 'Tessera workspace', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, text); return true;
});
ipcMain.handle('ws:import', async e => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, { title: 'Import workspace', properties: ['openFile'], filters: [{ name: 'Tessera workspace', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const t = readJSON(r.filePaths[0]);
  return t && validWorkspace(t) ? t : null;
});
ipcMain.handle('app:revealData', () => shell.openPath(dataDir()));

// ---------- window controls for the in-app title bar ----------
const senderWin = e => BrowserWindow.fromWebContents(e.sender);
ipcMain.on('win:minimize', e => senderWin(e)?.minimize());
ipcMain.on('win:toggleMaximize', e => { const w = senderWin(e); if (!w) return; w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.on('win:close', e => senderWin(e)?.close());
ipcMain.on('win:toggleFullscreen', e => { const w = senderWin(e); if (w) w.setFullScreen(!w.isFullScreen()); });
ipcMain.on('win:devtools', e => { if (DEV_URL || !app.isPackaged) e.sender.toggleDevTools(); });
ipcMain.on('win:state', e => { const w = senderWin(e); e.returnValue = { maximized: !!w?.isMaximized(), fullscreen: !!w?.isFullScreen() }; });
ipcMain.on('app:info', e => { e.returnValue = { version: app.getVersion(), dataDir: dataDir(), dev: !!DEV_URL || !app.isPackaged }; });
ipcMain.on('app:quit', () => app.quit());

// ---------- window ----------
function createWindow() {
  let state = { width: 1360, height: 860 };
  try { state = { ...state, ...JSON.parse(readJSON(winFile()) || '{}') }; } catch {}
  const win = new BrowserWindow({
    ...state, minWidth: 720, minHeight: 480, show: false, title: 'Tessera',
    backgroundColor: '#1b1a18',
    // the app draws its own title bar (menus + window controls) so the chrome matches the canvas
    ...(isMac ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 12 } } : { frame: false }),
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  if (state.maximized) win.maximize();
  if (!isMac) win.removeMenu(); // menus live in the in-app title bar on Linux/Windows
  const sendMax = () => win.webContents.send('win:state', { maximized: win.isMaximized(), fullscreen: win.isFullScreen() });
  ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'].forEach(ev => win.on(ev, sendMax));
  win.on('focus', () => win.webContents.send('win:focus', true));
  win.on('blur', () => win.webContents.send('win:focus', false));
  win.once('ready-to-show', () => win.show());

  const saveState = () => { try { const b = win.getNormalBounds(); fs.writeFileSync(winFile(), JSON.stringify({ ...b, maximized: win.isMaximized() })); } catch {} };
  win.on('close', saveState);

  // links open in the system browser; the app never navigates away from itself
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => {
    const own = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!own) { ev.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); }
  });
  // the canvas owns Ctrl+/-/0 zoom; keep the page itself at 100%
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.on('zoom-changed', () => win.webContents.setZoomLevel(0));

  if (DEV_URL) win.loadURL(DEV_URL); else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

// ---------- menu: items forward to registered renderer commands ----------
function buildMenu() {
  const send = id => () => BrowserWindow.getFocusedWindow()?.webContents.send('app:command', id);
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'New Note', click: send('add.note') },
      { label: 'New Checklist', click: send('add.todo') },
      { label: 'New Board', click: send('add.board') },
      { label: 'Upload Images or Files…', click: send('add.upload') },
      { type: 'separator' },
      { label: 'Import Workspace…', click: send('data.import') },
      { label: 'Export Workspace…', click: send('data.export') },
      { label: 'Show Data Folder', click: () => shell.openPath(dataDir()) },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { label: 'Edit', submenu: [
      // canvas undo/redo are handled in the page (Ctrl+Z / Ctrl+Shift+Z); these entries are for discoverability
      { label: 'Undo', click: send('edit.undo') },
      { label: 'Redo', click: send('edit.redo') },
      { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { type: 'separator' },
      { label: 'Duplicate Selection', click: send('edit.duplicate') },
      { label: 'Delete Selection', click: send('edit.delete') },
      { label: 'Select All Blocks', click: send('edit.selectAll') },
    ] },
    { label: 'View', submenu: [
      { label: 'Command Palette…', click: send('palette') },
      { type: 'separator' },
      { label: 'Zoom In', click: send('view.zoomIn') },
      { label: 'Zoom Out', click: send('view.zoomOut') },
      { label: 'Zoom to Fit', click: send('view.fit') },
      { label: 'Actual Size', click: send('view.reset') },
      { type: 'separator' },
      { label: 'Toggle Light / Dark', click: send('view.theme') },
      { role: 'togglefullscreen' },
      ...(DEV_URL || !app.isPackaged ? [{ role: 'toggleDevTools' }, { role: 'reload' }] : []),
    ] },
    { label: 'Go', submenu: [
      { label: 'Home Board', click: send('nav.home') },
      { label: 'Parent Board', click: send('nav.up') },
    ] },
    { label: 'Help', submenu: [{ label: 'About Tessera', click: () => dialog.showMessageBox({ title: 'Tessera', message: `Tessera ${app.getVersion()}`, detail: 'A visual workspace for nested boards.\nData folder: ' + dataDir() }) }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
