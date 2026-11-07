import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BIG_MESHES, BIG_TRIANGLES, sceneUpload, setUploadBudget, stepBudgetMs, UPLOAD_BUDGET_MAX, UPLOAD_BUDGET_MIN, UPLOAD_FIRST_STEPS, uploadBudgetMs } from '../../src/app/upload';

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

describe('나눠 올리는 중 몫 바꾸기', () => {
  it('뷰어의 나눠 올리기 상태(upload.budget)가 있을 때만 바꾼다', () => {
    const v = { upload: { budget: 80, cb: null } };
    expect(setUploadBudget(v, 8)).toBe(true);
    expect(v.upload.budget).toBe(8);
    expect(setUploadBudget({ upload: null }, 8)).toBe(false);
    expect(setUploadBudget({}, 8)).toBe(false);
    expect(setUploadBudget({ upload: { budgetMs: 8 } }, 8)).toBe(false);
  });

  it('코어(opencad-viewer3d)는 프레임마다 upload.budget을 읽는다 — 코어를 올려 이름이 바뀌면 이 시험이 알린다', () => {
    const src = readFileSync(join(__dirname, '../../node_modules/opencad-viewer3d/src/viewer.ts'), 'utf8');
    expect(src).toMatch(/private upload: \{ budget: number;/);
    expect(src).toMatch(/this\.pumpUpload\(this\.renderer\.uploadProgress \? \(this\.upload\?\.budget \?\? 8\)/);
  });
});
