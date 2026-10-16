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
 * 평면·원기둥·원환 곡면, 구멍 있는 면, 조립 변환, 인스턴스, 색, 한글 이름(\X2\ 부호)을 함께 보여 준다.
 */
import { cube, cylinder, plateWithHole, StepText, stepString as s, torus } from './stepText';

export const SAMPLE_NAME = 'opencad-sample.stp';

/** 예제 STEP 글 */
export function sampleStepText(): string {
  const w = new StepText();
  const ctx = w.context('mm');

  // ── 부품 ──
  const plateSolid = plateWithHole(w, '');
  w.color(plateSolid, [0.46, 0.58, 0.71]);
  const plate = w.product(s('받침판'), [plateSolid], ctx);

  const blockSolid = cube(w, 3, [0, 0, 0], '').solid;
  w.color(blockSolid, [0.36, 0.69, 0.47]);
  const block = w.product(s('블록'), [blockSolid], ctx);

  const pinSolid = cylinder(w, 1.6, 7, '');
  w.color(pinSolid, [0.93, 0.55, 0.22]);
  const pin = w.product(s('핀'), [pinSolid], ctx);

  const ringSolid = torus(w, 2.6, 0.5, '');
  w.color(ringSolid, [0.86, 0.71, 0.27]);
  const ring = w.product(s('고리'), [ringSolid], ctx);

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
