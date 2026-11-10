// @vitest-environment jsdom
/**
 * 66차 가상 커서 그물 면 후보 표식(코어 0.54.0 pickCycle facePreview·faceRanges — keysnap.ts pick, picklist.ts pickFaceRanges)과 모드를 바꾼 뒤 후보 다시 구하기:
 * - 지금 후보가 그물 면이면 맞은 B-rep 면 통째를 3D 덧그림에 칠하고 테두리(원기둥 옆면 — 코어 기본 같은 평면 면은 띠 하나), 면 표가 없으면 코어 같은 평면 면
 * - pickFaceRanges: 면 표의 그 면 삼각형 구간, 잘린 면·모서리·선·문서 없음은 null
 * - 고른 면 강조와 겹쳐도 표식은 그린다(덧그림 — 고른 것·강조는 그대로), 측정 모드에서는 그리지 않는다(코어), 분해(겉모습 행렬)로 옮긴 부품은 옮긴 자리에
 * - 면 고르기·여러 개 고르기·고르기 단위를 바꾸고 sync하면 켜진 커서의 후보가 새 묶음(65차까지는 커서를 옮길 때까지 앞 묶음 — sync 없이는 그대로)
 * 덧그림 세기는 코어 시험(v0540preview)과 같은 법: 강조 색 칠하기·긋기 수와 moveTo 수(삼각형마다 하나 + 테두리 변마다 두 번 — 바탕 테·강조)
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Pick3d, Viewer3d } from 'opencad-viewer3d';
import { planarFace, rangesFace } from 'opencad-viewer3d/pickpreview';
import { stepToScene } from '../../src/index';
import { createDoc, type StepDoc } from '../../src/app/doc';
import { faceAt, faceDetails } from '../../src/app/faces';
import { paintHi } from '../../src/app/hipaint';
import { installKeySnap } from '../../src/app/keysnap';
import { PICK_LIST_MAX, pickFaceRanges, pickGroup } from '../../src/app/picklist';
import { cube, cylinder, StepText } from '../stepText';
import { jsdomViewer, VIEW_H, VIEW_W } from './jsdomview';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
  document.body.innerHTML = '';
});

/** 원기둥 하나(반지름 4, 높이 10 — 앞에서 보면 가운데가 옆면) */
function pin(): Uint8Array {
  const w = new StepText();
  w.product('pin', [w.ax2([0, 0, 0]), cylinder(w, 4, 10, 'pin-body')], w.context());
  return w.bytes();
}

/** 위아래로 겹친 두 부품(picklist.test.ts와 같다 — 위 front z 20~30, 아래 back z 0~10) */
function stacked(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const front = w.product('front', [w.ax2([0, 0, 0]), cube(w, 10, [0, 0, 20], 'front-body').solid], ctx);
  const back = w.product('back', [w.ax2([0, 0, 0]), cube(w, 10, [0, 0, 0], 'back-body').solid], ctx);
  const root = w.product('asm', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, front, w.ax2([0, 0, 0]), 'front-1');
  w.place(root, back, w.ax2([0, 0, 0]), 'back-1');
  return w.bytes();
}

function setup(bytes: Uint8Array, view: 'front' | 'top') {
  const j = jsdomViewer({ keyboard: true });
  restore = j.restore;
  const sc = stepToScene(bytes, { name: 's.stp' });
  j.viewer.setScene(sc);
  j.viewer.setView(view);
  j.viewer.fit(false);
  const d = createDoc('s.stp', 1, { scene: sc, ms: 1 });
  return { v: j.viewer, d, sc };
}

const key = (v: Viewer3d, k: string): void => void v.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

/** 덧그림 한 번 그리기의 강조 색 칠하기·긋기 수와 moveTo 자리(코어 v0540preview 시험의 marks와 같은 법) */
function marks(v: Viewer3d): { fills: number; strokes: number; moves: [number, number][] } {
  const hi = (v as unknown as { theme: { highlight: string } }).theme.highlight;
  const octx = (v as unknown as { octx: Record<string, unknown> }).octx;
  const out = { fills: 0, strokes: 0, moves: [] as [number, number][] };
  const save = { fill: octx.fill, stroke: octx.stroke, moveTo: octx.moveTo };
  octx.fill = (): void => void (octx.fillStyle === hi && out.fills++);
  octx.stroke = (): void => void (octx.strokeStyle === hi && out.strokes++);
  octx.moveTo = (x: number, y: number): void => void out.moves.push([x, y]);
  v.renderNow();
  Object.assign(octx, save);
  return out;
}

/** 면 셈 조각(코어 import())이 와서 면 표식이 그려질 때까지 이벤트 고리를 돌린다 */
async function faceKitReady(v: Viewer3d): Promise<void> {
  for (let i = 0; i < 400 && marks(v).fills === 0; i++) await new Promise((r) => setTimeout(r, 0));
}

/** 지금 후보(가상 커서 차례의 고르기 후보 — 코어와 같은 선택·묶음으로 다시 구한다) */
const current = (v: Viewer3d, group?: (p: Pick3d) => string | undefined): Pick3d => {
  const c = v.keyboardCursor!;
  return v.pickCandidates(c.x, c.y, { pointerType: 'keyboard', throughTranslucent: false, max: PICK_LIST_MAX, ...(group ? { group } : {}) })[c.index]!;
};

describe('pickFaceRanges(66차)', () => {
  it('그물 면 후보 → 그 B-rep 면 삼각형 구간(면 표 — faceDetails와 같다), 잘린 면·모서리·문서 없음은 null', () => {
    const { v, d, sc } = setup(pin(), 'front');
    const p = v.pick(VIEW_W / 2, VIEW_H / 2)!;
    expect(p.kind).toBe('mesh');
    const t = d.faces!.tables[d.faces!.tableOf.get(p.id)!]!;
    const f = faceDetails(sc.meshes[0]!, t, faceAt(t, p.raw ?? p.index), d.faces!.kinds)!;
    expect(f.kind).toBe('cylinder');
    expect(pickFaceRanges(d, p)).toEqual([{ start: f.triStart, count: f.triangles }]);
    expect(f.triangles).toBeGreaterThan(8);
    expect(pickFaceRanges(d, { ...p, section: true, index: -1, raw: -1 })).toBeNull();
    expect(pickFaceRanges(d, { ...p, kind: 'edge' })).toBeNull();
    expect(pickFaceRanges(null, p)).toBeNull();
    // 면 표가 없는 문서(삼각형 형식 등) — 코어가 같은 평면 면으로
    expect(pickFaceRanges({ ...d, faces: null } as StepDoc, p)).toBeNull();
  });
});

describe('가상 커서 그물 면 후보 표식(66차 — 코어 0.54.0 facePreview·faceRanges)', () => {
  it('원기둥 옆면 후보: 앱 고르기 상태(pick)를 주면 B-rep 면 통째를 칠하고 테두리 — 주지 않으면 코어 같은 평면 면(띠 하나), 표식은 덧그림뿐', async () => {
    const { v, d, sc } = setup(pin(), 'front');
    const H = { doc: d, faceMode: false, multiPick: false, pickUnit: 'part' as const };
    const ks = installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false, pick: H });
    expect(v.keyboardSnap!.pickCycle).toMatchObject({ throughTranslucent: false, facePreview: true });
    expect(typeof (v.keyboardSnap!.pickCycle as { faceRanges?: unknown }).faceRanges).toBe('function');
    key(v, 'ArrowRight');
    expect(v.keyboardCursor).toMatchObject({ x: VIEW_W / 2, y: VIEW_H / 2, mode: 'pick', index: 0 });
    const p = current(v, (q) => pickGroup(H, q));
    expect(p.kind).toBe('mesh');
    await faceKitReady(v);
    const m = sc.meshes[0]!;
    const ranges = pickFaceRanges(d, p)!;
    const fo = rangesFace(m.positions, m.indices, ranges)!;
    const a = marks(v);
    expect(a.fills).toBe(1);
    expect(a.strokes).toBe(1);
    expect(fo.tris.length).toBe(ranges[0]!.count);
    // 바탕: 같은 커서에 면 표식을 끈 그림(65차까지 — 커서 표식만)
    v.setKeyboardSnap({ pickCycle: { throughTranslucent: false } });
    const base = marks(v);
    expect(base.fills).toBe(0);
    expect(a.moves.length - base.moves.length).toBe(fo.tris.length + 2 * (fo.edges.length / 6));
    // 코어 기본(앱 면 없음): 맞은 삼각형과 같은 평면으로 이어진 삼각형 — 원기둥 옆면에서는 B-rep 면보다 훨씬 적다
    const plain = planarFace(m.positions, m.indices, p.index)!;
    expect(plain.tris.length).toBeLessThan(fo.tris.length / 4);
    v.setKeyboardSnap({ pickCycle: { throughTranslucent: false, facePreview: true } });
    expect(marks(v).moves.length - base.moves.length).toBe(plain.tris.length + 2 * (plain.edges.length / 6));
    // 표식은 덧그림 — 고른 것·강조·알림은 바꾸지 않는다(그림 저장에도 없다)
    expect(v.pickPreview).toBeNull();
    ks.sync();
    expect(marks(v).moves.length - base.moves.length).toBe(fo.tris.length + 2 * (fo.edges.length / 6));
  });

  it('고른 면 강조와 겹쳐도 표식은 그린다(고른 것·강조 그대로), 측정 모드에서는 그리지 않는다', async () => {
    const { v, d, sc } = setup(pin(), 'front');
    const H = { doc: d, faceMode: true, multiPick: false, pickUnit: 'face' as const };
    installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false, pick: H });
    key(v, 'ArrowRight');
    const p = current(v, (q) => pickGroup(H, q));
    await faceKitReady(v);
    const t = d.faces!.tables[0]!;
    const face = faceDetails(sc.meshes[0]!, t, faceAt(t, p.raw ?? p.index), d.faces!.kinds)!;
    const before = marks(v);
    // 앱이 그 면을 골라 강조(hipaint.ts — 구간 강조와 경계 선)한 뒤에도 같은 표식
    paintHi(v, { face });
    const both = marks(v);
    expect(both.fills).toBe(1);
    expect(both.moves.length).toBe(before.moves.length);
    paintHi(v, {});
    // 측정 모드: 코어가 고르기 후보 표식을 그리지 않는다(측정 붙잡기 표식만) — 표식을 켜도 끈 것과 같은 그림
    v.setMeasureMode(true);
    key(v, 'ArrowRight');
    expect(v.keyboardCursor!.mode).toBe('measure');
    const on = marks(v);
    v.setKeyboardSnap({ pickCycle: { throughTranslucent: false } });
    key(v, 'ArrowLeft');
    key(v, 'ArrowRight');
    expect(marks(v)).toEqual(on);
  });

  it('분해(겉모습 행렬)로 옮긴 부품의 면 후보는 옮긴 자리에 표식', async () => {
    const { v, d } = setup(pin(), 'front');
    // 평행 투영(옮긴 만큼 화면에서도 고르게 옮겨진다)
    v.setProjection('orthographic');
    const H = { doc: d, faceMode: false, multiPick: false, pickUnit: 'part' as const };
    installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false, pick: H });
    key(v, 'ArrowRight');
    await faceKitReady(v);
    const a = marks(v).moves;
    const n = pickFaceRanges(d, current(v, (q) => pickGroup(H, q)))![0]!.count;
    // 앱 분해는 겉모습 행렬(looks.ts LookSync — setItemLooks matrix): 화면 오른쪽으로 조금(커서 자리는 그대로 옆면 위)
    const id = d.scene.meshes[0]!.id;
    const s0 = v.project([0, 0, 0])!, s1 = v.project([0.5, 0, 0])!;
    v.setItemLooks([[id, { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.5, 0, 0, 1] }]]);
    const b = marks(v).moves;
    expect(b.length).toBe(a.length);
    const dx = s1.x - s0.x;
    expect(dx).toBeGreaterThan(1);
    // 면 칠하기(삼각형마다 moveTo)·테두리가 옮긴 만큼 옮겨 그려졌다(커서 표식 등 나머지는 그대로)
    const moved = b.filter((q, i) => Math.abs(q[0] - a[i]![0] - dx) < 0.01 && Math.abs(q[1] - a[i]![1]) < 0.01).length;
    expect(moved).toBeGreaterThanOrEqual(n);
  });
});

describe('모드를 바꾸면 켜진 커서의 후보 묶음을 다시(66차 — 65차 남은 일)', () => {
  /** 커서 자리(가운데에서 오른쪽 15·아래 5 — 정사각형 면의 대각선 위가 아니게) */
  const X = VIEW_W / 2 + 15;
  const Y = VIEW_H / 2 + 5;
  it('부품 → 여러 개 고르기 → 면 고르기(모서리도) → 몸체 단위: sync 뒤 후보 수·차례가 그 모드의 묶음, sync 없이는 앞 묶음 그대로', () => {
    const { v, d } = setup(stacked(), 'top');
    const H = { doc: d, faceMode: false, multiPick: false, pickUnit: 'part' as 'part' | 'body' | 'face' };
    const ks = installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false, pick: H });
    const want = () => v.pickCandidates(X, Y, { pointerType: 'keyboard', throughTranslucent: false, max: PICK_LIST_MAX, group: (p) => pickGroup(H, p) });
    key(v, 'ArrowRight');
    for (let i = 0; i < 3; i++) key(v, 'ArrowRight');
    key(v, 'ArrowDown');
    expect(v.keyboardCursor).toMatchObject({ x: X, y: Y, count: 4 });
    expect(want()).toHaveLength(4);
    key(v, 'Tab');
    key(v, 'Tab');
    expect(v.keyboardCursor!.index).toBe(2);
    // 여러 개 고르기: 부품 단위 둘(앞·뒤 부품). sync 전에는 앞 묶음(B-rep 면 넷) 그대로 — 65차의 남은 일
    H.multiPick = true;
    expect(v.keyboardCursor).toMatchObject({ count: 4, index: 2 });
    ks.sync();
    expect(v.keyboardCursor).toMatchObject({ x: X, y: Y, count: 2, index: 0 });
    expect(want().map((p) => pickGroup(H, p))).toEqual(['n:0/0', 'n:0/1']);
    // 면 고르기(앱은 윤곽선 고르기도 켠다 — setPickEdges): 그 모드의 묶음과 같은 수
    H.multiPick = false;
    H.faceMode = true;
    H.pickUnit = 'face';
    v.setPickEdges(true);
    ks.sync();
    expect(v.keyboardCursor).toMatchObject({ count: want().length, index: 0 });
    expect(want().length).toBeGreaterThanOrEqual(4);
    // 몸체 단위 여러 개 고르기: 몸체마다(여기서는 부품마다 몸체 하나라 둘)
    H.faceMode = false;
    H.multiPick = true;
    H.pickUnit = 'body';
    v.setPickEdges(false);
    ks.sync();
    expect(v.keyboardCursor).toMatchObject({ count: 2, index: 0 });
    expect(want().map((p) => pickGroup(H, p))).toEqual(want().map((p) => `b:${p.id}`));
  });
});
