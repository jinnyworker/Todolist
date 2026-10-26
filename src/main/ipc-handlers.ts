import fs from 'node:fs';

import { BrowserWindow, ClipboardItem, clipboard, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';

import { toDateString } from '../shared/dates';
import { IPC_CHANNELS, type IpcChannel } from '../shared/ipc-channels';
import type { ExportInput, ShareInput, ShareResult } from '../shared/types';
import { AppError, invalid, toErrorResult } from './errors';
import type { Services } from './services';
import { requireDate, requireObject } from './services/validate';

type Handler = (payload: unknown, event: IpcMainInvokeEvent) => unknown;

const EXPORT_TABLES = ['task', 'task_status_history', 'tag', 'task_tag', 'recurrence_rule', 'app_setting'];
const canceled = (): AppError => new AppError('CANCELED', '취소되었습니다.');

export function setupIpcHandlers(services: Services, onDataChanged: () => void): void {
  const { db, tasks, stats, tags, recurrence, settings, share } = services;

  /** 모든 핸들러를 공통 응답 형식으로 감싼다. 변경 API는 성공 후 파일에 저장한다. */
  const handle = (channel: IpcChannel, handler: Handler, mutates = false): void => {
    ipcMain.handle(channel, async (event, payload: unknown) => {
      try {
        const data = await handler(payload ?? {}, event);
        if (mutates) {
          db.save();
          onDataChanged();
        }
        return { success: true, data };
      } catch (err) {
        return toErrorResult(err);
      }
    });
  };

  handle(IPC_CHANNELS.TASK_LIST, (p) => tasks.list(p));
  handle(IPC_CHANNELS.TASK_CREATE, (p) => tasks.create(p), true);
  handle(IPC_CHANNELS.TASK_UPDATE, (p) => tasks.update(p), true);
  handle(IPC_CHANNELS.TASK_DELETE, (p) => tasks.delete(p), true);
  handle(IPC_CHANNELS.TASK_BULK_CREATE, (p) => tasks.bulkCreate(p), true);
  handle(IPC_CHANNELS.TASK_REORDER, (p) => tasks.reorder(p), true);
  handle(IPC_CHANNELS.TASK_CHANGE_STATUS, (p) => tasks.changeStatus(p), true);
  handle(IPC_CHANNELS.TASK_HISTORY, (p) => tasks.history(p));
  handle(IPC_CHANNELS.CALENDAR_MONTH_SUMMARY, (p) => stats.monthSummary(p));
  handle(IPC_CHANNELS.STATS_WEEKLY, (p) => stats.weekly(p));
  handle(IPC_CHANNELS.TAG_LIST, () => tags.list());
  handle(IPC_CHANNELS.TAG_SAVE, (p) => tags.save(p), true);
  handle(IPC_CHANNELS.TAG_DELETE, (p) => tags.delete(p), true);
  handle(IPC_CHANNELS.RECURRENCE_LIST, () => recurrence.list());
  handle(IPC_CHANNELS.RECURRENCE_SAVE, (p) => recurrence.save(p), true);
  handle(IPC_CHANNELS.RECURRENCE_DELETE, (p) => recurrence.delete(p), true);
  handle(IPC_CHANNELS.SETTINGS_GET, () => settings.get());
  handle(IPC_CHANNELS.SETTINGS_UPDATE, (p) => settings.update(p), true);

  handle(IPC_CHANNELS.DATA_EXPORT, async (p, event) => {
    const { format } = requireObject(p) as unknown as ExportInput;
    if (format !== 'sqlite' && format !== 'json') throw invalid('내보내기 형식이 올바르지 않습니다.');
    const extension = format === 'sqlite' ? 'db' : 'json';
    const filePath = await askSavePath(event, `todolist-backup-${stamp()}.${extension}`, [
      { name: format === 'sqlite' ? 'SQLite DB' : 'JSON', extensions: [extension] },
    ]);
    const bytes =
      format === 'sqlite'
        ? Buffer.from(db.exportBytes())
        : Buffer.from(
            JSON.stringify(
              Object.fromEntries(EXPORT_TABLES.map((table) => [table, db.all(`SELECT * FROM ${table}`)])),
              null,
              2,
            ),
          );
    fs.writeFileSync(filePath, bytes);
    return { path: filePath, bytes: bytes.length };
  });

  handle(IPC_CHANNELS.SHARE_EXPORT, async (p, event): Promise<ShareResult> => {
    const input = requireObject(p) as unknown as ShareInput;
    if (input.scope !== 'day' && input.scope !== 'week') throw invalid('공유 대상이 올바르지 않습니다.');
    if (!['preview', 'clipboard', 'file'].includes(input.target)) throw invalid('공유 방식이 올바르지 않습니다.');

    // 텍스트·이미지 모두 대상 데이터가 있는지 먼저 확인한다 (없으면 NOT_FOUND).
    const text =
      input.scope === 'day'
        ? share.dayText(requireDate(input.date))
        : share.weekText(requireDate(input.weekStart, '주 시작일'));

    if (input.format === 'text') {
      if (input.target === 'file') throw invalid('텍스트는 클립보드 복사만 지원합니다.');
      if (input.target === 'clipboard') await clipboard.writeText(text);
      return { format: 'text', text, imageDataUrl: null, path: null };
    }
    if (input.format !== 'image') throw invalid('공유 형식이 올바르지 않습니다.');

    const image = await event.sender.capturePage(requireRect(input.rect));
    if (input.target === 'preview') return { format: 'image', text: null, imageDataUrl: image.toDataURL(), path: null };
    if (input.target === 'clipboard') {
      const png = new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' });
      await clipboard.write([new ClipboardItem({ 'image/png': png })]);
      return { format: 'image', text: null, imageDataUrl: null, path: null };
    }
    const filePath = await askSavePath(event, `todolist-${input.scope}-${stamp()}.png`, [
      { name: 'PNG 이미지', extensions: ['png'] },
    ]);
    fs.writeFileSync(filePath, image.toPNG());
    return { format: 'image', text: null, imageDataUrl: null, path: filePath };
  });
}

async function askSavePath(
  event: IpcMainInvokeEvent,
  defaultPath: string,
  filters: Electron.FileFilter[],
): Promise<string> {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = { defaultPath, filters };
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) throw canceled();
  return result.filePath;
}

function requireRect(value: unknown): Electron.Rectangle {
  const rect = requireObject(value);
  const keys = ['x', 'y', 'width', 'height'] as const;
  const out: Electron.Rectangle = {
    x: Math.round(Number(rect.x)),
    y: Math.round(Number(rect.y)),
    width: Math.round(Number(rect.width)),
    height: Math.round(Number(rect.height)),
  };
  if (keys.some((key) => !Number.isFinite(out[key]) || out[key] < 0) || out.width === 0 || out.height === 0) {
    throw invalid('캡처 영역이 올바르지 않습니다.');
  }
  return out;
}

const stamp = (): string => toDateString(new Date()).replaceAll('-', '');
