/**
 * 면 표에 식이 없는 곡면(회전·밀기·B-스플라인·띄운 곡면)을 해석 워커에서 화면으로 보내고 되살린다(순수, DOM 없음).
 *
 * 곡면·곡선 객체(surfaces.ts·curves.ts·nurbs.ts의 클래스)는 함수 없이 수·형식 배열·하위 객체만 들고 있어 postMessage의 구조화 복제로 그대로 옮겨진다.
 * 다만 복제는 클래스(원형)를 잃으므로, 보낼 때 객체를 깊이 우선으로 훑으며 객체마다 클래스 번호(CLASSES 차례, 일반 객체·배열은 −1)를 적고,
 * 받는 쪽에서 같은 차례로 훑으며 원형을 다시 붙인다(복제는 고유 속성의 차례와 같은 객체를 함께 가리키는 것을 지킨다).
 * 모르는 클래스(Map 등)가 든 곡면은 보내지 않는다(그 면은 삼각형 위 점 그대로). 보내는 쪽 형식 배열은 옮기지(transfer) 않고 복사한다 —
 * 워커가 같은 곡면으로 질량 속성을 적분하는 중일 수 있다.
 * 화면 쪽은 측정 곡선 조각(곡면 계산과 함께 필요할 때 받는 조각)만 이 모듈을 가져온다.
 */
import { BSplineCurve, CircleCurve, CompositeCurve, EllipseCurve, HyperbolaCurve, LineCurve, ParabolaCurve, PolylineCurve, SurfaceMappedCurve, TrimmedCurve } from './curves';
import { Basis, NurbsCurve, NurbsSurface } from './nurbs';
import type { FaceSurfaceSet } from './scene';
import { BSplineSurface, ConeSurface, CylinderSurface, ExtrusionSurface, OffsetSurface, PlaneSurface, RevolutionSurface, SphereSurface, type Surface, TorusSurface } from './surfaces';

/** 되살릴 클래스(차례가 곧 번호 — 워커와 화면이 같은 표를 쓴다) */
const CLASSES: readonly { prototype: object }[] = [
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  SphereSurface,
  TorusSurface,
  RevolutionSurface,
  ExtrusionSurface,
  BSplineSurface,
  OffsetSurface,
  LineCurve,
  CircleCurve,
  EllipseCurve,
  ParabolaCurve,
  HyperbolaCurve,
  PolylineCurve,
  BSplineCurve,
  SurfaceMappedCurve,
  TrimmedCurve,
  CompositeCurve,
  Basis,
  NurbsCurve,
  NurbsSurface,
];

/** 화면에 보내는 곡면 정의: 면 표마다 곡면이 있는 면 번호·곡면·배율·원점, 모든 곡면을 훑은 차례의 클래스 번호 */
export interface FaceSurfacePayload {
  tables: ({ faces: Int32Array; surfs: unknown[]; k: number; origin: [number, number, number] } | null)[];
  tags: Int16Array;
}

const isLeaf = (v: object): boolean => ArrayBuffer.isView(v) || v instanceof ArrayBuffer;

/**
 * v 아래 객체를 깊이 우선(고유 속성 차례, 배열은 번호 차례)으로 처음 만날 때마다 visit. visit이 false면 그만두고 false.
 * 형식 배열·버퍼는 잎이라 부르지 않는다
 */
function walk(v: unknown, seen: Set<object>, visit: (o: object) => boolean): boolean {
  if (v === null || typeof v !== 'object' || isLeaf(v) || seen.has(v)) return true;
  seen.add(v);
  if (!visit(v)) return false;
  for (const k of Object.keys(v)) if (!walk((v as Record<string, unknown>)[k], seen, visit)) return false;
  return true;
}

/** 객체의 클래스 번호(일반 객체·배열 −1, 모르는 것 null) */
function classOf(o: object, protos: ReadonlyMap<object, number>): number | null {
  const p = Object.getPrototypeOf(o) as object | null;
  if (p === Object.prototype || p === Array.prototype || p === null) return -1;
  return protos.get(p) ?? null;
}

/**
 * 워커: 다음 해석까지 들고 있을 곡면 정의의 캐시를 버린다(B-스플라인 되짚기 첫 짐작 격자 — 들고 있는 몫의 절반 남짓, 23차 실제 파일 측정).
 * 질량 속성 적분이 같은 곡면으로 되짚기를 하므로 적분이 끝난 뒤(적분 거리가 없으면 해석 뒤 바로) 부른다. 화면도 되살린 곡면에서 쓸 때 같은 격자를 다시 만든다
 */
export function dropFaceSurfaceCaches(set: FaceSurfaceSet | null | undefined): void {
  for (const t of set?.tables ?? []) for (const s of t?.surfs ?? []) s?.dropCaches();
}

/** 워커: 장면의 곡면 정의 → 보낼 꼴(보낼 곡면이 없으면 null) */
export function packFaceSurfaces(set: FaceSurfaceSet | null | undefined): FaceSurfacePayload | null {
  if (!set) return null;
  const protos = new Map(CLASSES.map((c, i) => [c.prototype, i] as const));
  // 곡면마다 따로 훑어 모르는 클래스가 든 것은 뺀다
  const known = (s: Surface): boolean => walk(s, new Set(), (o) => classOf(o, protos) !== null);
  let any = false;
  const tables = set.tables.map((t) => {
    if (!t) return null;
    const faces: number[] = [];
    const surfs: Surface[] = [];
    t.surfs.forEach((s, f) => {
      if (s && known(s)) {
        faces.push(f);
        surfs.push(s);
      }
    });
    if (!faces.length) return null;
    any = true;
    return { faces: Int32Array.from(faces), surfs, k: t.k, origin: [t.origin[0], t.origin[1], t.origin[2]] as [number, number, number] };
  });
  if (!any) return null;
  // 받는 쪽(reviveFaceSurfaces)과 같은 차례: 표 차례, 곡면 차례, 함께 쓰는 객체는 처음 만날 때 한 번
  const tags: number[] = [];
  const seen = new Set<object>();
  for (const t of tables) for (const s of t?.surfs ?? []) walk(s, seen, (o) => (tags.push(classOf(o, protos)!), true));
  return { tables, tags: Int16Array.from(tags) };
}

/**
 * 화면: 받은 곡면 정의(구조화 복제된 것)에 원형을 다시 붙여 (면 표, 면) → 곡면 찾기 함수로. 꼴이 맞지 않으면(차례·번호 어긋남) null.
 * 찾기는 곡면·배율·원점을 돌려주고, 곡면이 없는 면은 null
 */
export function reviveFaceSurfaces(p: FaceSurfacePayload | null | undefined): ((table: number, face: number) => { surf: Surface; k: number; origin: readonly [number, number, number] } | null) | null {
  if (!p || !Array.isArray(p.tables) || !(p.tags instanceof Int16Array)) return null;
  const protos = CLASSES.map((c) => c.prototype);
  const seen = new Set<object>();
  let i = 0;
  let bad = false;
  for (const t of p.tables) {
    if (!t) continue;
    for (const s of t.surfs)
      walk(s, seen, (o) => {
        const c = p.tags[i++];
        if (c === undefined || c >= protos.length) {
          bad = true;
          return false;
        }
        if (c >= 0) Object.setPrototypeOf(o, protos[c]!);
        return true;
      });
    if (bad) return null;
  }
  if (i !== p.tags.length) return null;
  const maps = p.tables.map((t) => {
    if (!t) return null;
    const m = new Map<number, Surface>();
    t.faces.forEach((f, j) => m.set(f, t.surfs[j] as Surface));
    return { m, k: t.k, origin: t.origin };
  });
  return (table, face) => {
    const t = maps[table];
    const surf = t?.m.get(face);
    return t && surf ? { surf, k: t.k, origin: t.origin } : null;
  };
}
