/**
 * STEP 해석 워커: 파일 바이트를 화면 밖에서 해석해 Scene3d로 돌려준다.
 * 진행률(onProgress)은 60ms에 한 번 이하로 알리고, 결과의 형식 배열은 이전 가능한 버퍼로 넘긴다(protocol.ts collectTransfers).
 */
/// <reference lib="webworker" />
import { stepToScene } from '../scene';
import { collectTransfers, errorText, sniffStep, type ParseRequest, type ParseResponse, type ParseResult } from '../app/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: ParseResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

function parse(req: ParseRequest): ParseResult {
  const id = req.id;
  let last = 0;
  const progress = (fraction: number, stage: string): void => {
    const now = performance.now();
    if (fraction < 1 && now - last < 60) return;
    last = now;
    post({ id, type: 'progress', fraction: Math.max(0, Math.min(1, fraction)), stage });
  };
  const t0 = performance.now();
  const bytes = new Uint8Array(req.bytes);
  const sniff = sniffStep(bytes.subarray(0, 64 * 1024));
  if (!sniff.ok) throw new Error(sniff.reason);
  const name = req.name.replace(/^.*[\\/]/, '');
  const scene = stepToScene(bytes, { name, onProgress: (f, stage) => progress(f, stage) });
  return { scene, ms: performance.now() - t0 };
}

ctx.onmessage = (ev: MessageEvent<ParseRequest>) => {
  const req = ev.data;
  if (!req || req.type !== 'parse') return;
  let result: ParseResult;
  try {
    result = parse(req);
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
