// @vitest-environment jsdom
/**
 * 217차: 가상 커서가 켜진 동안의 두 점 측정 잠금 안내(216차가 남긴 것 — WCAG 2.1.1·4.1.3).
 * 커서가 켜지면 화살표는 커서를 옮기는데(keys.ts arrowOwner) 상태 막대·측정 띠 잠금 안내가 「Shift·화살표로 방향 잠금」·「화살표로 축 잠금」 그대로였다 —
 * 켜진 동안은 216차 글쇠로 「X·Y·Z로 축 방향, L로 지금 방향 잠금」(잠글 것이 있을 때 — NC 205차 글)·「X·Y·Z로 축 잠금」(없을 때 — X·Y·Z 축 잠금은 늘 된다).
 * - snap.ts lockHint 다섯째 인자(커서 켜짐)·viewerLockHint(코어 keyboardCursor)를 표와 실제 코어 뷰어(jsdom — 정육면체를 앞에서 보고 가상 커서로 앞면 가운데를 첫 점으로)로
 * - 잠글 것이 없을 때 L은 알림 상자(aria-live) 경고만 — 그때 안내는 켜진 커서의 글(화살표 글이 아님), 커서를 끄면(캔버스 초점이 떠남 — 코어 'end') 화살표 글로 돌아옴
 * - 앱은 커서를 켜고 끄는 코어 알림 → 다음 프레임 → refreshLock으로 안내를 다시 그린다(다시 그리기 열쇠에 커서 켜짐 — app.ts 원문)
 * - 3D 보기 aria-keyshortcuts의 X·Y·Z·L(216차)은 그대로 — 대문자 한 번씩, Shift와 함께는 받지 않아 없음
 * - 새 원문 둘의 네 사전 값(같은 사전 근거 — 「화살표로 축 잠금」의 화살표 낱말만 X·Y·Z로, 「지금 방향 잠그기」의 지금 방향 낱말)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { KeyboardSnapAnnouncement } from 'opencad-viewer3d';
import { catalogs, sourceMessage, translate } from '../../site/i18n.mjs';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { installKeySnap } from '../../src/app/keysnap';
import { arrowLock, circleCenters, lockHint, lockName, measureSnapOptions, viewerLockHint, type LockName, type LockViewer } from '../../src/app/snap';
import { cube, StepText } from '../stepText';
import { jsdomViewer } from './jsdomview';

const CODES = ['en', 'ja', 'zh-CN', 'de'] as const;
const hangul = /[가-힣]/;
/** 커서가 켜진 동안 · 잠글 것이 있을 때(NC 205차 글) */
const ON = 'X·Y·Z로 축 방향, L로 지금 방향 잠금';
/** 커서가 켜진 동안 · 잠글 것이 없을 때(꺼짐 쪽 「화살표로 축 잠금」과 같은 꼴) */
const AXES = 'X·Y·Z로 축 잠금';
const KEYS = 'Shift·화살표로 방향 잠금';
const ARROWS = '화살표로 축 잠금';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const key = (el: EventTarget, k: string, o: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  el.dispatchEvent(e);
  return e;
};

/** 실제 코어 뷰어 + 앱처럼 installKeySnap(고르기 호스트에 lockArrow)과 창 keydown 캡처(216차 시험 꼴). 다음 프레임은 쌓아 두었다가 frame()이 차례대로 */
function rig() {
  const w = new StepText();
  w.product('c', [cube(w, 10).solid], w.context());
  const j = jsdomViewer({ keyboard: true });
  const frames: FrameRequestCallback[] = [];
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => frames.push(cb)) as typeof window.requestAnimationFrame;
  const frame = (): void => {
    for (const cb of frames.splice(0)) cb(0);
  };
  const v = j.viewer;
  const sc = stepToScene(w.bytes());
  v.setScene(sc);
  // 앞에서(+Y 쪽을 본다 — 화면 가로 = X, 세로 = Z): 캔버스 가운데는 앞면 가운데 (5, 0, 5)
  v.setView('front', false);
  v.fit(false);
  v.renderNow();
  const ex = stepEdgeIndex(sc);
  const opts = measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, null, true);
  v.setMeasureSnap(opts);
  v.setMeasureMode(true);
  let failed = 0;
  const reasons: KeyboardSnapAnnouncement['reason'][] = [];
  /** app.ts lockArrow와 같은 길(곡선 접선 없음 — 잠글 것이 없으면 앱은 알림 상자 경고 lockFailed) */
  const lockArrow = (k: string, hold = false): boolean => {
    if (!v.measureMode) return false;
    const want = arrowLock(k, v.measurePointCount, v.measureInferenceLock);
    if (want === null || hold) return want !== null;
    if (want === false) v.setMeasureInferenceLock(false);
    else if (!v.setMeasureInferenceLock(want)) failed++;
    return true;
  };
  const ks = installKeySnap(v, {
    tr: (s) => s,
    pickThrough: () => false,
    announced: (a) => void reasons.push(a.reason),
    pick: { faceMode: false, multiPick: false, pickUnit: 'part', doc: null, tangents: { locked: () => false }, lockArrow },
  });
  const capture = (e: KeyboardEvent): void => {
    if (ks.lockKey(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', capture, true);
  restore = () => {
    window.removeEventListener('keydown', capture, true);
    j.restore();
  };
  frame();
  return { v, opts, frame, failed: () => failed, reasons, lock: () => lockName(v.measureInferenceLock) };
}

describe('잠금 안내 고르기(217차)', () => {
  it('lockHint: 가상 커서가 켜진 동안(다섯째 인자)은 끝점을 잡는 동안 X·Y·Z·L 안내 — 꺼짐은 그대로, 잠갔으면·첫 점 전·둘째 점 뒤·손가락은 커서와 무관', () => {
    // [찍은 점 수, 잠근 방향, 손가락 기기, 커서 아래 잠글 것 있음, 커서 꺼짐 글, 커서 켜짐 글]
    const table: [number, LockName | null, boolean, boolean, string | null, string | null][] = [
      [1, null, false, true, KEYS, ON],
      [1, null, false, false, ARROWS, AXES],
      [0, null, false, true, null, null],
      [0, null, false, false, null, null],
      [2, null, false, true, null, null],
      [1, null, true, true, null, null],
      [1, null, true, false, null, null],
      [0, 'x', false, false, 'X축으로 잠금', 'X축으로 잠금'],
      [1, 'parallel', false, true, '모서리와 나란히 잠금', '모서리와 나란히 잠금'],
      [1, 'tangent', true, false, '접선 방향으로 잠금', '접선 방향으로 잠금'],
    ];
    for (const [n, lock, touch, can, off, on] of table) {
      const tag = `${n} ${lock} ${touch} ${can}`;
      expect(lockHint(n, lock, touch, can), tag).toBe(off);
      expect(lockHint(n, lock, touch, can, false), tag).toBe(off);
      expect(lockHint(n, lock, touch, can, true), tag).toBe(on);
    }
    // viewerLockHint는 코어 keyboardCursor로 고른다(가짜 뷰어 — 칸이 없거나 null이면 꺼짐)
    const edge = { kind: 'parallel' as const, direction: [Math.SQRT1_2, Math.SQRT1_2, 0] as [number, number, number] };
    const cur = { x: 400, y: 300 } as NonNullable<LockViewer['keyboardCursor']>;
    const v = (hover: LockViewer['measureHoverLock'], c?: LockViewer['keyboardCursor']): LockViewer => ({ measurePointCount: 1, measureInferenceLock: null, measureHoverLock: hover, keyboardCursor: c });
    expect([viewerLockHint(v(edge)), viewerLockHint(v(edge, null)), viewerLockHint(v(edge, cur))]).toEqual([KEYS, KEYS, ON]);
    expect([viewerLockHint(v(null)), viewerLockHint(v(null, null)), viewerLockHint(v(null, cur))]).toEqual([ARROWS, ARROWS, AXES]);
    expect(viewerLockHint(v(edge, cur), true)).toBeNull();
    // 곡선 접선(tangent.ts — 커서 아래가 그 곡선 위면 Shift·L로 잠글 것)도 잠글 것 있음
    expect(viewerLockHint(v(null, cur), false, { locked: () => false, now: () => [0, 1, 0] })).toBe(ON);
  });
});

describe('실제 코어 — 가상 커서를 켜고 끌 때의 안내(217차)', () => {
  it('첫 점 뒤 커서가 켜진 동안 X·Y·Z·L 안내, 잠갔으면 잠근 방향, 잠글 것이 없으면 「X·Y·Z로 축 잠금」(L은 알림 상자만 — 안내 그대로), 초점이 떠나 커서가 꺼지면 화살표 글', () => {
    const r = rig();
    const { v } = r;
    v.canvas.focus();
    expect(document.activeElement).toBe(v.canvas);
    // 첫 점 전: 커서 꺼짐·켜짐 모두 안내 없음
    expect(viewerLockHint(v)).toBeNull();
    key(v.canvas, 'ArrowUp');
    expect(v.keyboardCursor).toMatchObject({ mode: 'measure' });
    expect(r.reasons).toContain('start');
    expect(viewerLockHint(v)).toBeNull();
    key(v.canvas, 'Enter');
    expect(v.measurePointCount).toBe(1);
    // 오른쪽으로 30화소(걸음 5 × 6): 첫 점 X축 위 — 잠글 것 있음
    for (let i = 0; i < 6; i++) key(v.canvas, 'ArrowRight');
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x' });
    expect(v.measureHoverLock).not.toBeNull();
    r.frame();
    expect(viewerLockHint(v)).toBe(ON);
    // L로 잠그면 잠근 방향, 다시 L로 풀고 그 자리를 다시 가리키면 켜진 커서 안내
    expect(key(v.canvas, 'l', { code: 'KeyL' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('x');
    expect(viewerLockHint(v)).toBe('X축으로 잠금');
    expect(key(v.canvas, 'l', { code: 'KeyL' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    r.frame();
    key(v.canvas, 'ArrowLeft');
    key(v.canvas, 'ArrowRight');
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x' });
    expect(viewerLockHint(v)).toBe(ON);
    // 잠글 것 없음: 빈 곳(왼쪽 위 — 후보 없음)에서 마지막으로 본 방향을 잊게 붙잡기 선택을 다시 준 뒤(앱 syncMeasureSnap과 같은 길)
    for (let i = 0; i < 7; i++) key(v.canvas, 'ArrowLeft', { shiftKey: true });
    for (let i = 0; i < 5; i++) key(v.canvas, 'ArrowUp', { shiftKey: true });
    expect(v.measureHoverSnap).toBeNull();
    v.setMeasureSnap(r.opts);
    r.frame();
    expect(v.measurePointCount).toBe(1);
    expect(v.measureHoverLock).toBeNull();
    expect(v.keyboardCursor).not.toBeNull();
    expect(viewerLockHint(v)).toBe(AXES);
    // L: 받아 막고 앱 실패 알림(알림 상자)만 — 안내는 켜진 커서의 글 그대로(화살표 글이 아님)
    expect(key(v.canvas, 'l', { code: 'KeyL' }).defaultPrevented).toBe(true);
    expect(r.failed()).toBe(1);
    expect(r.lock()).toBeNull();
    expect(viewerLockHint(v)).toBe(AXES);
    // X·Y·Z 축 잠금은 잠글 것이 없어도 된다(안내가 말한 대로)
    expect(key(v.canvas, 'z', { code: 'KeyZ' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('z');
    expect(viewerLockHint(v)).toBe('Z축으로 잠금');
    key(v.canvas, 'z', { code: 'KeyZ' });
    expect(r.lock()).toBeNull();
    expect(viewerLockHint(v)).toBe(AXES);
    // 커서 끔: 캔버스 초점이 문서 안 다른 곳으로 가면 코어가 끄고 'end'를 알린다(앱은 이 알림으로 안내를 다시 그린다) — 화살표 글
    const out = document.createElement('button');
    document.body.append(out);
    out.focus();
    expect(v.keyboardCursor).toBeNull();
    expect(r.reasons.at(-1)).toBe('end');
    expect(v.measurePointCount).toBe(1);
    expect(viewerLockHint(v)).toBe(ARROWS);
    out.remove();
  });

  it('(ㄴ) 3D 보기 aria-keyshortcuts: 받는 X·Y·Z·L이 대문자로 한 번씩(글자 키는 대소문자를 같게 봄 — WAI-ARIA), Shift와 함께는 받지 않아 없음 — 216차 그대로', () => {
    const r = rig();
    const list = r.v.canvas.getAttribute('aria-keyshortcuts')!.split(' ');
    for (const k of ['X', 'Y', 'Z', 'L']) {
      expect(list.filter((x) => x === k), k).toHaveLength(1);
      expect(list, k).not.toContain(k.toLowerCase());
      expect(list, k).not.toContain(`Shift+${k}`);
    }
    // 받지 않는 키: Shift+X는 lockKey가 거른다(커서를 켜고 첫 점을 찍은 뒤에도)
    key(r.v.canvas, 'ArrowUp');
    key(r.v.canvas, 'Enter');
    expect(key(r.v.canvas, 'X', { code: 'KeyX', shiftKey: true }).defaultPrevented).toBe(false);
    expect(r.lock()).toBeNull();
  });
});

describe('사전·app.ts 길(217차)', () => {
  it('새 원문 둘은 네 사전에 같은 사전 근거 값(「화살표로 축 잠금」의 화살표 낱말만 X·Y·Z로, 「지금 방향 잠그기」의 지금 방향 낱말)이고 같은 언어의 다른 값과 겹치지 않아 거꾸로 찾으면 제 원문', () => {
    const want: Record<(typeof CODES)[number], [string, string]> = {
      en: ['X·Y·Z lock an axis', 'X·Y·Z lock an axis, L locks the current direction'],
      ja: ['X・Y・Zで軸をロック', 'X・Y・Zで軸方向、Lで今の方向をロック'],
      'zh-CN': ['按 X·Y·Z 锁定轴', '按 X·Y·Z 锁定轴方向，按 L 锁定当前方向'],
      de: ['X·Y·Z sperren eine Achse', 'X·Y·Z sperren eine Achse, L sperrt die aktuelle Richtung'],
    };
    /** 「화살표로 축 잠금」 값의 화살표 낱말 → X·Y·Z(일본어는 같은 사전 「Shift・矢印キー」 꼴의 ・) */
    const arrow: Record<(typeof CODES)[number], [string, string]> = { en: ['Arrow keys', 'X·Y·Z'], ja: ['矢印キー', 'X・Y・Z'], 'zh-CN': ['方向键', ' X·Y·Z '], de: ['Pfeiltasten', 'X·Y·Z'] };
    /** 「지금 방향 잠그기(다시 누르면 풀기)」의 지금 방향 잠금 낱말 */
    const now: Record<(typeof CODES)[number], string> = { en: 'the current direction', ja: '今の方向をロック', 'zh-CN': '锁定当前方向', de: 'aktuelle richtung' };
    for (const code of CODES) {
      const c = catalogs[code]!;
      expect([AXES, ON].map((k) => c[k]), code).toEqual(want[code]);
      expect(c[AXES], code).toBe(c[ARROWS]!.replace(arrow[code][0], arrow[code][1]));
      expect(c['지금 방향 잠그기(다시 누르면 풀기)']!.toLowerCase(), code).toContain(now[code]);
      expect(c[ON]!.toLowerCase(), code).toContain(now[code]);
      // 키 이름은 옮기지 않는다
      for (const k of ['X', 'Y', 'Z', 'L']) expect(c[ON], `${code}: ${k}`).toContain(k);
      const all = Object.values(c);
      for (const k of [AXES, ON]) {
        const val = c[k]!;
        expect(val, `${code}: ${k}`).not.toMatch(hangul);
        expect(all.filter((x) => x === val).length, `${code}: ${k}`).toBe(1);
        expect(sourceMessage(val), `${code}: ${val}`).toBe(k);
        expect(translate(k, code), `${code}: ${k}`).toBe(val);
      }
      // 꺼짐 쪽 두 글과도 다르다(켜고 끄면 들리는 글이 바뀐다)
      expect(new Set([c[KEYS], c[ARROWS], c[AXES], c[ON]]).size, code).toBe(4);
    }
  });

  it('app.ts: 잠금 안내를 다시 그리는 열쇠에 가상 커서 켜짐(코어 켜기·끄기 알림 → 다음 프레임 → refreshLock), 안내는 코어 뷰어로 viewerLockHint, 잠글 것 없음은 알림 상자(aria-live)', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const method = (head: string): string => {
      const i = app.indexOf(`\n  ${head}`);
      expect(i, head).toBeGreaterThan(0);
      return app.slice(i, app.indexOf('\n  }\n', i));
    };
    expect(method('private refreshLock(): void {')).toContain('const key = on ? `${lock}|${v.measurePointCount}|${can}|${!!v.keyboardCursor}` : \'\';');
    expect(method('private measureLockHint(): string | null {')).toContain('return viewerLockHint(v, this.touch, this.tangents);');
    expect(method('private showHoverSnap(): void {')).toContain('this.refreshLock();');
    const i = app.indexOf('announced: (a) => {');
    expect(i).toBeGreaterThan(0);
    expect(app.slice(i, app.indexOf('},', i))).toContain('this.scheduleHoverSnap();');
    // 측정 띠 글 칸(잠금 안내가 든다)과 알림 상자는 알림 영역
    expect(app).toContain("this.measureText = h('div', { class: 'mb-text', 'aria-live': 'polite' });");
    expect(app).toContain("this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });");
    expect(method('private lockFailed(): void {')).toContain("'잠글 방향이 없습니다: 커서를 축·모서리와 나란한 방향에 맞춘 뒤 누르십시오'");
  });
});
