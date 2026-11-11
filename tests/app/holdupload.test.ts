/**
 * 69차(코어 0.56.0): 앱이 setScene 앞에서 묶어 그리기 조각을 기다리지 않아도 한 번에 올리는 큰 장면의 GL 객체가 쌓이지 않고, 조각을 받는 동안 상태 표시(holdUpload)가
 * 켜졌다 조각이 와서 다 구우면 꺼지는지 실제 코어(가짜 DOM·WebGL2)로 본다. 받기 모양은 모듈을 새로 받아 바꾼다(코어 조각 받기 상태는 모듈마다 하나).
 * 조각이 오는 때를 시험이 정한다(gate) — 시간을 재지 않는다.
 */
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Viewer3d as ViewerT } from 'opencad-viewer3d';
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
    upload.holdUpload(v, (done, total) => shows.push(done < total), Viewer3d, 1);
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
    upload.holdUpload(v, (done, total) => shows.push(done < total), Viewer3d, 1);
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
});
