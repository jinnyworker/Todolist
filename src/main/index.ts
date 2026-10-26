import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { BrowserWindow, app, shell, type Tray } from 'electron';

import { UI_EVENTS, type UiEvent } from '../shared/ipc-channels';
import { Database } from './db/database';
import { setupIpcHandlers } from './ipc-handlers';
import { notify, startScheduler } from './scheduler';
import { createServices, type Services } from './services';
import { INTERNAL_KEYS } from './services/settingsService';
import { runSmokeTest } from './smoke';
import { createTray } from './tray';

const APP_ID = 'com.jinny.todolist';
const isSmoke = process.argv.includes('--smoke');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let services: Services | null = null;
let isQuitting = false;

if (isSmoke) {
  // 스모크 테스트는 실제 데이터와 섞이지 않게 임시 폴더를 쓴다.
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'todolist-smoke-')));
}

if (!isSmoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(start).catch((err) => {
    console.error(err);
    app.exit(1);
  });
}

async function start(): Promise<void> {
  app.setAppUserModelId(APP_ID);
  const db = await Database.open(path.join(app.getPath('userData'), 'todolist.db'));
  services = createServices(db);
  services.recurrence.generateDue();
  db.save();

  setupIpcHandlers(services, () => send(UI_EVENTS.DATA_CHANGED));
  startScheduler(services, {
    showWindow,
    openBulk,
    onDateChanged: (date) => {
      // 자정에 반복 할 일이 새로 생겼을 수 있으므로 목록도 다시 불러오게 한다.
      send(UI_EVENTS.DATE_CHANGED, date);
      send(UI_EVENTS.DATA_CHANGED);
    },
  });

  createWindow();
  if (isSmoke) {
    runSmokeTest(mainWindow!, services);
    return;
  }
  tray = createTray(path.join(app.getAppPath(), 'resources', 'icon.png'), {
    show: showWindow,
    openBulk,
    quit: () => {
      isQuitting = true;
      app.quit();
    },
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'TODOLIST',
    icon: path.join(app.getAppPath(), 'resources', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (!isSmoke) mainWindow?.show();
  });

  // 창의 ✕는 종료가 아니라 트레이로 숨기기. 완전 종료는 트레이 메뉴의 "종료".
  mainWindow.on('close', (event) => {
    if (isQuitting || isSmoke) return;
    event.preventDefault();
    mainWindow?.hide();
    showTrayNoticeOnce();
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://');
    if (!allowed) {
      event.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function showWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function openBulk(): void {
  showWindow();
  send(UI_EVENTS.OPEN_BULK);
}

function send(channel: UiEvent, payload?: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function showTrayNoticeOnce(): void {
  if (!services || services.settings.getRaw(INTERNAL_KEYS.TRAY_NOTICE_SHOWN) === 'true') return;
  services.settings.setRaw(INTERNAL_KEYS.TRAY_NOTICE_SHOWN, 'true');
  services.db.save();
  notify('TODOLIST', '트레이에서 계속 실행됩니다. 종료하려면 트레이 메뉴에서 "종료"를 누르세요.');
}

app.on('before-quit', () => {
  isQuitting = true;
  services?.db.close();
  tray?.destroy();
});

// 트레이 상주 앱이라 모든 창이 닫혀도 종료하지 않는다.
app.on('window-all-closed', () => {
  if (isSmoke) app.quit();
});
