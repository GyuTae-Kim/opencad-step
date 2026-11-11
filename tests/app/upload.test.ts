// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mesh3d, Viewer3d } from 'opencad-viewer3d';
import {
  BIG_MESHES,
  BIG_TRIANGLES,
  HOLD_POLL_MS,
  holdUpload,
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

describe('코어가 조각을 기다려 미룬 한 번에 올리기의 상태 표시(69차 — 코어 0.56.0, 66차 setScene 앞 기다림을 뺐다)', () => {
  afterEach(() => void vi.useRealTimers());
  /** 코어 흉내: 상태 이름과 stats.merged.pending */
  const fake = (state: string, pending: number) => ({ kit: { mergingState: () => state }, v: { stats: { merged: { pending } } } });

  it('받는 중이고 pending이면 진행 0을 알리고, 올려 다 구우면(pending 0) 끝을 알린다 — 미루지 않은 장면(받음·늦음·실패·문턱 아래)은 부르지 않는다', () => {
    vi.useFakeTimers();
    const a = fake('loading', 1);
    const seen: number[][] = [];
    holdUpload(a.v, (done, total) => seen.push([done, total]), a.kit);
    expect(seen).toEqual([[0, 1]]);
    vi.advanceTimersByTime(HOLD_POLL_MS * 3);
    expect(seen).toEqual([[0, 1]]);
    a.v.stats.merged.pending = 0;
    vi.advanceTimersByTime(HOLD_POLL_MS);
    expect(seen).toEqual([[0, 1], [1, 1]]);
    vi.advanceTimersByTime(HOLD_POLL_MS * 5);
    expect(seen).toHaveLength(2);
    for (const [state, pending] of [['ready', 1], ['late', 1], ['failed', 1], ['idle', 1], ['loading', 0]] as const) {
      const b = fake(state, pending);
      const none: number[][] = [];
      holdUpload(b.v, (done, total) => none.push([done, total]), b.kit);
      vi.advanceTimersByTime(HOLD_POLL_MS * 2);
      expect(none, state).toEqual([]);
    }
  });

  it('앱: 문서를 만들기 전에 조각을 기다리지 않고, 한 번에 올리는 장면만 나눠 올리기와 같은 진행 알림으로 상태를 건다', () => {
    const app = readFileSync(join(__dirname, '../../src/app/app.ts'), 'utf8');
    expect(app).not.toMatch(/preloadMerging/);
    expect(app).toMatch(/await this\.ensureViewer\(\);\n\s*if \(seq !== this\.loadSeq\) return false;\n\s*const doc = createDoc\(name, size, res\);/);
    expect(app).toMatch(/v\.setScene\(doc\.scene, \{[^\n]*onProgress \} : \{\}\) \}\);\n(\s*\/\/[^\n]*\n)*\s*if \(!budgetMs\) this\.ent!\.holdUpload\(v, onProgress\);/);
    // 나눠 올리는 문턱은 그대로
    expect(BIG_MESHES).toBe(3000);
    expect(BIG_TRIANGLES).toBe(400_000);
  });
});
