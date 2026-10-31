// @vitest-environment jsdom
// 분해 손질 도구(35차 — 36차부터 jsdom에 실제 코어 Viewer3d로 끌기): 앱이 건네는 것(TweakHost)으로 부품을 끌어 손질 → 끈 점이 커서 아래, 되돌리기·모두 되돌리기,
// 측정 중·빈 곳은 코어가 돌려 봄, 손가락 길게 눌러 잡기·떼면 작업 메뉴, 링크 손질 만들기 → 새 문서에 받기, 최근 문서 항목에 남기기·받기.
// 끌기 셈은 시험이 정한 카메라(cam)로 하고, 포인터는 실제 코어(포인터 맡기 훅)가 받는다 — 코어가 돌았는지는 그 뷰어 카메라로 본다
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeFrame, projectToScreen, type CameraState } from 'opencad-viewer3d/camera';
import type { Mesh3d, Pick3d, Viewer3d } from 'opencad-viewer3d';
import { touchPointerEvent } from '../../src/app/aim';
import { jsdomViewer } from './jsdomview';
import type { ProductNode, StepDoc } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan, type ExplodeAxis, type ExplodePlan } from '../../src/app/explode';
import { ExplodeTweakTool, storedTweaks, type TweakHost } from '../../src/app/explodetool';
import { RecentStore, type RecentBackend, type RecentEntry } from '../../src/app/recent';

const box = (id: string, c: [number, number, number]): Mesh3d => ({
  id,
  positions: Float32Array.from([c[0] - 1, c[1] - 1, c[2] - 1, c[0] + 1, c[1] + 1, c[2] + 1, c[0] + 1, c[1] - 1, c[2] - 1]),
  indices: Uint32Array.from([0, 1, 2]),
  color: [0.7, 0.7, 0.7, 1],
});
const N = (name: string, meshIds: string[] = [], children: ProductNode[] = []): ProductNode => ({ name, productId: name, meshIds, children });
const meshes = [box('a', [-3, 0, 0]), box('b', [3, 0, 0])];
const products = () => [N('R', [], [N('a', ['a']), N('b', ['b'])])];
const W = 800;
const H = 600;
const cam: CameraState = { target: [0, 0, 0], distance: 40, yaw: 0, pitch: 0, projection: 'perspective', fovY: (40 * Math.PI) / 180 };
const frame = computeFrame(cam, W, H, { center: cam.target, radius: cam.distance });
const add = (a: readonly number[], b: readonly number[]) => a.map((x, i) => x + b[i]!);

/** 메모리 최근 문서 저장소 */
function memory(): RecentBackend {
  const meta = new Map<string, RecentEntry>();
  return {
    entries: async () => [...meta.values()].map((e) => ({ ...e })),
    put: async (e) => void meta.set(e.id, { ...e }),
    touch: async (e) => void meta.set(e.id, { ...e }),
    data: async () => null,
    remove: async (ids) => ids.forEach((id) => meta.delete(id)),
    clear: async () => meta.clear(),
  };
}

describe('분해 손질 도구(jsdom 끌기)', () => {
  let env: ReturnType<typeof jsdomViewer>;
  let canvas: HTMLCanvasElement;
  /** 코어 뷰어 카메라(돌았는지)와 누르기 알림 수 */
  let coreCam: () => string;
  let picks: number;
  let doc: StepDoc;
  let axis: ExplodeAxis;
  let measuring: boolean;
  let log: string[];
  let backend: RecentBackend;
  let tool: ExplodeTweakTool;
  const plans = new Map<string, ExplodePlan>();
  const planOf = (d: StepDoc): ExplodePlan => {
    const k = `${d.id}:${axis}`;
    if (!plans.has(k)) plans.set(k, explodePlan(meshes, d.products, 'all', axis));
    return plans.get(k)!;
  };
  /** 지금 b가 그려진 자리의 한 점(누른 점) */
  const shownB = (d = doc) => add([3.5, -1, 0.5], explodeMoves(planOf(d), d.explode, EXPLODE_SCALE, d.tweaks?.resolve(planOf(d), axis, undefined)).get('b') ?? [0, 0, 0]);
  const newDoc = (id: number, recentKey?: string): StepDoc =>
    ({ id, products: products(), vis: { pmiIds: new Set() }, explode: 0.5, selKey: null, items: null, pick: null, body: null, ...(recentKey ? { recentKey } : {}) }) as unknown as StepDoc;
  const fire = (type: string, x: number, y: number, pointerType = 'mouse', id = 1) => canvas.dispatchEvent(touchPointerEvent(type, id, x, y, pointerType));

  beforeEach(async () => {
    document.body.innerHTML = '';
    env = jsdomViewer();
    const real = env.viewer;
    canvas = real.canvas;
    coreCam = () => JSON.stringify(real.getCamera());
    picks = 0;
    real.onPick(() => void picks++);
    plans.clear();
    axis = 'free';
    measuring = false;
    log = [];
    backend = memory();
    await backend.put({ id: 'f.stp:10', name: 'f.stp', size: 10, time: 1 }, new Blob([]));
    doc = newDoc(1, 'f.stp:10');
    const viewer = { canvas, getCamera: () => ({ ...cam }) } as unknown as Viewer3d;
    const host: TweakHost = {
      live: () => (measuring ? null : { doc, viewer }),
      opened: () => doc,
      setup: () => ({ mode: 'all', axis, view: null }),
      // 어디를 눌러도 b의 지금 그려진 자리(빈 곳은 x < 100)
      pick: (x) => (x < 100 ? null : ({ kind: 'mesh', id: 'b', index: 0, point: shownB() } as Pick3d)),
      select: (p) => {
        log.push(`select ${p.id}`);
        doc.selKey = '0/1';
      },
      plan: planOf,
      redraw: () => log.push('redraw'),
      looks: () => log.push('looks'),
      toast: (m) => log.push(`toast ${m}`),
      menu: (x, y) => log.push(`menu ${x},${y}`),
      recent: new RecentStore(backend),
    };
    tool = new ExplodeTweakTool(host);
    tool.attach(real);
  });

  afterEach(() => {
    tool.cancel();
    env.restore();
  });

  it('옮기기를 켜고 마우스로 끌면 고르고 손질해, 끈 점이 커서 아래에 온다 — 코어는 돌지 않고, 최근 문서 항목에 남긴다', async () => {
    tool.move(true);
    expect(log).toEqual(['redraw', 'toast 부품을 끌어 분해 자리를 옮깁니다 — 빈 곳을 끌면 돌려 봅니다.']);
    expect(tool.state(doc, 'free')).toEqual({ on: true, count: 0, undo: false });
    const s = projectToScreen(frame, shownB())!;
    const p0 = shownB();
    const c0 = coreCam();
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', s[0] + 3, s[1]);
    expect(tool.dragging).toBe(false);
    fire('pointermove', s[0] + 41.3, s[1] - 17.9);
    expect(tool.dragging).toBe(true);
    expect(log.slice(2, 3)).toEqual(['select b']);
    fire('pointermove', s[0] + 83.7, s[1] - 29.1);
    fire('pointerup', s[0] + 83.7, s[1] - 29.1);
    expect(coreCam()).toBe(c0);
    expect(picks).toBe(0);
    // 누른 점(p0)이 지금은 커서 아래
    const moved = add(p0, add(shownB(), p0.map((v) => -v)));
    const q = projectToScreen(frame, moved)!;
    expect(Math.abs(q[0] - (s[0] + 83.7)) + Math.abs(q[1] - (s[1] - 29.1))).toBeLessThan(1e-6);
    expect(tool.state(doc, 'free')).toEqual({ on: true, count: 1, undo: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(await storedTweaks(backend, 'f.stp:10')).toEqual(doc.tweaks!.toJSON());
    // 한 단계 되돌리기 → 손질 없음, 항목에서도 빠진다
    expect(tool.undo()).toBe(true);
    expect(doc.tweaks!.count('free')).toBe(0);
    await new Promise((r) => setTimeout(r, 0));
    expect(await storedTweaks(backend, 'f.stp:10')).toBeNull();
    expect(tool.undo()).toBe(false);
  });

  it('측정 중(손질할 때가 아님)·빈 곳·옮기기를 끈 끌기는 코어가 돌려 보고, 움직이지 않고 떼면 코어의 누르기', () => {
    tool.move(true);
    /** 그 끌기에 코어가 돌았는지 */
    const orbited = (x0: number, x1: number): boolean => {
      const c = coreCam();
      fire('pointerdown', x0, 300);
      fire('pointermove', x1, 300);
      fire('pointerup', x1, 300);
      return coreCam() !== c;
    };
    measuring = true;
    expect(orbited(400, 450)).toBe(true);
    measuring = false;
    expect(orbited(50, 90)).toBe(true);
    tool.move(false);
    expect(orbited(400, 450)).toBe(true);
    tool.move(true);
    fire('pointerdown', 400, 300);
    fire('pointerup', 401, 301);
    expect(picks).toBe(1);
    expect(doc.tweaks?.count('free') ?? 0).toBe(0);
    expect(log.filter((l) => l.startsWith('select'))).toEqual([]);
  });

  it('X로만이면 끈 거리의 X 성분만, 모두 되돌리기는 한 단계(되돌리면 돌아온다), 방향마다 따로', () => {
    tool.move(true);
    axis = 'x';
    const s = projectToScreen(frame, shownB())!;
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', s[0] + 30, s[1] + 40);
    fire('pointerup', s[0] + 30, s[1] + 40);
    const c = doc.tweaks!.moves('x').get('0/1')!;
    expect(c).toHaveLength(1);
    expect(c[0]).toBeGreaterThan(0);
    expect(doc.tweaks!.count('free')).toBe(0);
    expect(tool.reset()).toBe(true);
    expect(doc.tweaks!.count('x')).toBe(0);
    expect(tool.undo()).toBe(true);
    expect(doc.tweaks!.moves('x').get('0/1')).toEqual(c);
    expect(tool.reset()).toBe(true);
    expect(tool.reset()).toBe(false);
  });

  it('손가락: 길게 눌러 잡고(옮기기를 켜지 않아도) 끌면 손질, 움직이지 않고 떼면 손질 없이 작업 메뉴 — 처음 한 번 안내', () => {
    const s = projectToScreen(frame, shownB())!;
    fire('pointerdown', s[0], s[1], 'touch');
    expect(tool.grab(s[0], s[1], 1)).toBe(true);
    fire('pointerup', s[0] + 2, s[1] + 3, 'touch');
    expect(log).toEqual(['select b', 'toast 끌어 옮기십시오 — 움직이지 않고 떼면 작업 메뉴입니다.', 'redraw', `menu ${s[0]},${s[1]}`]);
    expect(doc.tweaks!.count('free')).toBe(0);
    log = [];
    fire('pointerdown', s[0], s[1], 'touch');
    expect(tool.grab(s[0], s[1], 1)).toBe(true);
    fire('pointermove', s[0] + 40, s[1] + 10, 'touch');
    fire('pointerup', s[0] + 40, s[1] + 10, 'touch');
    // 이미 고른 b라 다시 고르지 않고, 안내도 한 번만
    expect(log.filter((l) => l !== 'redraw' && l !== 'looks')).toEqual([]);
    // 끄는 동안은 겉모습만, 끝나면 막대까지
    expect(log.at(-1)).toBe('redraw');
    expect(log.slice(0, -1).every((l) => l === 'looks')).toBe(true);
    expect(doc.tweaks!.count('free')).toBe(1);
    // 빈 곳은 잡지 않는다(앱은 예전처럼 작업 메뉴)
    fire('pointerdown', 50, 50, 'touch', 2);
    expect(tool.grab(50, 50, 2)).toBe(false);
    fire('pointerup', 50, 50, 'touch', 2);
  });

  it('링크: 지금 방향의 손질 글을 만들고, 새 문서(같은 나무)에 받으면 양자 안에서 같은 손질(되돌리기 한 단계) — 손질이 없으면 빈 글', async () => {
    expect(tool.link(doc)).toBe('');
    tool.move(true);
    const s = projectToScreen(frame, shownB())!;
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', s[0] + 60, s[1] - 20);
    fire('pointerup', s[0] + 60, s[1] - 20);
    const exm = tool.link(doc)!;
    expect(exm).toMatch(/^[0-9.e-]+\+0\/1:-?\d+,-?\d+,-?\d+$/);
    const q = Number(exm.split('+')[0]);
    const mine = doc.tweaks!.moves('free').get('0/1')!;
    const other = newDoc(2);
    tool.applyLink(other, exm);
    const got = other.tweaks!.moves('free').get('0/1')!;
    got.forEach((v, i) => expect(Math.abs(v - mine[i]!)).toBeLessThanOrEqual(q / 2 + 1e-12));
    expect(other.tweaks!.canUndo('free')).toBe(true);
    // 남긴 손질 받기: 손질·되돌리기가 없는 문서에만
    await new Promise((r) => setTimeout(r, 0));
    const again = newDoc(3, 'f.stp:10');
    expect(await tool.restore(again)).toBe(true);
    expect(again.tweaks!.moves('free').get('0/1')).toEqual(mine);
    expect(await tool.restore(newDoc(4, 'nope:1'))).toBe(false);
  });
});
