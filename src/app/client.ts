/**
 * 해석 워커 손님: 파일 바이트를 워커로 넘기고(이전), 진행률을 받아 결과 장면을 돌려받는다.
 * 워커는 처음 쓸 때 만들고 계속 쓴다. 취소하면 워커를 끝내고(terminate) 기다리던 요청을 ParseCancelled로 끝내며,
 * 다음 요청 때 새로 만든다. 워커가 죽으면(메모리 부족 등) 기다리던 요청을 모두 실패로 끝낸다.
 */
import type { ParseOptions, ParseRequest, ParseResponse, ParseResult } from './protocol';

/** 사용자가 취소한 해석 */
export class ParseCancelled extends Error {
  constructor() {
    super('해석을 취소했습니다');
    this.name = 'ParseCancelled';
  }
}

interface Pending {
  resolve: (r: ParseResult) => void;
  reject: (e: Error) => void;
  progress?: (fraction: number, stage: string) => void;
}

export class ParseClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  /** 해석 중인 요청이 있는지 */
  get busy(): boolean {
    return this.pending.size > 0;
  }

  /** 파일 해석(data는 이전되어 비워진다) */
  parse(name: string, data: ArrayBuffer, progress?: (fraction: number, stage: string) => void, options?: ParseOptions): Promise<ParseResult> {
    let w: Worker;
    try {
      w = this.ensure();
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
    const id = ++this.seq;
    return new Promise<ParseResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      const req: ParseRequest = { id, type: 'parse', name, bytes: data, ...(options ? { options } : {}) };
      try {
        w.postMessage(req, [data]);
      } catch (e) {
        this.pending.delete(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  /** 워커를 미리 띄워 둔다(첫 열기 때 모듈 받기·준비 시간을 줄인다) */
  warm(): void {
    try {
      this.ensure();
    } catch {
      /* 워커를 못 만드는 환경: 열 때 다시 알린다 */
    }
  }

  /** 진행 중인 해석을 멈춘다(워커 종료) */
  cancel(): void {
    if (!this.pending.size) return;
    this.worker?.terminate();
    this.worker = null;
    this.fail(new ParseCancelled());
  }

  dispose(): void {
    this.fail(new ParseCancelled());
    this.worker?.terminate();
    this.worker = null;
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('../worker/parse.worker.ts', import.meta.url), { type: 'module', name: 'opencad-step-parse' });
    w.onmessage = (ev: MessageEvent<ParseResponse>) => {
      const m = ev.data;
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') {
        p.progress?.(m.fraction, m.stage);
        return;
      }
      this.pending.delete(m.id);
      if (m.type === 'done') p.resolve(m.result);
      else p.reject(new Error(m.message));
    };
    w.onerror = (ev: ErrorEvent) => {
      ev.preventDefault();
      this.fail(new Error(ev.message || '해석 워커가 멈췄습니다(메모리가 모자랄 수 있습니다)'));
      w.terminate();
      if (this.worker === w) this.worker = null;
    };
    this.worker = w;
    return w;
  }

  private fail(e: Error): void {
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const p of all) p.reject(e);
  }
}
