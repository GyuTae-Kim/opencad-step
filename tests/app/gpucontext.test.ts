/**
 * 그래픽 문맥 잃음·되찾음 안내(gpucontext.ts — 코어 0.25.0 onContextLost·onContextRestore)를 실제 코어(가짜 DOM·WebGL2 뷰어)로 본다.
 * - 잃으면 되찾을 때까지 남는 경고 하나, 되찾으면 그것을 닫고 짧은 알림. 잃음이 거듭 와도 경고는 하나
 * - 잃음 없이 되찾음만 오면 아무것도 띄우지 않는다. 푼 뒤에는 알리지 않고 남은 경고를 닫는다
 * - 앱은 놓기 선택(release)을 쓰지 않으므로 되찾은 뒤 다시 줄 것이 없다(restoreNeed null)
 * - 두 문구는 네 언어 사전에 있다
 * - 잃음 안내는 앱 알림 칸 한도(셋)에 밀려나지 않는다(144차 — 닫을 때까지 남기는 안내는 data-keep, 넣기·한도는 pushToast)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Viewer3d } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { pushToast } from '../../src/app/dom';
import { CONTEXT_LOST_MESSAGE, CONTEXT_RESTORED_MESSAGE, watchGraphicsContext } from '../../src/app/gpucontext';
import { translate } from '../../site/i18n.mjs';
import { cube, StepText } from '../stepText';
import { installDom, type FakeElement } from './fakeview';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
});
afterAll(() => dom.restore());

function box() {
  const w = new StepText();
  const ctx = w.context();
  w.product('p', [cube(w, 10).solid], ctx);
  return stepToScene(w.bytes());
}

/** 띄운 알림 기록(닫혔는지 함께) */
function toasts() {
  const list: { msg: string; kind: string; ms: number; open: boolean }[] = [];
  const toast = (msg: string, kind: 'info' | 'warn', ms: number) => {
    const t = { msg, kind, ms, open: true };
    list.push(t);
    return () => void (t.open = false);
  };
  return { list, toast, open: () => list.filter((t) => t.open) };
}

/** 앱 알림 칸 흉내(app.ts toast — 닫을 때까지 남기는 안내는 data-keep, 넣기와 한도 셋은 pushToast) */
function toastBox() {
  const box = dom.host();
  const toast = (msg: string, _kind?: string, _ms?: number, keep = false) => {
    const t = dom.host();
    t.textContent = msg;
    if (keep) t.setAttribute('data-keep', '');
    pushToast(box as unknown as Element, t as unknown as Element, 3);
    return () => t.remove();
  };
  return { toast, shown: () => box.children.map((c) => c.textContent), kept: () => box.children.filter((c) => c.hasAttribute('data-keep')).map((c) => c.textContent) };
}

function viewer() {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  v.setScene(box());
  v.renderNow();
  const cv = v.canvas as unknown as FakeElement;
  return { v, lose: () => cv.fire('webglcontextlost', {}), restore: () => cv.fire('webglcontextrestored', {}) };
}

describe('그래픽 문맥 잃음·되찾음 안내', () => {
  it('잃으면 남는 경고 하나, 되찾으면 닫고 짧게 알린다(다시 줄 것 없음)', () => {
    const { v, lose, restore } = viewer();
    const t = toasts();
    watchGraphicsContext(v, t.toast);
    lose();
    expect(t.open()).toEqual([{ msg: CONTEXT_LOST_MESSAGE, kind: 'warn', ms: 24 * 60 * 60 * 1000, open: true }]);
    // 거듭 잃어도 경고는 하나
    lose();
    expect(t.open().map((x) => x.msg)).toEqual([CONTEXT_LOST_MESSAGE]);
    restore();
    expect(t.open().map((x) => [x.msg, x.kind, x.ms])).toEqual([[CONTEXT_RESTORED_MESSAGE, 'info', 3500]]);
    expect(t.list.filter((x) => x.msg === CONTEXT_LOST_MESSAGE).every((x) => !x.open)).toBe(true);
    // 앱은 놓기 선택을 쓰지 않는다 — 코어가 장면을 스스로 다시 올렸고 다시 줄 배열이 없다
    expect(v.restoreNeed).toBeNull();
    v.dispose();
  });

  it('잃음 없이 되찾음만 오면 띄우지 않고, 푼 뒤에는 알리지 않으며 남은 경고를 닫는다', () => {
    const { v, lose, restore } = viewer();
    const t = toasts();
    const off = watchGraphicsContext(v, t.toast);
    restore();
    expect(t.list).toEqual([]);
    lose();
    expect(t.open().length).toBe(1);
    off();
    expect(t.open()).toEqual([]);
    lose();
    restore();
    expect(t.list.length).toBe(1);
    v.dispose();
  });

  it('잃음 안내는 알림 칸 한도(셋)에 밀려나지 않고 되찾으면 닫힌다 — 그 밖의 알림은 가장 오래된 것부터 빠진다(144차)', () => {
    // 잃음 안내가 없으면 지금처럼 가장 오래된 것부터
    const plain = toastBox();
    for (const m of ['가', '나', '다', '라']) plain.toast(m);
    expect(plain.shown()).toEqual(['나', '다', '라']);
    const { v, lose, restore } = viewer();
    const a = toastBox();
    a.toast('앞 알림');
    watchGraphicsContext(v, a.toast);
    lose();
    expect(a.shown()).toEqual(['앞 알림', CONTEXT_LOST_MESSAGE]);
    expect(a.kept()).toEqual([CONTEXT_LOST_MESSAGE]);
    // 잃은 동안 PNG 저장을 거듭 누르고(오류 알림 셋) 다른 알림이 하나 더 와도 잃음 안내는 남는다(그 밖은 오래된 것부터 빠짐)
    const err = '그림을 저장하지 못했습니다: 3D 보기 문맥이 없어 그림을 만들 수 없습니다';
    for (let i = 0; i < 3; i++) a.toast(err, 'error');
    a.toast('부품 단위로 고릅니다.');
    expect(a.shown()).toEqual([CONTEXT_LOST_MESSAGE, err, '부품 단위로 고릅니다.']);
    // 되찾으면 잃음 안내를 닫고 짧은 알림(남기지 않는 알림)
    restore();
    expect(a.shown()).toEqual([err, '부품 단위로 고릅니다.', CONTEXT_RESTORED_MESSAGE]);
    expect(a.kept()).toEqual([]);
    v.dispose();
  });

  it('앱(원문): 알림 함수가 남기는 안내에 data-keep을 달고 pushToast로 넣으며, 문맥 안내에 넘기는 함수가 keep을 넘긴다(144차)', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toContain("'data-keep': keep");
    expect(app).toContain('pushToast(this.toasts, t, 3);');
    expect(app).not.toContain('this.toasts.children.length > 3');
    expect(app).toContain('core.watchGraphicsContext(v, (msg, kind, ms, keep) => this.toast(msg, kind, ms, undefined, keep));');
  });

  it('두 문구는 네 언어 사전에 있다', () => {
    for (const lang of ['en', 'ja', 'zh-CN', 'de'])
      for (const m of [CONTEXT_LOST_MESSAGE, CONTEXT_RESTORED_MESSAGE]) expect(translate(m, lang), `${lang}: ${m}`).not.toMatch(/[가-힣]/);
  });
});
