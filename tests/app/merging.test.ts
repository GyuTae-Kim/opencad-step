/**
 * 63차(코어 0.52.0 묶어 그리기 — merging 기본 'auto'): 서로 다른 부품이 2,000개를 넘는 STEP 조립을 앱처럼 열면(해석 워커와 같은 길 parseStepFile →
 * 법선 줄이기 → 문서) 코어가 저절로 묶는다. 묶음이 켜진 뷰어(앱 그대로 — merging을 정하지 않는다)와 끈 뷰어(merging: false — 0.51.0 길)를 같은 장면·같은 카메라에 두고
 * 앱 기능이 같은지 실제 코어(가짜 DOM·WebGL2)로 본다:
 * - 묶음이 켜지고 GPU 버퍼·그리기 호출이 크게 준다(끈 뷰어의 1/20·1/50 아래)
 * - 부품 고르기(화면 격자)·측정 붙잡기 후보가 같다
 * - 면 강조(면 표의 삼각형 범위)·부품 강조·숨기기·분해(앱 LookSync — 단계마다 행렬)·단면 동안 다시 굽지 않고(굽기 시간·묶음 수·버퍼 수 그대로) 고르기가 같다.
 *   단면은 코어가 그물마다(묶음 자리로) 그려 그리기 호출이 끈 뷰어와 같다
 * - 앱 나눠 올리기(uploadOptions)로 올려도 다 올린 뒤 묶이고 고르기가 같다
 * - 묶은 뒤에도 장면 배열(위치·색인)은 그대로라 물리 속성(physProps)이 같다
 * 부품은 모양 틀(구멍 뚫린 판·상자 셋)의 닫힌 껍질을 함께 쓰되 제품·입체를 부품마다 따로 둔 합성 STEP이다 — 해석기가 부품마다 따로 삼각화해 배열을 함께 쓰지 않는다.
 * 화면 좌표는 경계를 피해 칸 가운데를 가리킨다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MERGE_AUTO_MIN, Viewer3d } from 'opencad-viewer3d';
import type { Scene3d } from 'opencad-viewer3d/types';
import { createDoc, type StepDoc } from '../../src/app/doc';
import { explodeMoves, explodePlan } from '../../src/app/explode';
import { faceAt } from '../../src/app/faces';
import { parseStepFile } from '../../src/app/job';
import { LookSync } from '../../src/app/looks';
import { packSceneNormals } from '../../src/app/normals';
import { physProps } from '../../src/app/physics';
import { uploadOptions } from '../../src/app/upload';
import { cube, plateWithHole, StepText } from '../stepText';
import { installDom } from './fakeview';

/** 서로 다른 부품 n개(뿌리 조립에 격자로 한 번씩) */
function distinctAssembly(n: number): Uint8Array {
  const w = new StepText();
  const ctx = w.context('mm');
  const solids = [plateWithHole(w, 's0'), cube(w, 6, [0, 0, 0], 's1').solid, cube(w, 9, [0, 0, 0], 's2').solid, cube(w, 4, [0, 0, 0], 's3').solid];
  const shells = solids.map((s) => s - 1);
  const appCtx = w.add('APPLICATION_CONTEXT', `'mechanical design'`);
  const pc = w.add('PRODUCT_CONTEXT', `'',#${appCtx},'mechanical'`);
  const pdc = w.add('PRODUCT_DEFINITION_CONTEXT', `'part definition',#${appCtx},'design'`);
  const dz = w.dir([0, 0, 1]);
  const dx = w.dir([1, 0, 0]);
  const origin = w.add('AXIS2_PLACEMENT_3D', `'',#${w.pt([0, 0, 0])},#${dz},#${dx}`);
  const prod = (name: string): { pd: number; pds: number } => {
    const p = w.add('PRODUCT', `'${name}','${name}','',(#${pc})`);
    const f = w.add('PRODUCT_DEFINITION_FORMATION', `'','',#${p}`);
    const pd = w.add('PRODUCT_DEFINITION', `'design','',#${f},#${pdc}`);
    return { pd, pds: w.add('PRODUCT_DEFINITION_SHAPE', `'','',#${pd}`) };
  };
  const parts: { pd: number; rep: number }[] = [];
  for (let i = 0; i < n; i++) {
    const k = i % shells.length;
    const brep = i < shells.length ? solids[k]! : w.add('MANIFOLD_SOLID_BREP', `'b${i}',#${shells[k]}`);
    const { pd, pds } = prod(`p${i}`);
    const rep = w.add('ADVANCED_BREP_SHAPE_REPRESENTATION', `'p${i}',(#${brep},#${origin}),#${ctx}`);
    w.add('SHAPE_DEFINITION_REPRESENTATION', `#${pds},#${rep}`);
    parts.push({ pd, rep });
  }
  const cols = Math.ceil(Math.sqrt(n));
  const axes = parts.map((_, i) => w.add('AXIS2_PLACEMENT_3D', `'',#${w.pt([(i % cols) * 14, Math.floor(i / cols) * 14, (i % 3) * 2])},#${dz},#${dx}`));
  const root = prod('assembly');
  const rootRep = w.add('SHAPE_REPRESENTATION', `'assembly',(${[...axes, w.ax2([0, 0, 0])].map((x) => `#${x}`).join(',')}),#${ctx}`);
  w.add('SHAPE_DEFINITION_REPRESENTATION', `#${root.pds},#${rootRep}`);
  parts.forEach((c, i) => {
    const nauo = w.add('NEXT_ASSEMBLY_USAGE_OCCURRENCE', `'n${i}','n${i}','',#${root.pd},#${c.pd},$`);
    const idt = w.add('ITEM_DEFINED_TRANSFORMATION', `'','',#${origin},#${axes[i]}`);
    const rel = w.raw(`(REPRESENTATION_RELATIONSHIP('','',#${c.rep},#${rootRep}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${idt}) SHAPE_REPRESENTATION_RELATIONSHIP())`);
    w.add('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION', `#${rel},#${w.add('PRODUCT_DEFINITION_SHAPE', `'','',#${nauo}`)}`);
  });
  return w.bytes('merge.stp');
}

const N = MERGE_AUTO_MIN + 16;
let dom: ReturnType<typeof installDom>;
let doc: StepDoc;
let scene: Scene3d;
const views: Viewer3d[] = [];
beforeAll(async () => {
  dom = installDom();
  const bytes = distinctAssembly(N);
  const res = await parseStepFile('merge.stp', bytes, () => {}, {});
  // 해석 워커가 넘기기 전에 하듯 법선을 Int8 4값으로
  packSceneNormals(res.scene);
  doc = createDoc('merge.stp', bytes.length, res);
  scene = doc.scene;
});
afterAll(() => {
  for (const v of views) v.dispose();
  dom.restore();
});

/** 앱처럼 만든 뷰어(merging을 정하지 않음) — off면 0.51.0 길(merging: false). 묶음 굽기를 마칠 때까지 그린다 */
function viewer(off: boolean, incremental = false): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  if (off) v.setRenderOptions({ merging: false });
  let done = !incremental;
  v.setScene(scene, incremental ? { incremental: uploadOptions(), onProgress: (a, b) => void (done = a >= b) } : {});
  for (let i = 0; i < 2000 && (!done || v.stats.merged.pending > 0 || v.stats.instanced.pending > 0); i++) v.renderNow();
  expect(done).toBe(true);
  v.fit(false);
  v.orbitBy(0.3, 0.15);
  v.renderNow();
  return v;
}
const settle = (v: Viewer3d): void => {
  for (let i = 0; i < 200 && v.stats.merged.pending > 0; i++) v.renderNow();
  v.renderNow();
};
/** 화면 격자 24 × 18자리(칸 가운데)의 고른 것 */
const picks = (v: Viewer3d): string[] => {
  const out: string[] = [];
  for (let gy = 0; gy < 18; gy++)
    for (let gx = 0; gx < 24; gx++) {
      const p = v.pick(33.3 * gx + 9.1, 33.3 * gy + 7.7);
      out.push(p ? `${p.id}:${p.index}:${p.section ? 's' : ''}:${p.point.map((x) => x.toFixed(4)).join(',')}` : '-');
    }
  return out;
};
const hits = (l: string[]): number => l.filter((x) => x !== '-').length;
/** 굽기·묶음·GPU 버퍼 — 겉모습·보이기·강조·단면은 이것을 바꾸지 않아야 한다(다시 굽지 않음) */
const baked = (v: Viewer3d): string => {
  const m = v.stats.merged;
  return JSON.stringify([m.active, m.groups, m.meshes, m.bytes, m.bakeMs, v.stats.buffers.count, v.stats.buffers.bytes]);
};
const sum = (s: Scene3d): number => {
  let t = 0;
  for (const m of s.meshes) {
    for (let i = 0; i < m.positions.length; i += 7) t += m.positions[i]!;
    t += m.indices?.length ?? 0;
  }
  return t;
};

describe('서로 다른 부품이 2,000개 넘는 조립: 코어 0.52.0 묶어 그리기(63차)', () => {
  it('해석 결과: 부품마다 따로 삼각화한 배열(함께 쓰지 않음), 닫힌 입체·정점 색 없음', () => {
    expect(scene.meshes.length).toBe(N);
    expect(new Set(scene.meshes.map((m) => m.positions)).size).toBe(N);
    expect(scene.meshes.every((m) => !m.doubleSided && !m.colors && m.normals instanceof Int8Array && m.edges)).toBe(true);
    expect(doc.faces).toBeTruthy();
  });

  it('묶음이 켜져 GPU 버퍼·그리기 호출이 크게 주고, 고르기·측정 붙잡기 후보·물리 속성이 끈 뷰어와 같다', () => {
    const before = sum(scene);
    const phys0 = JSON.stringify(physProps(scene.meshes, null, { faces: doc.faces, sceneMm: 1 }));
    const on = viewer(false);
    const off = viewer(true);
    expect(on.stats.merged.active).toBe(true);
    expect(on.stats.merged.meshes).toBe(N);
    expect(off.stats.merged.active).toBe(false);
    expect(on.stats.buffers.count).toBeLessThan(off.stats.buffers.count / 20);
    expect(on.stats.drawCalls).toBeLessThan(off.stats.drawCalls / 50);
    const p = picks(on);
    expect(hits(p)).toBeGreaterThan(50);
    expect(p).toEqual(picks(off));
    // 측정 붙잡기 후보(코어 기본 붙잡기 — 꼭짓점·모서리·면): 격자 12 × 9
    on.setMeasureMode(true);
    off.setMeasureMode(true);
    const cand = (v: Viewer3d): string[] => {
      const out: string[] = [];
      for (let gy = 0; gy < 9; gy++)
        for (let gx = 0; gx < 12; gx++) out.push(v.measureCandidates(66.6 * gx + 17.1, 66.6 * gy + 13.7).map((c) => `${c.snap}:${c.point.map((x) => x.toFixed(4)).join(',')}`).join('|'));
      return out;
    };
    const c = cand(on);
    expect(c.filter(Boolean).length).toBeGreaterThan(10);
    expect(c).toEqual(cand(off));
    on.setMeasureMode(false);
    off.setMeasureMode(false);
    // 묶어도 장면 배열은 그대로(코어가 놓지 않는다) — 물리 속성이 같다
    expect(sum(scene)).toBe(before);
    expect(JSON.stringify(physProps(scene.meshes, null, { faces: doc.faces, sceneMm: 1 }))).toBe(phys0);
  });

  it('면 강조·부품 강조·숨기기·분해(LookSync 단계마다 행렬)·단면 동안 다시 굽지 않고 고르기가 같다', () => {
    const on = viewer(false);
    const off = viewer(true);
    const both = (f: (v: Viewer3d) => void): void => {
      f(on);
      f(off);
      settle(on);
      off.renderNow();
    };
    const b0 = baked(on);
    const draws0 = on.stats.drawCalls;
    // 면 강조(앱 showFace — 면 표의 삼각형 범위): 고른 자리의 면
    const hit = on.pick(400, 300) ?? on.pick(22.2 * 18 + 7.1, 22.2 * 13 + 5.7);
    const first = hit ?? { id: scene.meshes[0]!.id, index: 0 };
    const table = doc.faces!.tables[doc.faces!.tableOf.get(first.id)!]!;
    const fi = faceAt(table, first.index);
    expect(fi).toBeGreaterThanOrEqual(0);
    const range = { start: table.triStart[fi]!, count: table.triStart[fi + 1]! - table.triStart[fi]! };
    both((v) => v.highlightRanges({ [first.id]: [range] }));
    expect(baked(on)).toBe(b0);
    expect(picks(on)).toEqual(picks(off));
    both((v) => v.highlightRanges(null));
    // 부품 강조 20개
    both((v) => v.highlight(scene.meshes.slice(0, 20).map((m) => m.id)));
    expect(baked(on)).toBe(b0);
    expect(on.stats.drawCalls).toBeLessThan(off.stats.drawCalls / 20);
    both((v) => v.highlight(null));
    // 숨기기 30%(앱 보이기 — setItemVisible)
    const hide = scene.meshes.filter((_, i) => i % 10 < 3).map((m) => m.id);
    both((v) => hide.forEach((id) => v.setItemVisible(id, false)));
    expect(baked(on)).toBe(b0);
    const ph = picks(on);
    expect(ph).toEqual(picks(off));
    expect(ph.some((x) => hide.includes(x.split(':')[0]!))).toBe(false);
    both((v) => hide.forEach((id) => v.setItemVisible(id, true)));
    // 분해: 앱 겉모습 걸기(LookSync — 바뀐 묶음만 setItemLooks로 행렬)를 단계마다. 프레임마다 행렬이 바뀌어도 다시 굽지 않는다
    const plan = explodePlan(scene.meshes, doc.products, 'step', 'free');
    const syncs = new Map([on, off].map((v) => [v, new LookSync()]));
    for (const t of [0.2, 0.4, 0.6, 0.8, 1]) {
      both((v) => syncs.get(v)!.apply(v, { items: scene.meshes, products: doc.products, opacity: new Map(), dim: null, partColors: false, moves: explodeMoves(plan, t) }));
      expect(baked(on), `분해 ${t}`).toBe(b0);
      // 화면 밖으로 나간 부품은 묶음 구간을 끊어(코어 화면 밖 잘라내기) 그리기 호출이 조금 늘 뿐이다
      expect(on.stats.drawCalls, `분해 ${t}`).toBeLessThan(off.stats.drawCalls / 20);
    }
    const pe = picks(on);
    expect(pe).toEqual(picks(off));
    expect(syncs.get(on)!.moves().size).toBeGreaterThan(N / 2);
    both((v) => syncs.get(v)!.apply(v, { items: scene.meshes, products: doc.products, opacity: new Map(), dim: null, partColors: false }));
    expect(baked(on)).toBe(b0);
    // 단면: 그물마다(묶음 자리로) 그려 그리기 호출이 끈 뷰어와 같고, 잘린 면 고르기도 같다
    both((v) => v.setSectionAxis('x', 0.5));
    expect(on.stats.drawCalls).toBe(off.stats.drawCalls);
    expect(picks(on)).toEqual(picks(off));
    both((v) => v.setSection(null));
    expect(baked(on)).toBe(b0);
    expect(on.stats.drawCalls).toBe(draws0);
  });

  it('앱 나눠 올리기(uploadOptions)로 올려도 다 올린 뒤 묶이고 고르기가 같다', () => {
    const inc = viewer(false, true);
    const off = viewer(true);
    expect(inc.stats.merged.active).toBe(true);
    expect(inc.stats.merged.meshes).toBe(N);
    expect(picks(inc)).toEqual(picks(off));
  });
});
