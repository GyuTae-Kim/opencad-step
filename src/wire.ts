/**
 * 선 형상 → 선분 쌍: 와이어프레임·곡선 형상(GEOMETRICALLY_BOUNDED_WIREFRAME_SHAPE_REPRESENTATION의 GEOMETRIC_CURVE_SET,
 * GEOMETRIC_SET, EDGE_BASED_WIREFRAME_MODEL, SHELL_BASED_WIREFRAME_MODEL, 형상 표현 안의 독립 곡선)과
 * PMI 주석의 그림(곡선, TESSELLATED_CURVE_SET, 삼각형 글자의 윤곽, ANNOTATION_FILL_AREA 경계).
 *
 * 곡선은 Geometry의 곡선 객체를 허용 오차(형상 크기 대비 현 높이·최대 각)에 맞춰 나누고, 모서리(EDGE_CURVE)는
 * B-rep 삼각화와 같은 모서리 다각선을 쓴다. 끝이 없는 곡선(LINE, 잘리지 않은 포물선 등)은 그리지 않고 센다.
 */
import type { BrepMesher } from './brep';
import type { Tol } from './curves';
import type { Geometry } from './geometry';
import { dist, type V3 } from './math';
import { list, numList, partOf, refId, refList, type StepEntity, type StepFile } from './part21';

/** 형상 항목 하나의 선 그림(형상 항목 좌표·단위) */
export interface WireGeom {
  /** 선분 쌍 xyz,xyz… */
  segs: number[];
  /** 점 xyz… */
  points: number[];
}

export interface WireOptions {
  /** 크기 대비 현 높이 */
  relTol: number;
  /** 절대 현 높이(있으면 relTol 대신) */
  absTol?: number;
  /** 최대 각(라디안) */
  angle: number;
}

/** 묶음(집합·와이어프레임 모형·껍질·고리) 개체 */
const SET_TYPES = new Set([
  'GEOMETRIC_SET',
  'GEOMETRIC_CURVE_SET',
  'EDGE_BASED_WIREFRAME_MODEL',
  'SHELL_BASED_WIREFRAME_MODEL',
  'CONNECTED_EDGE_SET',
  'WIRE_SHELL',
  'VERTEX_SHELL',
  'EDGE_LOOP',
  'POLY_LOOP',
  'VERTEX_LOOP',
  'PATH',
  'OPEN_PATH',
  'ORIENTED_PATH',
  'TESSELLATED_GEOMETRIC_SET',
  'ANNOTATION_FILL_AREA',
]);

/** 곡선 개체(Geometry.curve가 아는 것) */
const CURVE_TYPES = new Set([
  'LINE',
  'CIRCLE',
  'ELLIPSE',
  'PARABOLA',
  'HYPERBOLA',
  'POLYLINE',
  'TRIMMED_CURVE',
  'COMPOSITE_CURVE',
  'COMPOSITE_CURVE_ON_SURFACE',
  'BOUNDARY_CURVE',
  'OUTER_BOUNDARY_CURVE',
  'SURFACE_CURVE',
  'INTERSECTION_CURVE',
  'SEAM_CURVE',
  'BOUNDED_SURFACE_CURVE',
  'PCURVE',
  'BOUNDED_PCURVE',
  'B_SPLINE_CURVE',
  'B_SPLINE_CURVE_WITH_KNOTS',
  'BEZIER_CURVE',
  'UNIFORM_CURVE',
  'QUASI_UNIFORM_CURVE',
  'RATIONAL_B_SPLINE_CURVE',
]);

const EDGE_TYPES = new Set(['EDGE_CURVE', 'ORIENTED_EDGE', 'SUBEDGE']);
const TRI_SET_TYPES = new Set(['TRIANGULATED_SURFACE_SET', 'COMPLEX_TRIANGULATED_SURFACE_SET']);
/** 선 그림이 아닌 것으로 세어 두는 곡면 개체 일부 */
const SURFACE_HINT = /SURFACE|PLANE$|^FACE/;

/** 형상 표현의 항목으로 와이어프레임·곡선 형상인지(이름만 보고 — 복합 인스턴스는 부분 이름) */
export function isWireItemType(f: StepFile, id: number): boolean {
  const t = f.typeOf(id);
  if (t === 'COMPLEX') {
    const parts = f.partNames(id) ?? [];
    return parts.includes('B_SPLINE_CURVE') || parts.includes('BEZIER_CURVE');
  }
  return SET_TYPES.has(t) || CURVE_TYPES.has(t) || EDGE_TYPES.has(t);
}

type Leaf = { kind: 'curve'; id: number } | { kind: 'edge'; id: number } | { kind: 'poly'; pts: V3[]; closed: boolean } | { kind: 'point'; p: V3 } | { kind: 'segs'; segs: number[] };

export class WireSampler {
  /** 끝이 없어 그리지 않은 곡선 수 */
  unbounded = 0;
  /** 집합 안의 곡면 등 그리지 않은 것 → 개수 */
  readonly skipped = new Map<string, number>();

  constructor(
    readonly f: StepFile,
    readonly g: Geometry,
    readonly mesher: BrepMesher,
    readonly opts: WireOptions,
  ) {}

  private skip(t: string): void {
    this.skipped.set(t, (this.skipped.get(t) ?? 0) + 1);
  }

  /** 형상 항목 하나 → 선 그림(그릴 것이 없으면 null) */
  sample(itemId: number): WireGeom | null {
    const leaves: Leaf[] = [];
    this.collect(itemId, leaves, 0, new Set());
    if (!leaves.length) return null;
    // 크기: 끝점·중간점 상자
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    const grow = (p: V3) => {
      for (let k = 0; k < 3; k++) {
        if (p[k]! < lo[k]!) lo[k] = p[k]!;
        if (p[k]! > hi[k]!) hi[k] = p[k]!;
      }
    };
    const curves = new Map<number, ReturnType<Geometry['curve']>>();
    for (const l of leaves) {
      if (l.kind === 'curve') {
        const c = this.g.curve(l.id, false);
        curves.set(l.id, c);
        if (c && Number.isFinite(c.t0) && Number.isFinite(c.t1)) for (let i = 0; i <= 4; i++) grow(c.point(c.t0 + ((c.t1 - c.t0) * i) / 4));
      } else if (l.kind === 'edge') {
        const e = this.edgeEntity(l.id);
        if (e) {
          const a = this.g.point(refId(e.args[1]));
          const b = this.g.point(refId(e.args[2]));
          if (a) grow(a);
          if (b) grow(b);
          const c = e.type === 'EDGE_CURVE' ? this.g.curve(refId(e.args[3]), true) : null;
          if (c && Number.isFinite(c.t0) && Number.isFinite(c.t1) && a && b && dist(a, b) < 1e-12) for (let i = 0; i <= 4; i++) grow(c.point(c.t0 + ((c.t1 - c.t0) * i) / 4));
        }
      } else if (l.kind === 'poly') l.pts.forEach(grow);
      else if (l.kind === 'point') grow(l.p);
      else for (let i = 0; i + 2 < l.segs.length; i += 3) grow([l.segs[i]!, l.segs[i + 1]!, l.segs[i + 2]!]);
    }
    const diag = Number.isFinite(lo[0]) ? dist(lo, hi) : 1;
    const chord = this.opts.absTol ?? Math.max((diag || 1) * this.opts.relTol, 1e-9);
    const tol: Tol = { chord, angle: this.opts.angle };
    const out: WireGeom = { segs: [], points: [] };
    const pushPoly = (pts: V3[], closed = false) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        out.segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
      if (closed && pts.length > 2) {
        const a = pts[pts.length - 1]!;
        const b = pts[0]!;
        if (dist(a, b) > 0) out.segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    };
    let edgesReady = false;
    for (const l of leaves) {
      if (l.kind === 'curve') {
        const c = curves.get(l.id);
        if (!c) continue;
        if (!Number.isFinite(c.t0) || !Number.isFinite(c.t1)) {
          this.unbounded++;
          continue;
        }
        const ts: number[] = [];
        c.sample(c.t0, c.t1, tol, ts);
        const pts: V3[] = [c.point(c.t0)];
        for (const t of ts) pts.push(c.point(t));
        pts.push(c.point(c.t1));
        pushPoly(pts);
      } else if (l.kind === 'edge') {
        if (!edgesReady) {
          this.mesher.setWireTolerance(chord);
          edgesReady = true;
        }
        const pl = this.mesher.edgePolyline(l.id);
        if (pl) pushPoly(pl);
      } else if (l.kind === 'poly') pushPoly(l.pts, l.closed);
      else if (l.kind === 'point') out.points.push(l.p[0], l.p[1], l.p[2]);
      else for (const v of l.segs) out.segs.push(v);
    }
    return out.segs.length || out.points.length ? out : null;
  }

  private edgeEntity(id: number): StepEntity | undefined {
    let e = this.f.get(id);
    let depth = 0;
    while (e && e.type === 'ORIENTED_EDGE' && depth++ < 8) e = this.f.get(refId(e.args[3]));
    return e;
  }

  private collect(id: number, out: Leaf[], depth: number, seen: Set<number>): void {
    if (depth > 8 || seen.has(id)) return;
    seen.add(id);
    const e = this.f.get(id);
    if (!e) return;
    const t = e.type;
    if (t === 'CARTESIAN_POINT' || t === 'VERTEX_POINT') {
      const p = this.g.point(id);
      if (p) out.push({ kind: 'point', p });
      return;
    }
    if (EDGE_TYPES.has(t)) {
      out.push({ kind: 'edge', id });
      return;
    }
    if (CURVE_TYPES.has(t) || (e.parts && (partOf(e, 'B_SPLINE_CURVE') || partOf(e, 'BEZIER_CURVE')))) {
      out.push({ kind: 'curve', id });
      return;
    }
    switch (t) {
      case 'GEOMETRIC_SET':
      case 'GEOMETRIC_CURVE_SET':
      case 'CONNECTED_EDGE_SET':
      case 'WIRE_SHELL':
      case 'EDGE_LOOP':
      case 'PATH':
      case 'OPEN_PATH':
      case 'TESSELLATED_GEOMETRIC_SET':
      case 'ANNOTATION_FILL_AREA':
        // (name, 요소들)
        for (const c of refList(e.args[1])) this.collect(c, out, depth + 1, seen);
        return;
      case 'ORIENTED_PATH':
        this.collect(refId(e.args[2]), out, depth + 1, seen);
        return;
      case 'EDGE_BASED_WIREFRAME_MODEL':
      case 'SHELL_BASED_WIREFRAME_MODEL':
        for (const c of refList(e.args[1])) this.collect(c, out, depth + 1, seen);
        return;
      case 'VERTEX_SHELL':
      case 'VERTEX_LOOP':
        this.collect(refId(e.args[1]), out, depth + 1, seen);
        return;
      case 'POLY_LOOP': {
        const pts = refList(e.args[1])
          .map((p) => this.g.point(p))
          .filter((p): p is V3 => !!p);
        if (pts.length >= 2) out.push({ kind: 'poly', pts, closed: true });
        return;
      }
      case 'TESSELLATED_CURVE_SET': {
        // (name, coordinates, line_strips) — 번호는 1부터
        const coords = this.coords(refId(e.args[1]));
        const segs: number[] = [];
        for (const strip of list(e.args[2])) {
          const s = numList(strip);
          for (let i = 1; i < s.length; i++) {
            const a = coords[s[i - 1]! - 1];
            const b = coords[s[i]! - 1];
            if (a && b) segs.push(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0);
          }
        }
        if (segs.length) out.push({ kind: 'segs', segs });
        return;
      }
      default:
        break;
    }
    if (TRI_SET_TYPES.has(t)) {
      const segs = this.triangleOutline(e);
      if (segs.length) out.push({ kind: 'segs', segs });
      return;
    }
    this.skip(SURFACE_HINT.test(t) ? '곡면' : t);
  }

  private coords(id: number): number[][] {
    const c = this.f.get(id);
    return c ? list(c.args[2]).map((p) => numList(p)) : [];
  }

  /** 삼각형 묶음(채운 글자 등)의 바깥 윤곽: 한 번만 쓰인 변 */
  private triangleOutline(e: StepEntity): number[] {
    // (name, coordinates, pnmax, normals, pnindex, triangles | strips, fans)
    const coords = this.coords(refId(e.args[1]));
    const pnindex = numList(e.args[4]);
    const pos = (k: number): number[] | undefined => coords[(pnindex.length ? pnindex[k - 1]! : k) - 1];
    const tris: number[] = [];
    if (e.type.startsWith('COMPLEX_')) {
      for (const strip of list(e.args[5])) {
        const s = numList(strip);
        for (let i = 0; i + 2 < s.length; i++) tris.push(s[i]!, s[i + 1]!, s[i + 2]!);
      }
      for (const fan of list(e.args[6])) {
        const s = numList(fan);
        for (let i = 1; i + 1 < s.length; i++) tris.push(s[0]!, s[i]!, s[i + 1]!);
      }
    } else for (const tr of list(e.args[5])) tris.push(...numList(tr));
    const count = new Map<string, number>();
    const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
    for (let i = 0; i + 2 < tris.length; i += 3) {
      const [a, b, c] = [tris[i]!, tris[i + 1]!, tris[i + 2]!];
      if (a === b || b === c || c === a) continue;
      for (const [x, y] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const k = key(x, y);
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
    const segs: number[] = [];
    for (const [k, n] of count) {
      if (n !== 1) continue;
      const [x, y] = k.split(',').map(Number) as [number, number];
      const a = pos(x);
      const b = pos(y);
      if (a && b) segs.push(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0);
    }
    return segs;
  }
}
