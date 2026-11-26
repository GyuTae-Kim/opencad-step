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
 * - 117차(코어 0.117.0 앱이 할 일): 가상 커서를 첫 점에서 모서리에 수직인 방향 위로 옮기면 화면 읽기 알림 글(keysnap.ts 알림 영역)도 상태 막대와 같은
 *   「모서리에 수직」(코어 틀 'snap.perpendicular'만으로는 수직 발과 같은 「수직점」), 화면 언어를 바꾼 뒤(영어)도
 * - 124차(117차 남은 한계): 가상 커서를 첫 점에서 지나간 모서리와 나란한 선 위로 옮기면 알림 글도 상태 막대와 같은 「모서리와 나란히」(코어 틀 'snap.parallel'은
 *   「나란한 선」), 화면 언어를 바꾼 뒤(영어)도
 * - 118차(코어 0.118.0 앱이 할 일): 겹친 후보 자리에서 마우스 Tab·Shift+Tab으로 돌린 동안(미리 보기 값의 cycle)만 상태 막대·측정 띠 이름 뒤에 「i+1/n」
 *   (keysnap.ts cycleLabel — 가상 커서 알림 틀 'order', 이름 마디는 번역층이 옮김)·같은 글을 화면 언어로 알림 영역에. 포인터가 벗어나거나 Esc로 풀면(첫 후보에서도
 *   코어가 한 번 더 알림) 없어지고 돌리기 전·뒤 글은 116차 이름 그대로. app.ts showHoverSnap 원문도
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
  /** 키보드 붙잡기(app.ts처럼 installKeySnap — 118차: 알림 영역·Tab 돌리기 차례 글) */
  ks: ReturnType<typeof installKeySnap>;
}

/** tr: 화면 언어(118차 — 주지 않으면 한국어) */
function rig(tr: (ko: string) => string = (ko) => ko): Rig {
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
  const ks = installKeySnap(v, {
    tr,
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
  return { v, host: j.host, at, right: p!.id, resnap, seen, old, now, ks };
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

describe('가상 커서 알림의 「모서리에 수직」(117차 — 코어 0.117.0 앱이 할 일·0.115.0 남은 한계)', () => {
  it('첫 점(윗면 빈 곳) 뒤 곧은 모서리를 지나고 가상 커서를 그 모서리에 수직인 방향 위로 옮기면 화면 읽기 알림 글이 상태 막대와 같은 「모서리에 수직」(코어 틀만으로는 「수직점」) — 화면 언어를 바꿔도(영어)', () => {
    const j = jsdomViewer({ keyboard: true });
    restore = j.restore;
    const v = j.viewer;
    const sc = stepToScene(tilted());
    v.setScene(sc);
    v.setView('top', false);
    v.fit(false);
    v.renderNow();
    const ex = stepEdgeIndex(sc)!;
    // 앱처럼(syncMeasureSnap — 뷰어 조각의 곧은 모서리 거르기를 받은 뒤), 키보드 붙잡기는 app.ts처럼 installKeySnap(화면 언어 tr)
    v.setMeasureSnap(measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, straightEdgeFilter(ex), true));
    v.setMeasureMode(true);
    let lang = 'ko';
    const ks = installKeySnap(v, { tr: (s) => (lang === 'ko' ? s : translate(s, lang)), pickThrough: () => false });
    const px = (p: readonly number[]): { x: number; y: number } => {
      const q = v.project(p)!;
      expect(q.onScreen, `화면 안 ${p}`).toBe(true);
      return q;
    };
    // 첫 점·기준은 116차 시험과 같다: 윗면 빈 곳(상자 자리 (7, 5)) → 마우스로 맞은편 모서리(상자 자리 w = 10)를 지난다
    const F = onTop(7, 5);
    const f = px(F);
    expect(v.commitMeasureCandidate(f.x + 0.37, f.y - 0.29, 0)).toBe(true);
    expect(v.measurePointCount).toBe(1);
    const e = px(onTop(3, 10));
    v.canvas.dispatchEvent(touchPointerEvent('pointermove', 1, e.x + 0.37, e.y - 0.29, 'mouse'));
    v.renderNow();
    expect(v.measureHoverSnap?.segment?.kind).toBe('edge');
    // 가상 커서 켜기(캔버스 가운데 — 윗면 가운데)
    expect(key(v.canvas, 'ArrowUp').defaultPrevented).toBe(true);
    const c0 = v.keyboardCursor!;
    expect(c0.mode).toBe('measure');
    const step = v.keyboardSnap!.step;
    // 목표: 116차 시험의 수직 방향 위 자리(상자 자리 (7, 7.5)) 둘레 7화소 안의 가상 커서 자리(가운데에서 걸음 단위) 가운데 첫 점 → 그 자리 화면 선에 가장 가까운 것
    // (그 시험이 그 자리가 첫 점 X·Y축·나란함 선에서 20화소 넘게 떨어진 것을 본다 — 7화소 안이면 붙잡기 10화소 밖)
    const t = px(onTop(7, 7.5));
    const len = Math.hypot(t.x - f.x, t.y - f.y);
    const lineDist = (x: number, y: number): number => Math.abs((t.x - f.x) * (y - f.y) - (t.y - f.y) * (x - f.x)) / len;
    let g = { x: c0.x, y: c0.y };
    let best = Infinity;
    for (let i = Math.floor((t.x - 7 - c0.x) / step); i <= Math.ceil((t.x + 7 - c0.x) / step); i++)
      for (let k = Math.floor((t.y - 7 - c0.y) / step); k <= Math.ceil((t.y + 7 - c0.y) / step); k++) {
        const x = c0.x + i * step;
        const y = c0.y + k * step;
        if (Math.hypot(x - t.x, y - t.y) > 7 || lineDist(x, y) >= best) continue;
        best = lineDist(x, y);
        g = { x, y };
      }
    expect(best, '수직 방향 선에서 화면 거리').toBeLessThan(3);
    // 화살표로 옮긴다(윗면 안쪽만 지나 기준 모서리가 바뀌지 않는다)
    const goTo = (to: { x: number; y: number }): void => {
      for (let n = 0; n < 200; n++) {
        const c = v.keyboardCursor!;
        const k = c.x < to.x ? 'ArrowRight' : c.x > to.x ? 'ArrowLeft' : c.y < to.y ? 'ArrowDown' : c.y > to.y ? 'ArrowUp' : null;
        if (!k) return;
        expect(key(v.canvas, k).defaultPrevented).toBe(true);
      }
    };
    goTo(g);
    expect(v.keyboardCursor).toMatchObject(g);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.perpendicularDir).toBe(true);
    expect(h.trackFrom).toBeUndefined();
    expect(h.locked).toBeFalsy();
    expect(appName(h)).toBe('모서리에 수직');
    const said = ks.live.textContent!;
    expect(said.startsWith('모서리에 수직'), said).toBe(true);
    expect(said).not.toContain('수직점');
    expect(said).toContain(', 거리 ');
    // 화면 언어를 바꾸면(app.ts는 sync) 다음 알림부터 그 언어 — 한 걸음 옆에 갔다 같은 자리로 돌아온다
    lang = 'en';
    ks.sync();
    goTo({ x: g.x - step, y: g.y });
    goTo(g);
    expect(v.measureHoverSnap?.perpendicularDir).toBe(true);
    const en = ks.live.textContent!;
    expect(en.startsWith(translate('모서리에 수직', 'en')), en).toBe(true);
    expect(en).not.toContain(translate('수직점', 'en'));
    expect(en).not.toMatch(/[가-힣]/);
  });
});

describe('가상 커서 알림의 「모서리와 나란히」(124차 — 117차 남은 한계)', () => {
  it('첫 점(윗면 빈 곳) 뒤 곧은 모서리를 지나고 가상 커서를 첫 점에서 그 모서리와 나란한 선 위로 옮기면 화면 읽기 알림 글이 상태 막대와 같은 「모서리와 나란히」(코어 틀만으로는 「나란한 선」) — 화면 언어를 바꿔도(영어)', () => {
    const j = jsdomViewer({ keyboard: true });
    restore = j.restore;
    const v = j.viewer;
    const sc = stepToScene(tilted());
    v.setScene(sc);
    v.setView('top', false);
    v.fit(false);
    v.renderNow();
    const ex = stepEdgeIndex(sc)!;
    // 117차 시험과 같은 차림(곧은 모서리 거르기를 받은 붙잡기 선택, app.ts처럼 installKeySnap — 화면 언어 tr)
    v.setMeasureSnap(measureSnapOptions(sc.meshes, ex, circleCenters(sc.meshes, ex), null, false, straightEdgeFilter(ex), true));
    v.setMeasureMode(true);
    let lang = 'ko';
    const ks = installKeySnap(v, { tr: (s) => (lang === 'ko' ? s : translate(s, lang)), pickThrough: () => false });
    const px = (p: readonly number[]): { x: number; y: number } => {
      const q = v.project(p)!;
      expect(q.onScreen, `화면 안 ${p}`).toBe(true);
      return q;
    };
    // 첫 점: 윗면 빈 곳(상자 자리 (5, 6.5) — 윗면 가운데에서 +w 쪽이라 위에서 본 첫 점 Z축은 w 방향으로 비쳐 u 방향 나란한 선과 직각, 모서리에서 3.5 넘게)
    const F = onTop(5, 6.5);
    const f = px(F);
    expect(v.commitMeasureCandidate(f.x + 0.37, f.y - 0.29, 0)).toBe(true);
    expect(v.measurePointCount).toBe(1);
    // 기준: 마우스로 맞은편 모서리(상자 자리 w = 10 — u 방향)를 지난다(가운데점·수직 발 (5, 10)·꼭짓점에서 2.5)
    const e = px(onTop(2.5, 10));
    v.canvas.dispatchEvent(touchPointerEvent('pointermove', 1, e.x + 0.37, e.y - 0.29, 'mouse'));
    v.renderNow();
    expect(v.measureHoverSnap?.segment?.kind).toBe('edge');
    // 가상 커서 켜기(캔버스 가운데 — 윗면 가운데)
    expect(key(v.canvas, 'ArrowUp').defaultPrevented).toBe(true);
    const c0 = v.keyboardCursor!;
    expect(c0.mode).toBe('measure');
    const step = v.keyboardSnap!.step;
    // 목표: 첫 점 나란한 선(상자 자리 w = 6.5) 위 u 7.5~8.25 둘레 7화소 안의 가상 커서 자리(가운데에서 걸음 단위) 가운데 그 선에 가장 가까운 것
    const a = px(onTop(7.5, 6.5));
    const len = Math.hypot(a.x - f.x, a.y - f.y);
    const lineTo = (p: { x: number; y: number }, q: { x: number; y: number }, x: number, y: number): number => {
      const l = Math.hypot(q.x - p.x, q.y - p.y);
      return Math.abs((q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x)) / l;
    };
    let g = { x: c0.x, y: c0.y };
    let best = Infinity;
    for (const u of [7.5, 7.75, 8, 8.25]) {
      const t = px(onTop(u, 6.5));
      for (let i = Math.floor((t.x - 7 - c0.x) / step); i <= Math.ceil((t.x + 7 - c0.x) / step); i++)
        for (let k = Math.floor((t.y - 7 - c0.y) / step); k <= Math.ceil((t.y + 7 - c0.y) / step); k++) {
          const x = c0.x + i * step;
          const y = c0.y + k * step;
          if (Math.hypot(x - t.x, y - t.y) > 7 || lineTo(f, a, x, y) >= best) continue;
          best = lineTo(f, a, x, y);
          g = { x, y };
        }
    }
    expect(len, '첫 점에서 나란한 선 위 목표까지').toBeGreaterThan(30);
    expect(best, '나란한 선에서 화면 거리').toBeLessThan(3);
    // 그 자리는 첫 점 X·Y축과 모서리에 수직인 방향(w — 위에서 본 첫 점 Z축도 이 선)에서 떨어져 있다(붙잡기 10화소 밖)
    for (const d of [[1, 0, 0], [0, 1, 0], E2]) {
      const p = v.project(F.map((x, i) => x - d[i]! * 5))!;
      const q = v.project(F.map((x, i) => x + d[i]! * 5))!;
      expect(Math.hypot(q.x - p.x, q.y - p.y), `첫 점 선 ${d}`).toBeGreaterThan(50);
      expect(lineTo(p, q, g.x, g.y), `첫 점 선 ${d}에서 화면 거리`).toBeGreaterThan(15);
    }
    // 화살표로 옮긴다(윗면 안쪽만 지나 기준 모서리가 바뀌지 않는다)
    const goTo = (to: { x: number; y: number }): void => {
      for (let n = 0; n < 200; n++) {
        const c = v.keyboardCursor!;
        const k = c.x < to.x ? 'ArrowRight' : c.x > to.x ? 'ArrowLeft' : c.y < to.y ? 'ArrowDown' : c.y > to.y ? 'ArrowUp' : null;
        if (!k) return;
        expect(key(v.canvas, k).defaultPrevented).toBe(true);
      }
    };
    goTo(g);
    expect(v.keyboardCursor).toMatchObject(g);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(h.trackFrom).toBeUndefined();
    expect(h.locked).toBeFalsy();
    expect(appName(h)).toBe('모서리와 나란히');
    const said = ks.live.textContent!;
    expect(said.startsWith('모서리와 나란히'), said).toBe(true);
    expect(said).not.toContain('나란한 선');
    expect(said).toContain(', 거리 ');
    // 화면 언어를 바꾸면(app.ts는 sync) 다음 알림부터 그 언어 — 한 걸음 옆에 갔다 같은 자리로 돌아온다
    lang = 'en';
    ks.sync();
    goTo({ x: g.x - step, y: g.y });
    goTo(g);
    expect(v.measureHoverSnap?.snap).toBe('parallel');
    const en = ks.live.textContent!;
    expect(en.startsWith(translate('모서리와 나란히', 'en')), en).toBe(true);
    expect(en).not.toContain(translate('나란한 선', 'en'));
    expect(en).not.toMatch(/[가-힣]/);
  });
});

/**
 * 118차 app.ts showHoverSnap 길 흉내(코어 미리 보기 알림 — 측정 중에만): 이름(appName)에 Tab으로 돌린 동안(cycle)만 뷰어 조각 cycleLabel 마디를 넣고
 * 같은 글(화면 언어)을 가상 커서 알림 영역에 넣는다 — 글이 앞과 같으면 아무것도 하지 않는다
 */
class AppSnap {
  text: string | null = null;
  /** 상태 막대·측정 띠 스냅 이름 요소 */
  readonly el = document.createElement('div');
  /** 알림 영역에 넣은 글 */
  readonly said: string[] = [];
  constructor(
    private readonly v: Viewer3d,
    private readonly ks: ReturnType<typeof installKeySnap>,
  ) {
    v.onMeasureHoverChange(() => v.measureMode && this.show());
  }
  show(): void {
    const h = this.v.measureHoverSnap;
    const name = this.v.measureMode ? appName(h) : null;
    const c = name && h?.cycle ? this.ks.cycleLabel(name, h.cycle) : undefined;
    const text = c ? c.parts.join('') : name;
    if (text === this.text) return;
    this.text = text;
    this.el.hidden = !text;
    if (c) this.el.replaceChildren(...c.parts);
    else this.el.textContent = text ?? '';
    if (c) {
      this.ks.live.textContent = c.said;
      this.said.push(c.said);
    }
  }
  /** 번역층처럼 글 마디마다 옮긴 글 */
  shown(code: string): string {
    return [...this.el.childNodes].map((n) => translate(n.nodeValue ?? '', code)).join('');
  }
}

describe('마우스 Tab 돌리기 스냅 이름의 차례·수(118차 — 코어 0.118.0 MeasureHoverSnap.cycle·앱이 할 일)', () => {
  it('겹친 후보 자리에서 Tab·Shift+Tab으로 돌린 동안만 이름 뒤에 「i+1/n」(이름 마디는 번역층이 옮김)·알림 영역에도 그때만 — 포인터가 자리를 벗어나거나 Esc로 풀면(첫 후보에서도 코어가 한 번 더 알림) 없어지고, 돌리기 전·뒤 글은 116차 이름 그대로', () => {
    let lang = 'ko';
    const r = rig((s) => (lang === 'ko' ? s : translate(s, lang)));
    const app = new AppSnap(r.v, r.ks);
    // 첫 점: 왼쪽 상자 앞면 왼쪽 위 꼭짓점(116차 시험과 같다)
    const a = r.v.project([0, 0, 10])!;
    expect(r.v.commitMeasureCandidate(a.x, a.y, 0)).toBe(true);
    hover(r);
    const list = r.v.measureCandidates(r.at.x, r.at.y);
    const n = list.length;
    expect(n, '겹친 후보').toBeGreaterThanOrEqual(2);
    // 돌리기 전: 칸 없음 — 이름 한 마디(116차와 같은 글), 알림 영역에 쓰지 않음
    const first = appName(list[0])!;
    expect(first).toBeTruthy();
    const plain = (what: string): void => {
      expect(r.v.measureHoverSnap?.cycle, what).toBeUndefined();
      expect(r.v.measureHoverSnap?.point, what).toEqual(list[0]!.point);
      expect(app.text, what).toBe(first);
      expect(app.el.textContent, what).toBe(first);
      expect(app.el.childNodes, what).toHaveLength(1);
    };
    plain('돌리기 전');
    expect(app.said).toEqual([]);
    const tab = (what: string, o: KeyboardEventInit, want: number): void => {
      const c = r.now.calls;
      expect(key(r.v.canvas, 'Tab', o).defaultPrevented, what).toBe(true);
      frame(r);
      expect(r.now.calls - c, what).toBe(1);
      expect(r.v.measureHoverSnap?.cycle, what).toEqual({ index: want, count: n });
      const name = appName(list[want])!;
      expect(app.text, what).toBe(`${name} ${want + 1}/${n}`);
      expect([...app.el.childNodes].map((x) => x.nodeValue), what).toEqual([name, ` ${want + 1}/${n}`]);
      expect(r.ks.live.textContent, what).toBe(`${lang === 'ko' ? name : translate(name, lang)} ${want + 1}/${n}`);
    };
    /** 포인터를 그 자리에서 벗어났다(4화소 넘게) 돌아온다 — 칸이 없어지고, Esc로 푼 뒤에도 그 자리 Tab을 다시 받는다 */
    const away = (what: string): void => {
      const said = app.said.length;
      hover(r, { x: r.at.x - 8, y: r.at.y + 8 });
      expect(r.v.measureHoverSnap?.cycle, what).toBeUndefined();
      hover(r);
      plain(what);
      expect(app.said, what).toHaveLength(said);
    };
    tab('Tab', {}, 1);
    tab('Tab', {}, 2 % n);
    tab('Shift+Tab', { shiftKey: true }, 1);
    expect(app.said).toHaveLength(3);
    away('벗어남');
    // 돌리는 중 Esc(둘째 후보): 돌리기를 풀고 첫 후보 — 칸이 없어져 이름 그대로, 알림 영역에 새로 쓰지 않음, 찍은 첫 점은 그대로
    tab('Tab', {}, 1);
    expect(key(r.v.canvas, 'Escape').defaultPrevented).toBe(true);
    frame(r);
    expect(r.v.measurePointCount).toBe(1);
    plain('Esc(둘째 후보)');
    expect(app.said).toHaveLength(4);
    // 첫 후보로 돌아와(1/n) Esc: 미리 보기는 같고 칸만 없어지는데 코어가 한 번 더 알려(0.118.0 바뀐 기본 동작) 이름이 「1/n」에 남지 않는다
    away('Esc 뒤 벗어남');
    tab('Tab', {}, 1);
    tab('Shift+Tab', { shiftKey: true }, 0);
    expect(app.text).toBe(`${first} 1/${n}`);
    const c = r.now.calls;
    expect(key(r.v.canvas, 'Escape').defaultPrevented).toBe(true);
    frame(r);
    expect(r.now.calls - c).toBe(1);
    plain('Esc(첫 후보)');
    // 화면 언어(영어 — app.ts는 languagechange에서 sync): 상태 막대 마디는 한국어 이름 그대로(번역층이 옮김)·알림 글은 영어, 둘이 같은 글
    away('언어 바꾸기 전');
    lang = 'en';
    r.ks.sync();
    tab('Tab(영어)', {}, 1);
    const en = r.ks.live.textContent!;
    expect(en).toBe(`${translate(appName(list[1])!, 'en')} 2/${n}`);
    expect(en).not.toMatch(/[가-힣]/);
    expect(app.shown('en')).toBe(en);
    away('영어 뒤 벗어남');
    expect(app.shown('en')).toBe(translate(first, 'en'));
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

  it('118차: showHoverSnap은 Tab으로 돌린 동안(코어 0.118.0 cycle)만 뷰어 조각 cycleLabel 마디를 두 요소에 넣고 알림 영역에 화면 언어 글 — 칸이 없으면 117차와 같은 textContent(위 AppSnap 흉내와 같은 길)', () => {
    const show = method('private showHoverSnap(): void {');
    expect(show).toContain('const c = name && h?.cycle ? this.keySnap?.cycleLabel(name, h.cycle) : undefined;');
    expect(show).toContain('const text = c ? c.parts.join(\'\') : name;');
    expect(show).toContain('if (text === this.hoverSnapText) return;');
    expect(show).toMatch(/el\.hidden = !text;\n\s*if \(c\) el\.replaceChildren\(\.\.\.c\.parts\);\n\s*else el\.textContent = text \?\? '';/);
    expect(show).toContain('if (c) this.keySnap!.live.textContent = c.said;');
    // 뷰어 조각 값은 첫 화면 JS에 값으로 들어오지 않는다(키보드 붙잡기 객체는 뷰어를 만들 때 core.installKeySnap)
    expect(app).toContain('this.keySnap = core.installKeySnap(v, {');
    expect(app).not.toMatch(/import \{[^}]*\b(hoverCycleLabel|installKeySnap)\b[^}]*\} from '\.\/keysnap'/);
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
