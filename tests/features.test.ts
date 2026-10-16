import { describe, expect, it } from 'vitest';
import type { LineSet3d, Scene3d } from 'opencad-viewer3d/types';
import { stepToScene, type StepMeta } from '../src/index';
import { isClosedMesh } from '../src/analysis';
import { FACE_KINDS, FACE_PARAMS } from '../src/scene';
import { cube, cylinder, plateWithHole, r, StepText, type P3 } from './stepText';

const meta = (s: Scene3d) => s.meta as unknown as StepMeta;

/** 선분 쌍 → 점들 */
function segPoints(l: LineSet3d): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < l.positions.length; i += 3) out.push([l.positions[i]!, l.positions[i + 1]!, l.positions[i + 2]!]);
  return out;
}

function curveStyle(w: StepText, item: number, rgb: P3): number {
  const c = w.add('COLOUR_RGB', `'',${rgb.map(r).join(',')}`);
  const font = w.add('DRAUGHTING_PRE_DEFINED_CURVE_FONT', `'continuous'`);
  const cs = w.add('CURVE_STYLE', `'',#${font},POSITIVE_LENGTH_MEASURE(0.1),#${c}`);
  const psa = w.add('PRESENTATION_STYLE_ASSIGNMENT', `(#${cs})`);
  return w.add('STYLED_ITEM', `'',(#${psa}),#${item}`);
}

function polyline(w: StepText, pts: P3[]): number {
  return w.add('POLYLINE', `'',(${pts.map((p) => `#${w.pt(p)}`).join(',')})`);
}

describe('레이어', () => {
  it('직접·껍질·양식 항목 배정, 이름 합치기, INVISIBILITY 레이어는 처음에 숨김 표시(그물은 그대로)', () => {
    const w = new StepText();
    const ctx = w.context();
    const a = cube(w, 10, [0, 0, 0], 'a').solid;
    const b = cube(w, 10, [20, 0, 0], 'b').solid;
    const c = cube(w, 10, [40, 0, 0], 'c').solid;
    const sb = w.color(b, [1, 0, 0]);
    w.product('part', [a, b, c], ctx);
    w.add('PRESENTATION_LAYER_ASSIGNMENT', `'Body','solids',(#${a})`);
    const lb = w.add('PRESENTATION_LAYER_ASSIGNMENT', `'Hidden','',(#${sb})`);
    w.add('PRESENTATION_LAYER_ASSIGNMENT', `'Body','',(#${c - 1})`); // c의 CLOSED_SHELL, 같은 이름은 합친다
    w.add('INVISIBILITY', `(#${lb})`);
    const s = stepToScene(w.bytes());
    expect(s.meshes).toHaveLength(3);
    expect(s.meshes.every((m) => m.group === 'part')).toBe(true);
    const L = meta(s).layers!;
    expect(L.map((l) => l.name)).toEqual(['Body', 'Hidden']);
    expect(L[0]!.description).toBe('solids');
    expect(L[0]!.visible).toBe(true);
    expect(L[0]!.meshIds).toEqual([s.meshes[0]!.id, s.meshes[2]!.id]);
    expect(L[1]!.visible).toBe(false);
    expect(L[1]!.meshIds).toEqual([s.meshes[1]!.id]);
  });

  it('사상 항목(MAPPED_ITEM)에 배정된 레이어는 그 아래 형상이 물려받는다, 레이어가 없으면 meta.layers 없음', () => {
    const w = new StepText();
    const ctx = w.context();
    const solid = cube(w, 5).solid;
    const src = w.add('ADVANCED_BREP_SHAPE_REPRESENTATION', `'src',(#${solid},#${w.ax2([0, 0, 0])}),#${ctx}`);
    const origin = w.ax2([0, 0, 0]);
    const map = w.add('REPRESENTATION_MAP', `#${origin},#${src}`);
    const m1 = w.add('MAPPED_ITEM', `'m1',#${map},#${w.ax2([0, 0, 0])}`);
    const m2 = w.add('MAPPED_ITEM', `'m2',#${map},#${w.ax2([10, 0, 0])}`);
    w.product('asm', [m1, m2], ctx, 'SHAPE_REPRESENTATION');
    w.add('PRESENTATION_LAYER_ASSIGNMENT', `'L2','',(#${m2})`);
    const s = stepToScene(w.bytes());
    expect(s.meshes).toHaveLength(2);
    expect(meta(s).layers).toEqual([{ name: 'L2', description: '', visible: true, meshIds: [s.meshes[1]!.id], lineIds: [] }]);

    const w2 = new StepText();
    w2.product('p', [cube(w2, 1).solid], w2.context());
    expect(meta(stepToScene(w2.bytes())).layers).toBeUndefined();
  });
});

describe('와이어프레임·곡선 형상', () => {
  function wireModel(extra?: (w: StepText, items: number[]) => void) {
    const w = new StepText();
    const ctx = w.context();
    const pl = polyline(w, [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
    ]);
    const circle = w.circle([0, 0, 5], 4);
    const quarter = w.add('TRIMMED_CURVE', `'',#${w.circle([0, 0, 20], 2)},(PARAMETER_VALUE(0.)),(PARAMETER_VALUE(${r(Math.PI / 2)})),.T.,.PARAMETER.`);
    const bs = w.add(
      'B_SPLINE_CURVE_WITH_KNOTS',
      `'',2,(${[
        [0, 0, 30],
        [5, 5, 30],
        [10, 0, 30],
      ]
        .map((p) => `#${w.pt(p as P3)}`)
        .join(',')}),.UNSPECIFIED.,.F.,.F.,(3,3),(0.,1.),.UNSPECIFIED.`,
    );
    const pt = w.pt([7, 7, 7]);
    const line = w.line([0, 0, 0], [0, 0, 1]); // 끝이 없는 직선
    const set = w.add('GEOMETRIC_CURVE_SET', `'set',(#${pl},#${circle},#${quarter},#${bs},#${pt},#${line})`);
    const items = [set];
    extra?.(w, items);
    w.product('wire', items, ctx, 'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION');
    return { w, set };
  }

  it('GEOMETRIC_CURVE_SET: 꺾은선·원·잘린 원·B-스플라인 → 선 묶음 하나, 점 → 점 묶음, 끝없는 직선은 경고', () => {
    const { w } = wireModel();
    const s = stepToScene(w.bytes());
    expect(s.meshes).toHaveLength(0);
    expect(s.lines).toHaveLength(1);
    expect(s.points).toHaveLength(1);
    expect(Array.from(s.points![0]!.positions)).toEqual([7, 7, 7]);
    const l = s.lines[0]!;
    expect(l.group).toBe('wire');
    const pts = segPoints(l);
    // 원(z=5) 위 점은 모두 반지름 4
    const onCircle = pts.filter((p) => Math.abs(p[2] - 5) < 1e-9);
    expect(onCircle.length).toBeGreaterThan(16);
    for (const p of onCircle) expect(Math.hypot(p[0], p[1])).toBeCloseTo(4, 5);
    // 잘린 원(z=20)은 첫 사분면만
    const quarter = pts.filter((p) => Math.abs(p[2] - 20) < 1e-9);
    expect(quarter.length).toBeGreaterThan(2);
    for (const p of quarter) {
      expect(p[0]).toBeGreaterThanOrEqual(-1e-9);
      expect(p[1]).toBeGreaterThanOrEqual(-1e-9);
    }
    // B-스플라인 끝점
    const bsp = pts.filter((p) => Math.abs(p[2] - 30) < 1e-9);
    expect(bsp.some((p) => Math.hypot(p[0] - 10, p[1]) < 1e-9)).toBe(true);
    expect(s.warnings!.some((x) => /끝이 없는 곡선.*1개/.test(x))).toBe(true);
    expect(s.warnings!.some((x) => /그릴 형상을 찾지 못했다/.test(x))).toBe(false);
    expect(s.bounds!.min[0]).toBeCloseTo(-4, 6);
    expect(s.bounds!.max[2]).toBeCloseTo(30, 6);
    const root = meta(s).products[0]!;
    expect(root.lineIds).toEqual([l.id, s.points![0]!.id]);
    expect(root.meshIds).toEqual([]);
  });

  it('선 색(CURVE_STYLE)은 색별로 묶음을 나누고, INVISIBILITY는 빼고, curves:false면 그리지 않는다', () => {
    const { w } = wireModel((w, items) => {
      const red = polyline(w, [
        [0, 0, 50],
        [1, 0, 50],
      ]);
      curveStyle(w, red, [1, 0, 0]);
      const gone = polyline(w, [
        [0, 0, 60],
        [1, 0, 60],
      ]);
      const sg = curveStyle(w, gone, [0, 1, 0]);
      w.add('INVISIBILITY', `(#${sg})`);
      items.push(red, gone);
    });
    const s = stepToScene(w.bytes());
    expect(s.lines).toHaveLength(2);
    const red = s.lines.find((l) => l.color)!;
    expect(red.color).toEqual([1, 0, 0, 1]);
    expect(red.positions.length).toBe(6);
    expect(segPoints(s.lines[0]!).some((p) => p[2] === 60)).toBe(false);
    const off = stepToScene(w.bytes(), { curves: false });
    expect(off.lines).toHaveLength(0);
    expect(off.points).toBeUndefined();
  });

  it('EDGE_BASED_WIREFRAME_MODEL·SHELL_BASED_WIREFRAME_MODEL과 조립 자리 변환', () => {
    const w = new StepText();
    const ctx = w.context();
    const v0 = w.vertex([0, 0, 0]);
    const v1 = w.vertex([10, 0, 0]);
    const e1 = w.edge(v0, v1, w.line([0, 0, 0], [10, 0, 0]));
    const v2 = w.vertex([5, 0, 0]);
    const arc = w.edge(v1, v2, w.circle([7.5, 0, 0], 2.5), true);
    const ces = w.add('CONNECTED_EDGE_SET', `'',(#${e1},#${arc})`);
    const ebwm = w.add('EDGE_BASED_WIREFRAME_MODEL', `'',(#${ces})`);
    const loop = w.add('POLY_LOOP', `'',(${[
      [0, 5, 0],
      [1, 5, 0],
      [1, 6, 0],
    ]
      .map((p) => `#${w.pt(p as P3)}`)
      .join(',')})`);
    const ws = w.add('WIRE_SHELL', `'',(#${loop})`);
    const sbwm = w.add('SHELL_BASED_WIREFRAME_MODEL', `'',(#${ws})`);
    const part = w.product('frame', [ebwm, sbwm], ctx, 'EDGE_BASED_WIREFRAME_SHAPE_REPRESENTATION');
    const p1 = w.ax2([0, 0, 0]);
    const p2 = w.ax2([100, 0, 0]);
    const root = w.product('asm', [p1, p2], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, p1, 'f1');
    w.place(root, part, p2, 'f2');
    const s = stepToScene(w.bytes());
    expect(s.lines).toHaveLength(2);
    const [a, b] = s.lines.map(segPoints);
    expect(a!.length).toBe(b!.length);
    for (let i = 0; i < a!.length; i++) {
      expect(b![i]![0]).toBeCloseTo(a![i]![0] + 100, 4);
      expect(b![i]![1]).toBeCloseTo(a![i]![1], 5);
    }
    // 호(10,0)→(5,0)은 반지름 2.5 반원, 꺾은선 고리는 닫힘(세 변)
    const arcPts = a!.filter((p) => p[1] < -1e-6 || (p[1] > 1e-6 && p[1] < 4));
    expect(arcPts.length).toBeGreaterThan(4);
    for (const p of arcPts) expect(Math.hypot(p[0] - 7.5, p[1])).toBeCloseTo(2.5, 5);
    expect(a!.filter((p) => p[1] >= 5).length).toBe(6);
    const kids = meta(s).products[0]!.children;
    expect(kids.map((k) => k.lineIds?.length)).toEqual([1, 1]);
  });

  it('B-rep과 같은 표현에 든 독립 곡선: 그물은 그대로, 선 묶음이 더해지고 범위가 넓어진다', () => {
    const w = new StepText();
    const ctx = w.context();
    const solid = cube(w, 10).solid;
    const c = w.circle([5, 5, 30], 3);
    w.product('mix', [solid, c], ctx, 'SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes());
    const plain = (() => {
      const w2 = new StepText();
      const ctx2 = w2.context();
      w2.product('mix', [cube(w2, 10).solid], ctx2, 'SHAPE_REPRESENTATION');
      return stepToScene(w2.bytes());
    })();
    expect(s.meshes).toHaveLength(1);
    expect(Array.from(s.meshes[0]!.positions)).toEqual(Array.from(plain.meshes[0]!.positions));
    expect(s.lines).toHaveLength(1);
    expect(s.bounds!.max[2]).toBeCloseTo(30, 9);
    expect(plain.bounds!.max[2]).toBeCloseTo(10, 9);
  });
});

describe('PMI', () => {
  function pmiModel(opts: { hideSecond?: boolean } = {}) {
    const w = new StepText();
    const ctx = w.context();
    const solid = cube(w, 10).solid;
    const part = w.product('part', [solid], ctx);
    const at = w.ax2([100, 0, 0]);
    const root = w.product('asm', [at], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'p1');
    // 표현 PMI: 주석 평면 안의 곡선 주석(빨강) + 삼각형 주석(꺾은선 + 채운 글자 두 삼각형)
    const pl = polyline(w, [
      [0, -2, 0],
      [10, -2, 0],
    ]);
    const red = w.add('COLOUR_RGB', `'',1.,0.,0.`);
    const font = w.add('DRAUGHTING_PRE_DEFINED_CURVE_FONT', `'continuous'`);
    const cs = w.add('CURVE_STYLE', `'',#${font},POSITIVE_LENGTH_MEASURE(0.1),#${red}`);
    const psa = w.add('PRESENTATION_STYLE_ASSIGNMENT', `(#${cs})`);
    const occ1 = w.add('ANNOTATION_CURVE_OCCURRENCE', `'linear dim',(#${psa}),#${pl}`);
    const coords = w.add('COORDINATES_LIST', `'',4,((0.,0.,12.),(2.,0.,12.),(2.,1.,12.),(0.,1.,12.))`);
    const tcs = w.add('TESSELLATED_CURVE_SET', `'',#${coords},((1,2,3))`);
    const tri = w.add('COMPLEX_TRIANGULATED_SURFACE_SET', `'',#${coords},4,(),(),(),((1,2,4,3))`);
    const tgs = w.add('TESSELLATED_GEOMETRIC_SET', `'',(#${tcs},#${tri})`);
    const occ2 = w.raw(`(ANNOTATION_OCCURRENCE() GEOMETRIC_REPRESENTATION_ITEM() REPRESENTATION_ITEM('note') STYLED_ITEM((#${psa}),#${tgs}) TESSELLATED_ANNOTATION_OCCURRENCE())`);
    const plane = w.add('ANNOTATION_PLANE', `'front plane',(#${psa}),#${w.plane([0, 0, 0])},(#${occ1})`);
    const dm = w.add('DRAUGHTING_MODEL', `'pmi model',(#${plane},#${occ2}),#${ctx}`);
    w.add('SHAPE_REPRESENTATION_RELATIONSHIP', `'','',#${dm},#${part.rep}`);
    if (opts.hideSecond) w.add('INVISIBILITY', `(#${occ2})`);
    // 의미 PMI
    const mm = w.raw(`(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))`);
    const pds = w.add('PRODUCT_DEFINITION_SHAPE', `'','',#${part.pd}`);
    const sa = w.add('SHAPE_ASPECT', `'hole','',#${pds},.T.`);
    const ds = w.add('DIMENSIONAL_SIZE', `#${sa},'diameter'`);
    const nominal = w.raw(`(LENGTH_MEASURE_WITH_UNIT() MEASURE_REPRESENTATION_ITEM() MEASURE_WITH_UNIT(LENGTH_MEASURE(25.),#${mm}) REPRESENTATION_ITEM('nominal value'))`);
    const sdr = w.add('SHAPE_DIMENSION_REPRESENTATION', `'',(#${nominal}),#${ctx}`);
    w.add('DIMENSIONAL_CHARACTERISTIC_REPRESENTATION', `#${ds},#${sdr}`);
    const lo = w.add('LENGTH_MEASURE_WITH_UNIT', `LENGTH_MEASURE(-0.05),#${mm}`);
    const hi = w.add('LENGTH_MEASURE_WITH_UNIT', `LENGTH_MEASURE(0.1),#${mm}`);
    const tv = w.add('TOLERANCE_VALUE', `#${lo},#${hi}`);
    w.add('PLUS_MINUS_TOLERANCE', `#${tv},#${ds}`);
    const mag = w.add('LENGTH_MEASURE_WITH_UNIT', `LENGTH_MEASURE(0.05),#${mm}`);
    w.add('FLATNESS_TOLERANCE', `'flat','',#${mag},#${sa}`);
    const da = w.add('DATUM', `'A','',#${pds},.F.,'A'`);
    const db = w.add('DATUM', `'B','',#${pds},.F.,'B'`);
    const c1 = w.add('DATUM_REFERENCE_COMPARTMENT', `'','',#${pds},.F.,#${da},$`);
    const c2 = w.add('DATUM_REFERENCE_COMPARTMENT', `'','',#${pds},.F.,#${db},$`);
    const dsys = w.add('DATUM_SYSTEM', `'','',#${pds},.F.,(#${c1},#${c2})`);
    const mag2 = w.add('LENGTH_MEASURE_WITH_UNIT', `LENGTH_MEASURE(0.1),#${mm}`);
    w.raw(`(GEOMETRIC_TOLERANCE('pos','',#${mag2},#${sa}) GEOMETRIC_TOLERANCE_WITH_DATUM_REFERENCE((#${dsys})) POSITION_TOLERANCE())`);
    return w;
  }

  it('표현 PMI: 주석 평면 안 곡선 주석과 삼각형 주석을 부품 자리에 선으로, 색·평면 이름', () => {
    const s = stepToScene(pmiModel().bytes());
    expect(s.meshes).toHaveLength(1);
    const P = meta(s).pmi!;
    expect(P.presentations.map((p) => [p.name, p.type, p.plane ?? '', p.model])).toEqual([
      ['linear dim', 'ANNOTATION_CURVE_OCCURRENCE', 'front plane', 'pmi model'],
      ['note', 'TESSELLATED_ANNOTATION_OCCURRENCE', '', 'pmi model'],
    ]);
    const l1 = s.lines.find((l) => l.id === P.presentations[0]!.id)!;
    expect(l1.color).toEqual([1, 0, 0, 1]);
    expect(l1.group).toBeUndefined();
    // 부품 자리(+100) 변환
    expect(Array.from(l1.positions)).toEqual([100, -2, 0, 110, -2, 0]);
    const l2 = s.lines.find((l) => l.id === P.presentations[1]!.id)!;
    // 꺾은선 2변 + 채운 사각형(두 삼각형) 윤곽 4변
    expect(l2.positions.length / 6).toBe(6);
    expect(segPoints(l2).every((p) => p[0] >= 100 && p[2] === 12)).toBe(true);
    expect(s.bounds!.min[1]).toBeCloseTo(-2, 9);
  });

  it('의미 PMI: 치수 값과 ± 공차, 기하 공차(크기·데이텀), 데이텀', () => {
    const s = stepToScene(pmiModel().bytes());
    const sem = meta(s).pmi!.semantic;
    expect(sem.map((x) => [x.kind, x.type, x.name, x.value])).toEqual([
      ['dimension', 'DIMENSIONAL_SIZE', 'diameter', '25 mm +0.1/-0.05'],
      ['tolerance', 'FLATNESS_TOLERANCE', 'flat', '0.05 mm'],
      ['tolerance', 'POSITION_TOLERANCE', 'pos', '0.1 mm | A|B'],
      ['datum', 'DATUM', 'A', 'A'],
      ['datum', 'DATUM', 'B', 'B'],
    ]);
  });

  it('INVISIBILITY 주석은 빼고, pmi:false면 PMI 없음', () => {
    const s = stepToScene(pmiModel({ hideSecond: true }).bytes());
    expect(meta(s).pmi!.presentations).toHaveLength(1);
    const off = stepToScene(pmiModel().bytes(), { pmi: false });
    expect(off.lines).toHaveLength(0);
    expect(meta(off).pmi).toBeUndefined();
    expect(off.meshes).toHaveLength(1);
  });
});

describe('면 표', () => {
  it('정육면체: 면 6개 · 삼각형 범위 · 평면 바깥 법선', () => {
    const w = new StepText();
    const ctx = w.context();
    const { solid, faces } = cube(w, 10);
    w.product('part', [solid], ctx);
    const s = stepToScene(w.bytes());
    const m = meta(s);
    expect(m.faceKinds).toEqual(FACE_KINDS);
    expect(Array.from(m.meshFaceTable!)).toEqual([0]);
    const t = m.faceTables![0]!;
    expect(Array.from(t.triStart)).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(Array.from(t.stepIds)).toEqual(faces);
    expect(Array.from(t.kinds).every((k) => FACE_KINDS[k] === 'plane')).toBe(true);
    const mesh = s.meshes[0]!;
    const P = mesh.positions;
    const I = mesh.indices!;
    for (let f = 0; f < 6; f++) {
      const n = Array.from(t.params.subarray(f * FACE_PARAMS + 2, f * FACE_PARAMS + 5));
      for (let tri = t.triStart[f]!; tri < t.triStart[f + 1]!; tri++) {
        const [a, b, c] = [I[tri * 3]! * 3, I[tri * 3 + 1]! * 3, I[tri * 3 + 2]! * 3];
        const u = [P[b]! - P[a]!, P[b + 1]! - P[a + 1]!, P[b + 2]! - P[a + 2]!];
        const v = [P[c]! - P[a]!, P[c + 1]! - P[a + 1]!, P[c + 2]! - P[a + 2]!];
        const cr = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        const l = Math.hypot(...cr);
        expect(cr[0]! / l).toBeCloseTo(n[0]!, 6);
        expect(cr[1]! / l).toBeCloseTo(n[1]!, 6);
        expect(cr[2]! / l).toBeCloseTo(n[2]!, 6);
      }
    }
  });

  it('원기둥: 평면 둘·원기둥 하나(반지름·축), 단위가 다른 부품은 매개변수도 장면 단위로, faceTable:false면 없음', () => {
    const w = new StepText();
    const mm = w.context('mm');
    const inch = w.context('inch');
    const part = w.product('pin', [cylinder(w, 1, 2)], inch);
    const at = w.ax2([0, 0, 0]);
    const root = w.product('asm', [at], mm, 'SHAPE_REPRESENTATION');
    w.place(root, part, at, 'pin-1');
    const s = stepToScene(w.bytes());
    expect(s.units).toBe('mm');
    const m = meta(s);
    const t = m.faceTables![m.meshFaceTable![0]!]!;
    expect(Array.from(t.kinds).map((k) => FACE_KINDS[k])).toEqual(['plane', 'plane', 'cylinder']);
    const o = 2 * FACE_PARAMS;
    expect(t.params[o]).toBeCloseTo(25.4, 4);
    expect(Array.from(t.params.subarray(o + 2, o + 5))).toEqual([0, 0, 1]);
    // 위 뚜껑 평면 바깥 법선 +Z(z=2in = 50.8mm)
    expect(Array.from(t.params.subarray(FACE_PARAMS + 2, FACE_PARAMS + 5))).toEqual([0, 0, 1]);
    expect(t.params[FACE_PARAMS + 7]).toBeCloseTo(50.8, 4);
    const off = meta(stepToScene(w.bytes(), { faceTable: false }));
    expect(off.faceTables).toBeUndefined();
    expect(off.meshFaceTable).toBeUndefined();
  });
});

describe('닫힌 입체(Mesh3d.closed)와 큰 좌표 묶음 원점(origin)', () => {
  it('닫힌 입체는 closed, 열린 껍질은 없음(양면 그리기는 그대로)', () => {
    const w = new StepText();
    const ctx = w.context();
    const solids = [cube(w, 10).solid, cylinder(w, 2, 5), sphereSolid(w), torusSolid(w), plateSolid(w)];
    const f = w.add('ADVANCED_FACE', `'',(#${w.bound(w.add('POLY_LOOP', `'',(#${w.pt([0, 0, 0])},#${w.pt([1, 0, 0])},#${w.pt([1, 1, 0])})`))}),#${w.plane([0, 0, 0])},.T.`);
    const open = w.add('OPEN_SHELL', `'',(#${f})`);
    const sbsm = w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${open})`);
    w.product('p', [...solids, sbsm], ctx, 'SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes());
    expect(s.meshes.map((m) => m.closed ?? false)).toEqual([true, true, true, true, true, false]);
    // 위상으로 정한 닫힘이 실제 삼각형 짝 검사와 같다
    expect(s.meshes.map((m) => isClosedMesh(m.positions, m.indices))).toEqual([true, true, true, true, true, false]);
    expect(s.meshes.map((m) => m.doubleSided)).toEqual([false, false, false, false, false, true]);
    expect(s.meshes.every((m) => m.origin === undefined)).toBe(true);
  });

  it('큰 좌표에 만든 부품: 원점을 빼서 담아 float32로도 정밀, 범위·면 표는 세계 좌표 그대로', () => {
    const w = new StepText();
    const ctx = w.context();
    const at: [number, number, number] = [1234567.891, 2345678.123, 100.5];
    const solid = cube(w, 10, at).solid;
    const wire = w.circle([at[0], at[1], 200], 3);
    w.product('far', [solid, wire], ctx, 'SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes());
    const m = s.meshes[0]!;
    expect(m.origin).toBeDefined();
    expect(m.origin![0]).toBeCloseTo(at[0] + 5, 6);
    expect(m.closed).toBe(true);
    let maxAbs = 0;
    for (const v of m.positions) maxAbs = Math.max(maxAbs, Math.abs(v));
    expect(maxAbs).toBeLessThanOrEqual(5 + 1e-6);
    // 꼭짓점 하나를 되살리면 원래 좌표와 1e-6 안(원점 없이 float32면 0.06 가까이 틀린다)
    const xs = new Set<number>();
    for (let i = 0; i < m.positions.length; i += 3) xs.add(m.positions[i]! + m.origin![0]);
    for (const x of xs) expect(Math.min(Math.abs(x - at[0]), Math.abs(x - at[0] - 10))).toBeLessThan(1e-6);
    expect(s.bounds!.min[0]).toBeCloseTo(at[0] - 3, 3);
    expect(s.bounds!.max[1]).toBeCloseTo(at[1] + 10, 3);
    // 선 묶음도 원점
    const l = s.lines[0]!;
    expect(l.origin).toBeDefined();
    expect(Math.abs(l.positions[0]!)).toBeLessThan(10);
    // 면 표 점 매개변수도 원점 기준(윗면 원점 z)
    const t = (s.meta as unknown as StepMeta).faceTables![0]!;
    expect(t.params[FACE_PARAMS + 7]! + m.origin![2]).toBeCloseTo(at[2] + 10, 4);
  });

  it('작은 부품을 큰 자리 변환으로 놓은 조립은 원점이 필요 없다(행렬은 double)', () => {
    const w = new StepText();
    const ctx = w.context();
    const part = w.product('c', [cube(w, 10).solid], ctx);
    const p = w.ax2([5e6, 0, 0]);
    const root = w.product('asm', [p], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, p, 'c1');
    const s = stepToScene(w.bytes());
    expect(s.meshes[0]!.origin).toBeUndefined();
    expect(isClosedMesh(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))).toBe(false); // 삼각형 하나는 열림
    expect(s.meshes[0]!.matrix![12]).toBe(5e6);
    expect(s.bounds!.min[0]).toBe(5e6);
  });
});

function sphereSolid(w: StepText): number {
  const R = 3;
  const S = w.vertex([20, 0, -R]);
  const Nn = w.vertex([20, 0, R]);
  const E = w.edge(S, Nn, w.circle([20, 0, 0], R, [0, -1, 0], [1, 0, 0]));
  const surf = w.add('SPHERICAL_SURFACE', `'',#${w.ax2([20, 0, 0])},${r(R)}`);
  return w.solid([w.face([w.bound(w.loop([w.oe(E, true), w.oe(E, false)]))], surf)], 'sphere');
}

function torusSolid(w: StepText): number {
  const R = 4;
  const rr = 1;
  const c: P3 = [40, 0, 0];
  const V = w.vertex([c[0] + R + rr, 0, 0]);
  const Q = w.edge(V, V, w.circle(c, R + rr));
  const M = w.edge(V, V, w.circle([c[0] + R, 0, 0], rr, [0, -1, 0], [1, 0, 0]));
  const surf = w.add('TOROIDAL_SURFACE', `'',#${w.ax2(c)},${r(R)},${r(rr)}`);
  return w.solid([w.face([w.bound(w.loop([w.oe(Q, true), w.oe(M, true), w.oe(Q, false), w.oe(M, false)]))], surf)], 'torus');
}

function plateSolid(w: StepText): number {
  return plateWithHole(w, 'plate');
}
