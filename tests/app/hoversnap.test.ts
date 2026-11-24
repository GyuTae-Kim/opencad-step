// @vitest-environment jsdom
/**
 * 106차·108차·111차: 두 점 측정 중 마우스를 멈춘 채 장면이 바뀐 뒤 상태 막대·측정 띠의 스냅 이름(app.ts showHoverSnap — 코어 measureHoverSnap).
 * - 실제 코어(jsdom, 가짜 WebGL): 보이기(H·I — setItemVisible)는 다음 그림에서 그 커서 자리로 미리 보기를 다시 구하고(0.98.0), 겉모습(setItemLooks)·단면도
 *   코어 0.109.0부터 그렇게 다시 구한다(0.108.0은 버렸다 — 111차). 붙잡기 선택 다시 주기(곡선 계산 조각을 받은 뒤 setMeasureSnap)는 그대로 버린다.
 *   그동안 3D 보기의 포인터 사건·가상 커서 알림은 하나도 오지 않는다(단면만 코어 onSectionChange)
 * - 108차: 코어 0.103.0 onMeasureHoverChange가 미리 보기 값이 바뀐 그 그림 뒤 한 번 알린다 — 앱은 이 알림 하나로 이름을 읽는다(106차 sceneSnap 여섯 곳과
 *   포인터 이동·떠남 뒤 다음 프레임 읽기를 걷음). 105차 길(포인터 사건·가상 커서 알림만)은 앞 이름이 남는다. 포인터 이동·떠남 뒤 이름은 다음 프레임 읽기와 같고
 *   값이 같은 이동은 알림이 없다. 측정이 꺼져 있으면 알림이 오지 않는다
 * - app.ts 원문: sceneSnap이 없고, 뷰어를 만들 때 onMeasureHoverChange 하나(측정 중에만 showHoverSnap), 3D 보기의 포인터 이동·떠남은 다음 프레임 읽기를 잡지 않는다
 * - putVisibility(looks.ts — 106차에 앱 입구 applyVisibility에서 뷰어 조각으로 옮김): 앞과 같은 setItemVisible 호출
 * 가리키는 자리는 상자 모서리에서 상자 안쪽으로 3화소(경계·구석을 정확히 가리키지 않는다)
 * - 116차(코어 0.115.0·0.116.0 — measureSnapOptions가 켠다): 첫 점에서 지나간 곧은 모서리에 수직인 방향 위 점은 "모서리에 수직"(수직 발 「수직점」과 가름 —
 *   뷰어 조각 trackdir.ts guideSnapLabel, app.ts는 그 이름 ?? hoverSnapLabel), 찍은 둘째 점의 결과 이름도. 겹친 후보 자리에서 Tab·Shift+Tab이 마우스 미리 보기를
 *   돌리고(measureCandidates 차례) 앱 이름이 코어 미리 보기 알림으로 따라오며, 돌리는 중 Esc는 돌리기를 풀고 첫 후보로(측정 지우기보다 먼저)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeasureHoverSnap, MeasureResult, Viewer3d } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { touchPointerEvent } from '../../src/app/aim';
import { stepEdgeIndex } from '../../src/app/doc';
import { installKeySnap } from '../../src/app/keysnap';
import { putVisibility } from '../../src/app/looks';
import { circleCenters, hoverSnapLabel, measureSnapOptions, snapPair } from '../../src/app/snap';
import { guideSnapLabel, straightEdgeFilter } from '../../src/app/trackdir';
import { translate } from '../../site/i18n.mjs';
import { cube, StepText } from '../stepText';
import { jsdomViewer } from './jsdomview';

let restore: (() => void) | null = null;
beforeEach(() => {
  // 끌어온 축 머무르기(0.5초 — 코어 setTimeout)가 시험 중에 끼어들지 않게
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  restore?.();
  restore = null;
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** 나란히 놓은 두 부품(왼쪽 x 0~10, 오른쪽 x 20~30 — 한 변 10, 앞면 y = 0) */
function pair(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const left = w.product('left', [w.ax2([0, 0, 0]), cube(w, 10, [0, 0, 0], 'left-body').solid], ctx);
  const right = w.product('right', [w.ax2([0, 0, 0]), cube(w, 10, [20, 0, 0], 'right-body').solid], ctx);
  const root = w.product('pair', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, left, w.ax2([0, 0, 0]), 'left-1');
  w.place(root, right, w.ax2([0, 0, 0]), 'right-1');
  return w.bytes();
}

/** 105차 길 흉내(포인터 사건·가상 커서 알림만): 사건이 오면 다음 프레임(코어가 그린 뒤)에 measureHoverSnap을 읽는다 — 106차까지 포인터 길도 이 꼴 */
class FrameRead {
  text: string | null = null;
  private due = false;
  constructor(
    private readonly v: Viewer3d,
    host: HTMLElement,
  ) {
    for (const t of ['pointermove', 'pointerleave']) host.addEventListener(t, () => this.schedule());
  }
  schedule(): void {
    this.due = true;
  }
  /** 코어가 그린 다음(같은 프레임의 뒤 예약) */
  read(): void {
    if (!this.due) return;
    this.due = false;
    this.text = this.v.measureMode ? hoverSnapLabel(this.v.measureHoverSnap) : null;
  }
}

/** 108차 길 흉내(app.ts v.onMeasureHoverChange(() => v.measureMode && this.showHoverSnap())): 알림이 오면 그 자리에서 읽는다(측정 중에만) */
class HoverNote {
  text: string | null = null;
  /** 받은 알림 수 */
  calls = 0;
  constructor(v: Viewer3d) {
    v.onMeasureHoverChange(() => {
      this.calls++;
      if (v.measureMode) this.text = hoverSnapLabel(v.measureHoverSnap);
    });
  }
}

interface Rig {
  v: Viewer3d;
  host: HTMLElement;
  /** 오른쪽 상자 앞면 오른쪽 위 모서리에서 상자 안쪽으로 3화소 */
  at: { x: number; y: number };
  right: string;
  /** 붙잡기 선택을 앱처럼 다시 준다(곡선 계산 조각을 받은 뒤의 syncMeasureSnap) */
  resnap: () => void;
  /** 3D 보기의 포인터 사건·가상 커서 알림·코어 단면 알림 */
  seen: string[];
  old: FrameRead;
  now: HoverNote;
}

function rig(): Rig {
  const j = jsdomViewer({ keyboard: true });
  restore = j.restore;
  const v = j.viewer;
  const sc = stepToScene(pair(), { name: 'pair.stp' });
  v.setScene(sc);
  v.setView('front', false);
  v.fit(false);
  v.renderNow();
  const ex = stepEdgeIndex(sc);
  // 앱처럼(syncMeasureSnap — 곡선 붙잡기를 받기 전): 모서리 표·원 중심, 접점 선택
  const resnap = (): void => v.setMeasureSnap(measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, null, true));
  resnap();
  v.setMeasureMode(true);
  const seen: string[] = [];
  for (const t of ['pointermove', 'pointerleave']) j.host.addEventListener(t, () => seen.push(t));
  const old = new FrameRead(v, j.host);
  const now = new HoverNote(v);
  installKeySnap(v, {
    tr: (ko) => ko,
    pickThrough: () => false,
    announced: (a) => {
      seen.push(`announce ${a.reason}`);
      old.schedule();
    },
  });
  v.onSectionChange(() => seen.push('section'));
  const c = v.project([30, 0, 10])!;
  const m = v.project([25, 0, 5])!;
  const k = 3 / Math.hypot(m.x - c.x, m.y - c.y);
  const at = { x: c.x + (m.x - c.x) * k, y: c.y + (m.y - c.y) * k };
  const p = v.pick(at.x, at.y);
  expect(p, '오른쪽 상자 위').toBeTruthy();
  return { v, host: j.host, at, right: p!.id, resnap, seen, old, now };
}

/** 다음 프레임: 코어가 그리고(미리 보기를 구하고 값이 바뀌었으면 알린다) 105차 흉내가 읽는다 */
function frame(r: Rig): void {
  r.v.renderNow();
  r.old.read();
}

/** 마우스를 그 자리로 옮긴다(그리기 없이) */
function move(r: Rig, at = r.at): void {
  r.v.canvas.dispatchEvent(touchPointerEvent('pointermove', 1, at.x, at.y, 'mouse'));
}

/** 마우스를 그 자리로 옮기고 다음 프레임 */
function hover(r: Rig, at = r.at): void {
  move(r, at);
  frame(r);
}

/** 마우스가 3D 보기를 떠나고 다음 프레임(pointerleave는 거품이 일지 않아 브라우저처럼 캔버스와 호스트에 따로) */
function leave(r: Rig): void {
  r.v.canvas.dispatchEvent(touchPointerEvent('pointerleave', 1, 0, 0, 'mouse'));
  r.host.dispatchEvent(touchPointerEvent('pointerleave', 1, 0, 0, 'mouse'));
  frame(r);
}

describe('측정 중 장면 길 뒤 스냅 이름(106차·108차)', () => {
  it('마우스를 멈춘 채 H로 커서 아래 바디를 숨기면 코어는 다음 그림에서 그 자리 미리 보기를 다시 구하고(없음) 그 그림 뒤 알림이 한 번 — 앱이 듣던 사건은 오지 않아 105차 길은 앞 이름, 108차 길은 숨김', () => {
    const r = rig();
    hover(r);
    const name = hoverSnapLabel(r.v.measureHoverSnap);
    expect(['끝점', '꼭짓점']).toContain(name);
    expect([r.old.text, r.now.text]).toEqual([name, name]);
    const n = r.seen.length;
    const c = r.now.calls;
    // app.ts hideSelection → setItemsVisible → applyVisibility(setItemVisible — 106차의 다음 프레임 읽기는 걷음)
    r.v.setItemVisible(r.right, false);
    // 그리기 전에는 알리지 않는다(그 그림 뒤)
    expect(r.now.calls).toBe(c);
    frame(r);
    expect(r.v.measureHoverSnap).toBeNull();
    // 포인터 사건도 가상 커서 알림('refresh' — 커서를 켰을 때만)도 오지 않는다
    expect(r.seen.slice(n)).toEqual([]);
    expect(r.now.calls - c).toBe(1);
    expect(r.old.text).toBe(name);
    expect(r.now.text).toBeNull();
  });

  it('겉모습(I로 흐리게 풀기 — setItemLooks)·단면은 코어 0.109.0부터 그 커서 자리에서 다시 구해 값이 바뀔 때만 그 그림 뒤 알림이 한 번, 붙잡기 선택 다시 주기(곡선 계산 조각)는 버리고 알림이 한 번 — 앱이 듣던 사건은 단면의 onSectionChange뿐, 105차 길은 앞 이름', () => {
    const r = rig();
    // [무엇, 바꾸기, 되돌리기, 그림 뒤 미리 보기: 'same' = 바꾸기 전과 같은 값(알림 없음 — 0.108.0은 버려 null), null = 없음(알림 한 번)]
    const steps: [string, () => void, (() => void) | null, 'same' | null][] = [
      // 반투명만: 붙잡기 선택에 반투명 너머 고르기가 없어 측정 고르기는 그대로 오른쪽 바디
      ['겉모습(반투명)', () => void r.v.setItemLooks([[r.right, { opacity: 0.5 }]]), () => void r.v.setItemLooks([[r.right, null]]), 'same'],
      // 앱 나머지 흐리게(looks.ts — 반투명·고르지 않음): 커서 아래 바디를 고르지 않으면 그 자리에 붙잡을 것이 없다
      ['겉모습(고르지 않음)', () => void r.v.setItemLooks([[r.right, { opacity: 0.5, pickable: false }]]), () => void r.v.setItemLooks([[r.right, null]]), null],
      ['붙잡기 선택', r.resnap, null, null],
      // x 가운데(15) 단면을 뒤집으면 x < 15(왼쪽 바디)만 잘라 내 커서 아래 오른쪽 바디는 그대로
      ['단면(왼쪽을 잘라 냄)', () => r.v.setSectionAxis('x', 0.5, { flip: true }), () => r.v.setSection(null), 'same'],
      // 뒤집지 않으면 x > 15(커서 아래 오른쪽 바디)를 잘라 내 붙잡을 것이 없다
      ['단면(오른쪽을 잘라 냄)', () => r.v.setSectionAxis('x', 0.5), null, null],
    ];
    for (const [what, edit, undo, want] of steps) {
      hover(r);
      const before = r.v.measureHoverSnap;
      const name = hoverSnapLabel(before);
      expect(name, what).toBeTruthy();
      expect([r.old.text, r.now.text], what).toEqual([name, name]);
      const n = r.seen.length;
      const c = r.now.calls;
      edit();
      frame(r);
      const after = r.seen.slice(n);
      expect(
        after.filter((e) => e !== 'section'),
        what,
      ).toEqual([]);
      expect(after.includes('section'), what).toBe(what.startsWith('단면'));
      expect(r.old.text, what).toBe(name);
      if (want === 'same') {
        // 같은 점·같은 붙잡기 종류로 다시 구한다. 반투명 묶음은 고르는 차례가 달라 같은 끝점을 낸 모서리(segment)가 다를 수 있어
        // 코어가 값이 바뀌었다고 한 번 알릴 수 있지만(0.103.0 — 모든 필드 비교) 앱 이름은 같다
        const now = r.v.measureHoverSnap;
        expect(now?.point, what).toEqual(before?.point);
        expect(now?.snap, what).toBe(before?.snap);
        expect(r.now.calls - c, what).toBeLessThanOrEqual(1);
        expect(r.now.text, what).toBe(name);
      } else {
        expect(r.v.measureHoverSnap, what).toBeNull();
        expect(r.now.calls - c, what).toBe(1);
        expect(r.now.text, what).toBeNull();
      }
      undo?.();
    }
  });

  it('포인터 이동·떠남도 그 그림 뒤 알림 — 이름은 포인터 이동 뒤 다음 프레임 읽기(105·106차 포인터 길)와 같고, 같은 자리로 다시 옮겨 값이 같으면 알림이 없다', () => {
    const r = rig();
    const mid = r.v.project([25, 0, 5])!;
    const steps: [string, () => void, number | null][] = [
      ['모서리 가까이', () => hover(r), 1],
      ['오른쪽 상자 앞면 가운데', () => hover(r, mid), null],
      [
        '한 그림 앞 두 이동(늦은 자리 = 모서리 가까이)',
        () => {
          move(r, mid);
          move(r, r.at);
          frame(r);
        },
        null,
      ],
      ['같은 자리', () => hover(r), 0],
      ['떠남', () => leave(r), 1],
    ];
    for (const [what, act, want] of steps) {
      const c = r.now.calls;
      act();
      const name = hoverSnapLabel(r.v.measureHoverSnap);
      expect(r.old.text, what).toBe(name);
      expect(r.now.text, what).toBe(name);
      if (want === null) expect(r.now.calls - c, what).toBeLessThanOrEqual(1);
      else expect(r.now.calls - c, what).toBe(want);
    }
    expect(r.now.text).toBeNull();
  });

  it('측정이 꺼져 있으면 포인터 이동·장면 길 모두 알림이 오지 않고 이름도 없다 — 켜면 다음 가리킴부터 알림', () => {
    const r = rig();
    r.v.setMeasureMode(false);
    hover(r);
    r.v.setItemVisible(r.right, false);
    r.v.setSectionAxis('x', 0.5);
    frame(r);
    hover(r);
    expect(r.now.calls).toBe(0);
    expect([r.old.text, r.now.text]).toEqual([null, null]);
    r.v.setSection(null);
    r.v.setItemVisible(r.right, true);
    r.v.setMeasureMode(true);
    hover(r);
    expect(r.now.calls).toBe(1);
    expect(r.now.text).toBeTruthy();
    expect(r.now.text).toBe(hoverSnapLabel(r.v.measureHoverSnap));
  });
});

/** 캔버스에 키를 누른다(코어 캔버스 리스너가 받는다 — 앱처럼 keyboard 켬) */
const key = (el: EventTarget, k: string, o: KeyboardEventInit = {}): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
  el.dispatchEvent(e);
  return e;
};

/** app.ts의 스냅 이름 길(showHoverSnap·onMeasure): 뷰어 조각 이름(guideSnapLabel)이 먼저, 없으면 첫 화면 hoverSnapLabel */
const appName = (h: MeasureHoverSnap | null | undefined): string | null => guideSnapLabel(h) ?? hoverSnapLabel(h);

const C30 = Math.cos(Math.PI / 6);
const S30 = Math.sin(Math.PI / 6);
/** 한 변 10 상자를 Z축 둘레로 30° 돌려 놓은 조립(measurelock.test.ts와 같다 — 윗면 z = 10의 모서리가 축과 나란하지 않다) */
function tilted(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const box = w.product('tilt-box', [w.ax2([0, 0, 0]), cube(w, 10, [0, 0, 0], 'tilt-body').solid], ctx);
  const root = w.product('tilt', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, box, w.ax2([0, 0, 0], [0, 0, 1], [C30, S30, 0]), 'tilt-1');
  return w.bytes();
}
/** 상자 자리 좌표(윗면 z = 10) → 세계 좌표 */
const onTop = (u: number, w: number): [number, number, number] => [u * C30 - w * S30, u * S30 + w * C30, 10];
const E2: readonly number[] = [-S30, C30, 0];

describe('첫 점에서 모서리에 수직인 방향·Tab 후보 돌리기(116차 — 코어 0.115.0 perpendicularDirs·0.116.0 tabCycle)', () => {
  it('첫 점(윗면 빈 곳) 뒤 곧은 모서리를 지나 그 모서리에 수직인 방향 위를 가리키면 미리 보기가 perpendicularDir이고 앱 이름은 "모서리에 수직"(첫 화면 hoverSnapLabel만으로는 「수직점」), 찍은 둘째 점의 결과 이름도', () => {
    const j = jsdomViewer({ keyboard: true });
    restore = j.restore;
    const v = j.viewer;
    const sc = stepToScene(tilted());
    v.setScene(sc);
    v.setView('top', false);
    v.fit(false);
    v.renderNow();
    const ex = stepEdgeIndex(sc)!;
    // 앱처럼(syncMeasureSnap — 뷰어 조각의 곧은 모서리 거르기를 받은 뒤)
    v.setMeasureSnap(measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, straightEdgeFilter(ex), true));
    v.setMeasureMode(true);
    const got: MeasureResult[] = [];
    v.onMeasure((m) => m && got.push(m));
    const names: (string | null)[] = [];
    v.onMeasureHoverChange(() => names.push(v.measureMode ? appName(v.measureHoverSnap) : null));
    const scr = (p: readonly number[]): { x: number; y: number } => {
      const q = v.project(p)!;
      expect(q.onScreen, `화면 안 ${p}`).toBe(true);
      return { x: q.x + 0.37, y: q.y - 0.29 };
    };
    const hoverAt = (p: readonly number[]): void => {
      const q = scr(p);
      v.canvas.dispatchEvent(touchPointerEvent('pointermove', 1, q.x, q.y, 'mouse'));
      v.renderNow();
    };
    // 첫 점: 윗면 빈 곳(상자 자리 (7, 5) — 모서리·꼭짓점에서 3 넘게)
    const F = onTop(7, 5);
    const f = scr(F);
    expect(v.commitMeasureCandidate(f.x, f.y, 0)).toBe(true);
    expect(v.measurePointCount).toBe(1);
    // 기준: 윗면 맞은편 모서리(상자 자리 w = 10)를 지난다
    hoverAt(onTop(3, 10));
    expect(v.measureHoverSnap?.segment?.kind).toBe('edge');
    // 그 모서리에 수직인 방향(첫 점 → 발 = 상자 자리 +w)으로 2.5 — 첫 점 X·Y축·나란함 선과 화면에서 떨어진 자리
    // (Z축은 위에서 본 화면 가운데(상자 윗면 가운데)에서 첫 점 쪽으로 뻗는다 — 첫 점을 가운데에서 상자 자리 +u 쪽에 두어 +w 방향과 직각)
    const T = onTop(7, 7.5);
    const t = scr(T);
    for (const d of [[1, 0, 0], [0, 1, 0], [C30, S30, 0]]) {
      const a = v.project(F.map((x, i) => x - d[i]! * 5))!;
      const b = v.project(F.map((x, i) => x + d[i]! * 5))!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      expect(len, `첫 점 선 ${d}`).toBeGreaterThan(50);
      expect(Math.abs((b.x - a.x) * (t.y - a.y) - (b.y - a.y) * (t.x - a.x)) / len, `첫 점 선 ${d}에서 화면 거리`).toBeGreaterThan(20);
    }
    hoverAt(T);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.perpendicularDir).toBe(true);
    expect(h.trackFrom).toBeUndefined();
    expect(Math.abs(h.direction![0]! * E2[0]! + h.direction![1]! * E2[1]! + h.direction![2]! * E2[2]!)).toBeGreaterThan(1 - 1e-6);
    expect(Math.hypot(h.point[0]! - T[0], h.point[1]! - T[1], h.point[2]! - T[2])).toBeLessThan(0.2);
    expect(appName(h)).toBe('모서리에 수직');
    expect(names[names.length - 1]).toBe('모서리에 수직');
    expect(hoverSnapLabel(h)).toBe('수직점');
    for (const code of ['en', 'ja', 'zh-CN', 'de']) {
      expect(translate(appName(h)!, code), code).not.toMatch(/[가-힣]/);
      expect(translate(appName(h)!, code), code).not.toBe(translate('수직점', code));
    }
    // Shift로 잠글 방향도 그 방향(앱 잠금 이름 「모서리에 수직으로 잠금」)
    expect(v.measureHoverLock?.kind).toBe('perpendicular');
    // 찍으면: 결과에는 snapB 'perpendicular'만 — 앱(onMeasure)은 찍은 점의 뷰어 조각 이름을 trackMeetB로
    expect(v.commitMeasureCandidate(t.x, t.y, 0)).toBe(true);
    expect(got).toHaveLength(1);
    const m = got[0]!;
    expect(m.snapB).toBe('perpendicular');
    const pts = v.measurePoints;
    expect(pts[1]!.perpendicularDir).toBe(true);
    const mB = guideSnapLabel(pts[1]);
    expect(snapPair({ ...m, ...(mB ? { trackMeetB: mB } : {}) })![1]).toBe('모서리에 수직');
    expect(snapPair(m)![1]).toBe('수직점');
  });

  it('겹친 후보 자리에서 Tab·Shift+Tab이 미리 보기를 measureCandidates 차례로 돌리고(기본 동작 막음) 앱 이름이 코어 미리 보기 알림으로 따라온다 — 돌리는 중 Esc는 돌리기를 풀고 첫 후보로(측정 지우기보다 먼저), 푼 뒤 Tab은 초점 이동', () => {
    const r = rig();
    // 첫 점: 왼쪽 상자 앞면 왼쪽 위 꼭짓점
    const a = r.v.project([0, 0, 10])!;
    expect(r.v.commitMeasureCandidate(a.x, a.y, 0)).toBe(true);
    expect(r.v.measurePointCount).toBe(1);
    hover(r);
    const list = r.v.measureCandidates(r.at.x, r.at.y);
    expect(list.length, '겹친 후보').toBeGreaterThanOrEqual(2);
    expect(r.v.measureHoverSnap?.point).toEqual(list[0]!.point);
    expect(r.now.text).toBe(hoverSnapLabel(list[0]));
    const n = list.length;
    const steps: [string, KeyboardEventInit, number][] = [
      ['Tab', {}, 1],
      ['Tab', {}, 2 % n],
      ['Shift+Tab', { shiftKey: true }, 1],
      ['Shift+Tab', { shiftKey: true }, 0],
      ['Shift+Tab(끝으로)', { shiftKey: true }, n - 1],
      ['Tab(처음으로)', {}, 0],
      ['Tab', {}, 1],
    ];
    for (const [what, o, want] of steps) {
      const c = r.now.calls;
      expect(key(r.v.canvas, 'Tab', o).defaultPrevented, what).toBe(true);
      frame(r);
      const now = r.v.measureHoverSnap;
      expect(now?.point, what).toEqual(list[want]!.point);
      expect(now?.snap, what).toBe(list[want]!.snap);
      expect(r.now.calls - c, what).toBe(1);
      expect(r.now.text, what).toBe(hoverSnapLabel(list[want]));
    }
    // 돌리는 중 Esc: 돌리기를 풀고 첫 후보로 — 찍은 첫 점은 그대로
    const esc = key(r.v.canvas, 'Escape');
    expect(esc.defaultPrevented).toBe(true);
    frame(r);
    expect(r.v.measurePointCount).toBe(1);
    expect(r.v.measureHoverSnap?.point).toEqual(list[0]!.point);
    expect(r.now.text).toBe(hoverSnapLabel(list[0]));
    // 푼 뒤 그 자리 Tab은 초점 이동(막지 않는다), 다음 Esc는 측정 지우기
    expect(key(r.v.canvas, 'Tab').defaultPrevented).toBe(false);
    expect(key(r.v.canvas, 'Escape').defaultPrevented).toBe(true);
    expect(r.v.measurePointCount).toBe(0);
  });
});

describe('app.ts 길(108차 — 106차 sceneSnap을 코어 알림 하나로)', () => {
  const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
  /** 클래스 메서드 하나(머리 줄부터 메서드를 닫는 중괄호 앞까지) */
  const method = (head: string): string => {
    const i = app.indexOf(`\n  ${head}`);
    expect(i, head).toBeGreaterThan(0);
    return app.slice(i, app.indexOf('\n  }\n', i));
  };
  /** 글 a부터 그 뒤 b 앞까지 */
  const between = (a: string, b: string): string => {
    const i = app.indexOf(a);
    expect(i, a).toBeGreaterThan(0);
    const j = app.indexOf(b, i);
    expect(j, b).toBeGreaterThan(i);
    return app.slice(i, j);
  };

  it('뷰어를 만들 때 onMeasureHoverChange 하나(측정 중에만 showHoverSnap)를 달고 sceneSnap은 없다 — 장면을 바꾸는 여섯 자리는 이름을 읽지 않는다', () => {
    expect(app).not.toMatch(/sceneSnap\(/);
    expect(app.match(/onMeasureHoverChange\(/g)).toHaveLength(1);
    expect(app).toMatch(/\n\s*v\.onMeasureHoverChange\(\(\) => v\.measureMode && this\.showHoverSnap\(\)\);\n/);
    const sites: Record<string, string> = {
      applyVisibility: 'private applyVisibility(ids?: readonly string[]): void {',
      setGroupVisible: 'setGroupVisible(group: string, on: boolean): void {',
      applyLooks: 'private applyLooks(): void {',
      syncSection: 'private syncSection(st: SectionState | null): void {',
      syncMeasureSnap: 'private syncMeasureSnap(): void {',
      fetchFaceSurfaces: 'private fetchFaceSurfaces(d: StepDoc): void {',
    };
    for (const [name, head] of Object.entries(sites)) expect(method(head), name).not.toMatch(/scheduleHoverSnap|showHoverSnap/);
    // 단면 막대·도구 막대는 그대로 코어 단면 알림으로
    expect(app).toMatch(/v\.onSectionChange\(\(st\) => this\.syncSection\(st\)\);/);
    // 보이기를 거는 고리는 뷰어 조각(looks.ts putVisibility — 106차 그대로, 첫 화면 JS 밖)
    expect(method(sites.applyVisibility)).toContain('this.ent!.putVisibility(v, d.vis, d.scene, ids);');
    expect(app).not.toContain('setItemVisible(id, on)');
  });

  it('3D 보기의 포인터 이동·떠남은 다음 프레임 읽기를 잡지 않는다(알림이 맡음) — Shift 없이 움직이면 접선 잠금 풀기·마우스가 3D 보기 위인지는 그대로, 다음 프레임 읽기는 키·잠금 길 넷에만', () => {
    const move = between("this.hostEl.addEventListener('pointermove'", "this.hostEl.addEventListener('pointerleave'");
    expect(move).toContain('if (!e.shiftKey) this.tangentShift(false);');
    expect(move).toContain("this.pointerIn = e.pointerType !== 'touch';");
    expect(move).not.toContain('HoverSnap');
    const leave = between("this.hostEl.addEventListener('pointerleave'", 'this.viewer = v;');
    expect(leave).toContain('this.pointerIn = false;');
    expect(leave).not.toContain('HoverSnap');
    // 가상 커서 알림·Shift 뗌·창 흐려짐·잠금 바뀜(refreshLock)
    expect(app.match(/this\.scheduleHoverSnap\(\)/g)).toHaveLength(4);
    expect(method('private refreshLock(): void {')).toContain('requestAnimationFrame(() => this.scheduleHoverSnap())');
  });

  it('116차: 스냅 이름은 뷰어 조각 이름(guideLabelOf = trackdir.ts guideSnapLabel — 끌어온 점 안내 선이 만나는 점·첫 점에서 모서리에 수직인 방향)이 먼저, 없으면 hoverSnapLabel — 미리 보기와 찍은 두 점 모두', () => {
    expect(app).toContain('this.guideLabelOf = core.guideSnapLabel;');
    expect(app).not.toContain('trackMeetLabelOf');
    expect(method('private showHoverSnap(): void {')).toContain('(this.guideLabelOf?.(h) ?? hoverSnapLabel(h, !!this.tangents?.locked(v)))');
    const onMeasure = method('private onMeasure(m: MeasureResult | null): void {');
    expect(onMeasure).toContain('this.guideLabelOf?.(pts[0])');
    expect(onMeasure).toContain('this.guideLabelOf?.(pts[1])');
  });
});

describe('putVisibility(106차 — 앱 입구 applyVisibility에서 뷰어 조각 looks.ts로 옮김)', () => {
  it('숨길 묶음은 늘, 보일 묶음은 뷰어와 다를 때만 setItemVisible — ids를 주면 그것만, 없으면 그물·선·점 모두(점이 없는 장면도)', () => {
    const hidden = new Set<string>();
    const calls: string[] = [];
    const v = {
      isVisible: (id: string): boolean => !hidden.has(id),
      setItemVisible: (id: string, on: boolean): void => {
        calls.push(`${id} ${on}`);
        if (on) hidden.delete(id);
        else hidden.add(id);
      },
    };
    const off = new Set(['m2', 'p1']);
    const vis = { visible: (id: string): boolean => !off.has(id) };
    const scene = { meshes: [{ id: 'm1' }, { id: 'm2' }], lines: [{ id: 'l1' }], points: [{ id: 'p1' }] };
    putVisibility(v, vis, scene);
    expect(calls).toEqual(['m2 false', 'p1 false']);
    calls.length = 0;
    putVisibility(v, vis, scene);
    expect(calls).toEqual(['m2 false', 'p1 false']);
    calls.length = 0;
    off.delete('m2');
    putVisibility(v, vis, scene, ['m2', 'm1']);
    expect(calls).toEqual(['m2 true']);
    calls.length = 0;
    putVisibility(v, vis, { meshes: [{ id: 'm1' }], lines: [] });
    expect(calls).toEqual([]);
  });
});
