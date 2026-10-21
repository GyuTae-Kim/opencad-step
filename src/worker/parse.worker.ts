/**
 * STEP 해석 워커: 파일 바이트를 화면 밖에서 해석해 Scene3d로 돌려준다(일은 src/app/job.ts — 압축 STEP 풀기 포함).
 * 진행률(onProgress)은 60ms에 한 번 이하로 알리고, 결과의 형식 배열은 이전 가능한 버퍼로 넘긴다(protocol.ts collectTransfers).
 */
/// <reference lib="webworker" />
import { parseStepFile } from '../app/job';
import { collectTransfers, errorText, type ParseRequest, type ParseResponse, type ParseResult } from '../app/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: ParseResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

function parse(req: ParseRequest): Promise<ParseResult> {
  const id = req.id;
  let last = 0;
  let lastStage = '';
  const progress = (fraction: number, stage: string): void => {
    const now = performance.now();
    // 단계가 바뀌면 바로, 아니면 60ms에 한 번
    if (fraction < 1 && stage === lastStage && now - last < 60) return;
    last = now;
    lastStage = stage;
    post({ id, type: 'progress', fraction: Math.max(0, Math.min(1, fraction)), stage });
  };
  return parseStepFile(req.name, req.bytes, progress, req.options);
}

ctx.onmessage = async (ev: MessageEvent<ParseRequest>) => {
  const req = ev.data;
  if (!req || req.type !== 'parse') return;
  let result: ParseResult;
  try {
    result = await parse(req);
  } catch (e) {
    post({ id: req.id, type: 'error', message: errorText(e) });
    return;
  }
  try {
    post({ id: req.id, type: 'done', result }, collectTransfers(result));
  } catch {
    // 이전이 막히면(드문 경우) 복사로 보낸다
    post({ id: req.id, type: 'done', result });
  }
};
