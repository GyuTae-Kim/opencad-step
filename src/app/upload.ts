/**
 * 큰 장면을 GPU에 나눠 올리기(58차 — 순수, DOM 없음. 뷰어 조각 viewerkit.ts에 든다 — 문서를 뷰어에 올릴 때만 쓴다).
 *
 * 삼각형이 BIG_TRIANGLES개 또는 그물이 BIG_MESHES개를 넘는 장면은 코어 나눠 올리기(setScene incremental)로 프레임마다 몫(budgetMs)만큼 올린다.
 * 코어는 프레임마다 그때까지 올린 그물을 모두 다시 그리고, 그물마다 그리기를 부른다(같은 부품 자리도 하나씩). 그래서 한 프레임 그리기는 올린 그물 수에
 * 비례하고, 몫이 고정이면 프레임 수도 그물 수에 비례해 합이 그물 수의 제곱으로 는다.
 * 58차 측정(같은 부품 8만 자리, M1 Pro Metal): 그물 하나 올리기 약 4~5 µs·그리기 약 3 µs — 8 ms 몫이면 프레임 40~50번을 다시 그려 다 올리기 5~6초.
 * 그물 1,000개마다 1 ms 몫이면 프레임 대여섯 번이다(한 프레임 가장 긴 작업은 몫 + 한 번 그리기로 거의 그대로). 몫은 8 ms(예전 값 — 그물이 적고
 * 삼각형만 많은 장면) ~ 100 ms.
 *
 * 59차: 58차 몫은 첫 걸음부터 커서 첫 그림이 0.35초 늦었다. 앞 두 걸음만 8 ms로 올리고(첫 그림 — 첫 프레임과 그다음 프레임이 57차와 같다)
 * 그다음부터 그물 수에 맞춘 몫이다(stepBudgetMs). 열 때 가장 긴 작업은 마지막 프레임(남은 것 올리기 + 장면 전체 그리기)이라 몫을 끝으로 갈수록 줄여도
 * 줄지 않았다 — 끝을 작게 나누면 프레임마다 장면 전체를 다시 그려 다 올리기가 늘었다(8만 자리: 두 판을 재 봄 — README 개발 절 "큰 조립의 화면 쪽 한계").
 *
 * 61차(코어 0.51.0): 걸음마다 몫을 코어 공개 선택(setScene incremental.budgetMs 함수 — stepBudgetMs를 그대로)으로 주고, 59차가 고치던 코어 비공개 상태
 * (upload.budget)는 쓰지 않는다. 다시 그리기 간격(incremental.redrawMs — UPLOAD_REDRAW_MS)을 주면 올리기 걸음만으로 생긴 다시 그리기를 그 간격에 한 번만 하고
 * (첫 걸음은 그린다 — 첫 그림), 다 올린 걸음과 장면 전체 그리기를 두 프레임으로 나눈다(가장 긴 작업이 둘의 합이 아니게).
 *
 * 66차(코어 0.54.0): 한 번에 올리는 큰 장면은 묶어 그리기 조각을 먼저 받는다(preloadMergingFor — 코어 입구를 가져오지만 뷰어 조각 안이라 받는 것은 같다).
 */
import { MERGE_AUTO_MIN, Viewer3d } from 'opencad-viewer3d';

/** 이보다 삼각형·그물이 많으면 GPU에 나눠 올린다 */
export const BIG_TRIANGLES = 400_000;
export const BIG_MESHES = 3000;
/** 나눠 올리기 몫의 아래·위 한도(ms) */
export const UPLOAD_BUDGET_MIN = 8;
export const UPLOAD_BUDGET_MAX = 100;
/** 첫 그림을 빨리 보이려고 8 ms로 올리는 앞 걸음 수 */
export const UPLOAD_FIRST_STEPS = 2;

/** 그물 수에 맞춘 나눠 올리기 몫(ms): 그물 1,000개마다 1 ms, 8~100 ms */
export function uploadBudgetMs(meshes: number): number {
  return Math.min(UPLOAD_BUDGET_MAX, Math.max(UPLOAD_BUDGET_MIN, Math.round(meshes / 1000)));
}

/** 걸음 step(0 = 첫 걸음)의 몫(ms): 앞 두 걸음은 8 ms, 그다음은 그물 수에 맞춘 몫 */
export function stepBudgetMs(step: number, meshes: number): number {
  return step < UPLOAD_FIRST_STEPS ? UPLOAD_BUDGET_MIN : uploadBudgetMs(meshes);
}

/** 장면 삼각형 수와 나눠 올리기 몫(작은 장면은 null — 한 번에 올린다) */
export function sceneUpload(meshes: readonly { positions: ArrayLike<number>; indices?: ArrayLike<number> | null }[]): { triangles: number; budgetMs: number | null } {
  let triangles = 0;
  for (const m of meshes) triangles += (m.indices ? m.indices.length : m.positions.length / 3) / 3;
  return { triangles, budgetMs: triangles > BIG_TRIANGLES || meshes.length > BIG_MESHES ? uploadBudgetMs(meshes.length) : null };
}

/** 나눠 올리는 동안 올리기 걸음만으로 생긴 다시 그리기 간격(ms — 코어 0.51.0 incremental.redrawMs): 올라온 부품이 4번/초 보인다 */
export const UPLOAD_REDRAW_MS = 250;

/** 코어 setScene의 나눠 올리기 선택(코어 0.51.0): 걸음마다 몫 함수(stepBudgetMs)와 다시 그리기 간격 */
export function uploadOptions(): { budgetMs: (step: number, meshes: number) => number; redrawMs: number } {
  return { budgetMs: stepBudgetMs, redrawMs: UPLOAD_REDRAW_MS };
}

/** 66차: 묶어 그리기 조각을 기다리는 가장 긴 시간(ms) — 받기가 끝나지 않는 네트워크에서도 열기가 멈추지 않게(넘으면 조각 없이 올리고, 오면 코어가 굽는다) */
export const MERGE_PRELOAD_WAIT_MS = 1500;

/**
 * 66차(코어 0.54.0 — 묶어 그리기 굽기 코드가 나눠 받는 조각으로 옮겼다): 코어가 묶어 그릴 장면(그물이 코어 문턱 MERGE_AUTO_MIN 2,000개 이상 — 'auto')인데
 * 앱이 한 번에 올리는 장면(나눠 올리기 문턱 아래 — sceneUpload의 budgetMs가 null, 그물 3,000개·삼각형 40만 개까지)이면 setScene 앞에 조각을 받는다.
 * 받기 전에 한 번에 올리면 코어는 그물마다 GL 객체를 다 만든 뒤 조각이 오면 굽는다(가짜 WebGL 서로 다른 부품 2,500개: 올리는 동안 GL 버퍼 가장 큰 값 10,007 —
 * 미리 받으면 19, 66차 측정). 나눠 올리는 장면은 코어가 setScene에서 받기를 걸어 첫 걸음들과 겹치고(굽기 단위에서만 걸음을 멈춘다) 문턱 아래 장면은 받지 않으므로 기다리지 않는다.
 * 받았거나·받지 못했거나·waitMs가 지나면 끝난다(던지지 않는다). kit은 코어 입구(시험이 흉내로 바꾼다).
 * 68차(코어 0.55.0): 받기가 코어 기다림 한도(MERGE_KIT_WAIT_MS 4초)를 넘은 페이지(mergingState 'late')에서는 기다리지 않는다 — 코어도 그 페이지에서는
 * 조각을 기다리지 않고 그물마다 올리고(늦게 오면 그때 굽는다), 끝나지 않는 같은 받기를 파일을 열 때마다 waitMs씩 기다리지 않게
 */
export function preloadMergingFor(
  meshes: readonly { positions: ArrayLike<number>; indices?: ArrayLike<number> | null }[],
  kit: { MERGE_AUTO_MIN: number; Viewer3d: { preloadMerging(): Promise<boolean>; mergingState?(): string } } = { MERGE_AUTO_MIN, Viewer3d },
  waitMs = MERGE_PRELOAD_WAIT_MS,
): Promise<void> {
  if (meshes.length < kit.MERGE_AUTO_MIN || sceneUpload(meshes).budgetMs !== null || kit.Viewer3d.mergingState?.() === 'late') return Promise.resolve();
  return new Promise((done) => {
    const t = setTimeout(done, waitMs);
    const end = (): void => {
      clearTimeout(t);
      done();
    };
    kit.Viewer3d.preloadMerging().then(end, end);
  });
}
