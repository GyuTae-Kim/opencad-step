import { describe, expect, it } from 'vitest';
import { BIG_MESHES, BIG_TRIANGLES, sceneUpload, UPLOAD_BUDGET_MAX, UPLOAD_BUDGET_MIN, uploadBudgetMs } from '../../src/app/upload';

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
