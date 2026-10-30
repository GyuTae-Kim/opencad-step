/**
 * 검사 워커: 간섭 검사(src/app/interference.ts)를 화면 밖에서 돌린다. 그물(형상 좌표·자리 변환)을 받아 결과를 돌려준다.
 * 간섭 쌍을 찾으면 먼저 보내고(pairs), 두 그물이 모두 닫힌 입체인 쌍의 겹친 부피를 광선 격자로 어림해 다시 보낸다(done —
 * src/app/overlap.ts, 쌍 차례대로 4초 한도). 진행률은 100ms에 한 번 이하로 알린다(겹친 부피를 구하는 동안은 phase 'volume').
 */
/// <reference lib="webworker" />
import { findInterference, type CheckRequest, type CheckResponse } from '../app/interference';
import { overlapVolumes } from '../app/overlap';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<CheckRequest>) => {
  const req = ev.data;
  if (!req || req.type !== 'interference') return;
  let last = 0;
  const progress = (done: number, total: number, phase?: 'volume') => {
    const now = performance.now();
    if (now - last < 100 && done < total) return;
    last = now;
    ctx.postMessage({ id: req.id, type: 'progress', done, total, ...(phase ? { phase } : {}) } satisfies CheckResponse);
  };
  try {
    const result = findInterference(req.meshes, { onProgress: (done, total) => progress(done, total) });
    // 찾은 쌍을 먼저 보낸다(겹친 부피는 몇 초 걸릴 수 있다 — 화면은 쌍 목록부터 보인다)
    ctx.postMessage({ id: req.id, type: 'pairs', result } satisfies CheckResponse);
    last = 0;
    result.volumes = overlapVolumes(req.meshes, result.pairs, { onProgress: (done, total) => progress(done, total, 'volume') });
    ctx.postMessage({ id: req.id, type: 'done', result } satisfies CheckResponse);
  } catch (e) {
    ctx.postMessage({ id: req.id, type: 'error', message: e instanceof Error ? e.message : String(e) } satisfies CheckResponse);
  }
};
