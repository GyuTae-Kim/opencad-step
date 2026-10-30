/**
 * 개체 측정 덧그림 글상자끼리 비키기(코어 0.24.0 — 앱 코드 그대로)를 실제 코어(가짜 DOM·WebGL2 뷰어)와 앱의 덧그림(pickedAnnotations)으로 본다.
 * - 해석적으로 못 재는 두 면(B-스플라인 면처럼 개체 없음)을 다른 부품에서 골라 "최소 거리 ≈"와 "부품 사이 최소 거리 ≈"가 같은 선분이면
 *   코어 0.23.0은 두 글상자를 같은 자리에 겹쳐 그렸다 — 0.24.0은 뒤에 놓는 것(부품 사이)이 비키고 앞의 것은 제자리
 * - 두 글상자가 겹치지 않는 자리면 하나씩 그릴 때와 같은 자리(넓은 화면의 보통 그림은 그대로)
 * - 앱이 피할 사각형(labelavoid.ts — 측정 띠·뷰 큐브)을 주면 그것도 비킨다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Viewer3d, type MeasureLabelRect } from 'opencad-viewer3d';
import type { Annotation3d } from 'opencad-viewer3d/annotate';
import { stepToScene } from '../../src/index';
import { stepFaceIndex } from '../../src/app/doc';
import { Fmt } from '../../src/app/display';
import { measurePicked, pickedAnnotations, pickedFace, type Picked } from '../../src/app/entpick';
import { faceDetails, type FacePick } from '../../src/app/faces';
import { cube, StepText } from '../stepText';
import { installDom } from './fakeview';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
});
afterAll(() => dom.restore());

type V3 = [number, number, number];
const MM = new Fmt('mm');
const overlap = (a: MeasureLabelRect, b: MeasureLabelRect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** 같은 정육면체(한 변 10) 두 개: 아래(원점)와 그 위 3 띄워(z 13) */
function stacked() {
  const w = new StepText();
  const ctx = w.context();
  const part = w.product('p', [cube(w, 10).solid], ctx);
  const a1 = w.ax2([0, 0, 0]);
  const a2 = w.ax2([0, 0, 13]);
  const root = w.product('asm', [a1, a2], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, part, a1, 'p-1');
  w.place(root, part, a2, 'p-2');
  return stepToScene(w.bytes());
}

const s = stacked();
function faces(mi: number): FacePick[] {
  const fx = stepFaceIndex(s)!;
  const m = s.meshes[mi]!;
  const t = fx.tables[fx.tableOf.get(m.id)!]!;
  return Array.from({ length: t.kinds.length }, (_, i) => faceDetails(m, t, i, fx.kinds)!);
}
// 아래 상자 윗면과 위 상자 아랫면(개체 없음 — 해석적으로 못 재는 면처럼)
const topA = faces(0).find((f) => f.normal?.[2] === 1)!;
const botB = faces(1).find((f) => f.normal?.[2] === -1)!;
const A: Picked = { ...pickedFace(topA, topA.center), entity: null };
const B: Picked = { ...pickedFace(botB, botB.center), entity: null };

/** 앱 onEntityPick·showEntities처럼: 고른 면 사이 최소 거리(seg1)와 부품 사이 최소 거리(seg2)의 덧그림 */
function annotations(seg1: [V3, V3], seg2: [V3, V3]): Annotation3d[] {
  const m = measurePicked(A, B, {
    size: 10,
    closest: () => ({ a: seg1[0], b: seg1[1], distance: 3 }),
    parts: () => ({ a: seg2[0], b: seg2[1], distance: 3 }),
  });
  expect(m.lines.map((l) => l.label)).toEqual(['최소 거리', '부품 사이 최소 거리']);
  return pickedAnnotations([A, B], m, MM);
}

function viewer(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  v.setScene(s);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return v;
}

/** 덧그림을 그리고 거리 덧그림 글상자 자리(덧그림 차례) */
function distanceRects(v: Viewer3d, list: Annotation3d[]): MeasureLabelRect[] {
  v.setAnnotations(list);
  v.renderNow();
  const all = v.annotationLabelRects;
  const out: MeasureLabelRect[] = [];
  list.forEach((a, i) => {
    if (a.kind === 'distance') out.push(all[i]!);
  });
  expect(out.every(Boolean)).toBe(true);
  return out;
}

describe('개체 측정 덧그림 글상자끼리 비키기(코어 0.24.0 — 앱 코드 그대로)', () => {
  it('최소 거리 ≈와 부품 사이 최소 거리 ≈가 같은 선분이면 뒤의 글상자(부품 사이)가 비키고 앞의 것은 제자리', () => {
    const v = viewer();
    const seg: [V3, V3] = [
      [5, 5, 10],
      [5, 5, 13],
    ];
    const list = annotations(seg, seg);
    expect(list.filter((a) => a.kind === 'distance').map((a) => a.label)).toEqual(['≈ 3 mm', '≈ 3 mm']);
    const [first, second] = distanceRects(v, list);
    expect(overlap(first!, second!)).toBe(false);
    // 하나씩 그리면 둘 다 같은 자리(0.23.0은 이 자리에 겹쳐 그렸다) — 앞의 것은 그 자리 그대로
    const alone1 = distanceRects(v, list.filter((a) => a.kind !== 'distance' || a.color === undefined))[0]!;
    const alone2 = distanceRects(v, list.filter((a) => a.kind !== 'distance' || a.color !== undefined))[0]!;
    expect(alone1).toEqual(alone2);
    expect(first).toEqual(alone1);
    expect(overlap(second!, alone2)).toBe(false);
    v.dispose();
  });

  it('겹치지 않는 두 글상자는 하나씩 그릴 때와 같은 자리', () => {
    const v = viewer();
    // 두 선분이 정육면체 맞은편 모서리 쪽(화면에서 멀리 떨어진다)
    const list = annotations(
      [
        [0.5, 0.5, 10],
        [0.5, 0.5, 13],
      ],
      [
        [9.5, 9.5, 10],
        [9.5, 9.5, 13],
      ],
    );
    const [first, second] = distanceRects(v, list);
    expect(overlap(first!, second!)).toBe(false);
    expect(first).toEqual(distanceRects(v, list.filter((a) => a.kind !== 'distance' || a.color === undefined))[0]);
    expect(second).toEqual(distanceRects(v, list.filter((a) => a.kind !== 'distance' || a.color !== undefined))[0]);
    v.dispose();
  });

  it('앱이 피할 사각형(측정 띠 등)을 주면 두 글상자 모두 그것과도, 서로도 겹치지 않는다', () => {
    const v = viewer();
    const seg: [V3, V3] = [
      [5, 5, 10],
      [5, 5, 13],
    ];
    const list = annotations(seg, seg);
    const [first] = distanceRects(v, list);
    // 앞 글상자 자리를 덮는 띠
    const bar: MeasureLabelRect = { x: first!.x - 20, y: first!.y - 4, width: first!.width + 40, height: first!.height + 8 };
    v.setMeasureLabelAvoid([bar]);
    const [a, b] = distanceRects(v, list);
    expect(overlap(a!, bar)).toBe(false);
    expect(overlap(b!, bar)).toBe(false);
    expect(overlap(a!, b!)).toBe(false);
    v.dispose();
  });
});
