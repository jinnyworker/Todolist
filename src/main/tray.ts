import { Menu, Tray, nativeImage } from 'electron';

interface TrayActions {
  show: () => void;
  openBulk: () => void;
  quit: () => void;
}

export function createTray(iconPath: string, actions: TrayActions): Tray {
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  const tray = new Tray(icon);
  tray.setToolTip('TODOLIST');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: actions.show },
      { label: '아침 일괄 등록', click: actions.openBulk },
      { type: 'separator' },
      { label: '종료', click: actions.quit },
    ]),
  );
  tray.on('click', actions.show);
  return tray;
}
