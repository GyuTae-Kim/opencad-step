/**
 * 개체 측정(순수, DOM 없음): 3D에서 누른 면·모서리·꼭짓점 → 측정 개체(entmeasure.ts) → 두 개 사이 거리·각과 코어 덧그림.
 *
 * - 면: 평면(면 가운데·법선), 원기둥·원뿔(축 — 면 가운데에서 축에 내린 발을 기준점으로), 구(중심 점), 원환(중심·축 원)
 * - 모서리: 직선(선분), 원·원호·타원(중심·법선 원 — 중심으로 잰다). 끝점·가운데 점 가까이 누르면 그 점(꼭짓점·가운데 점)
 * - 잘린 면(단면 채움): 단면 평면, 선·점 형상: 누른 점
 * - 해석적으로 못 재는 것(B-스플라인 면·곡선 모서리 등)이 끼면 고른 면·모서리의 화면용 삼각형·선분 사이 최소 거리(≈, 코어 closestBetween),
 *   두 개체가 다른 부품이면 부품 사이 최소 거리(코어 Viewer3d.closestPoints)도 함께 보인다.
 * 값은 장면 단위(길이)·도(각)로 두고, 화면 글은 Fmt로 만든다(단위·소수 자리·언어가 바뀌면 다시 만든다).
 * 첫 화면 JS 밖: 코어와 함께 받는 viewerkit.ts 조각에만 든다(앱은 뷰어를 만들 때 받은 그 모듈로 부른다 — 값 줄 글 lineValue는 measure.ts).
 */
import type { Annotation3d } from 'opencad-viewer3d/annotate';
import { buildBvh } from 'opencad-viewer3d/bvh';
import { closestBetween, type ClosestShape } from 'opencad-viewer3d/closest';
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { Fmt } from './display';
import { isFullCircle, type EdgePick } from './edges';
import { measureEntities, type Entity, type EntityMeasure, type MeasureLine, type V3 } from './entmeasure';
import { faceKindLabel, type FacePick } from './faces';
import { edgeTitle, lineValue } from './measure';

/** 누른 개체 하나 */
export interface Picked {
  /** 그물(선·점 묶음) id */
  meshId: string;
  what: 'face' | 'edge' | 'vertex' | 'mid' | 'section' | 'point';
  /** 화면 이름(번역할 글) */
  title: string;
  /** 해석적으로 잴 개체(못 재면 null — 최소 거리로 잰다) */
  entity: Entity | null;
  /** 누른 점(붙잡았으면 그 점, 세계) */
  point: V3;
  face?: FacePick;
  edge?: EdgePick;
}

/** 두 개체 측정 결과(값은 장면 단위·도) */
export interface PickedMeasure extends EntityMeasure {
  /** 화면용 삼각형으로 잰 값(≈)이 있는지 */
  approx: boolean;
}

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/** 면 → 측정 개체(해석적으로 못 재면 null) */
export function faceEntity(fp: FacePick): Entity | null {
  const label = faceKindLabel(fp.kind);
  switch (fp.kind) {
    case 'plane':
      return fp.normal ? { type: 'plane', label, point: fp.center, normal: fp.normal, meshId: fp.meshId } : null;
    case 'cylinder':
    case 'cone': {
      if (!fp.axis || !fp.origin) return null;
      // 면 가운데를 축에 내린 발(덧그림이 면 높이 가운데에 붙게)
      const t = dot(sub(fp.center, fp.origin), fp.axis);
      const o: V3 = [fp.origin[0] + fp.axis[0] * t, fp.origin[1] + fp.axis[1] * t, fp.origin[2] + fp.axis[2] * t];
      return { type: 'axis', label, origin: o, dir: fp.axis, ...(fp.radius !== undefined ? { radius: fp.radius } : {}), meshId: fp.meshId };
    }
    case 'sphere':
      return fp.origin ? { type: 'point', label, point: fp.origin, meshId: fp.meshId } : null;
    case 'torus':
      return fp.origin && fp.axis && fp.radius !== undefined ? { type: 'circle', label, center: fp.origin, normal: fp.axis, radius: fp.radius, meshId: fp.meshId } : null;
    default:
      return null;
  }
}

/** 모서리 → 측정 개체(해석적으로 못 재면 null) */
export function edgeEntity(ep: EdgePick): Entity | null {
  const label = edgeTitle(ep);
  if (ep.kind === 'line') return { type: 'line', label, a: ep.ends[0], b: ep.ends[1], meshId: ep.meshId };
  if ((ep.kind === 'circle' || ep.kind === 'ellipse') && ep.center && ep.axis && ep.radius !== undefined) return { type: 'circle', label, center: ep.center, normal: ep.axis, radius: ep.radius, meshId: ep.meshId };
  return null;
}

export function pickedFace(fp: FacePick, point: V3): Picked {
  return { meshId: fp.meshId, what: 'face', title: faceKindLabel(fp.kind), entity: faceEntity(fp), point, face: fp };
}

/** 모서리(snap이 있으면 그 꼭짓점·가운데 점) */
export function pickedEdge(ep: EdgePick, point: V3, snap: { what: 'vertex' | 'mid'; point: V3 } | null = null): Picked {
  if (snap) {
    const title = snap.what === 'vertex' ? '꼭짓점' : '모서리 가운데 점';
    return { meshId: ep.meshId, what: snap.what, title, entity: { type: 'point', label: title, point: snap.point, meshId: ep.meshId }, point: snap.point, edge: ep };
  }
  return { meshId: ep.meshId, what: 'edge', title: edgeTitle(ep), entity: edgeEntity(ep), point, edge: ep };
}

/** 잘린 면(단면 평면) */
export function pickedSection(meshId: string, point: V3, normal: V3): Picked {
  return { meshId, what: 'section', title: '단면', entity: { type: 'plane', label: '단면', point, normal, meshId }, point };
}

/** 면 정보가 없는 그물·선·점 형상: 누른 점 */
export function pickedPoint(meshId: string, point: V3, title = '점'): Picked {
  return { meshId, what: 'point', title, entity: { type: 'point', label: title, point, meshId }, point };
}

// ───────────────────────── 최소 거리(해석적으로 못 잴 때) ─────────────────────────

const translation = (o: readonly number[]): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, o[0]!, o[1]!, o[2]!, 1];

/** 그물 정점 i의 세계 좌표 */
function worldVertex(m: Mesh3d, i: number): V3 {
  const P = m.positions;
  const o = m.origin ?? [0, 0, 0];
  const x = P[i * 3]! + o[0];
  const y = P[i * 3 + 1]! + o[1];
  const z = P[i * 3 + 2]! + o[2];
  const M = m.matrix;
  if (!M) return [x, y, z];
  return [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!];
}

/**
 * 누른 개체의 최근접점용 모양: 면은 그 면 삼각형만, 모서리는 그 선분만, 점은 점 하나(세계 좌표를 기준점에서 뺀 float32 + 이동 행렬).
 * mesh는 면을 고를 때 쓴 그물(자리 변환 반영). 만들 수 없으면 null
 */
export function pickedShape(p: Picked, mesh: Mesh3d | undefined): ClosestShape | null {
  if (p.what === 'face' && p.face && mesh) {
    const f = p.face;
    const c = f.center;
    const I = mesh.indices;
    const pos = new Float32Array(f.triangles * 9);
    for (let t = 0; t < f.triangles; t++)
      for (let k = 0; k < 3; k++) {
        const vi = I ? I[(f.triStart + t) * 3 + k]! : (f.triStart + t) * 3 + k;
        const w = worldVertex(mesh, vi);
        for (let q = 0; q < 3; q++) pos[t * 9 + k * 3 + q] = w[q]! - c[q]!;
      }
    return { kind: 'triangle', positions: pos, bvh: buildBvh('triangle', pos), model: translation(c) };
  }
  if (p.what === 'edge' && p.edge) return { kind: 'segment', positions: p.edge.segs, bvh: buildBvh('segment', p.edge.segs), model: translation(p.edge.segOrigin) };
  const pos = new Float32Array(3);
  return { kind: 'point', positions: pos, bvh: buildBvh('point', pos), model: translation(p.point) };
}

/** 두 개체의 최소 거리(화면용 삼각형·선분, 못 재면 null) */
export function pickedClosest(a: Picked, b: Picked, meshOf: (id: string) => Mesh3d | undefined): { a: V3; b: V3; distance: number } | null {
  const A = pickedShape(a, meshOf(a.meshId));
  const B = pickedShape(b, meshOf(b.meshId));
  if (!A || !B) return null;
  const r = closestBetween(A, B);
  return r ? { a: [r.a[0], r.a[1], r.a[2]], b: [r.b[0], r.b[1], r.b[2]], distance: r.distance } : null;
}

/**
 * 두 개체 측정. 둘 다 해석적으로 잴 수 있으면 entmeasure, 아니면 closest(고른 면·모서리 사이 최소 거리 ≈).
 * parts를 주고 두 개체가 다른 그물이면 부품 사이 최소 거리(코어 closestPoints)를 덧붙인다(해석적으로 못 잴 때만).
 * size는 각 덧그림 팔 길이 기준(장면 단위)
 */
export function measurePicked(
  A: Picked,
  B: Picked,
  opts: {
    size: number;
    closest?: (a: Picked, b: Picked) => { a: V3; b: V3; distance: number } | null;
    parts?: (idA: string, idB: string) => { a: readonly number[]; b: readonly number[]; distance: number } | null;
  },
): PickedMeasure {
  if (A.entity && B.entity) return { ...measureEntities(A.entity, B.entity, opts.size), approx: false };
  const lines: MeasureLine[] = [];
  const annotations: EntityMeasure['annotations'] = [];
  const c = opts.closest?.(A, B) ?? null;
  if (c) {
    lines.push({ label: '최소 거리', unit: 'length', value: c.distance, approx: true });
    annotations.push({ kind: 'distance', a: c.a, b: c.b, line: 0 });
  } else {
    lines.push({ label: '누른 점 사이 거리', unit: 'length', value: dist(A.point, B.point) });
    annotations.push({ kind: 'distance', a: A.point, b: B.point, line: 0 });
  }
  if (A.meshId !== B.meshId && opts.parts) {
    const r = opts.parts(A.meshId, B.meshId);
    if (r) {
      lines.push({ label: '부품 사이 최소 거리', unit: 'length', value: r.distance, approx: true });
      annotations.push({ kind: 'distance', a: [r.a[0]!, r.a[1]!, r.a[2]!], b: [r.b[0]!, r.b[1]!, r.b[2]!], line: lines.length - 1 });
    }
  }
  return { lines, annotations, approx: lines.some((l) => l.approx) };
}

/** 덧그림 색: 부품 사이 최소 거리는 흐린 색 */
const PARTS_COLOR = '#8a94a6';

/**
 * 코어 덧그림(setAnnotations): 결과가 있으면 그 거리·각 선과 값 글, 원 개체는 중심 점.
 * 하나만 골랐으면 모서리 길이(직선)·지름(원)·반지름(원호)·꼭짓점·가운데 점 표시
 */
export function pickedAnnotations(picks: readonly Picked[], m: PickedMeasure | null, f: Fmt): Annotation3d[] {
  const out: Annotation3d[] = [];
  for (const p of picks) {
    const e = p.entity;
    if (e?.type === 'point' && (p.what === 'vertex' || p.what === 'mid' || p.what === 'point' || p.what === 'face')) out.push({ kind: 'point', a: e.point, label: '' });
    else if (e?.type === 'circle') {
      out.push({ kind: 'point', a: e.center, label: '' });
      // 하나만 골랐을 때 원 모서리는 지름 원(한 바퀴)·원호는 반지름 선, 타원은 가운데 점에 두 지름(긴 × 짧은)
      if (!m && p.edge?.kind === 'ellipse') {
        const ep = p.edge;
        out.push({ kind: 'point', a: ep.mid, label: ep.minorRadius !== undefined ? `${f.len(e.radius * 2)} × ${f.len(ep.minorRadius * 2)}` : f.len(ep.length) });
      } else if (!m && p.edge) {
        const full = isFullCircle(p.edge);
        out.push({ kind: 'radius', a: e.center, b: p.edge.ends[0], ...(full ? { normal: e.normal } : {}), label: full ? `Ø${f.len(e.radius * 2)}` : `R${f.len(e.radius)}` });
      }
    } else if (e?.type === 'line' && !m) out.push({ kind: 'distance', a: e.a, b: e.b, label: f.len(p.edge?.length ?? dist(e.a, e.b)) });
  }
  if (m)
    for (const a of m.annotations) {
      const l = a.line !== undefined ? m.lines[a.line] : undefined;
      const parts = l?.label === '부품 사이 최소 거리';
      out.push({ kind: a.kind, a: a.a, ...(a.b ? { b: a.b } : {}), ...(a.c ? { c: a.c } : {}), label: l ? lineValue(l, f) : '', ...(parts ? { color: PARTS_COLOR } : {}) });
    }
  return out;
}

/**
 * 각 덧그림 팔 길이 기준: 두 기준점 사이 거리를 장면 크기의 3~25%로 잘라 다섯 배(entmeasure 팔 = 8%)
 */
export function armSize(a: Picked, b: Picked, sceneDiag: number): number {
  const d = dist(a.entity ? anchor(a) : a.point, b.entity ? anchor(b) : b.point);
  const diag = sceneDiag > 0 ? sceneDiag : Math.max(d, 1);
  return Math.min(Math.max(d, diag * 0.03), diag * 0.25) * 5;
}

function anchor(p: Picked): V3 {
  const e = p.entity!;
  switch (e.type) {
    case 'plane':
      return e.point;
    case 'axis':
      return e.origin;
    case 'circle':
      return e.center;
    case 'line':
      return [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, (e.a[2] + e.b[2]) / 2];
    case 'point':
      return e.point;
  }
}
