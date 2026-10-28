/**
 * 해석 워커 손님: 파일 바이트를 워커로 넘기고(이전), 진행률을 받아 결과 장면을 돌려받는다.
 * 워커는 처음 쓸 때 만들고 계속 쓴다. 취소하면 워커를 끝내고(terminate) 기다리던 요청을 ParseCancelled로 끝내며,
 * 다음 요청 때 새로 만든다. 워커가 죽으면(메모리 부족 등) 기다리던 요청을 모두 실패로 끝낸다.
 *
 * 질량 속성: 해석 결과에 기다리는 면 표가 있으면(ParseResult.props) 화면이 문서를 보인 뒤 integrateProps로 적분을 맡기고
 * 진행(PropsProgress)을 받는다. 다른 파일을 해석하기 시작하거나 워커가 멈추면 그 문서의 적분은 멈춘다(onUpdate에 'stopped').
 */
import type { ParseOptions, ParseRequest, ParseResponse, ParseResult, PropsProgress, PropsRequest } from './protocol';

/** 질량 속성 적분 소식: 진행(끝낸 입체의 값) 또는 멈춤(다른 파일을 열었거나 워커가 멈춤) */
export type PropsUpdate = PropsProgress | 'stopped';

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
  /** 마지막으로 끝낸 해석(워커에 적분 거리가 남은 것) */
  private lastDone = 0;
  /** 적분 소식을 받을 곳(해석 하나) */
  private propsTo: { id: number; onUpdate: (u: PropsUpdate) => void } | null = null;

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
    // 워커는 새 해석을 받으면 앞 문서의 적분을 그만둔다
    this.stopProps();
    this.lastDone = 0;
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

  /**
   * 마지막으로 끝낸 해석의 질량 속성 적분을 워커에 맡긴다(ParseResult.props가 있을 때 — 문서를 보인 뒤).
   * 진행은 onUpdate로 온다(끝나면 finished). 맡길 것이 없으면(해석 뒤 다른 해석을 시작했거나 워커가 바뀜) false
   */
  integrateProps(onUpdate: (u: PropsUpdate) => void): boolean {
    const w = this.worker;
    const id = this.lastDone;
    if (!w || !id || this.pending.size) return false;
    this.propsTo = { id, onUpdate };
    const req: PropsRequest = { id, type: 'props' };
    w.postMessage(req);
    return true;
  }

  /** 질량 속성을 기다리는 곳에 멈춤을 알리고 잊는다 */
  private stopProps(): void {
    const p = this.propsTo;
    this.propsTo = null;
    p?.onUpdate('stopped');
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
    this.stopProps();
    this.worker?.terminate();
    this.worker = null;
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('../worker/parse.worker.ts', import.meta.url), { type: 'module', name: 'opencad-step-parse' });
    w.onmessage = (ev: MessageEvent<ParseResponse>) => {
      const m = ev.data;
      if (m.type === 'props') {
        const to = this.propsTo;
        if (!to || to.id !== m.id) return;
        if (m.finished) this.propsTo = null;
        to.onUpdate({ results: m.results, done: m.done, total: m.total, finished: m.finished, timedOut: m.timedOut, ms: m.ms });
        return;
      }
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.type === 'progress') {
        p.progress?.(m.fraction, m.stage);
        return;
      }
      this.pending.delete(m.id);
      if (m.type === 'done') {
        if (m.result.props) this.lastDone = m.id;
        p.resolve(m.result);
      } else p.reject(new Error(m.message));
    };
    w.onerror = (ev: ErrorEvent) => {
      ev.preventDefault();
      this.fail(new Error(ev.message || '해석 워커가 멈췄습니다(메모리가 모자랄 수 있습니다)'));
      this.stopProps();
      this.lastDone = 0;
      w.terminate();
      if (this.worker === w) this.worker = null;
    };
    this.worker = w;
    return w;
  }

  private fail(e: Error): void {
    // 워커를 끝내면 적분 거리도 사라진다
    if (e instanceof ParseCancelled) {
      this.stopProps();
      this.lastDone = 0;
    }
    const all = [...this.pending.values()];
    this.pending.clear();
    for (const p of all) p.reject(e);
  }
}
