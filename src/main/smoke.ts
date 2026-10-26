import fs from 'node:fs';
import path from 'node:path';

import { app, type BrowserWindow } from 'electron';

import { addDays, today, weekStartOf } from '../shared/dates';
import { UI_EVENTS } from '../shared/ipc-channels';
import type { Services } from './services';

const SMOKE_TITLE = '스모크 확인용 할 일';
const TIMEOUT_MS = 15_000;

/**
 * `electron . --smoke`: 빌드된 앱을 띄워 Renderer 렌더링, preload 노출, IPC 왕복을 확인하고 종료한다.
 * 결과는 stdout에 SMOKE_RESULT 한 줄로 남기고 성공 0 / 실패 1로 끝난다.
 */
export function runSmokeTest(window: BrowserWindow, services: Services): void {
  const date = today();
  services.tasks.create({ title: SMOKE_TITLE, taskDate: date, priority: 'high' });

  const fail = (reason: string): void => {
    console.log(`SMOKE_RESULT ${JSON.stringify({ ok: false, reason })}`);
    app.exit(1);
  };
  const timer = setTimeout(() => fail('timeout'), TIMEOUT_MS);

  window.webContents.once('did-finish-load', async () => {
    try {
      const result = await window.webContents.executeJavaScript(`
        (async () => {
          const waitFor = async (check) => {
            for (let i = 0; i < 100; i++) {
              if (check()) return true;
              await new Promise((r) => setTimeout(r, 100));
            }
            return false;
          };
          const rendered = await waitFor(() => document.body.innerText.includes(${JSON.stringify(SMOKE_TITLE)}));
          const created = await window.electronAPI.task.create({ title: '스모크 IPC', taskDate: ${JSON.stringify(date)} });
          const list = await window.electronAPI.task.list({ date: ${JSON.stringify(date)} });
          const status = await window.electronAPI.task.changeStatus({ id: created.data.id, status: 'done' });
          const stats = await window.electronAPI.stats.weekly({ weekStart: ${JSON.stringify(date)} });
          const invalid = await window.electronAPI.task.create({ title: '', taskDate: 'x' });
          const refreshed = await waitFor(() => document.body.innerText.includes('스모크 IPC'));
          return {
            rendered,
            refreshed,
            nodeHidden: typeof window.require === 'undefined' && typeof window.process === 'undefined',
            listCount: list.success ? list.data.items.length : -1,
            doneStatus: status.success ? status.data.task.status : null,
            weeklyTotal: stats.success ? stats.data.totals.total : -1,
            invalidCode: invalid.success ? null : invalid.error.code,
          };
        })()
      `);
      clearTimeout(timer);
      const ok =
        result.rendered &&
        result.refreshed &&
        result.nodeHidden &&
        result.listCount === 2 &&
        result.doneStatus === 'done' &&
        result.weeklyTotal >= 2 &&
        result.invalidCode === 'INVALID_INPUT';
      console.log(`SMOKE_RESULT ${JSON.stringify({ ok, ...result })}`);
      const shotDir = process.env.TODOLIST_SMOKE_SHOTS;
      if (ok && shotDir) await captureScreens(window, services, shotDir);
      app.exit(ok ? 0 : 1);
    } catch (err) {
      clearTimeout(timer);
      fail(String(err));
    }
  });
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** TODOLIST_SMOKE_SHOTS 폴더가 주어지면 예시 데이터를 넣고 주요 화면을 PNG로 저장한다 (레이아웃 확인용). */
async function captureScreens(window: BrowserWindow, services: Services, dir: string): Promise<void> {
  const date = today();
  const { tasks, tags, db } = services;
  // 스모크 확인용 할 일은 지우고 예시 데이터만으로 찍는다.
  for (const task of tasks.findByDate(date)) tasks.delete({ id: task.id });
  const work = tags.save({ name: '업무', color: '#2563eb' });
  const ids = tasks
    .bulkCreate({ taskDate: date, text: '제안서 초안 작성\n고객 메일 회신\n운동 30분\n은행 업무\n책상 정리' })
    .items.map((t) => t.id);
  tasks.update({ id: ids[0], priority: 'high', tagIds: [work.id], dueDate: addDays(date, 1) });
  tasks.update({ id: ids[1], priority: 'high', tagIds: [work.id] });
  tasks.update({ id: ids[4], priority: 'low' });
  tasks.changeStatus({ id: ids[0], status: 'in_progress' });
  tasks.changeStatus({ id: ids[2], status: 'done' });
  tasks.changeStatus({ id: ids[3], status: 'postponed', reason: '서류 미비', postponeDate: addDays(date, 2) });
  tasks.changeStatus({ id: ids[4], status: 'canceled', reason: '필요 없어짐' });
  db.save();
  window.webContents.send(UI_EVENTS.DATA_CHANGED);

  fs.mkdirSync(dir, { recursive: true });
  window.setBounds({ width: 1280, height: 800 });
  window.showInactive();
  const shots: [string, string][] = [
    ['day', `#/day/${date}`],
    ['calendar', `#/calendar/${date.slice(0, 7)}`],
    ['stats', `#/stats/week/${weekStartOf(date)}`],
    ['settings', '#/settings'],
  ];
  const shoot = async (name: string): Promise<void> => {
    await sleep(700);
    const image = await window.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), image.toPNG());
  };
  const js = (code: string): Promise<unknown> => window.webContents.executeJavaScript(code);
  const clickButton = (label: string): Promise<unknown> =>
    js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})?.click()`);
  const closeModal = (): Promise<unknown> => js(`document.querySelector('.modal [aria-label="닫기"]')?.click()`);

  for (const [name, hash] of shots) {
    await js(`window.location.hash = ${JSON.stringify(hash)}`);
    await shoot(name);
  }

  // 모달: 일괄 등록 → 수정 → 연기 사유 → 이미지 공유
  await js(`window.location.hash = ${JSON.stringify(shots[0][1])}`);
  await sleep(500);
  await clickButton('아침 일괄 등록');
  await sleep(200);
  await js(`(() => {
    const el = document.querySelector('.input--bulk');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, '- 회의 준비\\n- 보고서 검토\\n\\n- 점심 약속');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await shoot('modal-bulk');
  await closeModal();
  await clickButton('제안서 초안 작성');
  await shoot('modal-edit');
  await closeModal();
  await js(`(() => {
    const select = document.querySelectorAll('.task-row .status-select')[2];
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'postponed');
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await shoot('modal-reason');
  await closeModal();
  await clickButton('공유');
  await sleep(300);
  await js(`document.querySelectorAll('input[name="share-format"]')[1].click()`);
  await sleep(800);
  await shoot('modal-share-image');
  console.log(`SMOKE_SHOTS ${dir}`);
}
