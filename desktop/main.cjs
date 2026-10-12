// Highrise desktop shell (Electron). Serves the web build from ./game over a
// custom app:// scheme, stores saves in the user data folder, and optionally
// talks to Steam via steamworks.js.
const { app, BrowserWindow, ipcMain, Menu, protocol, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const GAME_DIR = path.join(__dirname, 'game');
const SPACEWAR = 480; // Valve's public test app id
const DECK = process.env.SteamDeck === '1'; // set by Steam on Steam Deck (gaming and desktop mode)

// Linux (incl. Steam Deck): Chromium's setuid sandbox helper can't work inside Steam's runtime container
// or from a depot (no root-owned chrome-sandbox), so Electron would abort at launch. The game only loads
// its own bundled files, with context isolation on.
if (process.platform === 'linux') app.commandLine.appendSwitch('no-sandbox');

// ------------------------------------------------------------------ Steam (optional)

function steamAppId() {
  if (process.env.STEAM_APP_ID) return Number(process.env.STEAM_APP_ID);
  try { return Number(JSON.parse(fs.readFileSync(path.join(__dirname, 'steam.json'), 'utf8')).appId) || 0; }
  catch { return 0; }
}

let steam = null;
let steamInfo = { enabled: false, player: '' };
const appId = steamAppId();
if (appId) {
  try {
    const sw = require('steamworks.js');
    // When shipped on Steam, relaunch through the Steam client if started directly.
    if (app.isPackaged && appId !== SPACEWAR && sw.restartAppIfNecessary(appId)) app.exit(0);
    steam = sw.init(appId);
    sw.electronEnableSteamOverlay();
    steamInfo = { enabled: true, player: steam.localplayer.getName() };
    console.log(`[steam] connected as ${steamInfo.player} (app ${appId})`);
  } catch (e) {
    console.warn('[steam] disabled:', e.message);
  }
}

// ------------------------------------------------------------------ saves

const savePath = () => path.join(app.getPath('userData'), 'save.json');

ipcMain.on('save:read', e => {
  try { e.returnValue = fs.readFileSync(savePath(), 'utf8') || null; }
  catch { e.returnValue = null; }
});
ipcMain.on('save:write', (e, data) => {
  try {
    if (!data) { fs.rmSync(savePath(), { force: true }); e.returnValue = true; return; }
    const tmp = savePath() + '.tmp';
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, savePath()); // atomic replace
    e.returnValue = true;
  } catch (err) {
    console.error('save failed', err);
    e.returnValue = false;
  }
});
ipcMain.on('steam:info', e => { e.returnValue = steamInfo; });
ipcMain.on('app:info', e => { e.returnValue = { deck: DECK }; });
ipcMain.on('steam:achievement', (_e, id) => {
  try { steam?.achievement.activate(String(id)); } catch (err) { console.warn('[steam] achievement', id, err.message); }
});

// ------------------------------------------------------------------ window

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
const send = act => win?.webContents.send('menu', act);

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Highrise',
    backgroundColor: '#05070f',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 20, y: 19 }, // vertically centred in the 52px game toolbar
    autoHideMenuBar: process.platform !== 'darwin',
    fullscreen: DECK || process.argv.includes('--fullscreen'),
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  const smoke = process.env.HIGHRISE_SMOKE; // automated check: render, screenshot, quit
  if (!smoke) win.once('ready-to-show', () => win.show());
  else {
    win.webContents.on('console-message', e => console.log(`[renderer:${e.level}] ${e.message}`));
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      fs.writeFileSync(smoke, (await win.webContents.capturePage()).toPNG());
      // click through the splash and capture the title menu over the live sim
      await win.webContents.executeJavaScript(`document.getElementById('splash').dispatchEvent(new PointerEvent('pointerdown'))`);
      await new Promise(r => setTimeout(r, 2500));
      fs.writeFileSync(smoke.replace(/\.png$/, '-2.png'), (await win.webContents.capturePage()).toPNG());
      // and the Handbook, open on the Controls page
      await win.webContents.executeJavaScript(`document.querySelector('[data-act=handbook]').click(); document.querySelector('#hbNav [data-page=controls]').click()`);
      await new Promise(r => setTimeout(r, 600));
      fs.writeFileSync(smoke.replace(/\.png$/, '-3.png'), (await win.webContents.capturePage()).toPNG());
      const info = await win.webContents.executeJavaScript('JSON.stringify({ native: !!window.native, platform: window.native?.platform, deck: window.native?.deck, steam: window.native?.steam, title: document.title })');
      console.log('[smoke]', info);
      app.quit();
    }, 4000));
  }
  win.webContents.setVisualZoomLevelLimits(1, 1);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://game/index.html');
}

ipcMain.on('app:fullscreen', () => win?.setFullScreen(!win.isFullScreen()));
ipcMain.on('app:quit', () => app.quit());

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Game',
      submenu: [
        { label: 'Save Tower', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Pause Menu', accelerator: 'Escape', registerAccelerator: false, click: () => send('menu') },
        { label: 'Mute / Unmute', accelerator: 'CmdOrCtrl+Shift+M', click: () => send('mute') },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  protocol.handle('app', req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(GAME_DIR, decodeURIComponent(pathname)));
    if (!file.startsWith(GAME_DIR)) return new Response('Not found', { status: 404 });
    if (file.endsWith('.wasm')) {
      return new Response(fs.readFileSync(file), { headers: { 'content-type': 'application/wasm' } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
  app.setAboutPanelOptions({
    applicationName: 'Highrise',
    applicationVersion: app.getVersion(),
    credits: 'A tower-building sim. Simulation in Rust + WebAssembly.',
  });
  buildMenu();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
