/**
 * 질량 속성을 삼각화와 떼어 나중에 구하기(propsjob.ts·scene.ts stepToSceneDeferred·app/job.ts):
 * 미룬 장면에는 면 표 props가 없고, 적분(run)을 면 단위로 잘게 나눠 돌려도 한 번에 돌린 것(stepToScene)과 값이 비트까지 같다.
 * 9차(삼각화하면서 적분)와 같은 값인지는 실제 파일 훑기(sweep:compare의 값 지문)로 견준다.
 */
import { describe, expect, it } from 'vitest';
import { applyProps, stepToScene, stepToSceneDeferred, type StepFaceTable, type StepMeta } from '../src/scene';
import { PROPS_BREP, PROPS_TIMEOUT } from '../src/massprops';
import { parseStepFile } from '../src/app/job';
import type { MassPropsJob } from '../src/propsjob';
import { cone, cube, cylinder, plateWithHole, sphere, StepText, torus } from './stepText';

/** 여러 입체(해석적 곡면 모두, 같은 부품 두 자리, 인치 부품)를 담은 조립 */
function assembly(): Uint8Array {
  const w = new StepText();
  const mm = w.context('mm');
  const inch = w.context('inch');
  const parts = [
    w.product('cube', [cube(w, 10, [3, -4, 5]).solid], mm),
    w.product('cyl', [cylinder(w, 5, 20)], mm),
    w.product('sph', [sphere(w, 7)], mm),
    w.product('tor', [torus(w, 10, 3)], mm),
    w.product('plate', [plateWithHole(w)], mm),
    w.product('cone', [cone(w, 4, 9)], mm),
    w.product('inch', [cylinder(w, 1, 2)], inch),
  ];
  const root = w.product('asm', [w.ax2([0, 0, 0])], mm, 'SHAPE_REPRESENTATION');
  parts.forEach((p, i) => w.place(root, p, w.ax2([i * 40, 0, 0]), `p${i}`));
  // 같은 부품을 한 자리 더(면 표는 하나)
  w.place(root, parts[1]!, w.ax2([0, 60, 0]), 'again');
  return w.bytes();
}

const tablesOf = (s: { meta?: unknown }) => ((s.meta as StepMeta).faceTables ?? []) as StepFaceTable[];
/** float64 비트 그대로 */
const bits = (p: Float64Array | undefined) => (p ? Array.from(new Uint8Array(p.buffer, p.byteOffset, p.byteLength)) : null);

describe('질량 속성 미루기', () => {
  const bytes = assembly();
  const inline = stepToScene(bytes);

  it('미룬 장면은 면 표 props가 없고, 적분 거리는 입체마다 하나(같은 부품 두 자리는 한 번)·값을 받을 면 표를 안다', () => {
    const { scene, props } = stepToSceneDeferred(bytes);
    expect(props).not.toBeNull();
    expect(tablesOf(scene).every((t) => t.props === undefined)).toBe(true);
    expect(props!.total).toBe(7);
    expect(props!.tables().sort()).toEqual(tablesOf(inline).map((_, i) => i));
    expect(props!.finished).toBe(false);
    // 삼각화 결과(그물)는 미뤄도 같다
    expect(scene.meshes.map((m) => Array.from(m.indices!))).toEqual(inline.meshes.map((m) => Array.from(m.indices!)));
  });

  it('면 하나씩(run(0)) 잘게 나눠 적분해도 한 번에(stepToScene) 구한 값과 비트까지 같다 — 인치 부품은 장면 단위로', () => {
    const job = stepToSceneDeferred(bytes).props!;
    let calls = 0;
    const seen: number[] = [];
    while (!job.run(0)) {
      calls++;
      for (const r of job.take()) seen.push(r.table);
      if (calls > 10_000) throw new Error('끝나지 않는다');
    }
    for (const r of job.take()) seen.push(r.table);
    // 면 단위로 멈췄다(입체 수보다 훨씬 많이 불렀다)
    expect(calls).toBeGreaterThan(job.total);
    expect(seen.sort((a, b) => a - b)).toEqual(tablesOf(inline).map((_, i) => i));
    // 다시 돌려 붙이기
    const again = stepToSceneDeferred(bytes);
    again.props!.run(0);
    while (!again.props!.run(1)) {
      /* 조각마다 */
    }
    applyProps(again.scene, again.props!.take(), again.props!);
    expect(tablesOf(again.scene).map((t) => bits(t.props))).toEqual(tablesOf(inline).map((t) => bits(t.props)));
    expect(tablesOf(inline).every((t) => t.props && t.props[14] === PROPS_BREP)).toBe(true);
    expect((again.scene.meta as unknown as StepMeta).stats.propsMs).toBeGreaterThanOrEqual(0);
  });

  it('take()는 지난번 뒤 끝낸 입체 값만, 끝나면 finished·done = total', () => {
    const { props } = stepToSceneDeferred(bytes);
    const job = props!;
    job.run();
    expect(job.finished).toBe(true);
    expect(job.done).toBe(job.total);
    expect(job.take()).toHaveLength(tablesOf(inline).length);
    expect(job.take()).toHaveLength(0);
    expect(job.run()).toBe(true);
  });

  it('시간 한도는 입체를 시작할 때 본다: 넘으면 그 입체부터 삼각형 값(PROPS_TIMEOUT)과 개수', () => {
    const { scene, props } = stepToSceneDeferred(bytes, { propsBudget: { minMs: -1, share: 0 } });
    props!.run();
    applyProps(scene, props!.take(), props!);
    expect(tablesOf(scene).every((t) => t.props![14] === PROPS_TIMEOUT)).toBe(true);
    expect((scene.meta as unknown as StepMeta).stats.propsTimedOut).toBe(7);
    // 넉넉하면 하나도 넘지 않는다
    const ok = stepToSceneDeferred(bytes, { propsBudget: { minMs: 1e9, share: 0 } });
    ok.props!.run();
    expect(ok.props!.timedOut).toBe(0);
  });

  it('질량 속성을 끄면(props: false) 적분 거리도 없다', () => {
    expect(stepToSceneDeferred(bytes, { props: false }).props).toBeNull();
    expect(stepToSceneDeferred(bytes, { faceTable: false }).props).toBeNull();
  });

  it('parseStepFile(워커 일)에 onProps를 주면 장면에 값 없이 적분 거리와 기다리는 면 표를 넘긴다 — 적분하면 주지 않았을 때와 같다', async () => {
    let job: MassPropsJob | null = null;
    const res = await parseStepFile('a.stp', bytes, () => {}, {}, (j) => (job = j));
    expect(job).not.toBeNull();
    expect(res.props).toEqual({ tables: job!.tables(), solids: 7 });
    expect(tablesOf(res.scene).every((t) => t.props === undefined)).toBe(true);
    job!.run();
    applyProps(res.scene, job!.take(), job!);
    const plain = await parseStepFile('a.stp', bytes);
    expect(plain.props).toBeUndefined();
    expect(tablesOf(res.scene).map((t) => bits(t.props))).toEqual(tablesOf(plain.scene).map((t) => bits(t.props)));
  });
});
