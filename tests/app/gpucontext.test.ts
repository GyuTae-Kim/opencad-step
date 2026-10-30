/**
 * 그래픽 문맥 잃음·되찾음 안내(gpucontext.ts — 코어 0.25.0 onContextLost·onContextRestore)를 실제 코어(가짜 DOM·WebGL2 뷰어)로 본다.
 * - 잃으면 되찾을 때까지 남는 경고 하나, 되찾으면 그것을 닫고 짧은 알림. 잃음이 거듭 와도 경고는 하나
 * - 잃음 없이 되찾음만 오면 아무것도 띄우지 않는다. 푼 뒤에는 알리지 않고 남은 경고를 닫는다
 * - 앱은 놓기 선택(release)을 쓰지 않으므로 되찾은 뒤 다시 줄 것이 없다(restoreNeed null)
 * - 두 문구는 네 언어 사전에 있다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Viewer3d } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
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

  it('두 문구는 네 언어 사전에 있다', () => {
    for (const lang of ['en', 'ja', 'zh-CN', 'de'])
      for (const m of [CONTEXT_LOST_MESSAGE, CONTEXT_RESTORED_MESSAGE]) expect(translate(m, lang), `${lang}: ${m}`).not.toMatch(/[가-힣]/);
  });
});
