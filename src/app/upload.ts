/**
 * 큰 장면을 GPU에 나눠 올리기(58차 — 순수, DOM 없음. 뷰어 조각 viewerkit.ts에 든다 — 문서를 뷰어에 올릴 때만 쓴다).
 *
 * 삼각형이 BIG_TRIANGLES개 또는 그물이 BIG_MESHES개를 넘는 장면은 코어 나눠 올리기(setScene incremental)로 프레임마다 몫(budgetMs)만큼 올린다.
 * 코어는 프레임마다 그때까지 올린 그물을 모두 다시 그리고, 그물마다 그리기를 부른다(같은 부품 자리도 하나씩). 그래서 한 프레임 그리기는 올린 그물 수에
 * 비례하고, 몫이 고정이면 프레임 수도 그물 수에 비례해 합이 그물 수의 제곱으로 는다.
 * 58차 측정(같은 부품 8만 자리, M1 Pro Metal): 그물 하나 올리기 약 4~5 µs·그리기 약 3 µs — 8 ms 몫이면 프레임 40~50번을 다시 그려 다 올리기 5~6초.
 * 그물 1,000개마다 1 ms 몫이면 프레임 대여섯 번이다(한 프레임 가장 긴 작업은 몫 + 한 번 그리기로 거의 그대로). 몫은 8 ms(예전 값 — 그물이 적고
 * 삼각형만 많은 장면) ~ 100 ms.
 */

/** 이보다 삼각형·그물이 많으면 GPU에 나눠 올린다 */
export const BIG_TRIANGLES = 400_000;
export const BIG_MESHES = 3000;
/** 나눠 올리기 몫의 아래·위 한도(ms) */
export const UPLOAD_BUDGET_MIN = 8;
export const UPLOAD_BUDGET_MAX = 100;

/** 그물 수에 맞춘 나눠 올리기 몫(ms): 그물 1,000개마다 1 ms, 8~100 ms */
export function uploadBudgetMs(meshes: number): number {
  return Math.min(UPLOAD_BUDGET_MAX, Math.max(UPLOAD_BUDGET_MIN, Math.round(meshes / 1000)));
}

/** 장면 삼각형 수와 나눠 올리기 몫(작은 장면은 null — 한 번에 올린다) */
export function sceneUpload(meshes: readonly { positions: ArrayLike<number>; indices?: ArrayLike<number> | null }[]): { triangles: number; budgetMs: number | null } {
  let triangles = 0;
  for (const m of meshes) triangles += (m.indices ? m.indices.length : m.positions.length / 3) / 3;
  return { triangles, budgetMs: triangles > BIG_TRIANGLES || meshes.length > BIG_MESHES ? uploadBudgetMs(meshes.length) : null };
}
