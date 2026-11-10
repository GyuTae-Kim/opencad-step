// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Mesh3d, Viewer3d } from 'opencad-viewer3d';
import {
  BIG_MESHES,
  BIG_TRIANGLES,
  MERGE_PRELOAD_WAIT_MS,
  preloadMergingFor,
  sceneUpload,
  stepBudgetMs,
  UPLOAD_BUDGET_MAX,
  UPLOAD_BUDGET_MIN,
  UPLOAD_FIRST_STEPS,
  UPLOAD_REDRAW_MS,
  uploadBudgetMs,
  uploadOptions,
} from '../../src/app/upload';
import { jsdomViewer } from './jsdomview';

/**
 * 코어 나눠 올리기 흉내: 프레임마다 몫(ms)만큼 그물을 올리고(그물 하나 upUs µs) 그때까지 올린 그물을 모두 그린다(그물 하나 drawUs µs).
 * 다 올릴 때까지 프레임 수와 걸린 시간(ms)
 */
function simulate(meshes: number, budgetMs: number, upUs = 5, drawUs = 3): { frames: number; ms: number; longest: number } {
  let done = 0;
  let frames = 0;
  let ms = 0;
  let longest = 0;
  while (done < meshes) {
    const n = Math.max(1, Math.floor((budgetMs * 1000) / upUs));
    done = Math.min(meshes, done + n);
    const frame = (Math.min(n, meshes) * upUs + done * drawUs) / 1000;
    ms += frame;
    longest = Math.max(longest, frame);
    frames++;
  }
  return { frames, ms, longest };
}

describe('나눠 올리기 몫(58차)', () => {
  it('그물 1,000개마다 1 ms, 8~100 ms', () => {
    expect(uploadBudgetMs(0)).toBe(UPLOAD_BUDGET_MIN);
    expect(uploadBudgetMs(3001)).toBe(8);
    expect(uploadBudgetMs(10_000)).toBe(10);
    expect(uploadBudgetMs(80_000)).toBe(80);
    expect(uploadBudgetMs(250_000)).toBe(UPLOAD_BUDGET_MAX);
  });

  it('작은 장면은 한 번에, 삼각형·그물이 많은 장면만 나눠 올린다(삼각형 수는 색인·위치로)', () => {
    const tri = { positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2, 0, 2, 1]) };
    const soup = { positions: new Float32Array(18) };
    expect(sceneUpload([tri, soup])).toEqual({ triangles: 4, budgetMs: null });
    expect(sceneUpload(Array(BIG_MESHES).fill(tri)).budgetMs).toBeNull();
    expect(sceneUpload(Array(BIG_MESHES + 1).fill(tri)).budgetMs).toBe(8);
    expect(sceneUpload(Array(80_000).fill(soup))).toEqual({ triangles: 160_000, budgetMs: 80 });
    const huge = { positions: new Float32Array(9), indices: new Uint32Array(3 * (BIG_TRIANGLES + 1)) };
    expect(sceneUpload([huge])).toEqual({ triangles: BIG_TRIANGLES + 1, budgetMs: 8 });
  });

  it('같은 부품 8만 자리: 고정 8 ms면 다시 그리기가 그물 수의 제곱으로 늘고, 맞춘 몫이면 프레임 몇 번에 끝난다', () => {
    const old = simulate(80_000, 8);
    const now = simulate(80_000, uploadBudgetMs(80_000));
    expect(old.frames).toBe(50);
    expect(old.ms).toBeGreaterThan(5000);
    expect(now.frames).toBe(5);
    expect(now.ms).toBeLessThan(1200);
    // 한 프레임 가장 긴 작업은 몫 + 장면 한 번 그리기를 넘지 않는다
    expect(now.longest).toBeLessThanOrEqual(80 + (80_000 * 3) / 1000 + 1e-9);
    // 그물이 적은 장면은 예전 몫 그대로
    expect(simulate(3500, uploadBudgetMs(3500))).toEqual(simulate(3500, 8));
  });
});

/**
 * 59차 걸음 사이 시간으로 본 코어 나눠 올리기 흉내: 프레임 하나 = 새로 올린 그물마다 (올리기 upUs + 처음 그리기 newUs) + 올려 둔 그물마다 다시 그리기 oldUs
 * + 프레임마다 ovMs. pace(k, 올린 수, 전체)가 걸음 k의 몫(ms)
 */
function frames(meshes: number, pace: (k: number, done: number) => number, upUs = 5, newUs = 7, oldUs = 3.1, ovMs = 10) {
  let done = 0;
  const out: number[] = [];
  const budgets: number[] = [];
  while (done < meshes) {
    const b = pace(out.length, done);
    budgets.push(b);
    const n = Math.min(meshes - done, Math.max(1, Math.floor((b * 1000) / upUs)));
    out.push((n * (upUs + newUs) + done * oldUs) / 1000 + ovMs);
    done += n;
  }
  return { frames: out.length, ms: out.reduce((s, x) => s + x, 0), longest: Math.max(...out), firstTwo: out[0]! + out[1]!, budgets };
}

describe('걸음마다 몫(59차)', () => {
  it('앞 두 걸음은 8 ms, 그다음은 그물 수에 맞춘 몫(58차)', () => {
    expect([0, 1, 2, 3, 9].map((k) => stepBudgetMs(k, 80_000))).toEqual([8, 8, 80, 80, 80]);
    expect([0, 1, 2].map((k) => stepBudgetMs(k, 250_000))).toEqual([8, 8, UPLOAD_BUDGET_MAX]);
    expect([0, 2].map((k) => stepBudgetMs(k, 3500))).toEqual([UPLOAD_BUDGET_MIN, UPLOAD_BUDGET_MIN]);
    expect(UPLOAD_FIRST_STEPS).toBe(2);
  });

  it('8만 자리 흉내: 첫 두 프레임은 57차와 같고(58차보다 0.3초 넘게 짧음), 다 올리기는 58차와 거의 같으며 57차보다 세 배 넘게 빠르다', () => {
    const step = frames(80_000, (k) => stepBudgetMs(k, 80_000));
    const old = frames(80_000, () => 8);
    const fixed = frames(80_000, () => uploadBudgetMs(80_000));
    expect(step.firstTwo).toBeCloseTo(old.firstTwo, 6);
    expect(fixed.firstTwo - step.firstTwo).toBeGreaterThan(300);
    expect(step.ms - fixed.ms).toBeLessThan(150);
    expect(step.ms).toBeLessThan(old.ms / 3);
    // 가장 긴 프레임은 마지막 프레임(남은 것 올리기 + 장면 전체 그리기)이라 58차 몫과 같은 범위
    expect(Math.abs(step.longest - fixed.longest)).toBeLessThan(80);
  });
});

describe('걸음마다 몫·다시 그리기 간격을 코어 공개 선택으로(61차 — 코어 0.51.0 incremental.budgetMs 함수·redrawMs)', () => {
  it('선택은 몫 함수 stepBudgetMs 그대로와 간격 250 ms', () => {
    const o = uploadOptions();
    expect(o.budgetMs).toBe(stepBudgetMs);
    expect(o.redrawMs).toBe(UPLOAD_REDRAW_MS);
    expect(UPLOAD_REDRAW_MS).toBe(250);
    // 코어 setScene 선택 타입에 그대로 들어간다(코어가 이름을 바꾸면 typecheck가 깨진다)
    const inc: Exclude<NonNullable<Parameters<Viewer3d['setScene']>[1]>['incremental'], boolean | undefined> = o;
    expect(inc).toBe(o);
  });

  it('실제 코어(가짜 WebGL): 장면 그물 수와 0부터 센 걸음으로 몫 함수를 부르고, 다 올리면 끝 알림이 온다', () => {
    const { viewer, restore } = jsdomViewer();
    try {
      const n = BIG_MESHES + 1;
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const meshes: Mesh3d[] = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, positions, indices: new Uint32Array([0, 1, 2]), color: [0.6, 0.6, 0.6, 1] }));
      const calls: [number, number][] = [];
      const o = uploadOptions();
      const progress: [number, number][] = [];
      viewer.setScene(
        { name: 'big', units: 'mm', meshes, lines: [], bounds: { min: [0, 0, 0], max: [1, 1, 0] } },
        { incremental: { ...o, budgetMs: (s, m) => (calls.push([s, m]), o.budgetMs(s, m)) }, onProgress: (d, t) => progress.push([d, t]) },
      );
      for (let k = 0; k < 400 && !(progress.length && progress[progress.length - 1]![0] === progress[progress.length - 1]![1]); k++) viewer.renderNow();
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.map(([s]) => s)).toEqual(calls.map((_, i) => i));
      expect(calls.every(([, m]) => m === n)).toBe(true);
      expect(progress[progress.length - 1]).toEqual([n, n]);
    } finally {
      restore();
    }
  });

  it('앱은 코어 비공개 나눠 올리기 상태(upload.budget)를 더 고치지 않는다', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/incremental: this\.ent!\.uploadOptions\(\)/);
    expect(app).not.toMatch(/setUploadBudget|\.upload\.budget/);
  });
});

describe('한 번에 올리는 큰 장면은 묶어 그리기 조각을 먼저(66차 — 코어 0.54.0 preloadMerging)', () => {
  const tri = new Float32Array(9);
  const meshes = (n: number, positions: Float32Array = tri) => Array.from({ length: n }, () => ({ positions }));
  /** 코어 흉내: 부른 수와 돌려줄 약속 */
  const fakeKit = (p: () => Promise<boolean>) => {
    const kit = { MERGE_AUTO_MIN: 2000, calls: 0, Viewer3d: { preloadMerging: () => (kit.calls++, p()) } };
    return kit;
  };

  it('문턱(2,000) 이상이고 나눠 올리지 않는 장면만 받는다 — 문턱 아래·나눠 올리는 장면(그물 3,000개 넘게·삼각형 40만 개 넘게)은 부르지 않는다', async () => {
    for (const [n, positions, want] of [
      [1999, tri, 0],
      [2000, tri, 1],
      [BIG_MESHES, tri, 1],
      [BIG_MESHES + 1, tri, 0],
      // 삼각형 40만 개 넘게(그물 2,000개 × 201개)면 나눠 올린다
      [2000, new Float32Array(9 * 201), 0],
    ] as const) {
      const kit = fakeKit(() => Promise.resolve(true));
      await preloadMergingFor(meshes(n, positions), kit);
      expect(kit.calls, `${n}`).toBe(want);
    }
    expect(BIG_TRIANGLES).toBeLessThan(2000 * 201);
  });

  it('받기가 끝나지 않으면 시간 상한에서, 받지 못하면(거절·false) 곧 끝난다 — 던지지 않는다', async () => {
    expect(MERGE_PRELOAD_WAIT_MS).toBe(1500);
    const hang = fakeKit(() => new Promise<boolean>(() => {}));
    const t0 = performance.now();
    await preloadMergingFor(meshes(2500), hang, 30);
    expect(performance.now() - t0).toBeGreaterThanOrEqual(25);
    expect(hang.calls).toBe(1);
    await expect(preloadMergingFor(meshes(2500), fakeKit(() => Promise.reject(new Error('오프라인'))), 10_000)).resolves.toBeUndefined();
    await expect(preloadMergingFor(meshes(2500), fakeKit(() => Promise.resolve(false)), 10_000)).resolves.toBeUndefined();
  });

  it('68차(코어 0.55.0): 받기가 코어 기다림 한도를 넘은 페이지(mergingState late)에서는 기다리지 않는다 — 받는 중(loading)이면 예전처럼 기다린다', async () => {
    const withState = (state: string) => {
      const kit = { MERGE_AUTO_MIN: 2000, calls: 0, Viewer3d: { preloadMerging: () => (kit.calls++, new Promise<boolean>(() => {})), mergingState: () => state } };
      return kit;
    };
    const late = withState('late');
    const t0 = performance.now();
    await preloadMergingFor(meshes(2500), late, 10_000);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(late.calls).toBe(0);
    const loading = withState('loading');
    const t1 = performance.now();
    await preloadMergingFor(meshes(2500), loading, 30);
    expect(performance.now() - t1).toBeGreaterThanOrEqual(25);
    expect(loading.calls).toBe(1);
    // 실제 코어 상태 이름(0.55.0 MergeKitState)에 'late'가 있다
    const core = await import('opencad-viewer3d');
    const states: import('opencad-viewer3d').MergeKitState[] = ['idle', 'loading', 'late', 'ready', 'failed'];
    expect(states).toContain(core.Viewer3d.mergingState());
  });

  it('실제 코어(기본 kit = 코어 입구): 문턱 상수가 같고 받은 뒤 상태가 ready, 앱은 뷰어를 만든 뒤·문서를 만들기 전(setScene 앞)에 기다리고 그 뒤 열기 차례를 본다', async () => {
    const core = await import('opencad-viewer3d');
    expect(core.MERGE_AUTO_MIN).toBe(2000);
    await preloadMergingFor(meshes(2500));
    expect(core.Viewer3d.mergingState()).toBe('ready');
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).toMatch(/await this\.ensureViewer\(\);\n(\s*\/\/[^\n]*\n)*\s*await this\.ent!\.preloadMergingFor\(res\.scene\.meshes\);\n\s*if \(seq !== this\.loadSeq\) return false;\n\s*const doc = createDoc\(name, size, res\);/);
  });
});
