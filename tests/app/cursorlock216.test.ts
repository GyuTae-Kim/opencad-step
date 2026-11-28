// @vitest-environment jsdom
/**
 * 216차: 가상 커서가 켜진 동안 두 점 측정 방향 잠금 글쇠 X·Y·Z·L(WCAG 2.1.1 — 커서가 켜진 동안 화살표는 커서를 옮겨, 방향 잠금은 누르는 동안만인 Shift뿐이었다).
 * keysnap.ts `lockKeyOf`(적힌 라틴 글자 먼저, 아니면 물리 키 code)와 installKeySnap `lockKey`(받는 조건·되풀이·알림)를 실제 코어 뷰어(jsdom)로 본다:
 * 정육면체를 앞에서 보고 가상 커서로 앞면 가운데를 첫 점으로 찍은 뒤, 앱 창 keydown 캡처와 같은 차례(코어 캔버스 리스너보다 먼저)에서 lockKey를 부른다.
 * 잠금 몸통은 앱 고르기 호스트(app.ts 자신)의 lockArrow — 여기서는 app.ts와 같은 arrowLock 꼴(코어 setMeasureInferenceLock, 곡선 접선 없음)로 흉내 내고,
 * app.ts가 그 길을 쓰는지는 원문으로 본다.
 * - X·Y·Z = 커서가 꺼졌을 때의 → · ← · ↑(그 축 — 같은 축이면 풂, 다른 축이면 바꿈, 첫 점 전에도), L = ↓(지금 방향 — 첫 점 뒤, 잠겼으면 풂, 잠글 것이 없으면 실패 알림만)
 * - Ctrl·⌘·Alt·Shift·막힌 사건·커서 꺼짐·둘째 점 뒤·측정 밖은 받지 않고, 누른 채 되풀이는 막기만, 한글 입력기(ㅌ·ㅛ·ㅋ·ㅣ·Process)는 물리 키, 독일어·AZERTY 자판은 적힌 글자
 * - 알림: 잠근 축·푼 것은 가상 커서 알림 영역에 — 다음 그림에서 코어가 그 자리를 다시 알리면('refresh') 그 글 앞에(코어 켜기 틀의 이음 글), 아니면 다음 프레임에 홀로.
 *   잠글 것이 없어 앞뒤 모두 잠금이 없으면 내지 않는다. 네 언어
 * - 겹침 0(앱 키·코어 키 표·뷰어 키), 도움말 키 표 줄·aria-keyshortcuts, 새 원문 둘의 네 사전 값
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { KEY_SNAP_KEYS, keySnapAction, type KeyboardSnapAnnouncement } from 'opencad-viewer3d';
import { catalogs, sourceMessage, translate } from '../../site/i18n.mjs';
import { stepToScene } from '../../src/index';
import { stepEdgeIndex } from '../../src/app/doc';
import { routeKey } from '../../src/app/keys';
import { installKeySnap, keyHelpRows, keySnapAnnounceText, keySnapMessagesFor, lockKeyOf } from '../../src/app/keysnap';
import { arrowLock, circleCenters, LOCK_HINTS, lockName, measureSnapOptions } from '../../src/app/snap';
import { cube, StepText } from '../stepText';
import { jsdomViewer } from './jsdomview';

const CODES = ['en', 'ja', 'zh-CN', 'de'] as const;
const hangul = /[가-힣]/;
const ko = (s: string): string => s;
const UNLOCKED = '방향 잠금을 풀었습니다';
const ROW = '두 점 측정 방향 잠금(X축 · Y축 · Z축 · 지금 방향 — 다시 누르면 풀기)';
/** 코어 켜기 틀 「가상 커서를 켰습니다. {0}. {1}」의 {0}과 {1} 사이(화면 언어) — 앱 글과 코어 다시 알림을 잇는 글 */
const GAP: Record<'ko' | (typeof CODES)[number], string> = { ko: '. ', en: '. ', ja: '。', 'zh-CN': '。', de: '. ' };

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

/** 실제 코어 뷰어 + 앱처럼 installKeySnap(고르기 호스트에 lockArrow)과 창 keydown 캡처. 다음 프레임은 쌓아 두었다가 frame()이 차례대로(코어 그리기 → 앱) */
function rig(tr: (s: string) => string = ko) {
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
  let last: KeyboardSnapAnnouncement | null = null;
  /** app.ts lockArrow와 같은 길(곡선 접선 없음 — ↓·L의 지금 방향은 코어 판정, 잠글 것이 없으면 앱은 알림 상자 경고 lockFailed) */
  const lockArrow = (k: string, hold = false): boolean => {
    if (!v.measureMode) return false;
    const want = arrowLock(k, v.measurePointCount, v.measureInferenceLock);
    if (want === null || hold) return want !== null;
    if (want === false) v.setMeasureInferenceLock(false);
    else if (!v.setMeasureInferenceLock(want)) failed++;
    return true;
  };
  const ks = installKeySnap(v, {
    tr,
    pickThrough: () => false,
    announced: (a) => void (last = a),
    pick: { faceMode: false, multiPick: false, pickUnit: 'part', doc: null, tangents: { locked: () => false }, lockArrow },
  });
  // 앞서 막는 다른 캡처(막힌 사건은 받지 않는다) → 앱 창 keydown 캡처(받으면 막고 멈춘다 — 코어 캔버스 리스너·창 버블에 가지 않음)
  let block = '';
  const blocker = (e: KeyboardEvent): void => {
    if (block && e.key === block) e.preventDefault();
  };
  const capture = (e: KeyboardEvent): void => {
    if (ks.lockKey(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener('keydown', blocker, true);
  window.addEventListener('keydown', capture, true);
  restore = () => {
    window.removeEventListener('keydown', blocker, true);
    window.removeEventListener('keydown', capture, true);
    j.restore();
  };
  frame();
  return {
    v,
    ks,
    opts,
    frame,
    failed: () => failed,
    last: () => last,
    clear: () => void (last = null),
    block: (k: string) => void (block = k),
    said: () => ks.live.textContent ?? '',
    lock: () => lockName(v.measureInferenceLock),
    /** 코어가 마지막으로 알린 글을 앱 알림 영역 꼴로(keySnapAnnounceText — 상태 막대 이름) */
    core: () => keySnapAnnounceText(last!, keySnapMessagesFor(tr), tr),
    /** 앱 글: 그 프레임에 코어가 다시 알렸으면('refresh') 그 글 앞에, 아니면 홀로 */
    heard: (notice: string, gap = GAP.ko) => (last?.reason === 'refresh' ? `${tr(notice)}${gap}${keySnapAnnounceText(last, keySnapMessagesFor(tr), tr)}` : tr(notice)),
  };
}

describe('겹침 셈·글자 읽기(216차)', () => {
  it('X·Y·Z·L은 앱 키(routeKey — 3D 보기 키는 뷰어에 넘길 뿐)·코어 키 표가 쓰지 않고, Ctrl/⌘+Z·Ctrl+Y(되돌리기·다시 하기)는 수정 키라 받지 않는다', () => {
    for (const k of ['x', 'y', 'z', 'l', 'X', 'Y', 'Z', 'L']) {
      expect(routeKey({ key: k, hasDoc: true }), k).toBe('viewer');
      expect(keySnapAction({ key: k }, KEY_SNAP_KEYS), k).toBeNull();
    }
    expect(routeKey({ key: 'z', ctrl: true, hasDoc: true })).toBe('undo');
    expect(routeKey({ key: 'z', meta: true, shift: true, hasDoc: true })).toBe('redo');
    expect(routeKey({ key: 'y', ctrl: true, hasDoc: true })).toBe('redo');
    // 앱 글쇠(H·I·F·1~7·F7·Home)와 코어 걷기 키(W·A·S·D·Q·E)는 잠금 글자가 아니다
    for (const k of ['h', 'H', 'i', 'f', 'F', '1', '7', 'F7', 'Home', 'w', 'a', 's', 'd', 'q', 'e']) expect(lockKeyOf({ key: k, code: '' }), k).toBeNull();
    // 코어 handleKey(걷기를 켜지 않은 뷰어 — STEP은 걷기를 쓰지 않는다)는 이 글자를 처리하지 않는다
    const r = rig();
    for (const k of ['x', 'y', 'z', 'l']) expect(r.v.handleKey(new KeyboardEvent('keydown', { key: k, cancelable: true })), k).toBe(false);
  });

  it('lockKeyOf: 적힌 글자가 라틴 글자면 그것(대소문자 무시 — 독일어 자판 Y·Z 자리·AZERTY도 적힌 대로), 아니면(한글 입력기·Process 등) 물리 키 code', () => {
    const cases: [string, string, string | null][] = [
      ['x', 'KeyX', 'x'], ['X', 'KeyX', 'x'], ['l', 'KeyL', 'l'], ['L', 'KeyL', 'l'], ['x', '', 'x'],
      // 독일어 자판(Y·Z 자리가 바뀜)·AZERTY(KeyZ 자리에 W): 적힌 글자
      ['z', 'KeyY', 'z'], ['y', 'KeyZ', 'y'], ['w', 'KeyZ', null], ['q', 'KeyA', null],
      // 한글 두벌식(ㅌ X · ㅛ Y · ㅋ Z · ㅣ L)·조합 중 'Process'·러시아 자판: 물리 키
      ['ㅌ', 'KeyX', 'x'], ['ㅛ', 'KeyY', 'y'], ['ㅋ', 'KeyZ', 'z'], ['ㅣ', 'KeyL', 'l'], ['Process', 'KeyL', 'l'], ['Unidentified', 'KeyZ', 'z'], ['ч', 'KeyX', 'x'],
      ['ㅁ', 'KeyA', null], ['Process', 'KeyA', null], ['Process', '', null], ['ArrowRight', 'ArrowRight', null],
    ];
    for (const [k, code, want] of cases) expect(lockKeyOf({ key: k, code }), `${k} ${code}`).toBe(want);
  });
});

describe('가상 커서 X·Y·Z·L(실제 코어 — 앱 창 keydown 캡처 차례)', () => {
  it('축 잠금·같은 키로 풂·다른 축으로 바꿈·L·되풀이·수정 키·입력기·막힌 사건·커서 꺼짐·잠글 것 없음·둘째 점 뒤, 알림은 코어 다시 알림 앞(없으면 홀로)', () => {
    const r = rig();
    const { v } = r;
    expect(v.canvas.getAttribute('aria-keyshortcuts')!.split(' ')).toEqual(expect.arrayContaining(['X', 'Y', 'Z', 'L']));
    // 커서가 꺼져 있으면 받지 않는다(그때는 화살표가 잠금 — 이 키는 그대로 창 버블로)
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(false);
    expect(r.lock()).toBeNull();
    key(v.canvas, 'ArrowUp');
    expect(v.keyboardCursor).toMatchObject({ mode: 'measure' });
    // 첫 점 전: L(↓ — 지금 방향은 첫 점 뒤)은 받지 않고, X·Y·Z(→·←·↑ 축 잠금은 첫 점 전에도)는 받는다
    expect(key(v.canvas, 'l', { code: 'KeyL' }).defaultPrevented).toBe(false);
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('x');
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    r.frame();
    key(v.canvas, 'Enter');
    expect(v.measurePointCount).toBe(1);
    // 오른쪽으로 30화소(걸음 5 × 6): 첫 점 X축 위(keysnap 125차 시험 꼴)
    for (let i = 0; i < 6; i++) key(v.canvas, 'ArrowRight');
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x' });
    r.frame();
    // X: X축으로 잠그고, 알림은 다음 그림 — 코어가 그 자리를 다시 알린 글('refresh') 앞에 「X축으로 잠금」
    r.clear();
    const moved = r.said();
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('x');
    expect(r.said()).toBe(moved);
    r.frame();
    expect(r.last()?.reason).toBe('refresh');
    expect(r.core()).toContain('잠금');
    expect(r.said()).toBe(`X축으로 잠금. ${r.core()}`);
    // 누른 채 되풀이: 막기만(잠금·알림 그대로)
    r.clear();
    const held = r.said();
    expect(key(v.canvas, 'x', { code: 'KeyX', repeat: true }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('x');
    r.frame();
    expect(r.last()).toBeNull();
    expect(r.said()).toBe(held);
    // 수정 키(Ctrl·⌘·Alt·Shift)는 받지 않는다 — 잠금 그대로
    for (const o of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
      expect(key(v.canvas, o.shiftKey ? 'X' : 'x', { code: 'KeyX', ...o }).defaultPrevented, JSON.stringify(o)).toBe(false);
      expect(r.lock()).toBe('x');
    }
    // 같은 키(대문자 고정 — Shift 없음): 풂, 「방향 잠금을 풀었습니다」를 코어 다시 알림 앞에
    r.clear();
    expect(key(v.canvas, 'X', { code: 'KeyX' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    r.frame();
    expect(r.last()?.reason).toBe('refresh');
    expect(r.said()).toBe(`방향 잠금을 풀었습니다. ${r.core()}`);
    // 한글 입력기(ㅋ — 물리 키 KeyZ)·조합 중(Process — KeyY)·독일어 자판(적힌 z — KeyY 자리): 다른 축으로 바꾼다
    for (const [k, code, axis] of [['ㅋ', 'KeyZ', 'z'], ['Process', 'KeyY', 'y'], ['z', 'KeyY', 'z']] as const) {
      r.clear();
      expect(key(v.canvas, k, { code }).defaultPrevented, k).toBe(true);
      expect(r.lock(), k).toBe(axis);
      r.frame();
      expect(r.said(), k).toBe(r.heard(`${axis.toUpperCase()}축으로 잠금`));
    }
    // AZERTY(KeyZ 자리에 적힌 w)는 받지 않는다
    expect(key(v.canvas, 'w', { code: 'KeyZ' }).defaultPrevented).toBe(false);
    expect(r.lock()).toBe('z');
    // L: 잠겼으면(어느 잠금이든) 풂
    r.clear();
    expect(key(v.canvas, 'l', { code: 'KeyL' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    r.frame();
    expect(r.said()).toBe(r.heard(UNLOCKED));
    // L: 풀려 있으면 지금 후보의 방향(첫 점 X축 위 — X축), 한글 입력기 ㅣ도
    key(v.canvas, 'ArrowLeft');
    key(v.canvas, 'ArrowRight');
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x' });
    r.frame();
    r.clear();
    expect(key(v.canvas, 'ㅣ', { code: 'KeyL' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('x');
    r.frame();
    expect(r.last()?.reason).toBe('refresh');
    expect(r.said()).toBe(`X축으로 잠금. ${r.core()}`);
    expect(key(v.canvas, 'L', { code: 'KeyL' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    r.frame();
    // 앞선 캡처가 막은 사건은 받지 않는다
    r.block('x');
    const seen = r.said();
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    r.frame();
    expect(r.said()).toBe(seen);
    r.block('');
    // 빈 곳(왼쪽 위 — 후보 없음): 코어가 다시 알리지 않아 다음 프레임에 앱 글만
    for (let i = 0; i < 7; i++) key(v.canvas, 'ArrowLeft', { shiftKey: true });
    for (let i = 0; i < 5; i++) key(v.canvas, 'ArrowUp', { shiftKey: true });
    expect(v.measureHoverSnap).toBeNull();
    r.frame();
    r.clear();
    expect(key(v.canvas, 'z', { code: 'KeyZ' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBe('z');
    r.frame();
    expect(r.last()).toBeNull();
    expect(r.said()).toBe('Z축으로 잠금');
    expect(key(v.canvas, 'z', { code: 'KeyZ' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    r.frame();
    expect(r.last()).toBeNull();
    expect(r.said()).toBe(UNLOCKED);
    // 잠글 것이 없음: 마지막으로 본 방향(코어 — 첫 점 X축)을 잊게 붙잡기 선택을 다시 준 뒤(앱 syncMeasureSnap과 같은 길) L —
    // 받아 막고 앱 실패 알림(알림 상자)만, 앞뒤 모두 잠금이 없어 가상 커서 알림 영역에는 내지 않는다
    v.setMeasureSnap(r.opts);
    r.frame();
    expect(v.measurePointCount).toBe(1);
    expect(v.measureHoverLock).toBeNull();
    r.clear();
    const none = r.said();
    expect(key(v.canvas, 'l', { code: 'KeyL' }).defaultPrevented).toBe(true);
    expect(r.lock()).toBeNull();
    expect(r.failed()).toBe(1);
    r.frame();
    expect(r.said()).toBe(none);
    // 둘째 점 뒤(방향을 잡는 중이 아님)는 받지 않는다
    for (let i = 0; i < 7; i++) key(v.canvas, 'ArrowRight', { shiftKey: true });
    for (let i = 0; i < 5; i++) key(v.canvas, 'ArrowDown', { shiftKey: true });
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x' });
    key(v.canvas, 'Enter');
    expect(v.measurePointCount).toBe(2);
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(false);
    expect(r.lock()).toBeNull();
    // 측정 밖(고르기)도 받지 않는다
    v.setMeasureMode(false);
    expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented).toBe(false);
  });

  it('네 언어: 잠근 축·푼 알림은 화면 언어이고 코어 다시 알림과 화면 언어 이음 글(코어 켜기 틀 — 영·독 「. 」, 일·중 「。」)로 잇는다', () => {
    for (const code of CODES) {
      const tr = (s: string): string => translate(s, code);
      const r = rig(tr);
      const { v } = r;
      key(v.canvas, 'ArrowUp');
      key(v.canvas, 'Enter');
      for (let i = 0; i < 6; i++) key(v.canvas, 'ArrowRight');
      r.frame();
      r.clear();
      expect(key(v.canvas, 'x', { code: 'KeyX' }).defaultPrevented, code).toBe(true);
      r.frame();
      expect(r.last()?.reason, code).toBe('refresh');
      expect(r.said(), code).toBe(`${catalogs[code]!['X축으로 잠금']}${GAP[code]}${r.core()}`);
      expect(r.said(), code).not.toMatch(hangul);
      r.clear();
      key(v.canvas, 'x', { code: 'KeyX' });
      r.frame();
      expect(r.said(), code).toBe(`${catalogs[code]![UNLOCKED]}${GAP[code]}${r.core()}`);
      expect(r.said(), code).not.toMatch(hangul);
      restore!();
      restore = null;
    }
  });
});

describe('도움말·사전·app.ts 길(216차)', () => {
  it('도움말 키 표에 X · Y · Z · L 줄, 새 원문 둘(푼 알림·키 표 줄)은 네 사전에 같은 사전 근거 값이 있고 같은 언어의 다른 값과 겹치지 않아 거꾸로 찾으면 제 원문 — 잠근 알림은 있는 원문(LOCK_HINTS)', () => {
    expect(keyHelpRows({ step: 5, bigStep: 50, keys: KEY_SNAP_KEYS })).toContainEqual(['X · Y · Z · L', ROW]);
    const want: Record<(typeof CODES)[number], [string, string]> = {
      en: ['Direction unlocked', 'Two-point measurement direction lock (X axis · Y axis · Z axis · current direction — press again to unlock)'],
      ja: ['方向ロックを解除しました', '2点測定の方向ロック（X 軸 · Y 軸 · Z 軸 · 現在の方向 — もう一度押すと解除）'],
      'zh-CN': ['已解除方向锁定', '两点测量方向锁定（X 轴 · Y 轴 · Z 轴 · 当前方向 — 再按一次解锁）'],
      de: ['Richtung entsperrt', 'Richtungssperre der Zwei-Punkt-Messung (X-Achse · Y-Achse · Z-Achse · aktuelle Richtung — erneut drücken zum Entsperren)'],
    };
    for (const code of CODES) {
      const c = catalogs[code]!;
      expect([UNLOCKED, ROW].map((k) => c[k]), code).toEqual(want[code]);
      const all = Object.values(c);
      for (const [i, k] of [UNLOCKED, ROW].entries()) {
        const v = want[code][i]!;
        expect(all.filter((x) => x === v).length, `${code}: ${k}`).toBe(1);
        expect(sourceMessage(v), `${code}: ${v}`).toBe(k);
      }
      // 같은 사전 근거: 「방향 잠금 풀기」 버튼의 풀다 낱말, 키 표 줄은 같은 대화 상자 화살표 안내 줄의 축·지금 방향 낱말과 잠금 버튼 말풍선의 「다시 누르면 풀기」
      expect(c[UNLOCKED]!.toLowerCase()).toContain(code === 'en' ? 'unlocked' : code === 'de' ? 'entsperrt' : code === 'ja' ? '解除' : '解除');
      const tip = c['지금 방향 잠그기(다시 누르면 풀기)']!;
      expect(c[ROW]).toContain(tip.slice(tip.search(/[(（]/) + 1, tip.search(/[)）]/)));
      for (const t of Object.values(LOCK_HINTS)) expect(translate(t, code), `${code}: ${t}`).not.toMatch(hangul);
    }
  });

  it('app.ts: 창 keydown 캡처가 화살표 잠금 다음에 keySnap.lockKey를 부르고(받으면 막고 멈춤), 화살표와 X·Y·Z·L이 같은 lockArrow(되풀이는 받는지만) — 고르기 호스트는 앱 자신', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    const method = (head: string): string => {
      const i = app.indexOf(`\n  ${head}`);
      expect(i, head).toBeGreaterThan(0);
      return app.slice(i, app.indexOf('\n  }\n', i));
    };
    const i = app.indexOf("if (this.tangentShift(ev) || ev.ctrlKey || ev.metaKey || ev.altKey || ev.key === 'Shift') return;");
    expect(i).toBeGreaterThan(0);
    const cap = app.slice(i, app.indexOf('ev.stopPropagation();', i));
    expect(cap.indexOf('this.arrowMeasureLock(ev)')).toBeGreaterThan(0);
    expect(cap.indexOf('this.keySnap?.lockKey(ev)')).toBeGreaterThan(cap.indexOf('this.arrowMeasureLock(ev)'));
    expect(method('private arrowMeasureLock(ev: KeyboardEvent): boolean {')).toContain('return this.lockArrow(ev.key);');
    const lock = method('lockArrow(key: string, hold = false): boolean {');
    expect(lock).toContain('if (!v?.measureMode || this.entMeasuring) return false;');
    expect(lock).toContain('const want = arrowLock(key, v.measurePointCount, v.measureInferenceLock);');
    expect(lock).toContain('if (want === null || hold) return want !== null;');
    expect(app).toContain('pick: this,');
  });
});
