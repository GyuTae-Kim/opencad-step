/**
 * 57차 해석기 퍼징(로컬 실제 표본 30개 × 바꾸기 13종, 16,588번 + 손으로 만든 악의적 입력 24개)에서 찾은 결함의 최소 재현(합성 STEP 글).
 * 고치기 전에는 예외로 파일 전체를 못 열거나(잡히지 않은 TypeError·RangeError), 끝없이 멈추거나, 메모리가 수 GB까지 불었다.
 * 시간 한도는 넉넉히(고치기 전에는 끝나지 않거나 수십 초) — 고친 뒤 이 기계에서 모두 수십 ms 안쪽이다.
 */
import { describe, expect, it } from 'vitest';
import { parseStepFile } from '../src/app/job';
import { BrepMesher } from '../src/brep';
import { MAX_COORD } from '../src/geometry';
import { MAX_DEGREE } from '../src/nurbs';
import { MAX_PLACEMENTS, partErrorHook, stepToScene, type StepMeta } from '../src/scene';
import { cube, type P3, r, StepText } from './stepText';

const enc = (t: string) => new TextEncoder().encode(t);

/** 잰 시간(ms)과 결과 */
function timed<T>(fn: () => T): [T, number] {
  const t0 = performance.now();
  const v = fn();
  return [v, performance.now() - t0];
}

/** 위치·그물·선의 좌표가 모두 유한한지 */
function finite(s: ReturnType<typeof stepToScene>): boolean {
  const ok = (a: ArrayLike<number> | undefined) => !a || Array.from(a).every(Number.isFinite);
  return s.meshes.every((m) => ok(m.positions) && ok(m.origin) && ok(m.matrix)) && s.lines.every((l) => ok(l.positions) && ok(l.origin));
}

const stats = (s: ReturnType<typeof stepToScene>) => (s.meta as unknown as StepMeta).stats;

/** 정육면체 하나 글(번호를 바꿔 깨뜨리는 시험의 바탕) */
function cubeText(): string {
  const w = new StepText();
  w.product('block', [cube(w, 10).solid], w.context());
  return w.toString();
}

describe('순환·자기 참조(끝없는 재귀·고리)', () => {
  it('VERTEX_POINT가 자기를 가리켜도 예외 없이 그 꼭짓점만 읽지 못한다(전: point 무한 재귀 → 파일 전체 RangeError)', () => {
    const t = cubeText();
    const v = /#(\d+)=VERTEX_POINT\('',#(\d+)\);/.exec(t)!;
    const broken = t.replace(v[0], `#${v[1]}=VERTEX_POINT('',#${v[1]});`);
    const [s, ms] = timed(() => stepToScene(enc(broken)));
    expect(ms).toBeLessThan(2000);
    expect(stats(s).failedFaces).toBeGreaterThan(0);
    expect(stats(s).faces).toBe(6);
  });

  it('ORIENTED_EDGE가 자기를 가리키는 고리도 끝난다(전: 모서리 벗기기 while이 끝나지 않음)', () => {
    const t = cubeText();
    const oe = /#(\d+)=ORIENTED_EDGE\('',\*,\*,#(\d+),\.T\.\);/.exec(t)!;
    const broken = t.replace(oe[0], `#${oe[1]}=ORIENTED_EDGE('',*,*,#${oe[1]},.T.);`);
    const [s, ms] = timed(() => stepToScene(enc(broken)));
    expect(ms).toBeLessThan(2000);
    expect(stats(s).faces).toBe(6);
  });

  it('양식 목록이 서로를 가리켜도 색 읽기가 곧 끝난다(전: 깊이 8까지 목록 길이의 거듭제곱)', () => {
    const w = new StepText();
    const ctx = w.context();
    const solid = cube(w, 10).solid;
    w.product('block', [solid], ctx);
    w.color(solid, [1, 0, 0]);
    // PRESENTATION_STYLE_ASSIGNMENT 목록에 자기와 STYLED_ITEM을 수천 번 되풀이해 넣는다
    let t = w.toString();
    const psa = /#(\d+)=PRESENTATION_STYLE_ASSIGNMENT\(\(#(\d+)\)\);/.exec(t)!;
    const many = Array.from({ length: 3000 }, () => `#${psa[1]},#${psa[2]}`).join(',');
    t = t.replace(psa[0], `#${psa[1]}=PRESENTATION_STYLE_ASSIGNMENT((${many}));`);
    const [s, ms] = timed(() => stepToScene(enc(t)));
    expect(ms).toBeLessThan(3000);
    // 순환은 끊고 실제 색은 그대로
    expect(Array.from(s.meshes[0]!.color!).slice(0, 3)).toEqual([1, 0, 0]);
  });

  it('사상 항목(MAPPED_ITEM)이 자기 표현을 두 번 비춰도 한 번만 놓는다(전: 깊이 32까지 2³²번)', () => {
    const w = new StepText();
    const ctx = w.context();
    const o = w.ax2([0, 0, 0]);
    const solid = cube(w, 1).solid;
    const repId = 900000;
    const map = w.add('REPRESENTATION_MAP', `#${o},#${repId}`);
    const m1 = w.add('MAPPED_ITEM', `'',#${map},#${w.ax2([2, 0, 0])}`);
    const m2 = w.add('MAPPED_ITEM', `'',#${map},#${w.ax2([0, 2, 0])}`);
    const t = w.toString().replace('ENDSEC;\nEND-ISO-10303-21;', `#${repId}=SHAPE_REPRESENTATION('self',(#${solid},#${m1},#${m2},#${o}),#${ctx});\nENDSEC;\nEND-ISO-10303-21;`);
    const [s, ms] = timed(() => stepToScene(enc(t)));
    expect(ms).toBeLessThan(2000);
    expect(s.meshes).toHaveLength(1);
  });
});

describe('지수로 불어나는 조립(같은 하위 조립을 층마다 두 번)', () => {
  /** 제품 P0..Pd, 층마다 다음 층 같은 제품을 두 번 놓는다 — 자리 2^d */
  function dag(depth: number): Uint8Array {
    const w = new StepText();
    const ctx = w.context();
    let child = w.product('leaf', [cube(w, 1).solid], ctx);
    for (let d = 0; d < depth; d++) {
      const p = w.product(`p${d}`, [], ctx);
      for (let j = 0; j < 2; j++) w.place(p, child, w.ax2([j * 2, 0, 0]), `u${d}_${j}`);
      child = p;
    }
    return w.bytes();
  }

  it('깊이 10(1,024 자리)은 그대로 다 놓는다', () => {
    const s = stepToScene(dag(10));
    expect(s.meshes).toHaveLength(1024);
    expect(s.warnings ?? []).toEqual([]);
  });

  it('깊이 31(자리 20억)은 MAX_PLACEMENTS에서 멈추고 경고(전: 해석기만 2.5 GB를 넘어 멈춤)', () => {
    const [s, ms] = timed(() => stepToScene(dag(31), { faceTable: false, props: false }));
    expect(ms).toBeLessThan(20_000);
    expect(s.meshes.length).toBeLessThan(MAX_PLACEMENTS);
    // 자리는 제품 나무 마디·표현·그물을 함께 센다 — 부품 하나에 셋쯤
    expect(s.meshes.length).toBeGreaterThan(MAX_PLACEMENTS / 10);
    expect(s.warnings).toContain(`조립 자리가 ${MAX_PLACEMENTS}개를 넘어 나머지는 놓지 않았다(같은 하위 조립을 층마다 거듭 쓴 파일일 수 있음)`);
  });

  it('끝의 형상을 읽지 못해 그물이 생기지 않는 깨진 깊이 31 조립도 따라가는 표현을 세어 멈춘다(퍼징 둘째 판: 20초 넘게 멈춤)', () => {
    // 맨 아래 정육면체의 닫힌 껍질을 지워 그물이 하나도 생기지 않게 한다
    const t = new TextDecoder().decode(dag(31)).replace(/#\d+=CLOSED_SHELL\([^;]*;\n/, '');
    const [s, ms] = timed(() => stepToScene(enc(t), { faceTable: false, props: false }));
    expect(ms).toBeLessThan(20_000);
    expect(s.meshes).toHaveLength(0);
    expect(s.warnings).toContain(`조립 자리가 ${MAX_PLACEMENTS}개를 넘어 나머지는 놓지 않았다(같은 하위 조립을 층마다 거듭 쓴 파일일 수 있음)`);
  });
});

describe('극값 숫자·터무니없는 크기', () => {
  /** 선 형상 묶음 하나(곡선들) */
  function wires(build: (w: StepText) => number[]): Uint8Array {
    const w = new StepText();
    const ctx = w.context();
    const set = w.add('GEOMETRIC_CURVE_SET', `'',(${build(w).map((x) => `#${x}`).join(',')})`);
    w.product('wires', [set], ctx, 'GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION');
    return w.bytes();
  }
  const polyline = (w: StepText) => w.add('POLYLINE', `'',(${[w.pt([0, 0, 0]), w.pt([1, 0, 0]), w.pt([1, 1, 0])].map((x) => `#${x}`).join(',')})`);
  const trimmed = (w: StepText, basis: number, a: string, b: string) => w.add('TRIMMED_CURVE', `'',#${basis},(PARAMETER_VALUE(${a})),(PARAMETER_VALUE(${b})),.T.,.PARAMETER.`);

  it.each([
    ['-1.E300', '1.E300'],
    ['0.', '1.E9'],
    ['1.E999', '-1.E999'],
  ])('꺾은선을 매개변수 %s ~ %s로 자른 곡선: 곧 끝나고 좌표가 유한하다(전: 점 10억 개·무한 → 메모리 폭발·TypeError)', (a, b) => {
    const [s, ms] = timed(() => stepToScene(wires((w) => [trimmed(w, polyline(w), a, b)])));
    expect(ms).toBeLessThan(2000);
    expect(finite(s)).toBe(true);
    // 정상 구간 안으로 잘린 곡선은 그대로 그린다
    expect(s.lines.length).toBe(1);
  });

  it('원 둘레를 매개변수 1E25로 자른 곡선도 곧 끝난다(주기의 16배 넘게 먼 값은 한 주기 안으로)', () => {
    const [s, ms] = timed(() => stepToScene(wires((w) => [trimmed(w, w.circle([0, 0, 0], 5), '1.E25', '3.E25')])));
    expect(ms).toBeLessThan(2000);
    expect(finite(s)).toBe(true);
  });

  const bspline = (deg: string, mult: string) =>
    wires((w) => [w.add('B_SPLINE_CURVE_WITH_KNOTS', `'',${deg},(#${w.pt([0, 0, 0])},#${w.pt([1, 1, 0])}),.UNSPECIFIED.,.F.,.F.,${mult},(0.,1.),.UNSPECIFIED.)`)]);

  it.each([
    ['1000000000', '(2,2)'],
    ['1', '(1000000000,1000000000)'],
    ['1', '(1000000,1000000)'],
  ])('B-스플라인 곡선 차수 %s·매듭 겹침 %s: 곡선만 읽지 못하고 곧 끝난다(전: 20초 넘게 멈춤 또는 3 GB)', (deg, mult) => {
    const [s, ms] = timed(() => stepToScene(bspline(deg, mult)));
    expect(ms).toBeLessThan(2000);
    expect(s.lines).toHaveLength(0);
  });

  it('차수는 1~MAX_DEGREE만 읽는다', () => {
    expect(stepToScene(bspline('1', '(2,2)')).lines).toHaveLength(1);
    expect(stepToScene(bspline(String(MAX_DEGREE + 1), '(2,2)')).lines).toHaveLength(0);
  });

  it('좌표 100만 개짜리 DIRECTION도 앞 셋만 읽는다(퍼징 둘째 판: 좌표틀마다 통째로 옮겨 13초)', () => {
    const t = cubeText().replace("DIRECTION('',(0.,0.,1.))", `DIRECTION('',(0.,0.,1.,${Array.from({ length: 1_000_000 }, () => '0.').join(',')}))`);
    expect(t.length).toBeGreaterThan(3_000_000);
    const [s, ms] = timed(() => stepToScene(enc(t)));
    expect(ms).toBeLessThan(3000);
    expect(stats(s).failedFaces).toBe(0);
  });

  it('좌표 9e15인 꼭짓점: T자 이음 고치기의 칸 고리가 끝난다(퍼징 둘째 판: 칸 번호가 2^53을 넘어 칸++가 그대로 — 멈춤)', () => {
    const t = cubeText().replace("CARTESIAN_POINT('',(10.,10.,10.))", "CARTESIAN_POINT('',(10.,9007199254740993.,10.))");
    expect(t).toContain('9007199254740993');
    const [s, ms] = timed(() => stepToScene(enc(t)));
    expect(ms).toBeLessThan(2000);
    expect(finite(s)).toBe(true);
  });

  it('번호가 2^32를 넘는 문장은 문법 오류로 건너뛴다(32비트 색인에서 다른 번호로 접히지 않게)', () => {
    const s = stepToScene(enc(cubeText().replace(/#(\d+)=/g, (_, d) => `#${BigInt(d) + 4294967296n}=`)));
    expect(s.warnings?.[0]).toMatch(/^문법 오류로 건너뛴 문장 \d+개$/);
    expect(s.meshes).toHaveLength(0);
  });

  it('꼭짓점 좌표 1E300: 그 꼭짓점만 읽지 못하고 화면으로 가는 좌표는 모두 유한하다(전: float32 무한 → 경계 상자·카메라가 깨짐)', () => {
    const t = cubeText().replace("CARTESIAN_POINT('',(10.,10.,10.))", "CARTESIAN_POINT('',(1.E300,10.,10.))");
    expect(t).toContain('1.E300');
    const s = stepToScene(enc(t));
    expect(finite(s)).toBe(true);
    expect(stats(s).failedFaces).toBe(3);
    expect(MAX_COORD).toBeLessThan(3.4e38);
  });

  it.each([
    ['1.', true],
    ['0.', false],
  ])('유리 B-스플라인 곡면 무게 %s: 0이면 곡면을 읽지 못하고 NaN 좌표가 없다(전: 동차 좌표를 0으로 나눔)', (weight, readable) => {
    const w = new StepText();
    const ctx = w.context();
    // 비틀린 쌍선형 조각(네 귀퉁이가 한 평면에 있지 않다 — 곡면을 못 읽으면 평면으로 대신 그릴 수 없다)
    const C: P3[] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 5],
    ];
    const P = [C[0]!, C[1]!, C[3]!, C[2]!].map((p) => w.pt(p));
    const surf = w.raw(
      `(BOUNDED_SURFACE() B_SPLINE_SURFACE(1,1,((#${P[0]},#${P[1]}),(#${P[2]},#${P[3]})),.UNSPECIFIED.,.F.,.F.,.F.) B_SPLINE_SURFACE_WITH_KNOTS((2,2),(2,2),(0.,1.),(0.,1.),.UNSPECIFIED.) GEOMETRIC_REPRESENTATION_ITEM() RATIONAL_B_SPLINE_SURFACE(((1.,${weight}),(1.,1.))) REPRESENTATION_ITEM('') SURFACE())`,
    );
    const V = C.map((p) => w.vertex(p));
    const es = C.map((p, i) => w.edge(V[i]!, V[(i + 1) % 4]!, w.line(p, C[(i + 1) % 4]!)));
    const face = w.face([w.bound(w.loop(es.map((e) => w.oe(e, true))))], surf);
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('patch', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes());
    expect(finite(s)).toBe(true);
    // 무게가 맞으면 곡면으로 그리고, 0이면 곡면을 읽지 못한 면(평평하지 않은 고리라 실패)
    expect(stats(s).failedFaces).toBe(readable ? 0 : 1);
  });
});

describe('깨진 경계(끊긴 파일·같은 모서리 되풀이)', () => {
  it('원기둥 반쪽 면 테두리 호의 자리(AXIS2_PLACEMENT_3D)가 가리키는 점이 없으면 그 호를 읽지 못한 것으로 — 원점의 엉뚱한 원으로 면을 잘게 나누지 않는다(퍼징: 끊긴 실제 파일에서 면 하나 삼각형 30만 개·13초)', () => {
    // 원점에서 먼 원기둥(중심 (-7, 27), 반지름 1, 높이 1)의 반쪽 면: 호 둘 + 직선 둘
    const w = new StepText();
    const ctx = w.context();
    const c: P3 = [-7, 27, 0];
    const at = (a: number, z: number): P3 => [c[0] + Math.cos(a), c[1] + Math.sin(a), z];
    const A = w.vertex(at(0, 0));
    const B = w.vertex(at(Math.PI, 0));
    const C = w.vertex(at(Math.PI, 1));
    const D = w.vertex(at(0, 1));
    const e1 = w.edge(A, B, w.circle(c, 1));
    const e2 = w.edge(B, C, w.line(at(Math.PI, 0), at(Math.PI, 1)));
    const e3 = w.edge(D, C, w.circle([c[0], c[1], 1], 1));
    const e4 = w.edge(A, D, w.line(at(0, 0), at(0, 1)));
    const surf = w.add('CYLINDRICAL_SURFACE', `'',#${w.ax2(c)},${r(1)}`);
    const face = w.face([w.bound(w.loop([w.oe(e1, true), w.oe(e2, true), w.oe(e3, false), w.oe(e4, false)]))], surf);
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('half', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    const t = w.toString();
    const ok = stepToScene(enc(t));
    expect(stats(ok).failedFaces).toBe(0);
    // 두 호의 자리가 가리키는 원점 점을 지운다(끊긴 파일처럼)
    let broken = t;
    for (const m of t.matchAll(/#\d+=CIRCLE\('',#(\d+),/g)) {
      const ax = new RegExp(`#${m[1]}=AXIS2_PLACEMENT_3D\\('',#(\\d+),`).exec(t)!;
      broken = broken.replace(new RegExp(`#${ax[1]}=CARTESIAN_POINT[^;]*;\\n`), '');
    }
    expect(broken.length).toBeLessThan(t.length);
    const [s, ms] = timed(() => stepToScene(enc(broken)));
    expect(ms).toBeLessThan(2000);
    expect(finite(s)).toBe(true);
    expect(stats(s).triangles).toBeLessThan(Math.max(4 * stats(ok).triangles, 2000));
  });

  it('경계 고리가 같은 모서리를 수천 번 되풀이하면 그 면만 실패로(전: 다각형 하나로 삼각화하느라 멈춤)', () => {
    const t = cubeText();
    const loop = /#(\d+)=EDGE_LOOP\('',\((#[^)]*)\)\);/.exec(t)!;
    const many = Array.from({ length: 20000 }, () => loop[2]).join(',');
    const [s, ms] = timed(() => stepToScene(enc(t.replace(loop[0], `#${loop[1]}=EDGE_LOOP('',(${many}));`))));
    expect(ms).toBeLessThan(3000);
    expect(stats(s).failedFaces).toBe(1);
    expect(s.warnings?.some((x) => x.includes('경계 고리가 같은 모서리를 두 번 넘게 지남 1'))).toBe(true);
  });

  it('경계 모서리 개체가 없는 면은 실패로 적는다(남은 모서리로 틀린 모양을 그리지 않는다)', () => {
    const t = cubeText();
    const ec = /#(\d+)=EDGE_CURVE\([^;]*;\n/.exec(t)!;
    const s = stepToScene(enc(t.replace(ec[0], '')));
    expect(stats(s).failedFaces).toBe(2);
    expect(s.warnings?.some((x) => x.includes('경계 모서리를 읽지 못함(가리키는 개체가 없거나 값이 잘못됨) 2'))).toBe(true);
  });
});

describe('덧붙은 부분의 예외는 그 부분만 뺀다', () => {
  it('PMI 주석의 제도 모형이 없어도 예외 없이 연다(전: place()의 TypeError로 파일 전체 실패)', async () => {
    const { sampleStepText } = await import('../src/app/sample');
    const t = sampleStepText();
    const dm = /#(\d+)=DRAUGHTING_MODEL\(/.exec(t)!;
    const broken = t.replace(new RegExp(`#${dm[1]}=DRAUGHTING_MODEL\\([^;]*;\\n`), '');
    expect(broken.length).toBeLessThan(t.length);
    const res = await parseStepFile('sample.stp', enc(broken));
    expect(res.scene.meshes.length).toBeGreaterThan(0);
  });

  it('형상 항목 하나를 읽다가 예외가 나면 그 항목만 빼고 연다 — 갈고리로 알리고 경고 "읽지 못해 뺀 부분"을 남긴다', () => {
    const w = new StepText();
    const ctx = w.context();
    w.product('two', [cube(w, 1).solid, cube(w, 1, [3, 0, 0], 'b').solid], ctx);
    const bytes = w.bytes();
    expect(stepToScene(bytes).meshes).toHaveLength(2);
    const caught: unknown[] = [];
    const orig = BrepMesher.prototype.meshItem;
    let calls = 0;
    BrepMesher.prototype.meshItem = function (this: BrepMesher, ...args: Parameters<typeof orig>) {
      if (calls++ === 0) throw new RangeError('시험용 예외');
      return orig.apply(this, args);
    };
    partErrorHook.onError = (e) => caught.push(e);
    try {
      const s = stepToScene(bytes);
      expect(s.meshes).toHaveLength(1);
      expect(caught).toHaveLength(1);
      expect(s.warnings).toContain('읽지 못해 뺀 부분 1곳(형상·선·PMI·색·레이어·속성 — 읽다가 오류가 났거나 좌표가 잘못됨)');
    } finally {
      BrepMesher.prototype.meshItem = orig;
      partErrorHook.onError = undefined;
    }
  });
});
