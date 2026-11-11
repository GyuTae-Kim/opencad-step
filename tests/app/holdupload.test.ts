/**
 * 69차(코어 0.56.0): 앱이 setScene 앞에서 묶어 그리기 조각을 기다리지 않아도 한 번에 올리는 큰 장면의 GL 객체가 쌓이지 않고, 조각을 받는 동안 상태 표시(holdUpload)가
 * 켜졌다 조각이 와서 다 구우면 꺼지는지 실제 코어(가짜 DOM·WebGL2)로 본다. 받기 모양은 모듈을 새로 받아 바꾼다(코어 조각 받기 상태는 모듈마다 하나).
 * 조각이 오는 때를 시험이 정한다(gate) — 시간을 재지 않는다.
 */
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Viewer3d as ViewerT } from 'opencad-viewer3d';
import { MERGE_FIRST_MESHES } from 'opencad-viewer3d/mergeopts';
import type { Mesh3d, Scene3d } from 'opencad-viewer3d/types';
import { installDom } from './fakeview';

const MERGEGL = join(process.cwd(), 'node_modules/opencad-viewer3d/src/mergegl.ts');

/** 서로 다른 상자 그물 — 묶을 수 있는 불투명 그물 n개(문턱 2,000 이상) */
function boxes(n: number): Scene3d {
  const meshes: Mesh3d[] = [];
  const box = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3];
  for (let i = 0; i < n; i++) {
    const k = 1 + (i % 7) * 0.1;
    meshes.push({ id: `b${i}`, positions: Float32Array.from(box.map((x, j) => x * k + (j % 3 === 0 ? (i % 60) * 3 : j % 3 === 1 ? Math.floor(i / 60) * 3 : 0))), indices: Uint32Array.from(idx), color: [0.5, 0.6, 0.7, 1] });
  }
  return { name: 'b', units: 'mm', meshes, lines: [] };
}

let dom: ReturnType<typeof installDom>;
const views: ViewerT[] = [];
beforeAll(() => {
  dom = installDom();
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  vi.doUnmock(MERGEGL);
});
afterAll(() => dom.restore());

type Up = typeof import('../../src/app/upload');
async function fresh(how: 'gate' | 'fail'): Promise<{ Viewer3d: typeof ViewerT; upload: Up; open: () => void }> {
  vi.resetModules();
  let opened = false;
  let release = (): void => undefined;
  vi.doMock(MERGEGL, async () => {
    if (how === 'fail') throw new Error('조각을 받지 못함(시험)');
    if (!opened) await new Promise<void>((res) => (release = res));
    return vi.importActual(MERGEGL);
  });
  const { Viewer3d } = await import('opencad-viewer3d');
  return {
    Viewer3d,
    upload: await import('../../src/app/upload'),
    open: () => {
      opened = true;
      release();
    },
  };
}

/** 렌더러에 올린 그물 기록 수(그물마다 GL 버퍼·VAO가 든다) */
const uploaded = (v: ViewerT): number => (v as unknown as { renderer: { meshes: unknown[] } }).renderer.meshes.length;

describe('코어가 미룬 한 번에 올리기(69차 — 앱은 setScene 앞에서 기다리지 않는다)', () => {
  it('조각이 오기 전: 그물 기록이 없고 상태 표시가 켜진다, 맞추기는 그대로 — 조각이 오면 묶음으로 올려 꺼진다', async () => {
    const { Viewer3d, upload, open } = await fresh('gate');
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    const shows: boolean[] = [];
    v.setScene(boxes(2100));
    expect(Viewer3d.mergingState()).toBe('loading');
    upload.holdUpload(v, (done, total) => shows.push(done < total), Viewer3d);
    expect(shows).toEqual([true]);
    // 미루는 동안: 올린 그물 없음(그물마다 GL 객체가 쌓이지 않는다) — 맞추기는 장면 배열로
    expect(uploaded(v)).toBe(0);
    v.fit(false);
    const cam = v.getCamera();
    v.renderNow();
    expect(uploaded(v)).toBe(0);
    expect(v.stats.merged.pending).toBeGreaterThan(0);
    open();
    await vi.waitFor(() => expect(Viewer3d.mergingState()).toBe('ready'), { timeout: 15_000 });
    await vi.waitFor(
      () => {
        v.renderNow();
        expect(shows).toEqual([true, false]);
      },
      { timeout: 15_000 },
    );
    expect(v.stats.merged.pending).toBe(0);
    expect(uploaded(v)).toBe(2100);
    expect(v.stats.merged.groups).toBeGreaterThan(0);
    expect(v.stats.drawCalls).toBeLessThan(100);
    expect(v.getCamera()).toEqual(cam);
  }, 40_000);

  it('받기에 실패하면 그물마다 올리고 상태 표시가 꺼진다', async () => {
    const { Viewer3d, upload } = await fresh('fail');
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    const shows: boolean[] = [];
    v.setScene(boxes(2100));
    upload.holdUpload(v, (done, total) => shows.push(done < total), Viewer3d);
    await vi.waitFor(() => expect(Viewer3d.mergingState()).toBe('failed'), { timeout: 15_000 });
    await vi.waitFor(
      () => {
        v.renderNow();
        expect(shows.at(-1)).toBe(false);
      },
      { timeout: 15_000 },
    );
    expect(v.stats.merged.pending).toBe(0);
    expect(v.stats.drawCalls).toBeGreaterThan(1000);
  }, 40_000);

  it('71차(코어 0.58.0): 기다리는 동안 문맥을 잃으면 상태 표시가 꺼진다(남아 있으면 물리 속성 계산이 시작되지 않는다)', async () => {
    const { Viewer3d, upload } = await fresh('gate');
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    const shows: boolean[] = [];
    v.setScene(boxes(2100));
    upload.holdUpload(v, (done, total) => shows.push(done < total), Viewer3d);
    expect(shows).toEqual([true]);
    (v.canvas as unknown as { fire(type: string, e: object): void }).fire('webglcontextlost', {});
    await vi.waitFor(() => expect(shows).toEqual([true, false]), { timeout: 5_000 });
  }, 40_000);

  it('71차(코어 0.58.0): 기다리는 동안 뷰어를 없애면 상태 표시를 더 건드리지 않는다', async () => {
    const { Viewer3d, upload } = await fresh('gate');
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    const shows: boolean[] = [];
    v.setScene(boxes(2100));
    upload.holdUpload(v, (done, total) => shows.push(done < total), Viewer3d);
    expect(shows).toEqual([true]);
    v.dispose();
    await expect(v.whenMerged()).resolves.toBe('disposed');
    await new Promise((res) => setTimeout(res, 0));
    expect(shows).toEqual([true]);
  }, 40_000);
});

describe('조각을 받는 동안의 나눠 올리기(74차 — 코어 0.60.0, 앱은 뷰어 조각이 들어올 때 미리 받는다)', () => {
  /** 나눠 올리기(앱 선택)로 장면을 주고, 진행 알림의 올린 수를 모은다 */
  const put = (v: ViewerT, upload: Up, n: number): number[] => {
    const done: number[] = [];
    v.setScene(boxes(n), { incremental: upload.uploadOptions(), onProgress: (d) => void done.push(d) });
    return done;
  };
  /** 다 올리고 다 구울 때까지 그린다(조각 변환·굽기에 시간이 들어 시간으로 기다린다) */
  const finish = async (v: ViewerT, done: number[], n: number): Promise<void> => {
    await vi.waitFor(
      () => {
        v.renderNow();
        expect(done.at(-1)).toBe(n);
        expect(v.stats.merged.pending).toBe(0);
      },
      { timeout: 15_000, interval: 1 },
    );
  };

  it('받지 않았으면 첫 걸음 그물(MERGE_FIRST_MESHES)에서 그리기 목록이 늘지 않고, 미리 받았으면 첫 그림부터 그보다 많이 그린다 — 끝값은 같다', async () => {
    const n = 4000;
    // 받기 전: 첫 그림 뒤 훑기가 문턱만큼 세면 코어가 받기를 걸고, 조각이 오지 않는 동안 뒤 그물은 GL 객체 없이 들고 기다린다
    const a = await fresh('gate');
    const v = new a.Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    const done = put(v, a.upload, n);
    await vi.waitFor(
      () => {
        v.renderNow();
        expect(a.Viewer3d.mergingState()).toBe('loading');
      },
      { timeout: 15_000, interval: 1 },
    );
    for (let i = 0; i < 20; i++) v.renderNow();
    const held = uploaded(v);
    expect(held).toBeGreaterThanOrEqual(MERGE_FIRST_MESHES);
    expect(held).toBeLessThan(2 * MERGE_FIRST_MESHES);
    for (let i = 0; i < 50; i++) v.renderNow();
    expect(uploaded(v)).toBe(held);
    expect(a.Viewer3d.mergingState()).toBe('loading');
    // 상태 표시줄의 진행은 그리기 목록보다 앞서 나아간 채 멈춘다(들고 있는 그물까지 센다)
    expect(Math.max(...done)).toBeGreaterThan(held);
    expect(Math.max(...done)).toBeLessThan(n);
    a.open();
    await finish(v, done, n);
    expect(uploaded(v)).toBe(n);
    const fin = [v.stats.merged.groups, v.stats.merged.meshes, v.stats.drawCalls];
    expect(fin[0]).toBeGreaterThan(0);

    // 미리 받음(앱 warmMerging — 뷰어 조각이 들어올 때): setScene 때 조각이 있으면 첫 걸음부터 굽는다
    const b = await fresh('gate');
    b.open();
    b.upload.warmMerging(b.Viewer3d);
    await vi.waitFor(() => expect(b.Viewer3d.mergingState()).toBe('ready'), { timeout: 15_000 });
    const w = new b.Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(w);
    const done2 = put(w, b.upload, n);
    await vi.waitFor(
      () => {
        w.renderNow();
        expect(uploaded(w)).toBeGreaterThan(0);
      },
      { timeout: 15_000, interval: 1 },
    );
    expect(uploaded(w)).toBeGreaterThan(MERGE_FIRST_MESHES);
    await finish(w, done2, n);
    expect(uploaded(w)).toBe(n);
    expect([w.stats.merged.groups, w.stats.merged.meshes, w.stats.drawCalls]).toEqual(fin);
  }, 60_000);
});

describe('끼어든 그물이 있는 나눠 올리기의 진행 표시(71차 — 코어 0.58.0은 앞선 묶일 그물을 구울 때까지 끼어든 그물이 안 보인다)', () => {
  /** 불투명 상자 사이에 every개마다 반투명 그물이 낀 장면 */
  function mixed(n: number, every: number): Scene3d {
    const s = boxes(n);
    s.meshes = s.meshes.map((m, i) => (i % every === every - 1 ? { ...m, color: [0.5, 0.6, 0.7, 0.4] } : m));
    return s;
  }

  it('진행은 줄지 않고 전체로 끝나며, 끝을 알린 뒤에는 모든 그물이 올라가 있고 진행이 끝을 넘지 않는다', async () => {
    const { Viewer3d, upload, open } = await fresh('gate');
    open();
    await Viewer3d.preloadMerging();
    expect(Viewer3d.mergingState()).toBe('ready');
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    const n = 6000;
    const seen: [number, number][] = [];
    let atEnd = -1;
    v.setScene(mixed(n, 500), {
      incremental: upload.uploadOptions(),
      onProgress: (d, t) => {
        seen.push([d, t]);
        if (d === t) atEnd = uploaded(v);
      },
    });
    const end = v.whenMerged();
    for (let i = 0; i < 2000 && !(seen.length && seen.at(-1)![0] === seen.at(-1)![1]); i++) v.renderNow();
    expect(seen.at(-1)).toEqual([n, n]);
    // 끝을 알릴 때(상태 표시줄의 "화면에 올리는 중"이 사라질 때) 끼어든 그물까지 모두 렌더러에 있다 — 들고 있던 기록이 남아 안 보이는 일이 없다
    expect(atEnd).toBe(n);
    for (let i = 1; i < seen.length; i++) expect(seen[i]![0]).toBeGreaterThanOrEqual(seen[i - 1]![0]);
    expect(seen.every(([d, t]) => t === n && d <= t)).toBe(true);
    for (let i = 0; i < 2000 && v.stats.merged.pending > 0; i++) v.renderNow();
    v.renderNow();
    await expect(end).resolves.toBe('done');
    expect(uploaded(v)).toBe(n);
    expect(v.stats.merged.pending).toBe(0);
  }, 40_000);
});
