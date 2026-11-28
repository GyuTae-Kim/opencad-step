// @vitest-environment jsdom
/**
 * 218차(WCAG 4.1.2 — 단축키 알림): 키를 받는 칸마다 aria-keyshortcuts 값 = 그 칸이 실제로 받는 키. WAI-ARIA 1.2 §6.7 꼴 — 공백으로 가르고, 수정 키(Control·Meta·Alt·Shift)는
 * 앞에 「+」로, 수정 키가 아닌 키 하나, 이름은 KeyboardEvent key 값(ArrowUp 등 — 빈칸 키는 Space), 글자 키는 대소문자를 같게 봐 대문자로 한 번.
 * 키 목록(글자·숫자·F1~F12·이름 키·기호) × 수정 키 12꼴을 두루 눌러 받는 키 이름을 모아 값과 대조한다 — 받는 길에 새 키를 더하고 값에 넣지 않으면(또는 그 반대면) 실패.
 * - 3D 보기 캔버스: 앱 창 키(keys.ts routeKey — 3D 보기를 다루는 Home·H·I·F7·Esc), 코어 가상 커서 키 표(keySnapAction), 코어 보기 키(handleKey — F·1~7),
 *   방향 잠금 글자(keysnap.ts lockKey — X·Y·Z·L), 커서 자리 작업 메뉴(installKeySnap 캔버스 keydown — Shift+F10·ContextMenu). 217차까지 Home·H·I·F7·Shift+F10·ContextMenu가 빠져 있었다.
 *   창 어디서나 같은 문서 명령(Ctrl·⌘ — 열기·분해 손질 되돌리기·다시 하기)은 3D 보기를 다루는 키가 아니라 넣지 않는다(routeKey에 새 할 일이 생기면 갈래를 정하라고 실패)
 * - 모델 트리 거르기 칸: Ctrl·⌘+F가 초점을 주는 칸(treeview.ts findToFilter) — 「Control+F Meta+F」
 * - src에서 aria-keyshortcuts를 다는 곳은 이 둘뿐(새 자리가 생기면 여기에 그 칸의 받는 키 대조를 더하라고 실패)
 * - (ㄴ) 커서가 꺼져 있어도 3D 보기에 초점이 있고 마우스가 밖이면 캔버스가 받은 화살표는 가상 커서 켜기(keys.ts arrowOwner) — 그동안 잠금 안내는 커서가 켜진 동안의 글(217차),
 *   방향 잠금은 X·Y·Z·L(고르기 호스트 cursorArrows — app.ts가 화살표 임자로 답한다). 전에는 「화살표로 축 잠금」인데 화살표는 커서를 켜고 X·Y·Z·L은 받지 않았다
 * - 219차: 말풍선이 단축키를 말하는 버튼마다 값 = 그 버튼과 같은 일을 하는 앱 키(키를 두루 눌러 routeKey가 그 할 일을 고르는 키 — 전체 보기는 코어 handleKey가 fit을 부르는 키).
 *   도구 막대 전체 보기 F·격자 F7, 머리 줄 열기 Ctrl·⌘+O, 격리 띠 격리 풀기 I, 분해 막대 되돌리기 Ctrl·⌘+Z·다시 하기 Ctrl·⌘+Shift+Z·Ctrl+Y. 218차까지 값이 없었다.
 *   누르기가 부르는 함수와 키 갈래가 부르는 함수가 같은지도 본다(jsdom 버튼 누르기·app.ts 원문). 말풍선이 키를 말해도 같은 일이 아닌 버튼(표준 뷰 — 메뉴를 엶, 측정 — 켜고 끔,
 *   고르기 — 누르기 수정 키)에는 달지 않는다. 새 키를 그 버튼과 같은 일로 더하고 값에 넣지 않으면 실패
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { keySnapAction } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { ExplodeControls } from '../../src/app/explodebar';
import { routeKey } from '../../src/app/keys';
import { installKeySnap } from '../../src/app/keysnap';
import { arrowLock, circleCenters, lockName, measureSnapOptions, viewerLockHint, type LockViewer } from '../../src/app/snap';
import { Toolbar, type ToolbarHost } from '../../src/app/toolbar';
import { findToFilter } from '../../src/app/treeview';
import { cube, StepText } from '../stepText';
import { jsdomViewer } from './jsdomview';

const ON = 'X·Y·Z로 축 방향, L로 지금 방향 잠금';
const AXES = 'X·Y·Z로 축 잠금';
const KEYS = 'Shift·화살표로 방향 잠금';
const ARROWS = '화살표로 축 잠금';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

/** 눌러 볼 키(Shift 없는 key 값) */
const BASES = [
  ...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ...['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Insert', 'Delete', 'Backspace', 'Tab', 'Enter', 'Escape', ' ', 'ContextMenu'],
  ...['.', ',', '-', '=', '/', ';', "'", '[', ']', '\\', '`'],
];
type Mods = { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean };
/** 수정 키 12꼴: Ctrl·⌘ 가운데 하나 또는 없음(앱은 둘을 같게 받는다 — 둘을 함께 누르는 꼴은 보지 않음) × Alt × Shift */
const MODS: Mods[] = [
  { ctrlKey: false, metaKey: false },
  { ctrlKey: true, metaKey: false },
  { ctrlKey: false, metaKey: true },
].flatMap((p) => [false, true].flatMap((altKey) => [false, true].map((shiftKey) => ({ ...p, altKey, shiftKey }))));
/** Shift와 함께 누른 글자 키의 key 값은 대문자(숫자·기호의 Shift 글자는 자판마다 달라 같은 key로 — 받으면 Shift 없는 꼴과 같은 뜻이라 아래에서 묶인다) */
const keyOf = (base: string, m: Mods): string => (m.shiftKey && /^[a-z]$/.test(base) ? base.toUpperCase() : base);
/** WAI-ARIA 꼴 이름 */
const token = (base: string, m: Mods): string =>
  [m.ctrlKey && 'Control', m.metaKey && 'Meta', m.altKey && 'Alt', m.shiftKey && 'Shift', base === ' ' ? 'Space' : base.length === 1 ? base.toUpperCase() : base]
    .filter(Boolean)
    .join('+');
const tag = (base: string, m: Mods): string => `${base}|${+m.ctrlKey}${+m.metaKey}${+m.altKey}${+m.shiftKey}`;

/**
 * 받는 키 이름: 층마다 그 키의 뜻(받지 않으면 null)을 한 번씩 눌러 모은 뒤, 받은 키마다 이름 하나. Shift만 더한 꼴은 Shift 없는 꼴이 받지 않거나,
 * 두 꼴을 모두 받는 층에서 뜻이 갈릴 때만 따로(Shift+ArrowLeft 크게 옮기기·Shift+Tab 앞 후보·Shift+F10) — 아니면 같은 키(Shift+H·Shift+F·Shift+Enter·Shift+Esc)
 */
function receivedNames(press: (base: string, m: Mods) => (string | null)[]): string[] {
  const seen = new Map<string, (string | null)[]>();
  for (const base of BASES) for (const m of MODS) seen.set(tag(base, m), press(base, m));
  const out: string[] = [];
  for (const base of BASES)
    for (const m of MODS) {
      const r = seen.get(tag(base, m))!;
      if (r.every((x) => x === null)) continue;
      if (m.shiftKey) {
        const p = seen.get(tag(base, { ...m, shiftKey: false }))!;
        if (p.some((x) => x !== null) && !r.some((x, i) => x !== null && p[i] !== null && x !== p[i])) continue;
      }
      out.push(token(base, m));
    }
  return out;
}

/** 3D 보기(캔버스 — 3D 보기 안이라 172차 설정과 무관, 문서가 열림)에서 앱 창 키의 할 일 */
const routeOf = (base: string, m: Mods) =>
  routeKey({ key: keyOf(base, m), ctrl: m.ctrlKey, meta: m.metaKey, alt: m.altKey, shift: m.shiftKey, inText: false, control: null, hasDoc: true, modal: false, viewOnly: false });
/** 3D 보기를 다루는 앱 할 일(캔버스 값에 든다) */
const VIEW_ACTIONS = new Set(['grid', 'hide', 'isolate', 'home', 'escape']);
/** 창 어디서나 같은 문서 명령(캔버스 값 밖 — 열기 단추·분해 막대 되돌리기·다시 하기 단추가 하는 일) */
const DOC_ACTIONS = new Set(['open', 'undo', 'redo']);

const key = (el: EventTarget, k: string, o: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  el.dispatchEvent(e);
  return e;
};

function scene() {
  const w = new StepText();
  w.product('c', [cube(w, 10).solid], w.context());
  return stepToScene(w.bytes());
}

describe('3D 보기 캔버스 aria-keyshortcuts = 받는 키(218차)', () => {
  it('키를 두루 눌러 모은 받는 키 이름(앱 창 키·코어 키 표·코어 보기 키·X·Y·Z·L·작업 메뉴)과 값이 같다 — 217차까지 빠진 Home·H·I·F7·Shift+F10·ContextMenu, 문서 명령은 밖', () => {
    const j = jsdomViewer({ keyboard: true });
    restore = j.restore;
    const v = j.viewer;
    v.setScene(scene());
    v.setView('front', false);
    v.fit(false);
    v.renderNow();
    // 코어 보기 키(handleKey — 가상 커서 키 표를 달기 전): 받으면 막고 true
    const view = new Map<string, string | null>();
    for (const base of BASES)
      for (const m of MODS) view.set(tag(base, m), v.handleKey(new KeyboardEvent('keydown', { key: keyOf(base, m), cancelable: true, ...m })) ? 'view' : null);
    // 앱처럼 키보드 붙잡기를 달고(고르기 호스트의 lockArrow는 늘 받음 — 받는 키 고르기만 본다), 창 캡처에서 lockKey, 커서 자리 작업 메뉴는 menuAt
    let menu = false;
    const ks = installKeySnap(v, {
      tr: (s) => s,
      pickThrough: () => false,
      menuAt: () => (menu = true),
      pick: { faceMode: false, multiPick: false, pickUnit: 'part', doc: null, tangents: { locked: () => false }, lockArrow: () => true, cursorArrows: () => true },
    });
    let took = false;
    const capture = (e: KeyboardEvent): void => {
      if (!ks.lockKey(e)) return;
      took = true;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', capture, true);
    try {
      const doc = new Set<string>();
      const actions = new Set<string>();
      const names = receivedNames((base, m) => {
        const a = routeOf(base, m);
        if (a) actions.add(a);
        if (a && DOC_ACTIONS.has(a)) doc.add(token(base, m));
        const s = keySnapAction({ key: keyOf(base, m), ...m }, v.keyboardSnap!.keys);
        // 커서가 켜진 3D 보기에서 눌러 본다(작업 메뉴는 켜진 동안 — 꺼지면 다시 켠다)
        if (!v.keyboardCursor) key(v.canvas, 'ArrowUp');
        expect(v.keyboardCursor, tag(base, m)).not.toBeNull();
        took = false;
        menu = false;
        key(v.canvas, keyOf(base, m), m);
        return [a && VIEW_ACTIONS.has(a) ? a : null, s && JSON.stringify(s), view.get(tag(base, m))!, took ? 'lock' : null, menu ? 'menu' : null];
      });
      const value = v.canvas.getAttribute('aria-keyshortcuts')!.split(' ');
      expect(new Set(value).size, '겹친 이름 없음').toBe(value.length);
      expect([...value].sort()).toEqual([...new Set(names)].sort());
      // 손셈: 217차까지 빠져 있던 것
      expect(value).toEqual(expect.arrayContaining(['Home', 'H', 'I', 'F7', 'Shift+F10', 'ContextMenu']));
      expect(value).toHaveLength(30);
      // 앱 창 키의 할 일은 셋 갈래 — 3D 보기를 다룸(값), 문서 명령(값 밖), 코어에 넘김(viewer — 코어 층이 본다). 새 할 일이면 어느 갈래인지 정한다
      for (const a of actions) expect(VIEW_ACTIONS.has(a) || DOC_ACTIONS.has(a) || a === 'viewer', a).toBe(true);
      expect([...actions].filter((a) => DOC_ACTIONS.has(a)).sort()).toEqual(['open', 'redo', 'undo']);
      for (const t of doc) expect(value, t).not.toContain(t);
      expect([...doc]).toEqual(expect.arrayContaining(['Control+O', 'Meta+O', 'Control+Z', 'Meta+Z', 'Control+Shift+Z', 'Meta+Shift+Z', 'Control+Y']));
      // 받지 않는 꼴: Shift와 함께인 방향 잠금 글자(lockKey가 거름)·수정 키 하나(Shift — 꼴이 안 됨)
      for (const t of ['Shift+X', 'Shift+L', 'Shift', 'Control+H', 'Alt+Home']) expect(value, t).not.toContain(t);
    } finally {
      window.removeEventListener('keydown', capture, true);
    }
  });
});

describe('모델 트리 거르기 칸 aria-keyshortcuts = 받는 키(218차)', () => {
  it('Ctrl·⌘+F가 초점을 주는 칸(findToFilter) — 두루 눌러 모은 이름이 treeview.ts 원문의 값과 같다', () => {
    const f = document.createElement('input');
    document.body.append(f);
    try {
      const names = receivedNames((base, m) => [findToFilter(new KeyboardEvent('keydown', { key: keyOf(base, m), cancelable: true, ...m }), f) ? 'focus' : null]);
      const src = readFileSync(join(__dirname, '../../src/app/treeview.ts'), 'utf8');
      const lit = src.match(/o\.filter\.setAttribute\('aria-keyshortcuts', '([^']+)'\);/);
      expect(lit).not.toBeNull();
      expect(lit![1]!.split(' ').sort()).toEqual([...names].sort());
      expect(names.sort()).toEqual(['Control+F', 'Meta+F']);
    } finally {
      f.remove();
    }
  });

  it('src에서 aria-keyshortcuts를 다는 곳은 3D 보기 캔버스(keysnap.ts)·거르기 칸(treeview.ts)과 219차 버튼 자리(app.ts 열기·격리 풀기, toolbar.ts 전체 보기·격자, explodebar.ts 되돌리기·다시 하기)뿐이고 index.html에는 없다 — 새 자리면 그 칸의 받는 키 대조를 이 파일에', () => {
    const root = join(__dirname, '../../src');
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|js|mjs|html)$/.test(n)) files.push(p);
      }
    };
    walk(root);
    const sites = files.filter((p) => /setAttribute\('aria-keyshortcuts'|['"]aria-keyshortcuts['"]\s*:/.test(readFileSync(p, 'utf8'))).map((p) => p.slice(root.length + 1));
    expect(sites.sort()).toEqual(['app/app.ts', 'app/explodebar.ts', 'app/keysnap.ts', 'app/toolbar.ts', 'app/treeview.ts']);
    expect(readFileSync(join(__dirname, '../../index.html'), 'utf8')).not.toContain('aria-keyshortcuts');
  });
});

/** 실제 코어 뷰어 + 앱처럼 installKeySnap(고르기 호스트에 lockArrow·cursorArrows)과 창 keydown 캡처(217차 시험 꼴) */
function rig() {
  const sc = scene();
  const j = jsdomViewer({ keyboard: true });
  const v = j.viewer;
  v.setScene(sc);
  v.setView('front', false);
  v.fit(false);
  v.renderNow();
  const ex = stepEdgeIndex(sc);
  v.setMeasureSnap(measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, null, true));
  v.setMeasureMode(true);
  /** app.ts cursorArrows 흉내: 화살표가 가상 커서 몫인지(시험이 정한다) */
  let arrows = false;
  const lockArrow = (k: string, hold = false): boolean => {
    if (!v.measureMode) return false;
    const want = arrowLock(k, v.measurePointCount, v.measureInferenceLock);
    if (want === null || hold) return want !== null;
    v.setMeasureInferenceLock(want);
    return true;
  };
  const ks = installKeySnap(v, {
    tr: (s) => s,
    pickThrough: () => false,
    pick: { faceMode: false, multiPick: false, pickUnit: 'part', doc: null, tangents: { locked: () => false }, lockArrow, cursorArrows: () => arrows },
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
  return { v, setArrows: (on: boolean) => (arrows = on), lock: () => lockName(v.measureInferenceLock) };
}

describe('(ㄴ) 커서가 꺼져 있고 마우스가 3D 보기 밖일 때(218차)', () => {
  it('viewerLockHint 넷째 인자(화살표가 가상 커서 몫): 커서가 꺼져 있어도 켜진 커서의 글 — 주지 않으면 코어 keyboardCursor(217차 그대로)', () => {
    const edge = { kind: 'parallel' as const, direction: [Math.SQRT1_2, Math.SQRT1_2, 0] as [number, number, number] };
    const cur = { x: 400, y: 300 } as NonNullable<LockViewer['keyboardCursor']>;
    const lv = (hover: LockViewer['measureHoverLock'], c: LockViewer['keyboardCursor'] = null): LockViewer => ({ measurePointCount: 1, measureInferenceLock: null, measureHoverLock: hover, keyboardCursor: c });
    expect([viewerLockHint(lv(edge), false, null, true), viewerLockHint(lv(null), false, null, true)]).toEqual([ON, AXES]);
    expect([viewerLockHint(lv(edge), false, null, false), viewerLockHint(lv(null), false, null, false)]).toEqual([KEYS, ARROWS]);
    expect([viewerLockHint(lv(edge)), viewerLockHint(lv(null)), viewerLockHint(lv(edge, cur)), viewerLockHint(lv(null, cur))]).toEqual([KEYS, ARROWS, ON, AXES]);
    // 손가락 기기·잠갔을 때는 그대로
    expect(viewerLockHint(lv(edge), true, null, true)).toBeNull();
    expect(viewerLockHint({ ...lv(null), measureInferenceLock: { kind: 'axis', axis: 'y' } as LockViewer['measureInferenceLock'] }, false, null, true)).toBe('Y축으로 잠금');
  });

  it('실제 코어: 화살표가 커서 몫이면(cursorArrows) 커서가 꺼져 있어도 X·Y·Z·L이 방향 잠금 — 아니면(마우스가 3D 보기 위) 받지 않고 화살표가 잠금, Shift와 함께는 늘 받지 않음', () => {
    const r = rig();
    const { v } = r;
    v.canvas.focus();
    expect(v.keyboardCursor).toBeNull();
    // 마우스가 3D 보기 위(화살표 = 앱 잠금): X는 받지 않는다
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(false);
    expect(r.lock()).toBeNull();
    // 마우스가 밖(화살표 = 커서 켜기): 첫 점 전에도 X축 잠금·같은 키로 풂
    r.setArrows(true);
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('x');
    expect(v.keyboardCursor).toBeNull();
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    // 첫 점(가상 커서로 찍고 초점을 잠깐 떼어 커서를 끈 뒤 3D 보기로 돌아옴 — 커서는 꺼진 채)
    key(v.canvas, 'ArrowUp');
    key(v.canvas, 'Enter');
    expect(v.measurePointCount).toBe(1);
    const out = document.createElement('button');
    document.body.append(out);
    out.focus();
    v.canvas.focus();
    out.remove();
    expect(v.keyboardCursor).toBeNull();
    expect(document.activeElement).toBe(v.canvas);
    expect(key(v.canvas, 'z', { code: 'KeyZ' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('z');
    // L: 잠갔으면 푼다(↓와 같은 길)
    expect(key(v.canvas, 'l', { code: 'KeyL' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    expect(key(v.canvas, 'Y', { code: 'KeyY', shiftKey: true }).defaultPrevented).toBe(false);
    expect(r.lock()).toBeNull();
    r.setArrows(false);
    expect(key(v.canvas, 'y', { code: 'KeyY' }).defaultPrevented).toBe(false);
    expect(r.lock()).toBeNull();
  });

  it('app.ts: 화살표 임자(cursorArrows — 커서가 켜졌거나, 3D 보기에 초점이 있고 마우스가 밖)로 잠금 안내·다시 그리기 열쇠를 고르고, 마우스가 들고 날 때·캔버스 초점이 바뀔 때 다시 그림', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const method = (head: string): string => {
      const i = app.indexOf(`\n  ${head}`);
      expect(i, head).toBeGreaterThan(0);
      return app.slice(i, app.indexOf('\n  }\n', i));
    };
    expect(method('cursorArrows(): boolean {')).toContain("return !!v && arrowOwner(!!v.keyboardCursor, this.pointerIn || document.activeElement !== v.canvas) === 'core';");
    expect(method('private refreshLock(): void {')).toContain('const key = on ? `${lock}|${v.measurePointCount}|${can}|${this.cursorArrows()}` : \'\';');
    expect(method('private measureLockHint(): string | null {')).toContain('return viewerLockHint(v, this.touch, this.tangents, this.cursorArrows());');
    const between = (a: string, b: string): string => {
      const i = app.indexOf(a);
      expect(i, a).toBeGreaterThan(0);
      return app.slice(i, app.indexOf(b, i));
    };
    expect(between("this.hostEl.addEventListener('pointermove'", "this.hostEl.addEventListener('pointerleave'")).toContain('if (was !== this.pointerIn) this.refreshLock();');
    const leave = between("this.hostEl.addEventListener('pointerleave'", 'this.viewer = v;');
    expect(leave).toContain('this.refreshLock();');
    expect(leave).toContain("for (const t of ['focus', 'blur']) v.canvas.addEventListener(t, () => this.refreshLock());");
    // 고르기 호스트는 앱 자신(keysnap.ts lockKey가 cursorArrows를 읽는다)
    expect(app).toContain('pick: this,');
  });
});

/** 키를 두루 눌러 routeKey가 그 할 일을 고르는 키 이름(앱 설정 기본 — 172차 한 글자 키 어디서나, 문서가 열림) */
const routeNames = (want: string): string[] => receivedNames((base, m) => [routeOf(base, m) === want ? want : null]);
/** 앱 원문(12번 — 버튼 누르기와 키 갈래가 부르는 함수를 원문으로 대조) */
const APP = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
const appBetween = (a: string, b: string): string => {
  const i = APP.indexOf(a);
  expect(i, a).toBeGreaterThan(0);
  return APP.slice(i, APP.indexOf(b, i));
};

/** 도구 막대 호스트(누르기가 부른 일을 적는다) */
function toolHost(calls: string[]): ToolbarHost {
  const call = (n: string) => () => void calls.push(n);
  return {
    hasDoc: true,
    hasSelection: false,
    projection: 'perspective',
    renderMode: 'shadedEdges',
    gridOn: false,
    cubeOn: false,
    axesOn: false,
    measuring: false,
    panelOpen: false,
    pickUnit: 'part',
    multiPick: false,
    sectionAxis: null,
    sectionOn: false,
    hiddenEdges: false,
    profiles: false,
    partColors: false,
    ambientOcclusion: false,
    explodeOpen: false,
    fit: call('fit'),
    fitSelection: call('fitSelection'),
    setView: call('setView'),
    goHome: call('home'),
    setHome: call('setHome'),
    setProjection: call('proj'),
    setRenderMode: call('mode'),
    toggleHiddenEdges: call('hiddenEdges'),
    toggleProfiles: call('profiles'),
    togglePartColors: call('partColors'),
    toggleAmbientOcclusion: call('ao'),
    toggleExplode: call('explode'),
    toggleGrid: call('grid'),
    toggleCube: call('cube'),
    toggleAxes: call('axes'),
    toggleMeasure: call('measure'),
    setPickUnit: call('unit'),
    toggleMultiPick: call('multi'),
    setSectionAxis: call('section'),
    savePng: call('png'),
    exportItems: () => [],
    togglePanel: call('panel'),
  };
}

describe('말풍선이 단축키를 말하는 버튼의 aria-keyshortcuts = 같은 일을 하는 앱 키(219차)', () => {
  it('도구 막대 전체 보기·격자(jsdom): 전체 보기 = 앱이 코어에 넘겨 코어 handleKey가 fit을 부르는 키, 격자 = routeKey grid 키 — 누르기도 같은 일(host.fit·toggleGrid), 다른 버튼에는 없음', () => {
    const j = jsdomViewer({ keyboard: true });
    restore = j.restore;
    const v = j.viewer;
    v.setScene(scene());
    // 코어 handleKey가 부르는 this.fit을 센다(그리기는 보지 않는다)
    let fitted = false;
    (v as unknown as { fit: () => void }).fit = () => void (fitted = true);
    const fitKeys = receivedNames((base, m) => {
      if (routeOf(base, m) !== 'viewer') return [null];
      fitted = false;
      v.handleKey(new KeyboardEvent('keydown', { key: keyOf(base, m), cancelable: true, ...m }));
      return [fitted ? 'fit' : null];
    });
    expect(fitKeys).toEqual(['F']);
    expect(routeNames('grid')).toEqual(['F7']);
    const calls: string[] = [];
    const tb = new Toolbar(toolHost(calls));
    const tool = (n: string) => tb.el.querySelector<HTMLButtonElement>(`button[data-tool="${n}"]`)!;
    tool('fit').click();
    tool('grid').click();
    expect(calls).toEqual(['fit', 'grid']);
    expect(tool('fit').getAttribute('aria-keyshortcuts')?.split(' ')).toEqual(fitKeys);
    expect(tool('grid').getAttribute('aria-keyshortcuts')?.split(' ')).toEqual(routeNames('grid'));
    // 말풍선이 키를 말해도 같은 일이 아닌 버튼(표준 뷰 — 메뉴를 엶·1~7은 메뉴 항목의 일, 측정 — 켜고 끔·Esc는 지우기, 고르기 — Alt·Ctrl은 누르기 수정 키)와 나머지에는 없다
    expect([...tb.el.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.hasAttribute('aria-keyshortcuts')).map((b) => b.dataset.tool)).toEqual(['fit', 'grid']);
    // 앱: 도구 막대 호스트는 앱 자신, 전체 보기는 코어 fit, F7 갈래는 같은 toggleGrid
    expect(APP).toContain('this.toolbar = new Toolbar(this);');
    expect(appBetween('  fit(): void {', '\n  }')).toContain('this.viewer?.fit();');
    expect(appBetween("case 'grid':", 'break;')).toContain('this.toggleGrid();');
  });

  it('분해 막대 되돌리기·다시 하기(jsdom): 값 = routeKey undo·redo 키(Ctrl·⌘ 둘, 다시 하기는 Windows 꼴 Ctrl+Y도) — 누르기와 키 갈래가 같은 손질 도구 함수, 다른 버튼에는 없음', () => {
    const calls: string[] = [];
    const c = new ExplodeControls(
      () => {},
      () => {},
      { undo: () => void calls.push('undo'), redo: () => void calls.push('redo') },
    );
    const all = c.els.flatMap((e) => [...e.querySelectorAll<HTMLButtonElement>('button')]);
    const undo = all.find((b) => b.classList.contains('explode-undo'))!;
    const redo = all.find((b) => b.classList.contains('explode-redo'))!;
    undo.click();
    redo.click();
    expect(calls).toEqual(['undo', 'redo']);
    expect(routeNames('undo')).toEqual(['Control+Z', 'Meta+Z']);
    expect(routeNames('redo').sort()).toEqual(['Control+Shift+Z', 'Control+Y', 'Meta+Shift+Z'].sort());
    expect(undo.getAttribute('aria-keyshortcuts')?.split(' ').sort()).toEqual(routeNames('undo').sort());
    expect(redo.getAttribute('aria-keyshortcuts')?.split(' ').sort()).toEqual(routeNames('redo').sort());
    expect(all.filter((b) => b.hasAttribute('aria-keyshortcuts')).map((b) => b.className)).toEqual(['seg-btn explode-undo', 'seg-btn explode-redo']);
    // 앱: 키 갈래도 같은 손질 도구(막대의 TweakHandlers로 넘긴 ExplodeTweakTool)
    expect(appBetween("case 'undo':", 'break;')).toContain('this.tweakTool?.undo()');
    expect(appBetween("case 'redo':", 'break;')).toContain('this.tweakTool?.redo()');
    expect(APP).toContain('const tool = (this.tweakTool = new m.ExplodeTweakTool({');
    expect(appBetween('this.explodeUi = new m.ExplodeControls(', ');')).toContain('tool,');
  });

  it('머리 줄 열기·격리 띠 격리 풀기(app.ts 원문): 값 = routeKey open·isolate 키 — 누르기(pickFile·unisolate)와 키 갈래(pickFile·isolateSelection — 격리 중이면 unisolate, 격리 띠는 격리 중에만 보임)가 같은 일', () => {
    const lit = (re: RegExp): string[] => {
      const m = APP.match(re);
      expect(m, String(re)).not.toBeNull();
      return m![1]!.split(' ').sort();
    };
    expect(routeNames('open')).toEqual(['Control+O', 'Meta+O']);
    expect(routeNames('isolate')).toEqual(['I']);
    expect(lit(/openBtn\.setAttribute\('aria-keyshortcuts', '([^']+)'\);/)).toEqual(routeNames('open').sort());
    expect(lit(/const isoOff = h\('button', \{[^}]*'aria-keyshortcuts': '([^']+)'/)).toEqual(routeNames('isolate'));
    expect(APP).toContain("openBtn.addEventListener('click', () => this.pickFile());");
    expect(appBetween("case 'open':", 'return;')).toContain('this.pickFile();');
    expect(APP).toContain("isoOff.addEventListener('click', () => this.unisolate());");
    expect(appBetween("case 'isolate':", 'break;')).toContain('this.isolateSelection()');
    expect(appBetween('  isolateSelection(mode', '\n  }\n')).toContain('if (d.vis.isolated || d.dim) {\n      this.unisolate();');
    expect(appBetween('  private syncIsolate(): void {', '\n  }\n')).toContain('this.isoBar.hidden = !on;');
  });
});
