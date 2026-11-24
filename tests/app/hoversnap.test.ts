// @vitest-environment jsdom
/**
 * 106차: 두 점 측정 중 마우스를 멈춘 채 장면이 바뀐 뒤 상태 막대·측정 띠의 스냅 이름(app.ts showHoverSnap — 코어 measureHoverSnap).
 * - 실제 코어(jsdom, 가짜 WebGL): 보이기(H·I — setItemVisible)는 다음 그림에서 그 커서 자리로 미리 보기를 다시 구하고(0.98.0), 겉모습(setItemLooks)·붙잡기 선택
 *   다시 주기(곡선 계산 조각을 받은 뒤 setMeasureSnap)·단면은 버린다. 그동안 앱이 이름을 다시 읽던 사건(3D 보기의 포인터 사건·가상 커서 알림)은 하나도 오지 않는다 —
 *   코어 'refresh' 알림은 가상 커서를 켰을 때만이다. 단면만 코어 알림(onSectionChange)이 온다
 * - 앱처럼 이름을 맞추는 흉내: 105차 길(포인터 사건·가상 커서 알림만)은 앞 이름이 남고, 106차 길(장면 길 뒤 sceneSnap — 측정 중에만)은 다음 프레임에 코어와 같다.
 *   측정이 꺼져 있으면 장면 길이 프레임을 잡지 않는다
 * - app.ts 원문: 장면을 바꾸는 자리와 코어 단면 알림이 sceneSnap을 부르고, sceneSnap은 measureMode일 때만 scheduleHoverSnap
 * - putVisibility(looks.ts — 106차에 앱 입구 applyVisibility에서 뷰어 조각으로 옮김): 앞과 같은 setItemVisible 호출
 * 가리키는 자리는 상자 모서리에서 상자 안쪽으로 3화소(경계·구석을 정확히 가리키지 않는다)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Viewer3d } from 'opencad-viewer3d';
import { stepToScene } from '../../src/index';
import { touchPointerEvent } from '../../src/app/aim';
import { stepEdgeIndex } from '../../src/app/doc';
import { installKeySnap } from '../../src/app/keysnap';
import { putVisibility } from '../../src/app/looks';
import { circleCenters, hoverSnapLabel, measureSnapOptions } from '../../src/app/snap';
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

/**
 * 앱처럼 스냅 이름을 맞추는 흉내(app.ts scheduleHoverSnap·showHoverSnap): 다시 읽을 사건이 오면 다음 프레임(코어가 그린 뒤)에 measureHoverSnap을 읽는다.
 * sceneEdits = 106차 길(장면 길 뒤 sceneSnap — 측정 중에만), 아니면 105차 길(3D 보기 포인터 사건·가상 커서 알림만)
 */
class SnapStatus {
  text: string | null = null;
  /** 잡은 프레임 수 */
  frames = 0;
  private due = false;
  constructor(
    private readonly v: Viewer3d,
    host: HTMLElement,
    private readonly sceneEdits: boolean,
  ) {
    for (const t of ['pointermove', 'pointerleave']) host.addEventListener(t, () => this.schedule());
  }
  schedule(): void {
    this.due = true;
    this.frames++;
  }
  /** app.ts sceneSnap */
  sceneSnap(): void {
    if (this.sceneEdits && this.v.measureMode) this.schedule();
  }
  /** 코어가 그린 다음(같은 프레임의 뒤 예약) */
  read(): void {
    if (!this.due) return;
    this.due = false;
    this.text = this.v.measureMode ? hoverSnapLabel(this.v.measureHoverSnap) : null;
  }
}

interface Rig {
  v: Viewer3d;
  /** 오른쪽 상자 앞면 오른쪽 위 모서리에서 상자 안쪽으로 3화소 */
  at: { x: number; y: number };
  right: string;
  /** 붙잡기 선택을 앱처럼 다시 준다(곡선 계산 조각을 받은 뒤의 syncMeasureSnap) */
  resnap: () => void;
  /** 3D 보기의 포인터 사건·가상 커서 알림·코어 단면 알림 */
  seen: string[];
  old: SnapStatus;
  now: SnapStatus;
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
  const old = new SnapStatus(v, j.host, false);
  const now = new SnapStatus(v, j.host, true);
  installKeySnap(v, {
    tr: (ko) => ko,
    pickThrough: () => false,
    announced: (a) => {
      seen.push(`announce ${a.reason}`);
      old.schedule();
      now.schedule();
    },
  });
  v.onSectionChange(() => seen.push('section'));
  const c = v.project([30, 0, 10])!;
  const m = v.project([25, 0, 5])!;
  const k = 3 / Math.hypot(m.x - c.x, m.y - c.y);
  const at = { x: c.x + (m.x - c.x) * k, y: c.y + (m.y - c.y) * k };
  const p = v.pick(at.x, at.y);
  expect(p, '오른쪽 상자 위').toBeTruthy();
  return { v, at, right: p!.id, resnap, seen, old, now };
}

/** 다음 프레임: 코어가 그리고(미리 보기를 구한다) 앱이 읽는다 */
function frame(r: Rig): void {
  r.v.renderNow();
  r.old.read();
  r.now.read();
}

/** 마우스를 그 자리로 옮기고 다음 프레임 */
function hover(r: Rig): void {
  r.v.canvas.dispatchEvent(touchPointerEvent('pointermove', 1, r.at.x, r.at.y, 'mouse'));
  frame(r);
}

/** 앱의 장면 길 뒤(106차 sceneSnap — 105차 흉내는 아무것도 하지 않는다) */
function sceneSnap(r: Rig): void {
  r.old.sceneSnap();
  r.now.sceneSnap();
}

describe('측정 중 장면 길 뒤 스냅 이름(106차)', () => {
  it('마우스를 멈춘 채 H로 커서 아래 바디를 숨기면 코어는 다음 그림에서 그 자리 미리 보기를 다시 구한다(없음) — 앱이 듣던 사건은 오지 않아 105차 길은 앞 이름, 106차 길은 숨김', () => {
    const r = rig();
    hover(r);
    const name = hoverSnapLabel(r.v.measureHoverSnap);
    expect(['끝점', '꼭짓점']).toContain(name);
    expect([r.old.text, r.now.text]).toEqual([name, name]);
    const n = r.seen.length;
    // app.ts hideSelection → setItemsVisible → applyVisibility(setItemVisible 뒤 sceneSnap)
    r.v.setItemVisible(r.right, false);
    sceneSnap(r);
    frame(r);
    expect(r.v.measureHoverSnap).toBeNull();
    // 포인터 사건도 가상 커서 알림('refresh' — 커서를 켰을 때만)도 오지 않는다
    expect(r.seen.slice(n)).toEqual([]);
    expect(r.old.text).toBe(name);
    expect(r.now.text).toBeNull();
  });

  it('겉모습(I로 흐리게 풀기 — setItemLooks)·붙잡기 선택 다시 주기(곡선 계산 조각)·단면은 미리 보기를 버린다 — 알림은 단면의 onSectionChange뿐, 105차 길은 앞 이름', () => {
    const r = rig();
    const steps: [string, () => void, (() => void) | null][] = [
      ['겉모습', () => void r.v.setItemLooks([[r.right, { opacity: 0.5 }]]), () => void r.v.setItemLooks([[r.right, null]])],
      ['붙잡기 선택', r.resnap, null],
      ['단면', () => r.v.setSectionAxis('x', 0.5), null],
    ];
    for (const [what, edit, undo] of steps) {
      hover(r);
      const name = hoverSnapLabel(r.v.measureHoverSnap);
      expect(name, what).toBeTruthy();
      expect([r.old.text, r.now.text], what).toEqual([name, name]);
      const n = r.seen.length;
      edit();
      sceneSnap(r);
      frame(r);
      expect(r.v.measureHoverSnap, what).toBeNull();
      const after = r.seen.slice(n);
      expect(
        after.filter((e) => e !== 'section'),
        what,
      ).toEqual([]);
      expect(after.includes('section'), what).toBe(what === '단면');
      expect(r.old.text, what).toBe(name);
      expect(r.now.text, what).toBeNull();
      undo?.();
    }
  });

  it('측정이 꺼져 있으면 106차 장면 길은 프레임을 잡지 않고 이름도 없다(105차 길과 같은 프레임 수) — 측정 중에만 장면 길마다 한 번', () => {
    const r = rig();
    r.v.setMeasureMode(false);
    hover(r);
    expect([r.old.frames, r.now.frames]).toEqual([1, 1]);
    r.v.setItemVisible(r.right, false);
    sceneSnap(r);
    r.v.setItemLooks([[r.right, { opacity: 0.5 }]]);
    sceneSnap(r);
    r.v.setSectionAxis('x', 0.5);
    sceneSnap(r);
    frame(r);
    expect([r.old.frames, r.now.frames]).toEqual([1, 1]);
    expect([r.old.text, r.now.text]).toEqual([null, null]);
    r.v.setMeasureMode(true);
    r.v.setSection(null);
    sceneSnap(r);
    expect([r.old.frames, r.now.frames]).toEqual([1, 2]);
  });
});

describe('app.ts 길(106차)', () => {
  const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
  /** 클래스 메서드 하나(머리 줄부터 메서드를 닫는 중괄호 앞까지) */
  const method = (head: string): string => {
    const i = app.indexOf(`\n  ${head}`);
    expect(i, head).toBeGreaterThan(0);
    return app.slice(i, app.indexOf('\n  }\n', i));
  };

  it('sceneSnap은 두 점 측정 중에만 다음 프레임 읽기를 잡고, 장면을 바꾸는 자리와 코어 단면 알림(syncSection)이 그것만 부른다 — 보이기 고리는 뷰어 조각으로', () => {
    expect(method('private sceneSnap(): void {')).toMatch(/\{\n\s*if \(this\.viewer\?\.measureMode\) this\.scheduleHoverSnap\(\);$/);
    const sites: Record<string, string> = {
      applyVisibility: 'private applyVisibility(ids?: readonly string[]): void {',
      setGroupVisible: 'setGroupVisible(group: string, on: boolean): void {',
      applyLooks: 'private applyLooks(): void {',
      syncSection: 'private syncSection(st: SectionState | null): void {',
      syncMeasureSnap: 'private syncMeasureSnap(): void {',
      fetchFaceSurfaces: 'private fetchFaceSurfaces(d: StepDoc): void {',
    };
    for (const [name, head] of Object.entries(sites)) {
      const body = method(head);
      expect(body, name).toContain('this.sceneSnap();');
      expect(body, name).not.toContain('scheduleHoverSnap');
    }
    expect(app.match(/this\.sceneSnap\(\);/g)).toHaveLength(Object.keys(sites).length);
    // 단면은 코어가 알린다(onSectionChange → syncSection)
    expect(app).toMatch(/v\.onSectionChange\(\(st\) => this\.syncSection\(st\)\);/);
    // 보이기를 거는 고리는 뷰어 조각(looks.ts putVisibility — 첫 화면 JS 밖)
    expect(method(sites.applyVisibility)).toContain('this.ent!.putVisibility(v, d.vis, d.scene, ids);');
    expect(app).not.toContain('setItemVisible(id, on)');
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
