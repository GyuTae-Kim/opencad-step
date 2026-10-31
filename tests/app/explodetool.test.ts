// @vitest-environment jsdom
// 분해 손질 도구(35차 — 36차부터 jsdom에 실제 코어 Viewer3d로 끌기): 앱이 건네는 것(TweakHost)으로 부품을 끌어 손질 → 끈 점이 커서 아래, 되돌리기·모두 되돌리기,
// 측정 중·빈 곳은 코어가 돌려 봄, 손가락 길게 눌러 잡기·떼면 작업 메뉴, 링크 손질 만들기 → 새 문서에 받기, 최근 문서 항목에 남기기·받기.
// 끌기 셈은 시험이 정한 카메라(cam)로 하고, 포인터는 실제 코어(포인터 맡기 훅)가 받는다 — 코어가 돌았는지는 그 뷰어 카메라로 본다.
// 38차: 다시 하기(링크·최근 문서 저장과 섞어), 손질 파일 내보내기 → 같은·다른 문서에 불러오기·망가진 파일, 끄는 동안 거리 글
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeFrame, projectToScreen, type CameraState } from 'opencad-viewer3d/camera';
import type { Mesh3d, Pick3d, Viewer3d } from 'opencad-viewer3d';
import { touchPointerEvent } from '../../src/app/aim';
import { jsdomViewer } from './jsdomview';
import { Fmt } from '../../src/app/display';
import type { ProductNode, StepDoc } from '../../src/app/doc';
import { EXPLODE_SCALE, explodeMoves, explodePlan, type ExplodeAxis, type ExplodePlan } from '../../src/app/explode';
import { ExplodeTweakTool, storedTweaks, type TweakHost } from '../../src/app/explodetool';
import { dragDistanceLines } from '../../src/app/explodetweak';
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
  const newDoc = (id: number, recentKey?: string, name = 'f.stp', size = 10, tree = products()): StepDoc =>
    ({ id, name, size, scene: { units: 'mm' }, products: tree, vis: { pmiIds: new Set() }, explode: 0.5, selKey: null, items: null, pick: null, body: null, ...(recentKey ? { recentKey } : {}) }) as unknown as StepDoc;
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
    expect(tool.state(doc, 'free')).toEqual({ on: true, count: 0, undo: false, redo: false, any: false });
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
    expect(tool.state(doc, 'free')).toEqual({ on: true, count: 1, undo: true, redo: false, any: true });
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
      v: 1,
      doc: { name: 'f.stp', size: 10, units: 'mm' },
      axis: 'x',
      axes: { free: [['0/1', 'b', ...mine.free]], x: [['0/1', 'b', ...mine.x]] },
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
    expect(await tool.importFile({ text: async () => text } as Blob)).toBe(true);
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
      m: ['다른 문서(이름·크기가 다름)에서 내보낸 손질이라 자리와 부품 이름이 맞는 것만 받았습니다.', '분해 손질을 불러왔습니다(방향 1개 · 손질 1개).'],
      kind: 'warn',
    });
    // 같은 자리에 다른 부품(이름이 다름) — 받지 않는다
    const other = newDoc(9, undefined, 'h.stp', 99, [N('R', [], [N('a', ['a']), N('c', ['b'])])]);
    doc = other;
    toasts = [];
    expect(tool.importText(other, text)).toBe(false);
    expect(other.tweaks?.count('free') ?? 0).toBe(0);
    expect(toasts).toEqual([{ m: '다른 문서에서 내보낸 손질이라 이 문서에 맞는 부품이 없습니다 — 불러오지 않았습니다.', kind: 'warn' }]);
    // 망가진 파일·다른 판
    for (const [bad, msg] of [
      ['{ not json', '손질 파일을 읽지 못했습니다 — 이 앱에서 내보낸 분해 손질 JSON이 아닙니다.'],
      [JSON.stringify({ ...JSON.parse(text), format: 'x' }), '손질 파일을 읽지 못했습니다 — 이 앱에서 내보낸 분해 손질 JSON이 아닙니다.'],
      [JSON.stringify({ ...JSON.parse(text), v: 3 }), '판 3의 손질 파일이라 불러오지 않았습니다 — 이 앱은 판 1을 읽습니다.'],
    ]) {
      toasts = [];
      expect(tool.importText(other, bad!)).toBe(false);
      expect(toasts).toEqual([{ m: msg, kind: 'warn' }]);
    }
    expect(other.tweaks?.canUndo('free') ?? false).toBe(false);
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
});
