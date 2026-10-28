/**
 * 질량 속성을 문서를 보인 뒤 워커에서 따로 구하는 흐름: 실제 해석 워커 본문(src/worker/parse.worker.ts)을 가짜 self로 들여와
 * ParseClient(가짜 Worker가 메시지를 구조적 복제로 건넨다)와 잇는다. 해석 결과에는 값이 없고, integrateProps로 맡기면
 * 끝낸 입체의 값이 오며(한 번에 구한 값과 비트까지 같다), 다른 파일을 해석하기 시작하면 앞 문서의 적분은 멈춘다('stopped').
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stepToScene, type StepFaceTable, type StepMeta } from '../../src/scene';
import { ParseClient, type PropsUpdate } from '../../src/app/client';
import { applyDocProps, createDoc, propsPendingFor } from '../../src/app/doc';
import type { ParseResponse, PropsProgress } from '../../src/app/protocol';
import { cube, cylinder, sphere, StepText, torus } from '../stepText';

/** 워커 본문이 쓰는 self(메시지 받기·보내기) */
const ctx: { onmessage: ((ev: { data: unknown }) => unknown) | null; postMessage: (m: unknown) => void } = { onmessage: null, postMessage: () => {} };
/** 워커가 보낸 메시지(시험이 직접 볼 때) */
let sent: ParseResponse[] = [];
let live: FakeWorker | null = null;

class FakeWorker {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  terminated = false;
  constructor() {
    live = this;
  }
  postMessage(m: unknown): void {
    const data = structuredClone(m);
    setTimeout(() => void ctx.onmessage?.({ data }), 0);
  }
  terminate(): void {
    this.terminated = true;
  }
}

function parts(n: number): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const root = w.product('asm', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  const makers = [(x: StepText) => cylinder(x, 5, 20), (x: StepText) => sphere(x, 7), (x: StepText) => torus(x, 10, 3), (x: StepText) => cube(x, 10).solid];
  for (let i = 0; i < n; i++) w.place(root, w.product(`p${i}`, [makers[i % makers.length]!(w)], mm), w.ax2([i * 40, 0, 0]), `p${i}`);
  return w.bytes();
}

const tablesOf = (s: { meta?: unknown }) => ((s.meta as StepMeta).faceTables ?? []) as StepFaceTable[];
const bits = (p: Float64Array | undefined) => (p ? Array.from(new Uint8Array(p.buffer, p.byteOffset, p.byteLength)) : null);
const until = async (ok: () => boolean, what: string) => {
  for (let i = 0; i < 2000 && !ok(); i++) await new Promise((r) => setTimeout(r, 2));
  if (!ok()) throw new Error(`기다림 끝: ${what}`);
};

const g = globalThis as unknown as { self?: unknown; Worker?: unknown };
const saved = { self: g.self, Worker: g.Worker };

beforeAll(async () => {
  ctx.postMessage = (m) => {
    const msg = structuredClone(m) as ParseResponse;
    sent.push(msg);
    if (live && !live.terminated) setTimeout(() => live?.onmessage?.({ data: msg }), 0);
  };
  g.self = ctx;
  g.Worker = FakeWorker;
  await import('../../src/worker/parse.worker');
});

afterAll(() => {
  g.self = saved.self;
  g.Worker = saved.Worker;
});

describe('질량 속성: 워커가 문서를 보인 뒤 따로 적분', () => {
  it('해석 결과는 값 없이 기다리는 면 표만, integrateProps로 맡기면 값이 오고 한 번에 구한 것과 비트까지 같다', async () => {
    sent = [];
    const bytes = parts(5);
    const client = new ParseClient();
    const res = await client.parse('a.stp', bytes.slice().buffer);
    expect(res.props?.solids).toBe(5);
    expect(tablesOf(res.scene).every((t) => t.props === undefined)).toBe(true);
    const doc = createDoc('a.stp', bytes.length, res);
    expect(doc.props).toMatchObject({ state: 'running', total: 5, done: 0 });
    expect(propsPendingFor(doc, null)).toBe(true);
    // 고른 것만: 상자(평면)도 닫힌 입체라 기다린다
    expect(propsPendingFor(doc, new Set([res.scene.meshes[3]!.id]))).toBe(true);
    const updates: PropsUpdate[] = [];
    expect(
      client.integrateProps((u) => {
        updates.push(u);
        applyDocProps(doc, u);
      }),
    ).toBe(true);
    await until(() => doc.props.state === 'done', '적분 끝');
    expect(updates.at(-1)).toMatchObject({ finished: true, done: 5, total: 5, timedOut: 0 });
    expect(doc.props.pending.size).toBe(0);
    expect(propsPendingFor(doc, null)).toBe(false);
    const inline = stepToScene(bytes, { name: 'a.stp' });
    expect(tablesOf(res.scene).map((t) => bits(t.props))).toEqual(tablesOf(inline).map((t) => bits(t.props)));
    // 다 했으면 더 맡길 것이 없다(워커가 버렸다) — 다시 맡겨도 소식이 없다
    const before = sent.length;
    client.integrateProps(() => updates.push('stopped'));
    await new Promise((r) => setTimeout(r, 30));
    expect(sent.length).toBe(before);
  });

  it('워커는 새 해석을 받으면 앞 문서의 적분 거리를 버린다(그 번호로 맡겨도 소식이 없다), 새 문서는 그대로 맡길 수 있다', async () => {
    sent = [];
    const client = new ParseClient();
    await client.parse('a.stp', parts(3).slice().buffer);
    const idA = sent.find((m) => m.type === 'done')!.id;
    const b = await client.parse('b.stp', parts(2).slice().buffer);
    const n = sent.length;
    ctx.onmessage?.({ data: { id: idA, type: 'props' } });
    await new Promise((r) => setTimeout(r, 30));
    expect(sent.slice(n).filter((m) => m.type === 'props')).toEqual([]);
    const docB = createDoc('b.stp', 1, b);
    expect(client.integrateProps((u) => applyDocProps(docB, u))).toBe(true);
    await until(() => docB.props.state === 'done', 'b 적분 끝');
    expect(tablesOf(b.scene).every((t) => t.props)).toBe(true);
  });

  it('멈춘 문서(stopped)는 기다리던 면 표가 값 없이 남는다 — 물리 속성은 삼각형 값과 멈춤 안내', () => {
    const scene = stepToScene(parts(2), { props: false });
    const doc = createDoc('x.stp', 1, { scene, ms: 1, props: { tables: [0, 1], solids: 2 } });
    applyDocProps(doc, 'stopped');
    expect(doc.props.state).toBe('stopped');
    expect(propsPendingFor(doc, null)).toBe(true);
    expect(doc.faces!.tables.every((t) => t.props === undefined)).toBe(true);
  });

  it('맡긴 적분 소식을 기다리는 동안 새 파일을 열면 그 자리에서 stopped를 받는다', async () => {
    const client = new ParseClient();
    await client.parse('a.stp', parts(2).slice().buffer);
    const got: PropsUpdate[] = [];
    // 워커가 메시지를 받기 전에(가짜 Worker는 다음 틈에 건넨다) 새 해석을 시작한다
    client.integrateProps((u) => got.push(u));
    const next = client.parse('b.stp', parts(1).slice().buffer);
    expect(got).toEqual(['stopped']);
    await next;
    await new Promise((r) => setTimeout(r, 30));
    // 앞 문서의 늦은 소식은 버린다
    expect(got).toEqual(['stopped']);
  });

  it('applyDocProps: 끝난 뒤에는 바꾸지 않고, 시간 한도 수는 정보 탭 통계에도', () => {
    const scene = stepToScene(parts(1), { props: false });
    const doc = createDoc('x.stp', 1, { scene, ms: 1, props: { tables: [0], solids: 1 } });
    const p = new Float64Array(15).fill(1);
    const done: PropsProgress = { results: [{ table: 0, props: p }], done: 1, total: 1, finished: true, timedOut: 1, ms: 5 };
    applyDocProps(doc, done);
    expect(doc.props).toMatchObject({ state: 'done', done: 1, timedOut: 1, ms: 5 });
    expect(doc.faces!.tables[0]!.props).toBe(p);
    expect(doc.info.stats?.propsTimedOut).toBe(1);
    applyDocProps(doc, 'stopped');
    expect(doc.props.state).toBe('done');
  });
});
