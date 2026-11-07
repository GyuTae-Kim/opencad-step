/**
 * 해석기 견고성 퍼징(빠른 판 — 씨앗 고정, CI에서 수 초): 합성 STEP 셋(앱 예제 조립 — PMI·레이어·색·조립·\X2\ 이름·저장된 보기,
 * 원·타원·B-스플라인 모서리 판, 선 형상 묶음)을 tests/mutate.ts의 바꾸기 13종으로 수백 번 바꿔 앱 해석 워커와 같은 길
 * (parseStepFile → 법선 줄이기 → 이전 목록 → 질량 속성 조각 적분 → 곡면 정의 꾸리기)로 연다.
 * 기대: 앱이 알고 거절하는 글(STEP 아님·압축 손상 등) 말고는 예외가 없고, 한 입력이 시간 안에 끝나며, 넘기는 좌표가 모두 유한하다.
 * 57차 대량 퍼징(로컬 실제 표본 30개 × 13종, 수만 번)에서 찾은 결함의 최소 재현은 tests/robustness-fuzz.test.ts에 따로 둔다.
 */
import { describe, expect, it } from 'vitest';
import { parseStepFile } from '../src/app/job';
import { packSceneNormals } from '../src/app/normals';
import { collectTransfers, TRANSFER_MAX } from '../src/app/protocol';
import { sampleStepBytes } from '../src/app/sample';
import { dropFaceSurfaceCaches, packFaceSurfaces } from '../src/facesurf';
import type { FaceSurfaceSet, MassPropsJob } from '../src/scene';
import { errorCode } from '../scripts/sweep/classify';
import { qualityOptions } from '../scripts/sweep/quality';
import { curveStep } from './app/curvescene';
import { gzipWrap, mutate, MUTATION_KINDS, rng, zipWrap } from './mutate';
import { StepText } from './stepText';

/** 선 형상 묶음: 꺾은선·잘린 꺾은선·합성 곡선·B-스플라인 곡선·원 */
function wireStep(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const pts = [w.pt([0, 0, 0]), w.pt([10, 0, 0]), w.pt([10, 10, 0]), w.pt([0, 10, 5])];
  const pl = w.add('POLYLINE', `'',(${pts.map((x) => `#${x}`).join(',')})`);
  const tc = w.add('TRIMMED_CURVE', `'',#${pl},(PARAMETER_VALUE(0.5)),(PARAMETER_VALUE(2.5)),.T.,.PARAMETER.`);
  const s1 = w.add('COMPOSITE_CURVE_SEGMENT', `.CONTINUOUS.,.T.,#${w.line([0, 0, 0], [5, 5, 0])}`);
  const s2 = w.add('COMPOSITE_CURVE_SEGMENT', `.CONTINUOUS.,.T.,#${w.line([5, 5, 0], [5, 9, 0])}`);
  const cc = w.add('COMPOSITE_CURVE', `'',(#${s1},#${s2}),.F.`);
  const bs = w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',3,(${pts.map((x) => `#${x}`).join(',')}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.`);
  const ci = w.circle([20, 0, 0], 4);
  const set = w.add('GEOMETRIC_CURVE_SET', `'',(#${pl},#${tc},#${cc},#${bs},#${ci})`);
  w.product('wires', [set], ctx, 'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION');
  return w.bytes();
}

const INPUTS: [string, Uint8Array][] = [
  ['sample', sampleStepBytes()],
  ['curves', curveStep()],
  ['wires', wireStep()],
];

interface Outcome {
  ms: number;
  rejected?: string;
  nonFinite: number;
}

/** 앱 워커와 같은 길로 연다. 앱이 알고 거절하는 오류면 rejected, 아니면 예외를 그대로 던진다 */
async function open(name: string, bytes: Uint8Array): Promise<Outcome> {
  const t0 = performance.now();
  let job: MassPropsJob | null = null;
  let surf: FaceSurfaceSet | null = null;
  let res;
  try {
    res = await parseStepFile(name, bytes, () => {}, qualityOptions('normal'), (j) => (job = j), (s) => (surf = s));
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    const { code, rejected } = errorCode(message);
    if (rejected || code === 'unpack-failed' || code === 'zip-damaged') return { ms: performance.now() - t0, rejected: code, nonFinite: 0 };
    throw e;
  }
  let nonFinite = 0;
  const scan = (a: ArrayLike<number> | undefined) => {
    if (a) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) nonFinite++;
  };
  for (const m of res.scene.meshes) {
    scan(m.positions);
    scan(m.origin);
    scan(m.matrix);
  }
  for (const l of [...res.scene.lines, ...(res.scene.points ?? [])]) {
    scan(l.positions);
    scan(l.origin);
  }
  packSceneNormals(res.scene);
  collectTransfers(res, TRANSFER_MAX);
  if (job) {
    const j = job as MassPropsJob;
    while (!j.run(40)) j.take();
    j.take();
  }
  if (surf) {
    packFaceSurfaces(surf);
    dropFaceSurfaceCaches(surf);
  }
  return { ms: performance.now() - t0, nonFinite };
}

describe('해석기 퍼징(빠른 판, 씨앗 고정)', () => {
  it('바꾸기 13종 × 합성 표본 셋: 알고 거절하는 오류 말고는 예외 없음, 한 입력 2초 안, 좌표 모두 유한', async () => {
    const r = rng(57);
    const PER = 6;
    let runs = 0;
    let rejected = 0;
    let slowest = { ms: 0, what: '' };
    const failures: string[] = [];
    for (const [name, base] of INPUTS) {
      for (const kind of MUTATION_KINDS) {
        for (let k = 0; k < PER; k++) {
          const seed = Math.floor(r() * 2 ** 32);
          const m = mutate(base, kind, seed);
          const wrap = kind === 'container' ? 'plain' : k % 5 === 3 ? 'gzip' : k % 5 === 4 ? 'zip' : 'plain';
          const bytes = wrap === 'gzip' ? gzipWrap(m.bytes) : wrap === 'zip' ? zipWrap(m.bytes) : m.bytes;
          const what = `${name}:${kind}:${seed}:${wrap} ${m.detail}`;
          runs++;
          try {
            const o = await open(`${name}.stp`, bytes);
            if (o.rejected) rejected++;
            if (o.ms > slowest.ms) slowest = { ms: o.ms, what };
            if (o.ms > 2000) failures.push(`느림 ${Math.round(o.ms)}ms ${what}`);
            if (o.nonFinite) failures.push(`유한하지 않은 좌표 ${o.nonFinite}개 ${what}`);
          } catch (e) {
            failures.push(`예외 ${(e as Error)?.name}: ${String((e as Error)?.message).slice(0, 120)} ${what}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
    expect(runs).toBe(INPUTS.length * MUTATION_KINDS.length * PER);
    // 거절(STEP 아님·압축 손상)만 나오지 않게 — 대부분은 열린다
    expect(rejected).toBeLessThan(runs / 3);
    expect(slowest.ms).toBeLessThan(2000);
  });
});
