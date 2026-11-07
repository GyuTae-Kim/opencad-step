// @vitest-environment jsdom
// 분해 끌기의 붙잡기(47차 — 손질 도구, jsdom에 실제 코어 Viewer3d로 끌기): X로만 끄는 부품이 다른 부품 면에 닿는 자리에 붙고(정확히 닿음),
// 거리 글 아래 줄·강조색 테두리·안내 선(떼면 거둠), Alt(⌥)를 누른 끌기·끄는 중 Alt 글쇠는 붙잡지 않음, 손가락은 붙잡기 거리 14화소, 사방은 붙잡지 않음
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeFrame, projectToScreen, type CameraState } from 'opencad-viewer3d/camera';
import type { Pick3d, Viewer3d } from 'opencad-viewer3d';
import { touchPointerEvent } from '../../src/app/aim';
import { jsdomViewer } from './jsdomview';
import { Fmt } from '../../src/app/display';
import type { ProductNode, StepDoc } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan, type ExplodeAxis, type ExplodePlan } from '../../src/app/explode';
import { ExplodeTweakTool, type TweakHost } from '../../src/app/explodetool';
import { boxMesh, faceIndexOf } from './snapscene';

const W = 800;
const H = 600;
const cam: CameraState = { target: [0, 0, 0], distance: 40, yaw: 0, pitch: 0, projection: 'perspective', fovY: (40 * Math.PI) / 180 };
const frame = computeFrame(cam, W, H, { center: cam.target, radius: cam.distance });
const N = (name: string, meshIds: string[] = [], children: ProductNode[] = []): ProductNode => ({ name, productId: name, meshIds, children });
// a는 x −4~−2, b는 x 2~4(같은 Y·Z) — 한꺼번에 50%면 a는 −6.25~−4.25, b는 4.25~6.25
const A = boxMesh('a', [-4, -1, -1], [-2, 1, 1]);
const B = boxMesh('b', [2, -1, -1], [4, 1, 1]);

describe('분해 끌기의 붙잡기(jsdom 끌기)', () => {
  let env: ReturnType<typeof jsdomViewer>;
  let canvas: HTMLCanvasElement;
  let doc: StepDoc;
  let axis: ExplodeAxis;
  let tool: ExplodeTweakTool;
  /** 안내 선 걸기(선분 수 — null이면 거둠) */
  let guides: (number | null)[];
  const plans = new Map<string, ExplodePlan>();
  const planOf = (d: StepDoc): ExplodePlan => {
    if (!plans.has(axis)) plans.set(axis, explodePlan([A.mesh, B.mesh], d.products, 'all', axis));
    return plans.get(axis)!;
  };
  /** b의 지금 분해 이동 X */
  const moveB = () => explodeMoves(planOf(doc), doc.explode, EXPLODE_SCALE, doc.tweaks?.resolve(planOf(doc), axis, undefined)).get('b')?.[0] ?? 0;
  /** 누를 점: b의 −X 면 위 한 점(지금 그려진 자리) */
  const shownB = () => [2 + moveB(), 0.3, 1];
  /** 누른 점을 X로 s만큼 옮긴 자리의 화면 점 */
  const at = (p0: number[], s: number) => projectToScreen(frame, [p0[0]! + s, p0[1]!, p0[2]!])!;
  const fire = (type: string, x: number, y: number, pointerType = 'mouse', alt = false) => {
    const e = touchPointerEvent(type, 1, x, y, pointerType);
    if (alt) Object.defineProperty(e, 'altKey', { value: true });
    canvas.dispatchEvent(e);
  };
  const label = () => canvas.parentElement!.querySelector<HTMLElement>('.explode-dist');
  const snapRow = () => [...(label()?.querySelector('.explode-dist-snap')?.children ?? [])].map((c) => c.textContent);

  beforeEach(() => {
    document.body.innerHTML = '';
    env = jsdomViewer();
    canvas = env.viewer.canvas;
    plans.clear();
    axis = 'x';
    guides = [];
    doc = {
      id: 1,
      name: 'f.stp',
      size: 10,
      scene: { units: 'mm', meshes: [A.mesh, B.mesh], lines: [] },
      products: [N('R', [], [N('a', ['a']), N('b', ['b'])])],
      faces: faceIndexOf([A, B]),
      vis: { pmiIds: new Set() },
      dim: null,
      face: null,
      edge: null,
      explode: 0.5,
      selKey: null,
      items: null,
      pick: null,
      body: null,
    } as unknown as StepDoc;
    const viewer = {
      canvas,
      getCamera: () => ({ ...cam }),
      setHighlightSegments: (s: Float32Array | null) => guides.push(s ? s.length / 6 : null),
    } as unknown as Viewer3d;
    const host: TweakHost = {
      live: () => ({ doc, viewer }),
      opened: () => doc,
      setup: () => ({ mode: 'all', axis, view: null }),
      pick: (x) => (x < 100 ? null : ({ kind: 'mesh', id: 'b', index: 0, point: shownB() } as Pick3d)),
      select: () => void (doc.selKey = '0/1'),
      plan: planOf,
      redraw: () => undefined,
      looks: () => undefined,
      toast: () => undefined,
      menu: () => undefined,
      recent: { backend: null },
      deliver: async () => 'saved',
      aim: () => undefined,
      fmt: () => new Fmt('mm'),
    };
    tool = new ExplodeTweakTool(host);
    tool.attach(env.viewer);
    tool.move(true);
  });

  afterEach(() => {
    tool.cancel();
    env.restore();
  });

  it('X로만 끌어 a 쪽으로 가면 b의 −X 면이 a의 +X 면에 닿는 자리에 붙는다(정확히 닿음) — 거리 글 아래 줄·안내 선, 떼면 거둔다', () => {
    const p0 = shownB();
    const s = at(p0, 0);
    // 닿는 자리는 s = −8.5(4.25 → −4.25) — 커서는 0.2만큼 못 미친 자리(화면 약 4화소)
    const c = at(p0, -8.3);
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', c[0], c[1]);
    expect(tool.dragging).toBe(true);
    expect(2 + moveB()).toBeCloseTo(-4.25, 12);
    expect(label()!.classList.contains('snapped')).toBe(true);
    expect(snapRow()).toEqual(['면에 닿음', 'Alt/⌥로 풀기']);
    // 안내 선: 두 면 경계(사각형 넷씩)
    expect(guides.at(-1)).toBe(8);
    // 붙잡기 거리 밖(0.8 — 약 16화소)이면 커서 그대로, 줄과 안내 선이 사라진다
    const far = at(p0, -7.7);
    fire('pointermove', far[0], far[1]);
    expect(2 + moveB()).toBeCloseTo(4.25 - 7.7, 6);
    expect(label()!.classList.contains('snapped')).toBe(false);
    expect(snapRow()).toEqual([]);
    expect(guides.at(-1)).toBeNull();
    fire('pointermove', c[0], c[1]);
    fire('pointerup', c[0], c[1]);
    // 뗀 자리도 닿은 자리(되돌리기 한 단계), 안내 선은 거둔다
    expect(2 + moveB()).toBe(-4.25);
    expect(doc.tweaks!.canUndo('x')).toBe(true);
    expect(guides.at(-1)).toBeNull();
    expect(label()).toBeNull();
  });

  it('a를 지나 반대쪽에서는 b의 +X 면이 a의 −X 면에 닿고, 같은 쪽을 보는 면끼리는 같은 높이', () => {
    const p0 = shownB();
    const s = at(p0, 0);
    fire('pointerdown', s[0], s[1]);
    // s = −12.5: b의 +X(6.25)가 a의 −X(−6.25)에
    const t = at(p0, -12.4);
    fire('pointermove', t[0], t[1]);
    expect(2 + moveB()).toBeCloseTo(-8.25, 12);
    expect(snapRow()[0]).toBe('면에 닿음');
    // s = −10.5: 두 상자가 같은 X 범위(같은 쪽 면끼리 같은 높이)
    const f = at(p0, -10.4);
    fire('pointermove', f[0], f[1]);
    expect(2 + moveB()).toBeCloseTo(-6.25, 12);
    expect(snapRow()[0]).toBe('면과 같은 높이');
    fire('pointerup', f[0], f[1]);
  });

  it('Alt(⌥)를 누른 끌기는 붙잡지 않고, 끄는 중 Alt를 누르면 그 자리에서 풀렸다가 떼면 다시 붙는다', () => {
    const p0 = shownB();
    const s = at(p0, 0);
    const c = at(p0, -8.3);
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', c[0], c[1], 'mouse', true);
    expect(2 + moveB()).toBeCloseTo(4.25 - 8.3, 6);
    expect(snapRow()).toEqual([]);
    fire('pointermove', c[0] + 0.5, c[1]);
    expect(2 + moveB()).toBeCloseTo(-4.25, 12);
    const down = new KeyboardEvent('keydown', { key: 'Alt', cancelable: true, bubbles: true });
    window.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(2 + moveB()).not.toBeCloseTo(-4.25, 3);
    expect(guides.at(-1)).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
    expect(2 + moveB()).toBeCloseTo(-4.25, 12);
    fire('pointerup', c[0] + 0.5, c[1]);
    // 끌기가 끝나면 Alt 글쇠를 더 듣지 않는다
    const later = new KeyboardEvent('keydown', { key: 'Alt', cancelable: true, bubbles: true });
    window.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('손가락은 붙잡기 거리 14화소(마우스 10화소 밖인 12화소쯤도 붙는다), 거리 글 아래 줄에 푸는 글쇠는 없다', () => {
    const p0 = shownB();
    const s = at(p0, 0);
    const rate = Math.abs(at(p0, -8.5)[0] - at(p0, -8.4)[0]) / 0.1;
    const off = 12 / rate;
    const c = at(p0, -8.5 + off);
    // 마우스는 붙지 않는다
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', c[0], c[1]);
    expect(2 + moveB()).toBeCloseTo(-4.25 + off, 6);
    tool.cancel();
    fire('pointerup', c[0], c[1]);
    // 손가락(길게 눌러 잡기)
    fire('pointerdown', s[0], s[1], 'touch');
    expect(tool.grab(s[0], s[1], 1)).toBe(true);
    fire('pointermove', c[0], c[1], 'touch');
    expect(2 + moveB()).toBeCloseTo(-4.25, 12);
    expect(snapRow()).toEqual(['면에 닿음']);
    fire('pointerup', c[0], c[1], 'touch');
    expect(2 + moveB()).toBe(-4.25);
  });

  it('Alt로 고른 면 강조(같은 선분 강조)가 있으면 안내 선은 그리지 않고 거리 글 아래 줄만', () => {
    (doc as { face: unknown }).face = { meshId: 'b', boundary: new Float32Array(6) };
    const p0 = shownB();
    const s = at(p0, 0);
    const c = at(p0, -8.3);
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', c[0], c[1]);
    expect(2 + moveB()).toBeCloseTo(-4.25, 12);
    expect(snapRow()[0]).toBe('면에 닿음');
    fire('pointerup', c[0], c[1]);
    expect(guides).toEqual([]);
  });

  it('사방(면 위로 끄는 길)과 면 표가 없는 문서는 붙잡지 않는다', () => {
    axis = 'free';
    const p0 = shownB();
    const s = projectToScreen(frame, p0)!;
    const c = at(p0, -8.3);
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', c[0], c[1]);
    expect(snapRow()).toEqual([]);
    fire('pointerup', c[0], c[1]);
    axis = 'x';
    (doc as { faces: unknown }).faces = null;
    const p1 = shownB();
    const s1 = at(p1, 0);
    const c1 = at(p1, -8.3);
    fire('pointerdown', s1[0], s1[1]);
    fire('pointermove', c1[0], c1[1]);
    expect(snapRow()).toEqual([]);
    fire('pointerup', c1[0], c1[1]);
    expect(guides).toEqual([]);
  });
});
