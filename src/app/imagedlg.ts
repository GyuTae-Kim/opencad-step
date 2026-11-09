/**
 * 큰 그림 저장 대화 상자 본문(viewerkit 조각 — 62차에 첫 화면 JS를 줄이려고 app.ts에서 옮겼다: 뷰어가 있어야 연다).
 * 크기(1~4배, 실제 화소 — 코어 snapshotSize가 4096² 한도에 맞춰 줄인 크기), 바탕(테마·투명), 덧그림(측정·좌표축·단면 표시).
 * 저장을 누르면 대화 상자를 닫고 save(고른 선택) — 그리기·건네기는 앱(saveImage)
 */
import type { Viewer3d } from 'opencad-viewer3d';
import { closeDialog, selectRow } from './dialog';
import { h, icon } from './dom';
import { imageSizeLabel } from './format';

/** 큰 그림 저장 선택 */
export interface ImageOptions {
  scale: number;
  transparent: boolean;
  overlays: boolean;
}

export function imageDialogBody(v: Pick<Viewer3d, 'snapshotSize'>, cur: ImageOptions, save: (o: ImageOptions) => void): HTMLElement[] {
  const o = { ...cur };
  const scale = selectRow(
    '크기',
    [1, 2, 3, 4].map((k): [string, string] => [String(k), imageSizeLabel(k, v.snapshotSize({ scale: k }))]),
    String(o.scale),
    (x) => (o.scale = Number(x) || 1),
    '화면 화소의 몇 배로 다시 그립니다. 선 굵기·글자도 같은 비율로 커지고, 아주 크면 기기 한도(4096 × 4096 화소)에 맞춰 줄입니다.',
  );
  const bg = selectRow(
    '바탕',
    [
      ['theme', '화면 바탕'],
      ['transparent', '투명(PNG 알파)'],
    ],
    o.transparent ? 'transparent' : 'theme',
    (x) => (o.transparent = x === 'transparent'),
  );
  const ov = selectRow(
    '덧그림',
    [
      ['on', '측정·좌표축·단면 표시 담기'],
      ['off', '형상만'],
    ],
    o.overlays ? 'on' : 'off',
    (x) => (o.overlays = x === 'on'),
  );
  const btn = h('button', { type: 'button', class: 'btn primary' }, icon('image', 16), h('span', {}, '저장'));
  btn.addEventListener('click', () => {
    closeDialog();
    save({ ...o });
  });
  return [scale, bg, ov, h('div', { class: 'dlg-actions' }, btn)];
}
