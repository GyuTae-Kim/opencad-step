/**
 * 검사 워커: 간섭 검사(src/app/interference.ts)를 화면 밖에서 돌린다. 그물(형상 좌표·자리 변환)을 받아 결과를 돌려준다.
 * 진행률은 100ms에 한 번 이하로 알린다.
 */
/// <reference lib="webworker" />
import { findInterference, type CheckRequest, type CheckResponse } from '../app/interference';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<CheckRequest>) => {
  const req = ev.data;
  if (!req || req.type !== 'interference') return;
  let last = 0;
  try {
    const result = findInterference(req.meshes, {
      onProgress: (done, total) => {
        const now = performance.now();
        if (now - last < 100 && done < total) return;
        last = now;
        ctx.postMessage({ id: req.id, type: 'progress', done, total } satisfies CheckResponse);
      },
    });
    ctx.postMessage({ id: req.id, type: 'done', result } satisfies CheckResponse);
  } catch (e) {
    ctx.postMessage({ id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) } satisfies CheckResponse);
  }
};
