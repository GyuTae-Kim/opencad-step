// @vitest-environment jsdom
// 분해 손질 도구(35차 — 36차부터 jsdom에 실제 코어 Viewer3d로 끌기): 앱이 건네는 것(TweakHost)으로 부품을 끌어 손질 → 끈 점이 커서 아래, 되돌리기·모두 되돌리기,
// 측정 중·빈 곳은 코어가 돌려 봄, 손가락 길게 눌러 잡기·떼면 작업 메뉴, 링크 손질 만들기 → 새 문서에 받기, 최근 문서 항목에 남기기·받기.
// 끌기 셈은 시험이 정한 카메라(cam)로 하고, 포인터는 실제 코어(포인터 맡기 훅)가 받는다 — 코어가 돌았는지는 그 뷰어 카메라로 본다.
// 38차: 다시 하기(링크·최근 문서 저장과 섞어), 손질 파일 내보내기 → 같은·다른 문서에 불러오기·망가진 파일, 끄는 동안 거리 글
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { basisFromAngles, computeFrame, projectToScreen, type CameraState } from 'opencad-viewer3d/camera';
import type { Mesh3d, Pick3d, Viewer3d } from 'opencad-viewer3d';
import { touchPointerEvent } from '../../src/app/aim';
import { jsdomViewer } from './jsdomview';
import { Fmt } from '../../src/app/display';
import type { ProductNode, StepDoc } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan, type ExplodeAxis, type ExplodePlan } from '../../src/app/explode';
import { ExplodeTweakTool, storedTweaks, type TweakHost } from '../../src/app/explodetool';
import { dragDistanceLines, plainLength } from '../../src/app/explodetweak';
import { ExplodeControls, type DistField, type DistState } from '../../src/app/explodebar';
import { TWEAK_FILE_MAX_BYTES } from '../../src/app/explodefile';
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
    if (!plans.has(k)) plans.set(k, explodePlan((d as unknown as { testItems?: Mesh3d[] }).testItems ?? meshes, d.products, 'all', axis));
    return plans.get(k)!;
  };
  /** 지금 b가 그려진 자리의 한 점(누른 점) */
  const shownB = (d = doc) => add([3.5, -1, 0.5], explodeMoves(planOf(d), d.explode, EXPLODE_SCALE, d.tweaks?.resolve(planOf(d), axis, undefined)).get('b') ?? [0, 0, 0]);
  /** 시험 문서(testItems를 주면 그 문서의 계획은 그 그물로 — 지문이 다른 문서) */
  const newDoc = (id: number, recentKey?: string, name = 'f.stp', size = 10, tree = products(), testItems?: Mesh3d[]): StepDoc =>
    ({
      id,
      name,
      size,
      scene: { units: 'mm' },
      products: tree,
      vis: { pmiIds: new Set() },
      explode: 0.5,
      selKey: null,
      items: null,
      pick: null,
      body: null,
      ...(recentKey ? { recentKey } : {}),
      ...(testItems ? { testItems } : {}),
    }) as unknown as StepDoc;
  /** 건넨 파일(내보내기)·알림(종류와 함께)·방향 바꾸기(파일을 불러온 뒤) */
  let delivered: { blob: Blob; name: string }[];
  let toasts: { m: string | string[]; kind: string }[];
  let aimed: [ExplodeAxis, unknown][];
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
    delivered = [];
    toasts = [];
    aimed = [];
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
      toast: (m, kind = 'info') => {
        log.push(`toast ${m}`);
        toasts.push({ m, kind });
      },
      menu: (x, y) => log.push(`menu ${x},${y}`),
      recent: new RecentStore(backend),
      deliver: async (blob, name) => (delivered.push({ blob, name }), 'saved'),
      aim: (a, view) => {
        aimed.push([a, view]);
        axis = a;
      },
      fmt: () => new Fmt('mm'),
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
    expect(tool.state(doc, 'free')).toEqual({ on: true, snapOff: false, count: 0, undo: false, redo: false, any: false });
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
    // 43차: 막 끈 끌기는 거리 칸에 그 끌기로 옮긴 거리(누른 점이 지금 화면에서 옮긴 거리)
    const st = tool.state(doc, 'free');
    expect(st).toMatchObject({ on: true, count: 1, undo: true, redo: false, any: true });
    expect(st.dist).toEqual({ value: plainLength(Math.hypot(...add(shownB(), p0.map((v) => -v))), { factor: 1, decimals: 3 }), unit: 'mm', axis: 'free', live: false });
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

  /** 옮기기를 켠 마우스로 b를 (dx, dy)만큼 끈다 */
  const drag = (dx: number, dy: number) => {
    const s = projectToScreen(frame, shownB())!;
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', s[0] + dx * 0.5, s[1] + dy * 0.5);
    fire('pointermove', s[0] + dx, s[1] + dy);
    fire('pointerup', s[0] + dx, s[1] + dy);
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const b0 = () => [...doc.tweaks!.moves('free').get('0/1')!];
  /** 건넨 파일 글(jsdom Blob은 text()가 없을 수 있다) */
  const read = (b: Blob) =>
    typeof b.text === 'function'
      ? b.text()
      : new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = rej;
          r.readAsText(b);
        });

  it('다시 하기(38차): 되돌린 끌기를 다시 걸고(최근 문서 항목도 따라감), 새 끌기·링크 받기는 그 방향의 다시 할 목록을 비운다 — 방향마다 따로', async () => {
    tool.move(true);
    drag(50.3, -10.7);
    const first = b0();
    drag(30.9, 20.1);
    const second = b0();
    expect(tool.redo()).toBe(false);
    expect(tool.undo()).toBe(true);
    expect(b0()).toEqual(first);
    expect(tool.state(doc, 'free')).toMatchObject({ undo: true, redo: true, count: 1 });
    await tick();
    expect(await storedTweaks(backend, 'f.stp:10')).toEqual({ v: 1, axes: { free: [['0/1', ...first]] } });
    expect(tool.redo()).toBe(true);
    expect(b0()).toEqual(second);
    await tick();
    expect(await storedTweaks(backend, 'f.stp:10')).toEqual({ v: 1, axes: { free: [['0/1', ...second]] } });
    expect(tool.redo()).toBe(false);
    // 되돌린 뒤 X로만에서 끌어도 사방의 다시 할 것은 그대로, X에는 다시 할 것이 없다
    tool.undo();
    axis = 'x';
    drag(40.1, 0.3);
    expect(tool.state(doc, 'x')).toMatchObject({ undo: true, redo: false, count: 1 });
    axis = 'free';
    expect(tool.state(doc, 'free').redo).toBe(true);
    // 새 끌기는 사방의 다시 할 목록을 비운다
    drag(-20.2, 15.6);
    expect(tool.state(doc, 'free').redo).toBe(false);
    // 링크 받기도 새 단계: 다시 할 목록을 비우고, 되돌리면 받기 전 손질로
    expect(tool.undo()).toBe(true);
    const before = b0();
    expect(tool.state(doc, 'free').redo).toBe(true);
    tool.applyLink(doc, `0.001+0/1:${[1, 2, 3].join(',')}`);
    expect(b0()).toEqual([0.001, 0.002, 0.003]);
    expect(tool.state(doc, 'free').redo).toBe(false);
    expect(tool.undo()).toBe(true);
    expect(b0()).toEqual(before);
    expect(tool.redo()).toBe(true);
    expect(b0()).toEqual([0.001, 0.002, 0.003]);
    // 다시 할 것만 남은 방향(링크로 받고 되돌린 새 문서의 사방)은 최근 문서 항목의 손질로 채우지 않는다 — 손대지 않은 X는 채운다
    await tick();
    const fresh = newDoc(5, 'f.stp:10');
    tool.applyLink(fresh, '0.001+0/1:4,5,6');
    fresh.tweaks!.undo('free');
    expect(await tool.restore(fresh)).toBe(true);
    expect([fresh.tweaks!.count('free'), fresh.tweaks!.count('x')]).toEqual([0, 1]);
    expect(fresh.tweaks!.redo('free')).toBe(true);
    expect([...fresh.tweaks!.moves('free').get('0/1')!]).toEqual([0.004, 0.005, 0.006]);
  });

  it('손질 파일(38차): 내보내면 문서 이름 + -explode.json, 같은 문서에 불러오면 모든 방향이 그대로(방향마다 되돌리기 한 단계)·내보낸 방향으로·항목에도 남긴다', async () => {
    expect(await tool.exportFile()).toBe(false);
    expect(toasts.at(-1)).toEqual({ m: '내보낼 분해 손질이 없습니다.', kind: 'warn' });
    tool.move(true);
    drag(44.4, -12.2);
    axis = 'x';
    drag(-35.5, 3.3);
    const mine = { free: b0(), x: [...doc.tweaks!.moves('x').get('0/1')!] };
    expect(await tool.exportFile()).toBe(true);
    expect(delivered.map((x) => [x.name, x.blob.type])).toEqual([['f-explode.json', 'application/json']]);
    expect(toasts.at(-1)).toEqual({ m: '분해 손질을 파일로 내보냈습니다(방향 2개 · 손질 2개).', kind: 'info' });
    const text = await read(delivered[0]!.blob);
    expect(JSON.parse(text)).toEqual({
      format: 'opencad-step-explode',
      v: 2,
      doc: { name: 'f.stp', size: 10, units: 'mm' },
      axis: 'x',
      // 39차 판 2: 줄마다 부품 지문(묶음 수·범위 상자 크기)
      axes: { free: [['0/1', 'b', [1, 2, 2, 2], ...mine.free]], x: [['0/1', 'b', [1, 2, 2, 2], ...mine.x]] },
    });
    // 같은 파일(이름·크기)을 다시 연 문서에 받는다: 사방에서 받아도 내보낸 방향(X)으로 바꿔 보인다
    axis = 'free';
    const again = newDoc(6, 'f.stp:10');
    doc = again;
    log = [];
    expect(tool.importText(again, text)).toBe(true);
    expect({ free: b0(), x: [...again.tweaks!.moves('x').get('0/1')!] }).toEqual(mine);
    expect(aimed).toEqual([['x', null]]);
    expect(log).toContain('redraw');
    expect(toasts.at(-1)).toEqual({ m: ['분해 손질을 불러왔습니다(방향 2개 · 손질 2개).'], kind: 'info' });
    expect(['free', 'x'].map((a) => again.tweaks!.canUndo(a as ExplodeAxis))).toEqual([true, true]);
    await tick();
    expect(await storedTweaks(backend, 'f.stp:10')).toEqual(again.tweaks!.toJSON());
    // 파일 받기도 되돌리기·다시 하기 한 단계(지금 방향 X)
    expect(tool.undo()).toBe(true);
    expect(again.tweaks!.count('x')).toBe(0);
    expect(tool.redo()).toBe(true);
    expect([...again.tweaks!.moves('x').get('0/1')!]).toEqual(mine.x);
    // 파일 고르기(불러오기)의 글 읽기 길
    const third = newDoc(7);
    doc = third;
    expect(await tool.importFile({ size: text.length, text: async () => text } as Blob)).toBe(true);
    expect(third.tweaks!.count('free')).toBe(1);
  });

  it('손질 파일: 다른 문서면 자리와 부품 이름이 맞는 것만 받고 알린다, 맞는 것이 없거나 망가진 파일·다른 판은 알리고 그대로', async () => {
    tool.move(true);
    drag(44.4, -12.2);
    await tool.exportFile();
    const text = await read(delivered[0]!.blob);
    // 같은 나무·다른 파일 이름: 맞는 부품(b)을 받고 다른 문서라고 알린다
    const renamed = newDoc(8, undefined, 'g.stp', 10);
    doc = renamed;
    expect(tool.importText(renamed, text)).toBe(true);
    expect(renamed.tweaks!.count('free')).toBe(1);
    expect(toasts.at(-1)).toEqual({
      m: ['다른 문서(이름·크기가 다름)에서 내보낸 손질이라 자리와 부품(이름·묶음 수·크기)이 맞는 것만 받았습니다.', '분해 손질을 불러왔습니다(방향 1개 · 손질 1개).'],
      kind: 'warn',
    });
    // 같은 자리에 다른 부품(이름이 다름) — 받지 않는다
    const nope = '다른 문서에서 내보낸 손질이라 이 문서에 맞는 부품이 없습니다 — 불러오지 않았습니다.';
    const other = newDoc(9, undefined, 'h.stp', 99, [N('R', [], [N('a', ['a']), N('c', ['b'])])]);
    doc = other;
    toasts = [];
    expect(tool.importText(other, text)).toBe(false);
    expect(other.tweaks?.count('free') ?? 0).toBe(0);
    expect(toasts).toEqual([{ m: [nope], kind: 'warn' }]);
    // 39차: 같은 자리·같은 이름인데 묶음 수가 다른 부품(지문이 다름) — 받지 않는다. 38차 꼴(판 1) 파일은 지문이 없어 이름으로 받는다
    const twin = newDoc(10, undefined, 'k.stp', 77, [N('R', [], [N('a', ['a']), N('b', ['b', 'b2'])])], [...meshes, box('b2', [3, 2, 0])]);
    doc = twin;
    toasts = [];
    expect(tool.importText(twin, text)).toBe(false);
    expect(toasts).toEqual([{ m: [nope], kind: 'warn' }]);
    const old = JSON.parse(text) as { v: number; axes: Record<string, unknown[][]> };
    old.v = 1;
    for (const l of Object.values(old.axes)) for (const e of l) e.splice(2, 1);
    expect(tool.importText(twin, JSON.stringify(old))).toBe(true);
    expect(toasts.at(-1)!.m[0]).toBe('다른 문서(이름·크기가 다름)에서 내보낸 손질이라 자리와 부품 이름이 맞는 것만 받았습니다.');
    // 망가진 파일·다른 판·줄이 너무 많은 파일
    for (const [bad, msg] of [
      ['{ not json', '손질 파일을 읽지 못했습니다 — 이 앱에서 내보낸 분해 손질 JSON이 아닙니다.'],
      [JSON.stringify({ ...JSON.parse(text), format: 'x' }), '손질 파일을 읽지 못했습니다 — 이 앱에서 내보낸 분해 손질 JSON이 아닙니다.'],
      [JSON.stringify({ ...JSON.parse(text), v: 3 }), '판 3의 손질 파일이라 불러오지 않았습니다 — 이 앱은 판 2까지 읽습니다.'],
      [JSON.stringify({ ...JSON.parse(text), axes: { x: Array(4097).fill(['0/1', 'b', [1, 2, 2, 2], 1]) } }), '손질 줄이 너무 많은 파일이라 불러오지 않았습니다(한도 28,672개).'],
    ]) {
      toasts = [];
      expect(tool.importText(other, bad!)).toBe(false);
      expect(toasts).toEqual([{ m: msg, kind: 'warn' }]);
    }
    expect(other.tweaks?.canUndo('free') ?? false).toBe(false);
  });

  it('손질 파일 안전(39차): 크기 한도를 넘는 파일은 읽지 않고 알린다, 값이 범위를 벗어난 줄은 건너뛰고 알린다, 내보내기도 줄 한도를 넘으면 하지 않는다', async () => {
    const big = '손질 파일이 너무 커서 읽지 않았습니다(한도 약 24 MB).';
    let reads = 0;
    const huge = { size: TWEAK_FILE_MAX_BYTES + 1, text: async () => (reads++, '') } as unknown as Blob;
    expect(await tool.importFile(huge)).toBe(false);
    expect([reads, toasts.at(-1)]).toEqual([0, { m: big, kind: 'warn' }]);
    // 한도와 같으면 읽는다(꼴이 틀려 알린다)
    const edge = { size: TWEAK_FILE_MAX_BYTES, text: async () => (reads++, '{') } as unknown as Blob;
    expect(await tool.importFile(edge)).toBe(false);
    expect([reads, toasts.at(-1)!.m]).toEqual([1, '손질 파일을 읽지 못했습니다 — 이 앱에서 내보낸 분해 손질 JSON이 아닙니다.']);
    // 이상값: 조립 대각선 1만 배 넘는 성분·무한(1e400)은 건너뛰고 나머지는 받는다
    const reach = 1e4 * planOf(doc).size;
    const text = JSON.stringify({ format: 'opencad-step-explode', v: 2, doc: { name: 'f.stp', size: 10, units: 'mm' }, axis: 'free', axes: { free: [['0/1', 'b', [1, 2, 2, 2], 1, 2, 3]], x: [['0/1', 'b', [1, 2, 2, 2], reach * 2]] } }).replace(
      '"x":',
      '"y":[["0/1","b",[1,2,2,2],1e400]],"x":',
    );
    expect(tool.importText(doc, text)).toBe(true);
    expect(doc.tweaks!.moves('free').get('0/1')).toEqual([1, 2, 3]);
    expect([doc.tweaks!.count('x'), doc.tweaks!.count('y')]).toEqual([0, 0]);
    expect(toasts.at(-1)).toEqual({ m: ['분해 손질을 불러왔습니다(방향 1개 · 손질 1개).', '값이 범위를 벗어난 손질 2개는 건너뛰었습니다.'], kind: 'warn' });
    // 모두 이상값이면 받지 않는다
    expect(tool.importText(doc, text.replace('[1,2,2,2],1,2,3]', '[1,2,2,2],1e400,0,0]'))).toBe(false);
    expect(toasts.at(-1)).toEqual({ m: ['이 파일에는 이 문서에 걸 손질이 없습니다 — 불러오지 않았습니다.', '값이 범위를 벗어난 손질 3개는 건너뛰었습니다.'], kind: 'warn' });
    // 내보내기: 방향 하나에 4,096개 넘게 손질했으면(받는 쪽이 읽지 못할 파일) 내보내지 않는다
    doc.tweaks!.replace('z', Array.from({ length: 4097 }, (_, i) => [`0/${i}`, [1]] as const));
    delivered = [];
    expect(await tool.exportFile()).toBe(false);
    expect([delivered.length, toasts.at(-1)]).toEqual([0, { m: '손질이 너무 많아 파일로 내보내지 못했습니다(한도 28,672개).', kind: 'warn' }]);
  });

  it('끄는 동안 옮긴 거리 글(38차): 캔버스 부모에 측정 글상자 꼴(사방은 거리·ΔX·ΔY·ΔZ)로 보이고 떼면 사라진다, X로만이면 ΔX 하나', () => {
    const rows = () => [...(canvas.parentElement!.querySelector('.explode-dist')?.children ?? [])].map((r) => [...r.children].map((p) => p.textContent));
    const want = (a: ExplodeAxis, d: number[]) => dragDistanceLines(a, null, d, new Fmt('mm')).map((l) => l.map(([w, v]) => `${w} ${v}`));
    tool.move(true);
    const p0 = shownB();
    const s = projectToScreen(frame, p0)!;
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', s[0] + 41.3, s[1] - 17.9);
    const el = canvas.parentElement!.querySelector<HTMLElement>('.explode-dist')!;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(rows()).toEqual(want('free', add(shownB(), p0.map((v) => -v))));
    expect(rows()[0]![0]).toMatch(/^거리 [\d.]+ mm$/);
    fire('pointermove', s[0] + 83.7, s[1] - 29.1);
    // 같은 글상자에서 값만 바뀐다
    expect(canvas.parentElement!.querySelector('.explode-dist')).toBe(el);
    expect(rows()).toEqual(want('free', add(shownB(), p0.map((v) => -v))));
    fire('pointerup', s[0] + 83.7, s[1] - 29.1);
    expect(canvas.parentElement!.querySelector('.explode-dist')).toBeNull();
    axis = 'x';
    const q0 = shownB();
    const t = projectToScreen(frame, q0)!;
    fire('pointerdown', t[0], t[1]);
    fire('pointermove', t[0] + 30.2, t[1] + 5.1);
    const r = rows();
    expect(r).toHaveLength(1);
    expect(r[0]![0]).toMatch(/^ΔX -?[\d.]+ mm$/);
    expect(r).toEqual(want('x', add(shownB(), q0.map((v) => -v))));
    // Esc(취소)도 글을 치운다
    tool.cancel();
    expect(canvas.parentElement!.querySelector('.explode-dist')).toBeNull();
    fire('pointerup', t[0] + 30.2, t[1] + 5.1);
  });

  // ── 43차: 쳐 넣은 거리 ──

  /** 거리 칸(가짜 — 보인 상태·글쇠로 들어가기를 적는다) */
  function fakeField(): { field: DistField; shown: (DistState | null)[]; seeds: string[]; focused: number } {
    const r = { shown: [] as (DistState | null)[], seeds: [] as string[], focused: 0, field: null as unknown as DistField };
    r.field = {
      show: (s) => void r.shown.push(s),
      seed: (ch) => (r.seeds.push(ch), r.shown.at(-1) !== null && r.shown.length > 0),
      focus: () => (r.focused++, r.shown.at(-1) !== null && r.shown.length > 0),
    };
    return r;
  }
  /** 옮기기를 켜고 b를 화면에서 (dx, dy)만큼 끈다(떼지 않으려면 up = false). 누른 점(끌기 전 그려진 b 자리)을 돌려준다 */
  const dragB = (dx: number, dy: number, up = true): number[] => {
    tool.move(true);
    const p0 = shownB();
    const s = projectToScreen(frame, p0)!;
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', s[0] + dx * 0.5, s[1] + dy * 0.5);
    fire('pointermove', s[0] + dx, s[1] + dy);
    if (up) fire('pointerup', s[0] + dx, s[1] + dy);
    return p0;
  };
  const moved = (p0: readonly number[]) => add(shownB(), p0.map((v) => -v));
  const len = (v: readonly number[]) => Math.hypot(...v);
  const unit = (v: readonly number[]) => v.map((x) => x / len(v));

  it('거리 쳐 넣기(43차): 막 끈 뒤 수 하나면 누른 점이 끈 방향으로 그 거리(밀대 50% — 손질은 그 두 배), 같은 되돌리기 단계(되돌리면 끌기 전), 링크·최근 문서 항목도 그 값', async () => {
    const f = fakeField();
    tool.bind(f.field);
    const p0 = dragB(57.3, -21.9);
    const d0 = moved(p0);
    expect(f.shown.at(-1)).toEqual({ value: plainLength(len(d0), { factor: 1, decimals: 3 }), unit: 'mm', axis: 'free', live: false });
    expect(tool.typed('25')).toBe(true);
    const d1 = moved(p0);
    expect(len(d1)).toBeCloseTo(25, 9);
    unit(d1).forEach((v, i) => expect(v).toBeCloseTo(unit(d0)[i]!, 12));
    // 한꺼번에 50%라 손질(100%의 덧이동)은 50
    expect(len(doc.tweaks!.moves('free').get('0/1')!)).toBeCloseTo(50, 9);
    expect(f.shown.at(-1)).toEqual({ value: '25', unit: 'mm', axis: 'free', live: false });
    // 다시 쳐 넣어도 같은 단계(음수는 반대쪽)
    expect(tool.typed('-10')).toBe(true);
    const d2 = moved(p0);
    expect(len(d2)).toBeCloseTo(10, 9);
    unit(d2).forEach((v, i) => expect(v).toBeCloseTo(-unit(d0)[i]!, 12));
    await new Promise((r) => setTimeout(r, 0));
    expect(await storedTweaks(backend, 'f.stp:10')).toEqual(doc.tweaks!.toJSON());
    const exm = tool.link(doc)!;
    const other = newDoc(2);
    tool.applyLink(other, exm);
    const q = Number(exm.split('+')[0]);
    other.tweaks!.moves('free').get('0/1')!.forEach((v, i) => expect(Math.abs(v - doc.tweaks!.moves('free').get('0/1')![i]!)).toBeLessThanOrEqual(q / 2 + 1e-12));
    // 되돌리기 한 번에 끌기 전, 다시 하기는 마지막에 쳐 넣은 값
    expect(tool.undo()).toBe(true);
    expect(doc.tweaks!.count('free')).toBe(0);
    expect(tool.undo()).toBe(false);
    // 되돌린 뒤에는 고칠 끌기가 없다(칸을 숨기고, 쳐 넣어도 아무것도 하지 않고 알리지 않는다)
    expect(tool.state(doc, 'free').dist).toBeUndefined();
    const nToasts = toasts.length;
    expect(tool.typed('5')).toBe(false);
    expect(toasts.length).toBe(nToasts);
    expect(tool.redo()).toBe(true);
    expect(len(moved(p0))).toBeCloseTo(10, 9);
  });

  it('X로만: 수 하나는 그 축 위 끈 쪽으로(음수는 반대쪽) — 표시 단위·붙인 단위대로, 0이면 끌기 전 자리로 돌아와 단계가 없어진다', () => {
    axis = 'x';
    const p0 = dragB(-48.1, 7.3);
    const dx = moved(p0)[0]!;
    expect(dx).toBeLessThan(0);
    expect(tool.state(doc, 'x').dist).toMatchObject({ axis: 'x', live: false });
    expect(tool.typed('12')).toBe(true);
    expect(moved(p0)).toEqual([expect.closeTo(-12, 9), 0, 0]);
    expect(tool.typed('-3')).toBe(true);
    expect(moved(p0)[0]).toBeCloseTo(3, 9);
    // 끈 쪽은 지금 자리(+X)를 따른다 — 1in = 25.4mm(장면 mm)
    expect(tool.typed('1in')).toBe(true);
    expect(moved(p0)[0]).toBeCloseTo(25.4, 9);
    expect(tool.typed('0')).toBe(true);
    expect(doc.tweaks!.count('x')).toBe(0);
    expect(doc.tweaks!.canUndo('x')).toBe(false);
    expect(tool.state(doc, 'x').dist).toBeUndefined();
  });

  it('화면 평면은 가로; 세로 두 수, 사방은 ΔX; ΔY; ΔZ 세 수 — 다른 개수·못 읽는 글·너무 먼 거리는 방향에 맞게 알리고 그대로', () => {
    axis = 'sp';
    const p0 = dragB(33.2, 12.1);
    expect(tool.typed('3; -4')).toBe(true);
    const b = basisFromAngles(0, 0);
    moved(p0).forEach((v, i) => expect(v).toBeCloseTo(3 * b.right[i]! - 4 * b.up[i]!, 9));
    const keep = [...doc.tweaks!.moves('sp').get('0/1')!];
    expect(tool.typed('1;2;3')).toBe(false);
    expect(toasts.at(-1)).toEqual({ m: '거리를 읽지 못했습니다 — 수 하나(끈 방향으로 옮길 거리)나 가로; 세로 두 수를 쳐 넣으십시오.', kind: 'warn' });
    expect(tool.typed('abc')).toBe(false);
    expect(tool.typed(String(planOf(doc).size * 20 + 1))).toBe(false);
    expect(toasts.at(-1)!.m).toBe('너무 멀어 옮기지 않았습니다 — 조립 대각선의 20배까지 옮깁니다.');
    expect(doc.tweaks!.moves('sp').get('0/1')).toEqual(keep);
    axis = 'free';
    const q0 = dragB(-20.4, 30.6);
    expect(tool.typed('1, 2, 3')).toBe(true);
    moved(q0).forEach((v, i) => expect(v).toBeCloseTo([1, 2, 3][i]!, 9));
    expect(tool.typed('1;2')).toBe(false);
    expect(toasts.at(-1)!.m).toBe('거리를 읽지 못했습니다 — 수 하나(끈 방향으로 옮길 거리)나 ΔX; ΔY; ΔZ 세 수를 쳐 넣으십시오.');
  });

  it('끄는 동안: 숫자 글쇠는 거리 칸으로(표준 뷰 키보다 먼저) — Enter로 건 거리에서 끌기를 마치고(한 단계), 그 포인터는 뗄 때까지 더 움직이지 않는다', () => {
    const f = fakeField();
    tool.bind(f.field);
    // 사건 대상: 캔버스(끌던 곳), 글 칸, 단추·메뉴 항목(Enter를 스스로 쓴다)
    const search = document.createElement('input');
    const button = document.createElement('button');
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    // 끌지 않을 때 숫자는 거리 칸으로 가지 않는다(1~7 표준 뷰 키 그대로), Enter도 고칠 끌기가 없으면 그대로
    expect(tool.key('1', canvas)).toBe(false);
    expect(tool.key('Enter', canvas)).toBe(false);
    const p0 = dragB(41.7, 18.2, false);
    expect(tool.dragging).toBe(true);
    // 끄는 동안 거리 칸은 숨긴다(막대 줄이 바뀌지 않게 — 커서 곁 거리 글만), 쳐 넣기 시작하면 보인다
    expect(f.shown.at(-1)).toBeNull();
    expect(tool.key('7', canvas)).toBe(true);
    expect(f.shown.at(-1)).toMatchObject({ axis: 'free', live: true });
    expect(tool.key('-', document.body)).toBe(true);
    expect(tool.key('F', canvas)).toBe(false);
    // 글 입력 칸에서 누른 것은 그 칸 것
    expect(tool.key('7', search)).toBe(false);
    expect(f.seeds).toEqual(['7', '-']);
    const d0 = moved(p0);
    expect(tool.typed('7.5')).toBe(true);
    expect(tool.dragging).toBe(false);
    expect(len(moved(p0))).toBeCloseTo(7.5, 9);
    unit(moved(p0)).forEach((v, i) => expect(v).toBeCloseTo(unit(d0)[i]!, 12));
    // 더 움직여도·떼도 그대로(작업 메뉴도 열지 않는다), 되돌리기 한 단계
    const s = projectToScreen(frame, p0)!;
    fire('pointermove', s[0] + 90, s[1] - 40);
    fire('pointerup', s[0] + 90, s[1] - 40);
    expect(len(moved(p0))).toBeCloseTo(7.5, 9);
    expect(log.some((l) => l.startsWith('menu'))).toBe(false);
    expect(doc.tweaks!.count('free')).toBe(1);
    // 막 끈 뒤: Enter는 거리 칸으로(단추·메뉴 항목 등 Enter를 스스로 쓰는 칸·글 칸이면 그대로), 숫자 글쇠는 표준 뷰 키 그대로
    expect(tool.key('Enter', button)).toBe(false);
    expect(tool.key('Enter', item)).toBe(false);
    expect(tool.key('Enter', search)).toBe(false);
    expect(tool.key('Enter', canvas)).toBe(true);
    expect(f.focused).toBe(1);
    expect(tool.key('2', canvas)).toBe(false);
    expect(tool.undo()).toBe(true);
    expect(doc.tweaks!.count('free')).toBe(0);
  });

  it('막 끈 끌기는 밀대·방향·새 끌기·측정이 끼면 끝난다 — 아직 움직이지 않은 화면 평면 끌기에 거리 하나는 방향이 없다고 알린다', () => {
    dragB(30.3, 10.1);
    expect(tool.state(doc, 'free').dist).toBeTruthy();
    doc.explode = 0.6;
    expect(tool.state(doc, 'free').dist).toBeUndefined();
    expect(tool.typed('5')).toBe(false);
    doc.explode = 0.5;
    // 한 번 끝나면 밀대를 되돌려도 고치지 않는다
    expect(tool.state(doc, 'free').dist).toBeUndefined();
    dragB(30.3, 10.1);
    axis = 'x';
    expect(tool.state(doc, 'x').dist).toBeUndefined();
    axis = 'free';
    dragB(30.3, 10.1);
    measuring = true;
    expect(tool.state(doc, 'free').dist).toBeUndefined();
    measuring = false;
    // 화면 평면: 누른 뒤 움직이기 전(끌기 문턱 안)에는 끄는 중이 아니고, 끌기를 시작해 제자리로 돌아오면 방향이 없다
    axis = 'sp';
    tool.move(true);
    const s = projectToScreen(frame, shownB())!;
    fire('pointerdown', s[0], s[1]);
    fire('pointermove', s[0] + 30, s[1]);
    fire('pointermove', s[0], s[1]);
    expect(tool.dragging).toBe(true);
    expect(tool.typed('5')).toBe(false);
    expect(toasts.at(-1)!.m).toBe('아직 끈 방향이 없어 거리 하나로는 옮기지 못합니다 — 성분으로 쳐 넣으십시오.');
    expect(tool.typed('5; 0')).toBe(true);
    expect(tool.dragging).toBe(false);
    fire('pointerup', s[0], s[1]);
  });

  it('막대의 거리 칸(실제 ExplodeControls)과 함께: 끄는 동안은 숨기고(쳐 넣기 전), 떼면 그 끌기 거리 — 칸에 쳐 넣고 Enter면 그 거리로', () => {
    const c = new ExplodeControls(
      () => {},
      () => {},
      tool,
    );
    document.body.append(...c.els);
    const input = c.els[3]!.querySelector<HTMLInputElement>('.explode-num')!;
    const label = input.closest('label')!;
    expect(label.hidden).toBe(true);
    const p0 = dragB(44.4, -12.2, false);
    expect(label.hidden).toBe(true);
    const s = projectToScreen(frame, p0)!;
    fire('pointerup', s[0] + 44.4, s[1] - 12.2);
    expect(label.hidden).toBe(false);
    expect(input.value).toBe(plainLength(len(moved(p0)), { factor: 1, decimals: 3 }));
    input.focus();
    input.value = '18';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(len(moved(p0))).toBeCloseTo(18, 9);
    expect([input.value, document.activeElement === input]).toEqual(['18', false]);
    // 되돌리면(막대 sync — 앱은 다시 걸 때 부른다) 칸을 숨긴다
    tool.undo();
    c.sync(doc, 'all', true, 'free', null, tool.state(doc, 'free'));
    expect(label.hidden).toBe(true);
  });

  // ── 45차: 끌지 않고 고른 것에 거리 쳐 넣기 ──

  /** 그물 id의 지금 분해 이동(밀대·손질) */
  const shift = (id: string, d = doc) => explodeMoves(planOf(d), d.explode, EXPLODE_SCALE, d.tweaks?.resolve(planOf(d), axis, undefined)).get(id) ?? [0, 0, 0];

  it('끌지 않고 고른 것 옮기기(45차): 고른 것이 있으면 Enter로 빈 거리 칸을 열고, X로만이면 수 하나로 +X(음수는 반대쪽) — 새 되돌리기 한 단계, 다시 쳐 넣으면 같은 단계', () => {
    const f = fakeField();
    tool.bind(f.field);
    axis = 'x';
    // 고른 것이 없으면 Enter는 그대로(칸을 열지 않는다)
    expect(tool.key('Enter', canvas)).toBe(false);
    expect(tool.state(doc, 'x').dist).toBeUndefined();
    doc.selKey = '0/1';
    const b0 = shift('b');
    const a0 = shift('a');
    expect(tool.key('Enter', canvas)).toBe(true);
    expect(f.focused).toBe(1);
    expect(f.shown.at(-1)).toEqual({ value: '', unit: 'mm', axis: 'x', live: false, fresh: true });
    expect(tool.typed('12')).toBe(true);
    // 누른 점 대신 고른 것이 보이게 +X로 12(한꺼번에 50% — 손질은 그 두 배), a는 그대로
    expect(add(shift('b'), b0.map((v) => -v))).toEqual([expect.closeTo(12, 9), 0, 0]);
    expect(shift('a')).toEqual(a0);
    expect(doc.tweaks!.moves('x').get('0/1')).toEqual([expect.closeTo(24, 9)]);
    expect(f.shown.at(-1)).toEqual({ value: '12', unit: 'mm', axis: 'x', live: false });
    // 다시 쳐 넣으면 같은 단계를 고친다(음수는 반대쪽 — 끈 쪽이 없으니 +X 기준)
    expect(tool.typed('-3')).toBe(true);
    expect(add(shift('b'), b0.map((v) => -v))[0]).toBeCloseTo(-3, 9);
    expect(tool.undo()).toBe(true);
    expect(shift('b')).toEqual(b0);
    expect(doc.tweaks!.canUndo('x')).toBe(false);
    // 되돌린 뒤 칸은 닫히고(고칠 것이 없다), Enter로 다시 열면 지금 자리에서 새로
    expect(tool.state(doc, 'x').dist).toBeUndefined();
    expect(tool.key('Enter', canvas)).toBe(true);
    expect(tool.typed('0')).toBe(true);
    expect(doc.tweaks!.canUndo('x')).toBe(false);
    expect(tool.state(doc, 'x').dist).toMatchObject({ fresh: true });
    // 여러 개 고르기: 고른 단위마다 같은 거리
    doc.selKey = null;
    doc.items = { ids: ['a', 'b'], label: '' } as StepDoc['items'];
    expect(tool.state(doc, 'x').dist).toBeUndefined();
    expect(tool.key('Enter', canvas)).toBe(true);
    expect(tool.typed('2')).toBe(true);
    expect(add(shift('a'), a0.map((v) => -v))[0]).toBeCloseTo(2, 9);
    expect(add(shift('b'), b0.map((v) => -v))[0]).toBeCloseTo(2, 9);
    expect(doc.tweaks!.canUndo('x')).toBe(true);
    expect(tool.undo()).toBe(true);
    expect(doc.tweaks!.count('x')).toBe(0);
  });

  it('사방·화면 평면은 성분으로 쳐 넣고(수 하나는 방향이 없다고 알린다), 고른 것이 바뀌면 고른 것 옮기기 칸과 막 끈 끌기 고치기가 끝난다', () => {
    const f = fakeField();
    tool.bind(f.field);
    doc.selKey = '0/1';
    const b0 = shift('b');
    expect(tool.enterDistance()).toBe(true);
    expect(tool.typed('5')).toBe(false);
    expect(toasts.at(-1)).toEqual({ m: '아직 끈 방향이 없어 거리 하나로는 옮기지 못합니다 — 성분으로 쳐 넣으십시오.', kind: 'warn' });
    expect(tool.typed('1; 2; 3')).toBe(true);
    add(shift('b'), b0.map((v) => -v)).forEach((v, i) => expect(v).toBeCloseTo([1, 2, 3][i]!, 9));
    // 그 뒤 수 하나는 그 방향으로(막 끈 끌기처럼)
    expect(tool.typed('7')).toBe(true);
    expect(len(add(shift('b'), b0.map((v) => -v)))).toBeCloseTo(7, 9);
    // 다른 것을 고르면 끝난다(칸을 닫고, 쳐 넣어도 아무것도 하지 않는다)
    doc.selKey = '0/0';
    expect(tool.state(doc, 'free').dist).toBeUndefined();
    const n = toasts.length;
    expect(tool.typed('4')).toBe(false);
    expect(toasts.length).toBe(n);
    // 열어 둔 칸도 고른 것이 바뀌면 닫힌다
    expect(tool.key('Enter', canvas)).toBe(true);
    expect(tool.state(doc, 'free').dist).toMatchObject({ fresh: true });
    doc.selKey = '0/1';
    expect(tool.state(doc, 'free').dist).toBeUndefined();
    // 막 끈 끌기도: 끈 것(b — 끌면 고른다) 밖을 고르면 끝난다
    dragB(30.3, 10.1);
    expect(tool.state(doc, 'free').dist).toMatchObject({ live: false });
    doc.selKey = '0/0';
    expect(tool.state(doc, 'free').dist).toBeUndefined();
    // 화면 평면: 가로; 세로
    axis = 'sp';
    doc.selKey = '0/1';
    const s0 = shift('b');
    expect(tool.key('Enter', canvas)).toBe(true);
    expect(tool.typed('3; -4')).toBe(true);
    const bb = basisFromAngles(0, 0);
    add(shift('b'), s0.map((v) => -v)).forEach((v, i) => expect(v).toBeCloseTo(3 * bb.right[i]! - 4 * bb.up[i]!, 9));
  });

  it('작업 메뉴(손가락 기기는 길게 누르기): 고른 것을 옮길 수 있으면 맨 위에 "거리로 옮기기…"(Enter) — 고르면 빈 칸을 열고 들어간다, 되돌릴 것이 있으면 끝에 되돌리기·다시 하기', () => {
    const f = fakeField();
    tool.bind(f.field);
    const lab = (i: { label: string; hint?: string; sep?: boolean; disabled?: boolean }) => [i.label, i.hint ?? '', !!i.sep, !!i.disabled];
    const labels = () => [...(tool.moveItem(doc) ? [lab(tool.moveItem(doc)!)] : []), ...tool.menuItems(doc, axis).map(lab)];
    expect(labels()).toEqual([]);
    doc.selKey = '0/1';
    expect(labels()).toEqual([['거리로 옮기기…', 'Enter', false, false]]);
    // 측정 중(손질할 때가 아님)에는 없다
    measuring = true;
    expect(labels()).toEqual([]);
    measuring = false;
    tool.moveItem(doc)!.run();
    expect(f.focused).toBe(1);
    expect(f.shown.at(-1)).toMatchObject({ value: '', fresh: true, axis: 'free' });
    expect(tool.typed('0; 0; 6')).toBe(true);
    expect(labels()).toEqual([
      ['거리로 옮기기…', 'Enter', false, false],
      ['손질 되돌리기', 'Ctrl+Z', true, false],
      ['손질 다시 하기', 'Ctrl+Shift+Z', false, true],
    ]);
    tool.undo();
    // 고른 것이 없어도 다시 할 손질이 있으면 그 항목만
    doc.selKey = null;
    expect(labels()).toEqual([
      ['손질 되돌리기', 'Ctrl+Z', true, true],
      ['손질 다시 하기', 'Ctrl+Shift+Z', false, false],
    ]);
  });

  it('막대와 함께(실제 ExplodeControls): 고른 것 옮기기 칸은 빈 칸 — 사방·화면 평면은 글 자판, 축 하나는 숫자 자판. 끌기를 시작하면 닫히고 끄는 동안 막대 줄은 그대로', () => {
    const c = new ExplodeControls(
      () => {},
      () => {},
      tool,
    );
    document.body.append(...c.els);
    const input = c.els[3]!.querySelector<HTMLInputElement>('.explode-num')!;
    const label = input.closest('label')!;
    doc.selKey = '0/1';
    expect(label.hidden).toBe(true);
    expect(tool.key('Enter', canvas)).toBe(true);
    expect([label.hidden, input.value, input.getAttribute('inputmode'), document.activeElement === input]).toEqual([false, '', 'text', true]);
    input.blur();
    axis = 'x';
    c.sync(doc, 'all', true, 'x', null, tool.state(doc, 'x'));
    // 방향을 바꾸면 연 칸은 닫힌다 — 다시 열면 축 하나라 숫자 자판
    expect(label.hidden).toBe(true);
    expect(tool.key('Enter', canvas)).toBe(true);
    expect(input.getAttribute('inputmode')).toBe('decimal');
    const b0 = shift('b');
    input.value = '9';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(add(shift('b'), b0.map((v) => -v))[0]).toBeCloseTo(9, 9);
    expect([label.hidden, input.value, input.getAttribute('inputmode')]).toEqual([false, '9', 'decimal']);
    // 끌기를 시작하면 칸을 닫고(끄는 동안 쳐 넣기 전에는 숨긴 채), 떼면 그 끌기 거리
    const p0 = dragB(-40.2, 6.6, false);
    expect(label.hidden).toBe(true);
    fire('pointermove', projectToScreen(frame, p0)![0] - 50, projectToScreen(frame, p0)![1] + 6.6);
    expect(label.hidden).toBe(true);
    fire('pointerup', projectToScreen(frame, p0)![0] - 50, projectToScreen(frame, p0)![1] + 6.6);
    expect(label.hidden).toBe(false);
    expect(input.value).toBe(plainLength(Math.abs(moved(p0)[0]!), { factor: 1, decimals: 3 }));
  });
});
