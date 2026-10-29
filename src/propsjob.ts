/**
 * 닫힌 입체의 질량 속성을 삼각화와 떼어 나중에 구한다(순수 계산, DOM 없음).
 *
 * BrepMesher가 삼각화하면서 면마다 적분에 쓸 것(곡면, 매개변수 공간 다각형, 경계 모서리와 곡선 매개변수, 삼각형 범위)을
 * 남기고(ItemPropsJob), 적분은 MassPropsJob이 따로 한다. 앱 워커는 문서를 보인 뒤 면 단위로 나눠 적분해 결과를 보내고,
 * 다른 문서를 열면 그만둔다. stepToScene(질량 속성 기본값)은 삼각화를 마친 뒤 바로 끝까지 적분한다.
 * 적분은 삼각화하면서 하던 때와 같은 함수에 같은 점을 같은 차례로 넣으므로 값이 비트까지 같다.
 */
import type { Curve } from './curves';
import { addSliverFlux, faceFlux, FLUX, fluxToProps, integrableSurface, lineCurve, PROPS_BREP, PROPS_TIMEOUT, PROPS_TRIANGLES, scaleProps, type Seg, splineSurface, trianglesFlux } from './massprops';
import type { V3 } from './math';
import type { Surface } from './surfaces';
import type { FacePolygon, UV } from './tessellate';

/** 곡선 모서리의 매개변수: 다각선 점마다 곡선 t(t[0] = 시작, 끝이 작을 수 있다) */
export interface EdgeParam {
  c: Curve;
  t: number[];
}

/** 고리 안의 모서리: 다각선(모서리 방향)과 고리를 도는 방향(±1) */
export interface LoopEdge {
  eid: number;
  poly: V3[];
  dir: number;
}

/** 면 하나의 미룬 적분 */
export interface FaceFluxJob {
  /** 곡면. null이면 평평한 다각형으로 삼각화한 면(곡면을 모르거나 다각 고리) — 삼각형 그대로에 모서리 곡선과의 틈을 더한다 */
  surf: Surface | null;
  /** 삼각화한 매개변수 공간 다각형(점의 p는 경계 모서리 다각선의 그 점 객체) */
  polys?: FacePolygon[];
  /** 내보낸 정점의 (u,v)(면의 첫 정점부터) — 삼각형으로 구하는 곡면의 어림 오차 */
  uv?: number[];
  loopEdges: LoopEdge[][];
  /** 고리마다 FACE_BOUND 방향 */
  loopOrient: boolean[];
  /** 모서리 → 이 면에서 쓰인 횟수(2면 이음선) */
  inFace: ReadonlyMap<number, number>;
  /** 면이 뒤집혔는지(ORIENTED_FACE·껍질 방향) */
  reversed: boolean;
  sameSense: boolean;
  /** 이 면을 삼각화한 번의 모서리 곡선 매개변수(모서리 번호 → 곡선·점마다 t) */
  edgeParams: ReadonlyMap<number, EdgeParam>;
}

/** 형상 항목(닫힌 입체) 하나의 미룬 적분: 삼각화한 그대로의 정점·삼각형(면 방향 맞추기 전)과 면마다 할 일 */
export interface ItemPropsJob {
  /** 정점 좌표 xyz…(항목 좌표, 묶음 원점을 빼기 전) */
  P: ArrayLike<number>;
  /** 삼각형 정점 번호(면 방향 맞추기 전) */
  I: ArrayLike<number>;
  /** 면 i의 삼각형은 [faceTri[i], faceTri[i+1]) */
  faceTri: Uint32Array;
  /** 면 i의 첫 정점 번호 */
  vStart: ArrayLike<number>;
  faces: FaceFluxJob[];
  /** 면 방향 맞추기로 뒤집은 면(analysis.ts orientFaces), 없으면 null */
  flips: Uint8Array | null;
  /** 모멘트 기준점(항목 꼭짓점 상자 가운데) */
  c: V3;
  /** 항목 크기(꼭짓점 상자 대각선) */
  diag: number;
  /** 현 높이(삼각형으로 구하는 곡면의 어림 오차) */
  chord: number;
}

/** 색인 [from, to)의 삼각형 넓이 */
export function facetRange(P: ArrayLike<number>, I: ArrayLike<number>, from: number, to: number): number {
  let s = 0;
  for (let t = from; t + 2 < to; t += 3) {
    const a = I[t]! * 3;
    const c = I[t + 1]! * 3;
    const d = I[t + 2]! * 3;
    const ux = P[c]! - P[a]!;
    const uy = P[c + 1]! - P[a + 1]!;
    const uz = P[c + 2]! - P[a + 2]!;
    const vx = P[d]! - P[a]!;
    const vy = P[d + 1]! - P[a + 1]!;
    const vz = P[d + 2]! - P[a + 2]!;
    s += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return s;
}

/**
 * 삼각형으로 구한 곡면 면의 부피 어림 오차: 삼각형(색인 [from, to))마다 (u,v) 가운데의 곡면 점과 삼각형 무게중심 사이 법선 방향 거리 × 넓이의 합
 * (곡면과 삼각형 사이 부피는 꼭짓점에서 0인 혹 모양이라 대개 가운데 거리 × 넓이의 ¾쯤이다 — 여유를 두어 그대로 더한다).
 * uv는 이 면이 내보낸 정점(번호 vStart부터)의 (u,v)
 */
export function facetDeviation(surf: Surface, P: ArrayLike<number>, I: ArrayLike<number>, from: number, to: number, vStart: number, uv: readonly number[]): number {
  let s = 0;
  for (let t = from; t + 2 < to; t += 3) {
    const ia = I[t]!;
    const ib = I[t + 1]!;
    const ic = I[t + 2]!;
    const ka = (ia - vStart) * 2;
    const kb = (ib - vStart) * 2;
    const kc = (ic - vStart) * 2;
    if (Math.min(ka, kb, kc) < 0 || Math.max(ka, kb, kc) + 1 >= uv.length) continue;
    const S = surf.point((uv[ka]! + uv[kb]! + uv[kc]!) / 3, (uv[ka + 1]! + uv[kb + 1]! + uv[kc + 1]!) / 3);
    const a = ia * 3;
    const c1 = ib * 3;
    const c2 = ic * 3;
    const ux = P[c1]! - P[a]!, uy = P[c1 + 1]! - P[a + 1]!, uz = P[c1 + 2]! - P[a + 2]!;
    const wx = P[c2]! - P[a]!, wy = P[c2 + 1]! - P[a + 1]!, wz = P[c2 + 2]! - P[a + 2]!;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const dx = S[0] - (P[a]! + P[c1]! + P[c2]!) / 3;
    const dy = S[1] - (P[a + 1]! + P[c1 + 1]! + P[c2 + 1]!) / 3;
    const dz = S[2] - (P[a + 2]! + P[c1 + 2]! + P[c2 + 2]!) / 3;
    // |d·n̂| × 넓이 = |d·n| / 2
    const e = Math.abs(dx * nx + dy * ny + dz * nz) / 2;
    if (Number.isFinite(e)) s += e;
  }
  return s;
}

/**
 * 해석적 곡면 면의 흐름 값(massprops.ts faceFlux)을 out에: 매개변수 공간 다각형의 토막이 모서리 다각선의 이웃한 두 점이면
 * 그 모서리 곡선(매개변수가 없으면 두 점 사이 직선)으로, 아니면 매개변수 공간 직선으로 적분한다. 못 하면 NaN(out은 그대로), 하면 어림 오차
 */
function surfaceFaceFlux(f: FaceFluxJob, surf: Surface, polys: FacePolygon[], c: V3, size: number, out: Float64Array): number {
  const at = new Map<V3, [LoopEdge, number][]>();
  for (const l of f.loopEdges)
    for (const e of l)
      e.poly.forEach((p, i) => {
        const list = at.get(p);
        if (list) list.push([e, i]);
        else at.set(p, [[e, i]]);
      });
  const seg = (a: UV, b: UV): Seg | null => {
    for (const [e, ia] of at.get(a.p) ?? []) {
      for (const ib of [ia + 1, ia - 1]) {
        if (e.poly[ib] !== b.p) continue;
        const ep = f.edgeParams.get(e.eid);
        // 다각선 첫·끝 점은 꼭짓점이다(곡선 매개변수는 곡선에서 그 점에 가장 가까운 자리 — 곡선이 꼭짓점을 비껴 지날 수 있다)
        const last = e.poly.length - 1;
        if (ep) return { c: ep.c, t0: ep.t[ia]!, t1: ep.t[ib]!, linear: ep.c.linear, v0: ia === 0 || ia === last, v1: ib === 0 || ib === last };
        return { c: lineCurve(a.p, b.p), t0: 0, t1: 1, linear: true };
      }
    }
    return null;
  };
  const tmp = new Float64Array(FLUX);
  let bound: number;
  try {
    bound = faceFlux(surf, polys, c, seg, tmp, size);
  } catch {
    return NaN;
  }
  if (!Number.isFinite(bound) || !tmp.every(Number.isFinite)) return NaN;
  const sg = f.sameSense ? 1 : -1;
  for (let k = 0; k < FLUX; k++) out[k] = sg * tmp[k]!;
  return bound;
}

/**
 * 삼각형으로 구하는 면의 흐름 값을 out에: 이 면 삼각형 [t0, t1)에, 매개변수가 있는 모서리 곡선마다 꺾인 선과 곡선 사이 띠를 더한다
 * (이웃 면이 곡선으로 적분되어도 겉면이 닫히게). 이음선(한 면에서 두 번 쓴 모서리)은 두 띠가 지워지므로 뺀다
 */
function triangleFaceFlux(f: FaceFluxJob, P: ArrayLike<number>, I: ArrayLike<number>, t0: number, t1: number, c: V3, out: Float64Array): void {
  out.fill(0);
  trianglesFlux(out, P, I, t0, t1, c);
  f.loopEdges.forEach((l, li) => {
    for (const e of l) {
      if ((f.inFace.get(e.eid) ?? 0) >= 2) continue;
      const ep = f.edgeParams.get(e.eid);
      if (!ep || ep.t.length !== e.poly.length) continue;
      // 면 경계 방향으로 도는지: 고리 안 방향 × FACE_BOUND 방향 × 면 뒤집힘
      const d = e.dir * (f.loopOrient[li] ? 1 : -1) * (f.reversed ? -1 : 1);
      for (let i = 0; i + 1 < e.poly.length; i++) {
        if (d > 0) addSliverFlux(out, e.poly[i]!, e.poly[i + 1]!, ep.c, ep.t[i]!, ep.t[i + 1]!, c);
        else addSliverFlux(out, e.poly[i + 1]!, e.poly[i]!, ep.c, ep.t[i + 1]!, ep.t[i]!, c);
      }
    }
  });
}

/** 면 하나: 삼각형 넓이·굽은 면인지(늘)와, out이 있으면 흐름 값(out)과 부피 어림 오차 */
export function faceProps(job: ItemPropsJob, fi: number, out: Float64Array | null): { bound: number; facet: number; curved: boolean } {
  const f = job.faces[fi]!;
  const t0 = job.faceTri[fi]!;
  const t1 = job.faceTri[fi + 1]!;
  const facet = facetRange(job.P, job.I, t0 * 3, t1 * 3);
  const surf = f.surf;
  if (!surf) {
    // 평평한 다각형: 삼각형 그대로(정확), 모서리 곡선이 있으면 틈을 메운다
    if (out) triangleFaceFlux(f, job.P, job.I, t0, t1, job.c, out);
    return { bound: 0, facet, curved: false };
  }
  let bound = 0;
  if (out) {
    const triBound = () => (surf.planar ? 0 : f.uv ? facetDeviation(surf, job.P, job.I, t0 * 3, t1 * 3, job.vStart[fi]!, f.uv) : facet * job.chord);
    let b = integrableSurface(surf) && f.polys ? surfaceFaceFlux(f, surf, f.polys, job.c, job.diag, out) : NaN;
    // 조각 다항식 곡면은 곡선이 곡면에서 멀거나(되짚기 실패 포함) 유리 곡면 어림 오차가 크면 삼각형 쪽이 나을 수 있다 — 어림 오차가 작은 쪽
    let tb = NaN;
    if (Number.isFinite(b) && splineSurface(surf)) {
      tb = triBound();
      if (b > tb) b = NaN;
    }
    if (Number.isFinite(b)) bound = b;
    else {
      triangleFaceFlux(f, job.P, job.I, t0, t1, job.c, out);
      bound = Number.isNaN(tb) ? triBound() : tb;
    }
  }
  return { bound, facet, curved: !surf.planar };
}

/** 면 방향을 맞춘 삼각형 번호(뒤집은 면은 둘째·셋째 정점을 바꾼다 — 그물 indices와 같다) */
export function orientedIndices(job: Pick<ItemPropsJob, 'I' | 'faceTri' | 'flips'>): Uint32Array {
  const I = Uint32Array.from(job.I);
  const flips = job.flips;
  if (!flips) return I;
  for (let fi = 0; fi < flips.length; fi++) {
    if (!flips[fi]) continue;
    for (let t = job.faceTri[fi]!; t < job.faceTri[fi + 1]!; t++) {
      const x = I[t * 3 + 1]!;
      I[t * 3 + 1] = I[t * 3 + 2]!;
      I[t * 3 + 2] = x;
    }
  }
  return I;
}

/**
 * 항목 질량 속성: 면 흐름 값의 합(뒤집은 면은 부호를 바꾼다, 닫힘 어긋남 |∮n dA| × 반 대각선 / 3을 어림 오차에 더한다)을 받아들일 만하면 그것,
 * 아니면(적분을 못 했거나, 삼각형 부피와 삼각형 어림 오차의 네 배 넘게 어긋나거나, 어림 오차가 삼각형보다 크면) 삼각형 값.
 * flux가 null이면 시간 한도를 넘은 것(삼각형 값, PROPS_TIMEOUT)
 */
export function itemProps(job: ItemPropsJob, flux: Float64Array | null, fbound: Float64Array, facetA: Float64Array, curved: Uint8Array): Float64Array {
  const nf = job.faces.length;
  const c = job.c;
  const tri = new Float64Array(FLUX);
  const I = orientedIndices(job);
  trianglesFlux(tri, job.P, I, 0, I.length / 3, c);
  let triBound = 0;
  for (let fi = 0; fi < nf; fi++) if (curved[fi]) triBound += facetA[fi]! * job.chord;
  if (!flux) return fluxToProps(tri, c, triBound, PROPS_TIMEOUT);
  const total = new Float64Array(FLUX);
  let bound = 0;
  for (let fi = 0; fi < nf; fi++) {
    const sg = job.flips?.[fi] ? -1 : 1;
    for (let k = 0; k < FLUX; k++) total[k]! += sg * flux[fi * FLUX + k]!;
    bound += fbound[fi]!;
  }
  bound += (Math.hypot(total[10]!, total[11]!, total[12]!) * job.diag) / 6;
  const vb = total[0]! / 3;
  const vt = tri[0]! / 3;
  const finite = total.every(Number.isFinite) && Number.isFinite(bound);
  if (!finite || !(vb > 0) || Math.abs(vb - vt) > 4 * triBound + 1e-9 * Math.abs(vt) + 1e-12 * job.diag ** 3 || bound > triBound + 1e-9 * Math.abs(vt))
    return fluxToProps(tri, c, triBound, PROPS_TRIANGLES);
  return fluxToProps(total, c, bound, PROPS_BREP);
}

/** 항목 하나와 그 값을 받을 면 표들(장면의 meta.faceTables 번호, 장면 단위로 바꾸는 배율 k) */
export interface PropsTarget {
  item: ItemPropsJob;
  tables: { index: number; k: number }[];
}

/** 구한 값: 면 표 번호(meta.faceTables) → 질량 속성(장면 단위, massprops.ts PROPS_LEN칸) */
export interface PropsResult {
  table: number;
  props: Float64Array;
}

/** 질량 속성 적분 시간 한도: 적분에 쓴 시간이 minMs + share × 삼각화 시간을 넘으면 남은 입체는 삼각형 값(PROPS_TIMEOUT) */
export interface PropsBudget {
  minMs: number;
  share: number;
}

export const DEFAULT_PROPS_BUDGET: PropsBudget = { minMs: 1500, share: 0.5 };

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * 장면 하나의 질량 속성 적분(미룬 일). run(sliceMs)을 되풀이해 부르면 면 단위로 나눠 적분하고, 끝낸 입체의 값은 take()로 꺼낸다.
 * 시간 한도(budget)는 입체를 시작할 때 본다 — 넘었으면 그 입체와 남은 입체는 삼각형 값(PROPS_TIMEOUT)이다
 */
export class MassPropsJob {
  /** 끝낸 입체 수 */
  done = 0;
  /** 시간 한도를 넘어 삼각형 값을 쓴 입체 수 */
  timedOut = 0;
  /** 적분에 쓴 시간(ms) */
  ms = 0;
  private results: PropsResult[] = [];
  private cur: { flux: Float64Array | null; fbound: Float64Array; facet: Float64Array; curved: Uint8Array; fi: number } | null = null;

  constructor(
    private readonly items: readonly PropsTarget[],
    /** 삼각화에 쓴 시간(ms) — 시간 한도 */
    private readonly meshMs: number,
    private readonly budget: PropsBudget = DEFAULT_PROPS_BUDGET,
  ) {}

  /** 적분할 입체 수 */
  get total(): number {
    return this.items.length;
  }

  /** 값을 받을 면 표 번호(장면의 meta.faceTables) */
  tables(): number[] {
    return this.items.flatMap((x) => x.tables.map((t) => t.index));
  }

  get finished(): boolean {
    return this.done >= this.items.length;
  }

  /** 적분한다: sliceMs가 지나면(면 하나를 끝낸 뒤) 멈춘다. 다 했으면 true */
  run(sliceMs = Infinity): boolean {
    const t0 = now();
    const end = t0 + sliceMs;
    try {
      while (this.done < this.items.length) {
        const it = this.items[this.done]!;
        const job = it.item;
        const nf = job.faces.length;
        if (!this.cur) {
          const on = this.ms + (now() - t0) <= this.budget.minMs + this.budget.share * Math.max(0, this.meshMs);
          this.cur = { flux: on ? new Float64Array(nf * FLUX) : null, fbound: new Float64Array(nf), facet: new Float64Array(nf), curved: new Uint8Array(nf), fi: 0 };
        }
        const s = this.cur;
        while (s.fi < nf) {
          const fi = s.fi++;
          const r = faceProps(job, fi, s.flux ? s.flux.subarray(fi * FLUX, (fi + 1) * FLUX) : null);
          s.fbound[fi] = r.bound;
          s.facet[fi] = r.facet;
          s.curved[fi] = r.curved ? 1 : 0;
          if (s.fi < nf && now() >= end) return false;
        }
        const props = itemProps(job, s.flux, s.fbound, s.facet, s.curved);
        if (!s.flux) this.timedOut++;
        for (const t of it.tables) this.results.push({ table: t.index, props: t.k === 1 ? props : scaleProps(props, t.k) });
        this.cur = null;
        this.done++;
        if (this.done < this.items.length && now() >= end) return false;
      }
      return true;
    } finally {
      this.ms += now() - t0;
    }
  }

  /** 지난 take() 뒤에 끝낸 입체의 값 */
  take(): PropsResult[] {
    const r = this.results;
    this.results = [];
    return r;
  }
}
