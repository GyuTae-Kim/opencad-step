/**
 * 개체 측정(순수, DOM 없음): 3D에서 누른 면·모서리·꼭짓점 → 측정 개체(entmeasure.ts) → 두 개 사이 거리·각과 코어 덧그림.
 *
 * - 면: 평면(면 가운데·법선), 원기둥·원뿔(축 — 면 가운데에서 축에 내린 발을 기준점으로), 구(중심 점), 원환(중심·축 원)
 * - 모서리: 직선(선분), 원·원호·타원(중심·법선 원 — 중심으로 잰다). 끝점·가운데 점 가까이 누르면 그 점(꼭짓점·가운데 점)
 * - 잘린 면(단면 채움): 단면 평면, 선·점 형상: 누른 점
 * - 해석적으로 못 재는 것(B-스플라인 면·곡선 모서리 등)이 끼면 고른 면·모서리의 화면용 삼각형·선분 사이 최소 거리(≈),
 *   두 개체가 다른 부품이면 부품 사이 최소 거리도 함께 보인다. 40차부터 앱이 곡선 접선 조각(exactdist.ts)을 받았으면
 *   그 두 값을 B-rep 곡면·곡선 정의로 다듬어 받으면 "≈" 없이 보인다.
 *   62차: 두 최소 거리는 코어 나눠 돌리기로 구한다(EntClosest — 면 짝은 뷰어 closestPointsAsync의 면 구간, 부품 사이는 뷰어 closestPointsAsync).
 *   면 모양은 앱이 면 삼각형을 세계 좌표로 복사하지 않고 코어 closestPart(면 표의 이어진 삼각형 구간 — 뷰어 구간 모양과 같은 나무)로 만든다
 * 값은 장면 단위(길이)·도(각)로 두고, 화면 글은 Fmt로 만든다(단위·소수 자리·언어가 바뀌면 다시 만든다).
 * 첫 화면 JS 밖: 코어와 함께 받는 viewerkit.ts 조각에만 든다(앱은 뷰어를 만들 때 받은 그 모듈로 부른다 — 값 줄 글 lineValue는 measure.ts).
 */
import type { Viewer3d } from 'opencad-viewer3d';
import type { Annotation3d } from 'opencad-viewer3d/annotate';
import { buildBvh } from 'opencad-viewer3d/bvh';
import { closestBetween, closestBetweenAsync, closestPart, type ClosestResult, type ClosestShape, type ClosestSliceStats } from 'opencad-viewer3d/closest';
import { modelMatrix } from 'opencad-viewer3d/math';
import type { Mesh3d } from 'opencad-viewer3d/types';
import type { Fmt } from './display';
import { h } from './dom';
import { isFullCircle, type EdgePick } from './edges';
import { measureEntities, type Entity, type EntityMeasure, type MeasureLine, type V3 } from './entmeasure';
import { faceKindLabel, type FacePick } from './faces';
import { edgeSummary, edgeTitle, entityHint, faceSummary, lineValue } from './measure';

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

/** 면 표의 이어진 삼각형 구간(코어 IndexRange — 그물 삼각형 번호) */
const faceRange = (p: Picked): { start: number; count: number } | null => (p.what === 'face' && p.face ? { start: p.face.triStart, count: p.face.triangles } : null);

/**
 * 누른 개체의 최근접점용 모양: 면은 그 면 삼각형 구간만(62차 — 코어 closestPart: 번호 배열의 subarray로 복사 없이, 그물 정점·자리 행렬 그대로 —
 * 뷰어 closestPointsAsync의 rangeA·rangeB 모양과 같은 나무라 같은 답), 모서리는 그 선분만, 점은 점 하나(이동 행렬).
 * mesh는 면을 고를 때 쓴 그물(자리 변환 반영). 만들 수 없으면 null
 */
export function pickedShape(p: Picked, mesh: Mesh3d | undefined): ClosestShape | null {
  const range = faceRange(p);
  if (range && mesh) {
    const part = closestPart('triangle', mesh.positions, mesh.indices, [range]);
    if (!part) return null;
    const s: ClosestShape = { kind: 'triangle', positions: part.positions, bvh: part.bvh, model: modelMatrix(mesh.matrix, mesh.origin) ?? null, offset: part.offset, map: part.map };
    if (part.indices) s.indices = part.indices;
    return s;
  }
  if (p.what === 'edge' && p.edge) return { kind: 'segment', positions: p.edge.segs, bvh: buildBvh('segment', p.edge.segs), model: translation(p.edge.segOrigin) };
  const pos = new Float32Array(3);
  return { kind: 'point', positions: pos, bvh: buildBvh('point', pos), model: translation(p.point) };
}

/** 두 개체의 최소 거리(화면용 삼각형·선분, 한 번에 — 못 재면 null). 앱은 EntClosest로 나눠 돌린다 — 같은 모양·같은 답 */
export function pickedClosest(a: Picked, b: Picked, meshOf: (id: string) => Mesh3d | undefined): { a: V3; b: V3; distance: number } | null {
  const A = pickedShape(a, meshOf(a.meshId));
  const B = pickedShape(b, meshOf(b.meshId));
  if (!A || !B) return null;
  const r = closestBetween(A, B);
  return r ? { a: [r.a[0], r.a[1], r.a[2]], b: [r.b[0], r.b[1], r.b[2]], distance: r.distance } : null;
}

/** 최소 거리 답(두 점 — 세계, 거리) */
type Closest = { a: readonly number[]; b: readonly number[]; distance: number };

/** EntClosest가 쓰는 뷰어(코어 0.41.0·0.45.0 나눠 돌리는 최근접점 — 시험은 가짜, 68차: 있으면 0.55.0 점 둘레 삼각형 묻기) */
export type ClosestViewer = Pick<Viewer3d, 'closestPointsAsync'> & Partial<Pick<Viewer3d, 'trianglesNear'>>;

/** 68차: 부품 사이 답에 싣는 점 둘레 묻기 선택 — 그물 자기 좌표(다듬기의 면 찾기가 그물 좌표로 묻는다), 숨긴 구간도(그물 전수와 같은 삼각형 모음) */
const NEAR_OPTS = { local: true, hidden: true };

/** 나눠 돌리기 사이 쉬기(코어 closestPointsAsync와 같은 길 — MessageChannel: 브라우저 setTimeout 0은 다섯 번째부터 4 ms 넘게 미뤄진다. 없으면 setTimeout 0) */
function nextTask(): Promise<void> {
  return new Promise((res) => {
    if (typeof MessageChannel !== 'function') return void setTimeout(res, 0);
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      ch.port1.close();
      res();
    };
    ch.port2.postMessage(0);
  });
}

/** 측정 짝 하나의 할 일: 고른 두 개체 사이(closest)·부품 사이(parts) 최근접점이 필요한지 — measurePicked가 부르는 것과 같은 조건 */
export function closestNeeds(A: Picked, B: Picked): { closest: boolean; parts: boolean } {
  const closest = !(A.entity && B.entity);
  return { closest, parts: closest && A.meshId !== B.meshId };
}

/**
 * 개체 측정의 최소 거리 두 줄(고른 두 개체 사이·부품 사이)을 코어 나눠 돌리기로 구한다(62차 — 코어 0.41.0·0.45.0, 46차 받기와 같은 꼴):
 * - 고른 두 개체: 둘 다 면이면 뷰어 closestPointsAsync(두 그물, { rangeA·rangeB: 면 표의 이어진 삼각형 구간, indices, signal }) — 구간 BVH는 뷰어가 기억한다.
 *   모서리·점·단면이 끼면 순수 closestBetweenAsync(pickedShape — 면은 같은 구간 모양)
 * - 다른 그물이면 부품 사이: 뷰어 closestPointsAsync(두 그물, { indices, signal })
 * 측정 짝(key — 앱의 d.ent)마다 한 번 시작하고 차례로(고른 개체 → 부품 사이) 돌린다. 짝이 바뀌거나 cancel()이면 signal로 멈춘다.
 * 구하는 동안 get은 null이고, 다 구하면 later()를 부른다(그 짝이 그대로일 때만) — 앱이 다시 재면 그 답을 measurePicked의 closest·parts로 돌려준다.
 * 답은 한 번에 부른 closestPoints·closestBetween과 바이트까지 같다(코어 — 같은 차례로 같은 쌍을 본다).
 * 68차: 뷰어에 점 둘레 삼각형 묻기(코어 0.55.0 trianglesNear)가 있으면 부품 사이 답에 near(그물 좌표·숨긴 구간 포함)를 싣는다 — 다듬기(exactdist.ts
 * PartsClosest)가 두 점이 놓인 면을 찾을 때 그물을 훑지 않고 점 둘레 삼각형만 본다(답의 삼각형 번호 indexA·indexB처럼 답과 함께 가는 것)
 */
export class EntClosest {
  private key: object | null = null;
  private ac: AbortController | null = null;
  private picked: Closest | null = null;
  /** 부품 사이 답(68차: 뷰어가 묻기를 하면 near를 실어) */
  private parts: (Closest & { near?: (id: string, p: readonly number[], r: number) => readonly number[] | null }) | null = null;
  private busy = false;
  /** 마지막 짝의 나눠 돌리기 기록(조각 수·가장 긴 조각 ms·꺼낸 마디 쌍·다시 찾은 횟수 — 두 찾기를 합친 것) */
  stats: ClosestSliceStats = { slices: 0, longest: 0, visited: 0, restarts: 0 };

  /** 지금 짝의 찾기를 멈춘다(새 짝·지우기·문서 바꾸기) */
  cancel(): void {
    this.ac?.abort();
    this.ac = null;
    this.key = null;
    this.busy = false;
  }

  /**
   * 짝 key의 두 개체 A·B: 다 구했으면 measurePicked에 줄 { closest, parts }(앞 답을 돌려주는 함수), 구하는 중이면 null(처음 부르면 시작).
   * 해석적으로 재는 짝이면 찾지 않고 곧바로 빈 선택. sliceMs는 한 조각 시간(기본 코어 8 ms)
   */
  get(
    key: object,
    A: Picked,
    B: Picked,
    v: ClosestViewer,
    meshOf: (id: string) => Mesh3d | undefined,
    later: () => void,
    sliceMs?: number,
  ): { closest?: (a: Picked, b: Picked) => Closest | null; parts?: (idA: string, idB: string) => Closest | null } | null {
    if (key !== this.key) this.start(key, A, B, v, meshOf, later, sliceMs);
    if (this.busy) return null;
    const { picked, parts } = this;
    const need = closestNeeds(A, B);
    return { ...(need.closest ? { closest: () => picked } : {}), ...(need.parts ? { parts: () => parts } : {}) };
  }

  private start(key: object, A: Picked, B: Picked, v: ClosestViewer, meshOf: (id: string) => Mesh3d | undefined, later: () => void, sliceMs?: number): void {
    this.cancel();
    this.key = key;
    this.picked = this.parts = null;
    this.stats = { slices: 0, longest: 0, visited: 0, restarts: 0 };
    const need = closestNeeds(A, B);
    if (!need.closest) return;
    const ac = (this.ac = new AbortController());
    const signal = ac.signal;
    const stats = this.stats;
    this.busy = true;
    const opts = { indices: true, signal, stats, ...(sliceMs ? { sliceMs } : {}) };
    const ra = faceRange(A);
    const rb = faceRange(B);
    const pickedJob = (): Promise<ClosestResult | null> => {
      if (ra && rb) return v.closestPointsAsync(A.meshId, B.meshId, { ...opts, rangeA: ra, rangeB: rb });
      const sa = pickedShape(A, meshOf(A.meshId));
      const sb = pickedShape(B, meshOf(B.meshId));
      return sa && sb ? closestBetweenAsync(sa, sb, { ...opts, wait: nextTask }) : Promise.resolve(null);
    };
    // 멈춘 것이 아닌 실패(없는 묶음 등)는 답 없음 — 앞 판처럼 누른 점 사이 거리로 잰다
    const orNull = (e: unknown): Promise<null> => (signal.aborted ? Promise.reject(e) : Promise.resolve(null));
    const run = async (): Promise<[ClosestResult | null, ClosestResult | null]> => {
      const p = await pickedJob().catch(orNull);
      signal.throwIfAborted();
      return [p, need.parts ? await v.closestPointsAsync(A.meshId, B.meshId, opts).catch(orNull) : null];
    };
    const around = v.trianglesNear?.bind(v);
    run().then(
      ([p, q]) => {
        // 그사이 짝이 바뀌었으면(멈춘 뒤 끝난 조각) 버린다
        if (this.ac !== ac) return;
        this.picked = p;
        this.parts = q && around ? { ...q, near: (id: string, at: readonly number[], r: number) => around(id, at, r, NEAR_OPTS) } : q;
        this.busy = false;
        later();
      },
      () => undefined,
    );
  }
}

/**
 * 두 개체 측정. 둘 다 해석적으로 잴 수 있으면 entmeasure, 아니면 closest(고른 면·모서리 사이 최소 거리 ≈).
 * parts를 주고 두 개체가 다른 그물이면 부품 사이 최소 거리를 덧붙인다(해석적으로 못 잴 때만 — 앱은 둘 다 EntClosest가 나눠 돌려 구한 답을 준다, closestNeeds와 같은 조건).
 * refine·refineParts(40차 — 곡선 접선 조각의 exactdist.ts)를 주면 그 삼각형 답을 B-rep 곡면·곡선 정의로 다듬어, 받으면 "≈" 없이 그 값·두 점으로 보인다.
 * size는 각 덧그림 팔 길이 기준(장면 단위)
 */
export function measurePicked(
  A: Picked,
  B: Picked,
  opts: {
    size: number;
    closest?: (a: Picked, b: Picked) => Closest | null;
    parts?: (idA: string, idB: string) => Closest | null;
    refine?: (a: Picked, b: Picked, c: Closest) => Closest | null;
    refineParts?: (idA: string, idB: string, r: Closest) => Closest | null;
  },
): PickedMeasure {
  if (A.entity && B.entity) return { ...measureEntities(A.entity, B.entity, opts.size), approx: false };
  const lines: MeasureLine[] = [];
  const annotations: EntityMeasure['annotations'] = [];
  const v3 = (p: readonly number[]): V3 => [p[0]!, p[1]!, p[2]!];
  const c = opts.closest?.(A, B) ?? null;
  if (c) {
    const e = opts.refine?.(A, B, c) ?? null;
    const m = e ?? c;
    lines.push({ label: '최소 거리', unit: 'length', value: m.distance, approx: !e });
    annotations.push({ kind: 'distance', a: v3(m.a), b: v3(m.b), line: 0 });
  } else {
    lines.push({ label: '누른 점 사이 거리', unit: 'length', value: dist(A.point, B.point) });
    annotations.push({ kind: 'distance', a: A.point, b: B.point, line: 0 });
  }
  if (A.meshId !== B.meshId && opts.parts) {
    const r = opts.parts(A.meshId, B.meshId);
    if (r) {
      const e = opts.refineParts?.(A.meshId, B.meshId, r) ?? null;
      const m = e ?? r;
      lines.push({ label: '부품 사이 최소 거리', unit: 'length', value: m.distance, approx: !e });
      annotations.push({ kind: 'distance', a: v3(m.a), b: v3(m.b), line: lines.length - 1 });
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
 * 측정 띠의 개체 측정 글(62차 — 앱 입구 app.ts에서 옮김): 안내, 첫 개체(이름·주요 치수), 결과(첫 줄 굵게, 나머지와 두 개체 이름).
 * 두 개체를 눌렀어도 최소 거리를 구하는 동안(결과 없음)은 첫 개체와 안내
 */
export function entityBar(ent: { picks: readonly Picked[]; result: PickedMeasure | null }, fm: Fmt, touch: boolean): HTMLElement[] {
  const { picks, result } = ent;
  if (result && picks.length === 2) {
    const [first, ...rest] = result.lines;
    const sub: (Node | string)[] = [];
    for (const l of rest) sub.push(h('span', {}, l.label), ` ${lineValue(l, fm)} · `);
    sub.push(h('span', {}, picks[0]!.title), ' ↔ ', h('span', {}, picks[1]!.title));
    return [...(first ? [h('b', { class: 'mb-value' }, h('span', {}, first.label), ` ${lineValue(first, fm)}`)] : []), h('span', { class: 'mb-sub' }, ...sub)];
  }
  const p = picks[0];
  const out: HTMLElement[] = [];
  if (p) {
    const main = p.face ? faceSummary(p.face, fm).main : p.edge && p.what === 'edge' ? edgeSummary(p.edge, fm).main : null;
    out.push(h('b', { class: 'mb-value' }, h('span', {}, p.title), main ? ` ${main}` : null));
  }
  out.push(h('span', { class: p ? 'mb-sub' : 'mb-hint' }, entityHint(picks.length, touch)));
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
