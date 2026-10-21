/**
 * 예제 STEP 모형: 우리가 직접 만드는 합성 조립(외부 파일 없음, 수 KB).
 *
 *   OpenCAD 예제 조립
 *   ├ 받침판(구멍 뚫린 20×10×2 판, 파랑)
 *   ├ 블록 · 블록-1, 블록 · 블록-2(같은 부품 두 번, 하나는 45° 돌림, 초록)
 *   └ 핀 묶음(하위 조립)
 *     ├ 핀(구멍을 지나는 원기둥, 주황)
 *     └ 고리(원환, 금색)
 *
 * 평면·원기둥·원환 곡면, 구멍 있는 면, 조립 변환, 인스턴스, 색, 한글 이름(\X2\ 부호)을 함께 보여 주고,
 * 레이어 셋(본체·체결 부품·PMI 주석)과 받침판의 PMI(폭 치수·구멍 지름 지시선 — 표현 PMI 선, 의미 PMI 치수·공차·데이텀)도 넣었다.
 * 부품마다 재질 이름·밀도(PROPERTY_DEFINITION), 받침판은 설명과 사용자 속성(Finish)을 둔다(속성·질량 보기).
 * 의미 PMI는 모양 측면 → 면(GEOMETRIC_ITEM_SPECIFIC_USAGE)으로 판 면에 잇고, 글 주석(TEXT_LITERAL)과 저장된 보기(CAMERA_MODEL_D3)도 하나씩 둔다.
 */
import { cube, cylinder, type P3, plateWithHole, r, StepText, stepString as s, torus } from './stepText';

/** 획 글자(높이 1, 왼쪽 아래 원점, z=0 평면): 숫자와 지름 기호만 */
const GLYPHS: Record<string, [number, number][][]> = {
  '0': [
    [
      [0, 0],
      [0.6, 0],
      [0.6, 1],
      [0, 1],
      [0, 0],
    ],
  ],
  '2': [
    [
      [0, 1],
      [0.6, 1],
      [0.6, 0.5],
      [0, 0.5],
      [0, 0],
      [0.6, 0],
    ],
  ],
  '4': [
    [
      [0.45, 0],
      [0.45, 1],
      [0, 0.35],
      [0.65, 0.35],
    ],
  ],
  Ø: [
    [
      [0.3, 0.05],
      [0.55, 0.2],
      [0.6, 0.5],
      [0.55, 0.8],
      [0.3, 0.95],
      [0.05, 0.8],
      [0, 0.5],
      [0.05, 0.2],
      [0.3, 0.05],
    ],
    [
      [-0.05, -0.05],
      [0.65, 1.05],
    ],
  ],
};

/** 글을 획 꺾은선들로(x0,y0에서 높이 hgt, z 높이) */
function strokes(text: string, x0: number, y0: number, z: number, hgt: number): P3[][] {
  const out: P3[][] = [];
  let x = x0;
  for (const ch of text) {
    for (const g of GLYPHS[ch] ?? []) out.push(g.map(([u, v]) => [x + u * hgt, y0 + v * hgt, z]));
    x += hgt * 0.85;
  }
  return out;
}

export const SAMPLE_NAME = 'opencad-sample.stp';

/** 예제 STEP 글 */
export function sampleStepText(): string {
  const w = new StepText();
  const ctx = w.context('mm');

  // ── 부품 ──
  // 판 면: 바닥·윗면·앞·뒤·왼쪽·오른쪽·구멍 벽(의미 PMI가 가리킨다)
  const plateFaces: number[] = [];
  const plateSolid = plateWithHole(w, '', plateFaces);
  const plateStyle = w.color(plateSolid, [0.46, 0.58, 0.71]);
  const plate = w.product(s('받침판'), [plateSolid], ctx, undefined, s('구멍 뚫린 받침판 20 × 10 × 2'));
  w.textProperty(plate.pd, 'material property', 'material name', 'Aluminium 6061', ctx);
  w.density(plate.pd, 2700, ctx);
  w.textProperty(plate.pd, 'user defined attribute', 'Finish', 'Anodized', ctx);

  const blockSolid = cube(w, 3, [0, 0, 0], '').solid;
  w.color(blockSolid, [0.36, 0.69, 0.47]);
  const block = w.product(s('블록'), [blockSolid], ctx);
  w.textProperty(block.pd, 'material property', 'material name', 'Steel S45C', ctx);
  w.density(block.pd, 7850, ctx);

  const pinSolid = cylinder(w, 1.6, 7, '');
  w.color(pinSolid, [0.93, 0.55, 0.22]);
  const pin = w.product(s('핀'), [pinSolid], ctx);
  w.textProperty(pin.pd, 'material property', 'material name', 'Steel S45C', ctx);
  w.density(pin.pd, 7850, ctx);

  const ringSolid = torus(w, 2.6, 0.5, '');
  w.color(ringSolid, [0.86, 0.71, 0.27]);
  const ring = w.product(s('고리'), [ringSolid], ctx);
  w.textProperty(ring.pd, 'material property', 'material name', 'Brass C3604', ctx);
  w.density(ring.pd, 8500, ctx);

  // ── 받침판 PMI: 폭 치수(앞쪽 바닥 평면)와 구멍 지름 지시선(윗면) ──
  const poly = (pts: P3[]) => w.add('POLYLINE', `'',(${pts.map((p) => `#${w.pt(p)}`).join(',')})`);
  const pmiColour = w.add('COLOUR_RGB', `'',0.85,0.2,0.15`);
  const font = w.add('DRAUGHTING_PRE_DEFINED_CURVE_FONT', `'continuous'`);
  const curveStyle = w.add('CURVE_STYLE', `'',#${font},POSITIVE_LENGTH_MEASURE(0.1),#${pmiColour}`);
  const pmiStyle = w.add('PRESENTATION_STYLE_ASSIGNMENT', `(#${curveStyle})`);
  const annotation = (name: string, polys: P3[][]) => {
    const set = w.add('GEOMETRIC_CURVE_SET', `'',(${polys.map((pl) => `#${poly(pl)}`).join(',')})`);
    return w.add('ANNOTATION_CURVE_OCCURRENCE', `'${s(name)}',(#${pmiStyle}),#${set}`);
  };
  const a = 0.6; // 화살촉
  const widthDim = annotation('폭 20', [
    [
      [0, -0.3, 0],
      [0, -3.6, 0],
    ],
    [
      [20, -0.3, 0],
      [20, -3.6, 0],
    ],
    [
      [0, -3, 0],
      [20, -3, 0],
    ],
    [
      [a, -3 + a * 0.4, 0],
      [0, -3, 0],
      [a, -3 - a * 0.4, 0],
    ],
    [
      [20 - a, -3 + a * 0.4, 0],
      [20, -3, 0],
      [20 - a, -3 - a * 0.4, 0],
    ],
    ...strokes('20', 9.4, -2.7, 0, 1.2),
  ]);
  const holeDim = annotation('구멍 지름 4', [
    [
      [11.414, 6.414, 2],
      [14.5, 9.5, 2],
      [17.5, 9.5, 2],
    ],
    [
      [11.414 + 0.55, 6.414 + 0.15, 2],
      [11.414, 6.414, 2],
      [11.414 + 0.15, 6.414 + 0.55, 2],
    ],
    ...strokes('Ø4', 14.9, 9.75, 2, 1),
  ]);
  // 글 주석(TEXT_LITERAL — 내장 획 글꼴로 그린다): 높이 0.8, 윗면 위
  const textFont = w.add('DRAUGHTING_PRE_DEFINED_TEXT_FONT', `'ISO 3098'`);
  const textChar = w.add('TEXT_STYLE_FOR_DEFINED_FONT', `#${pmiColour}`);
  const textStyle = w.add('TEXT_STYLE_WITH_BOX_CHARACTERISTICS', `'',#${textChar},(BOX_HEIGHT(0.8),BOX_WIDTH(0.6))`);
  const textPsa = w.add('PRESENTATION_STYLE_ASSIGNMENT', `(#${textStyle})`);
  const noteText = w.add('TEXT_LITERAL', `'${s('메모')}','DEBURR ALL EDGES 0.2',#${w.ax2([1, 8.6, 2])},'baseline left',.RIGHT.,#${textFont}`);
  const note = w.add('ANNOTATION_TEXT_OCCURRENCE', `'${s('메모')}',(#${textPsa}),#${noteText}`);
  const frontPlane = w.add('ANNOTATION_PLANE', `'${s('바닥 평면')}',(#${pmiStyle}),#${w.plane([0, 0, 0])},(#${widthDim})`);
  const topPlane = w.add('ANNOTATION_PLANE', `'${s('윗면')}',(#${pmiStyle}),#${w.plane([0, 0, 2])},(#${holeDim},#${note})`);
  const dm = w.add('DRAUGHTING_MODEL', `'${s('받침판 PMI')}',(#${frontPlane},#${topPlane}),#${ctx}`);
  w.add('SHAPE_REPRESENTATION_RELATIONSHIP', `'','',#${dm},#${plate.rep}`);
  // 저장된 보기: 위에서 내려다보는 평행 투영(보기 창 24 × 14, 판 가운데)
  const win2d = w.add('AXIS2_PLACEMENT_2D', `'',#${w.add('CARTESIAN_POINT', `'',(-12.,-7.)`)},#${w.add('DIRECTION', `'',(1.,0.)`)}`);
  const win = w.add('PLANAR_BOX', `'',24.,14.,#${win2d}`);
  const vol = w.add('VIEW_VOLUME', `.PARALLEL.,#${w.pt([0, 0, 60])},60.,60.,.F.,0.,.F.,.F.,#${win}`);
  const cam = w.add('CAMERA_MODEL_D3', `'${s('윗면 보기')}',#${w.ax2([10, 5, 2], [0, 0, 1], [1, 0, 0])},#${vol}`);
  w.add('CAMERA_USAGE', `#${cam},#${dm}`);
  // 의미 PMI: 폭 20 ±0.1, 구멍 지름 4 +0.05/0, 윗면 평면도 0.02, 데이텀 A(바닥)
  const mm = w.raw(`(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))`);
  const pds = w.add('PRODUCT_DEFINITION_SHAPE', `'','',#${plate.pd}`);
  const measureItem = (v: number) =>
    w.raw(`(LENGTH_MEASURE_WITH_UNIT() MEASURE_REPRESENTATION_ITEM() MEASURE_WITH_UNIT(LENGTH_MEASURE(${r(v)}),#${mm}) REPRESENTATION_ITEM('nominal value'))`);
  const lmu = (v: number) => w.add('LENGTH_MEASURE_WITH_UNIT', `LENGTH_MEASURE(${r(v)}),#${mm}`);
  // 모양 측면 → 면(GEOMETRIC_ITEM_SPECIFIC_USAGE): 의미 PMI를 누르면 그 면을 강조한다
  const link = (sa: number, ...faces: number[]) => {
    for (const f of faces) w.add('GEOMETRIC_ITEM_SPECIFIC_USAGE', `'','',#${sa},#${plate.rep},#${f}`);
  };
  const size = (aspect: string, name: string, nominal: number, lo: number, hi: number, ...faces: number[]) => {
    const sa = w.add('SHAPE_ASPECT', `'${s(aspect)}','',#${pds},.T.`);
    link(sa, ...faces);
    const ds = w.add('DIMENSIONAL_SIZE', `#${sa},'${name}'`);
    const sdr = w.add('SHAPE_DIMENSION_REPRESENTATION', `'',(#${measureItem(nominal)}),#${ctx}`);
    w.add('DIMENSIONAL_CHARACTERISTIC_REPRESENTATION', `#${ds},#${sdr}`);
    w.add('PLUS_MINUS_TOLERANCE', `#${w.add('TOLERANCE_VALUE', `#${lmu(lo)},#${lmu(hi)}`)},#${ds}`);
    return sa;
  };
  size('폭', 'width', 20, -0.1, 0.1, plateFaces[4]!, plateFaces[5]!);
  size('구멍', 'diameter', 4, 0, 0.05, plateFaces[6]!);
  const top = w.add('SHAPE_ASPECT', `'${s('윗면')}','',#${pds},.T.`);
  link(top, plateFaces[1]!);
  w.add('FLATNESS_TOLERANCE', `'${s('윗면 평면도')}','',#${lmu(0.02)},#${top}`);
  // 데이텀 A: 데이텀 형체(바닥 면) ↔ 데이텀(SHAPE_ASPECT_RELATIONSHIP)
  const bottom = w.add('SHAPE_ASPECT', `'${s('바닥')}','',#${pds},.T.`);
  link(bottom, plateFaces[0]!);
  const datumA = w.add('DATUM', `'A','',#${pds},.F.,'A'`);
  w.add('SHAPE_ASPECT_RELATIONSHIP', `'','',#${bottom},#${datumA}`);

  // ── 핀 묶음(하위 조립): 핀은 판 밑으로 1 내려 구멍을 지나고, 고리는 판 위에 띄운다 ──
  const gPin = w.ax2([0, 0, -1]);
  const gRing = w.ax2([0, 0, 4.2]);
  const pinGroup = w.product(s('핀 묶음'), [gPin, gRing], ctx, 'SHAPE_REPRESENTATION');
  w.place(pinGroup, pin, gPin, s('핀-1'));
  w.place(pinGroup, ring, gRing, s('고리-1'));

  // ── 전체 조립 ──
  const c45 = Math.SQRT1_2;
  const pPlate = w.ax2([0, 0, 0]);
  const pBlock1 = w.ax2([2.5, 3.5, 2]);
  const pBlock2 = w.ax2([15.5, 3, 2], [0, 0, 1], [c45, c45, 0]);
  const pGroup = w.ax2([10, 5, 0]);
  const root = w.product(s('OpenCAD 예제 조립'), [pPlate, pBlock1, pBlock2, pGroup], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, plate, pPlate, s('받침판-1'));
  w.place(root, block, pBlock1, s('블록-1'));
  w.place(root, block, pBlock2, s('블록-2'));
  w.place(root, pinGroup, pGroup, s('핀 묶음-1'));

  // ── 레이어 ──
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'${s('본체')}','${s('받침판과 블록')}',(#${plateStyle},#${blockSolid})`);
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'${s('체결 부품')}','${s('핀과 고리')}',(#${pinSolid},#${ringSolid})`);
  w.add('PRESENTATION_LAYER_ASSIGNMENT', `'${s('PMI 주석')}','',(#${widthDim},#${holeDim},#${note})`);

  return w.toString(SAMPLE_NAME, undefined, {
    description: 'OpenCAD 예제 조립 모형',
    timeStamp: '2026-10-16T00:00:00',
    author: 'OpenCAD',
    organization: 'OpenCAD',
    preprocessor: 'opencad-step sample',
    system: 'OpenCAD STEP 뷰어',
  });
}

/** 예제 STEP 바이트 */
export function sampleStepBytes(): Uint8Array {
  return new TextEncoder().encode(sampleStepText());
}
