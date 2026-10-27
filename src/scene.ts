/**
 * STEP → Scene3d.
 *
 * 제품 구조: PRODUCT_DEFINITION ← PRODUCT_DEFINITION_SHAPE ← SHAPE_DEFINITION_REPRESENTATION → 표현(SHAPE_REPRESENTATION…),
 * 표현끼리는 SHAPE_REPRESENTATION_RELATIONSHIP(같은 좌표)로 잇고, 조립은 NEXT_ASSEMBLY_USAGE_OCCURRENCE(부모→자식)와
 * CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION → ITEM_DEFINED_TRANSFORMATION)
 * 또는 MAPPED_ITEM(REPRESENTATION_MAP)으로 자식을 놓는다. 같은 형상 항목은 한 번만 삼각화하고 Mesh3d.matrix로 여러 번 놓는다.
 * 표현마다 맥락 단위가 다르면 장면 단위(뿌리 표현의 길이 단위)로 바꾼다.
 *
 * 덧붙여(meta 선택 필드·scene.lines): 레이어(PRESENTATION_LAYER_ASSIGNMENT — layers.ts), 와이어프레임·곡선 형상(wire.ts →
 * LineSet3d), 표현 PMI 선과 의미 PMI 목록(pmi.ts), 면 표(그물 삼각형 → B-rep 면, 면 단위 고르기용).
 */
import type { Box3, LineSet3d, Mesh3d, PointSet3d, Rgba, Scene3d } from 'opencad-viewer3d/types';
import { BrepMesher, EDGE_KINDS, EDGE_PARAMS, type EdgeTableData, FACE_KINDS, FACE_PARAMS, type FaceTableData, isMeshableType, isTessellatedType, type ItemMesh, needsOrigin, relativeFloat32 } from './brep';
import { Geometry } from './geometry';
import { readLayers } from './layers';
import { TRUNCATED_WARNING } from './messages';
import { frameMatrix, identity, invert, isIdentity, makeFrame, type M4, mul, normalize, transformPoint, type V3 } from './math';
import { isA, num, partOf, refId, refList, StepFile, StepRef, text } from './part21';
import { findAnnotations, productDefinitionOf, semanticPmi, type StepPmiSemantic } from './pmi';
import { styleTextHeight, textLiterals, textSegments } from './pmitext';
import type { GlyphSource } from './strokefont';
import { readProductProps, type StepProductProps } from './props';
import { readSavedViews } from './savedviews';
import { type ContextColor, readStyles } from './styles';
import { type ContextUnits, contextUnits, DEFAULT_UNITS, sceneUnitMm, sceneUnitOf } from './units';
import { isWireItemType, type WireGeom, WireSampler } from './wire';

export type { StepPmiSemantic } from './pmi';
/** 면 표(meta.faceTables의 한 칸): 그물 삼각형 → B-rep 면. 뜻은 brep.ts FaceTableData */
export type StepFaceTable = FaceTableData;
/** 모서리 표(meta.edgeTables의 한 칸): 윤곽선 선분 → B-rep 모서리. 뜻은 brep.ts EdgeTableData */
export type StepEdgeTable = EdgeTableData;
export { EDGE_KINDS, EDGE_PARAMS, FACE_KINDS, FACE_PARAMS } from './brep';

export interface StepOptions {
  /** 장면 이름(기본: 파일 머리의 FILE_NAME 또는 'STEP') */
  name?: string;
  /** 부품 크기(꼭짓점 상자 대각선) 대비 현 높이. 기본 0.001 */
  tolerance?: number;
  /** 절대 현 높이(모형 단위). 주면 tolerance 대신 */
  chordTolerance?: number;
  /** 이웃 접선·법선 사이 최대 각(도). 기본 20 */
  angleTolerance?: number;
  /** 진행률(0~1)과 단계 이름 */
  onProgress?: (fraction: number, stage: string) => void;
  /** 면 경계 모서리 선(Mesh3d.edges)을 만들지. 기본 true */
  edges?: boolean;
  /** 와이어프레임·곡선 형상(GEOMETRIC_CURVE_SET 등)을 scene.lines로 그릴지. 기본 true */
  curves?: boolean;
  /** 표현 PMI(주석 선)를 scene.lines로 그리고 의미 PMI를 meta.pmi에 모을지. 기본 true */
  pmi?: boolean;
  /** 면 표(meta.faceTables·meta.meshFaceTable)를 만들지. 기본 true */
  faceTable?: boolean;
  /**
   * PMI 글자 가운데 내장 획 글꼴(숫자·영문·기호)에 없는 글자(한글·일본어·중국어 등)의 모양(선택).
   * 해석기는 DOM에 기대지 않으므로 부르는 쪽이 준다 — 앱 워커는 브라우저 글꼴 윤곽선(src/app/glyphs.ts). 없으면 빈 상자
   */
  glyphs?: GlyphSource | null;
}

/** 화면 패널용 제품 나무 마디 */
export interface StepProductNode {
  /** 제품 이름(PRODUCT.name, 없으면 id) */
  name: string;
  /** 제품 번호(PRODUCT.id) */
  productId: string;
  /** 이 자리(인스턴스)의 이름(NEXT_ASSEMBLY_USAGE_OCCURRENCE.name/id), 뿌리면 없음 */
  instance?: string;
  /** 이 자리에 바로 놓인 그물 id */
  meshIds: string[];
  /** 이 자리에 바로 놓인 선(와이어프레임·곡선 형상) 묶음 id — 있을 때만 */
  lineIds?: string[];
  children: StepProductNode[];
  /** 제품 속성(설명·판·재질·밀도·사용자 속성) — 있을 때만, 같은 제품의 자리끼리 함께 쓴다 */
  props?: StepProductProps;
  /** 이 자리의 세계 변환(열 우선 4×4, 장면 단위) — 단위 행렬이 아닐 때만 */
  matrix?: number[];
}

/** 레이어(PRESENTATION_LAYER_ASSIGNMENT, 이름이 같으면 합친다) */
export interface StepLayer {
  name: string;
  description: string;
  /** 파일이 레이어를 숨겼으면(INVISIBILITY) false — 그물은 그대로 만들고 화면이 처음에 숨긴다 */
  visible: boolean;
  meshIds: string[];
  /** 선 묶음(곡선·PMI) id */
  lineIds: string[];
}

/** 표현 PMI 주석 하나(scene.lines의 선 묶음 하나) */
export interface StepPmiPresentation {
  /** LineSet3d id */
  id: string;
  name: string;
  /** STEP 개체 이름(ANNOTATION_CURVE_OCCURRENCE·TESSELLATED_ANNOTATION_OCCURRENCE 등) */
  type: string;
  /** 담긴 주석 평면(ANNOTATION_PLANE) 이름 */
  plane?: string;
  /** 담긴 제도 모형(DRAUGHTING_MODEL) 이름 */
  model?: string;
  /** STEP 인스턴스 번호 */
  stepId: number;
}

/** 저장된 보기(장면 좌표·단위) */
export interface StepSavedView {
  /** CAMERA_MODEL 번호 */
  id: number;
  name: string;
  target: [number, number, number];
  /** 대상 → 눈(단위) */
  dir: [number, number, number];
  up: [number, number, number];
  /** 눈과 대상 사이(중심 투영), 평행이면 0 */
  distance: number;
  projection: 'orthographic' | 'perspective';
  /** 보기 창 세로 크기(장면 단위), 모르면 0 */
  height: number;
  /** 이 보기의 제도 모형에 든 표현 PMI 선 묶음 id(있을 때만) */
  pmiIds?: string[];
}

export interface StepPmi {
  presentations: StepPmiPresentation[];
  semantic: StepPmiSemantic[];
  /** 저장된 보기(있을 때만) */
  views?: StepSavedView[];
}

/** meta에 넣는 요약 */
export interface StepMeta {
  format: 'STEP';
  schema: string[];
  header: StepFile['header'];
  /** 제품 나무(뿌리들) */
  products: StepProductNode[];
  /** 제품별 인스턴스 수 */
  productCounts: { name: string; productId: string; instances: number }[];
  entityCount: number;
  stats: {
    solids: number;
    faces: number;
    failedFaces: number;
    triangles: number;
    instances: number;
    parseMs: number;
    meshMs: number;
    totalMs: number;
  };
  /** 길이 단위 이름(원래 파일) */
  lengthUnit: string;
  /** 레이어(있을 때만) */
  layers?: StepLayer[];
  /** PMI(있을 때만) */
  pmi?: StepPmi;
  /** 면 표 종류 이름(FACE_KINDS, 면 표가 있을 때만) */
  faceKinds?: readonly string[];
  /** 면 표들(같은 형상을 여러 자리에 놓으면 표 하나를 함께 쓴다) */
  faceTables?: StepFaceTable[];
  /** scene.meshes와 같은 순서로 그물마다 면 표 번호(-1 = 없음) */
  meshFaceTable?: Int32Array;
  /** 모서리 표 종류 이름(EDGE_KINDS) */
  edgeKinds?: readonly string[];
  /** 모서리 표들(면 표처럼 같은 형상이면 함께 쓴다) */
  edgeTables?: StepEdgeTable[];
  /** scene.meshes와 같은 순서로 그물마다 모서리 표 번호(-1 = 없음) */
  meshEdgeTable?: Int32Array;
}

interface RepInfo {
  id: number;
  type: string;
  items: number[];
  units: ContextUnits;
}

const DEFAULT_COLOR: Rgba = [0.75, 0.75, 0.78, 1];

/** STEP 바이트 → 장면 */
export function stepToScene(bytes: Uint8Array, opts: StepOptions = {}): Scene3d {
  const t0 = now();
  const progress = opts.onProgress ?? (() => {});
  progress(0, '읽기');
  const f = new StepFile(bytes);
  const tParse = now();
  progress(0.05, '구조');
  const warnings: string[] = [];
  if (f.truncated) warnings.push(TRUNCATED_WARNING);
  if (f.skipped) warnings.push(`문법 오류로 건너뛴 문장 ${f.skipped}개`);
  const styles = readStyles(f);
  const geom = new Geometry(f);
  const mesher = new BrepMesher(f, geom, (id) => styles.colors.get(id), {
    relTol: opts.tolerance ?? 0.001,
    absTol: opts.chordTolerance,
    angle: ((opts.angleTolerance ?? 20) * Math.PI) / 180,
    faceTable: opts.faceTable !== false,
  });
  const wantCurves = opts.curves !== false;
  const wantPmi = opts.pmi !== false;
  const wantFaces = opts.faceTable !== false;
  const wire = new WireSampler(f, geom, mesher, {
    relTol: opts.tolerance ?? 0.001,
    absTol: opts.chordTolerance,
    angle: ((opts.angleTolerance ?? 20) * Math.PI) / 180,
  });
  // ── 레이어 ──
  const layerIdx = readLayers(f);
  const layerOf = layerIdx.layerOf;
  const hasLayers = layerIdx.layers.length > 0;
  const layerMeshes: string[][] = layerIdx.layers.map(() => []);
  const layerLines: string[][] = layerIdx.layers.map(() => []);
  /** 지금 따라가는 표현·사상 항목에서 물려받은 레이어(-1 = 없음) */
  let curLayer = -1;
  /** 형상 항목의 레이어: 항목 → 껍질·첫 면(몇 단계) → 물려받은 것 */
  const itemLayer = (item: number): number => {
    if (!hasLayers) return -1;
    const direct = layerOf.get(item);
    if (direct !== undefined) return direct;
    let cur = f.get(item);
    for (let hop = 0; hop < 2 && cur && !cur.parts; hop++) {
      const next = refId(cur.args[1]) || refList(cur.args[1])[0] || 0;
      if (!next) break;
      const l = layerOf.get(next);
      if (l !== undefined) return l;
      cur = f.get(next);
    }
    return curLayer;
  };

  // ── 표현 ──
  const repCache = new Map<number, RepInfo | null>();
  const ctxCache = new Map<number, ContextUnits>();
  const rep = (id: number): RepInfo | null => {
    const hit = repCache.get(id);
    if (hit !== undefined) return hit;
    const e = f.get(id);
    let r: RepInfo | null = null;
    if (e) {
      const args = e.parts ? (e.parts.find((p) => p.type.endsWith('REPRESENTATION') && p.args.length >= 3)?.args ?? null) : e.args;
      if (args && Array.isArray(args[1]) && args[2] instanceof StepRef) {
        const ctx = refId(args[2]);
        let u = ctxCache.get(ctx);
        if (!u) ctxCache.set(ctx, (u = contextUnits(f, ctx)));
        r = { id, type: e.type, items: refList(args[1]), units: u };
      }
    }
    repCache.set(id, r);
    return r;
  };

  // ── 제품 구조 ──
  const pdReps = new Map<number, number[]>(); // PRODUCT_DEFINITION → 표현
  const repOwner = new Map<number, number>(); // 표현 → PRODUCT_DEFINITION
  for (const id of f.idsOfType('SHAPE_DEFINITION_REPRESENTATION')) {
    const e = f.get(id);
    if (!e) continue;
    const pds = f.get(refId(e.args[0]));
    const r = refId(e.args[1]);
    if (!pds || !r) continue;
    const def = refId(pds.args[2]);
    const dt = f.typeOf(def);
    if (!dt.startsWith('PRODUCT_DEFINITION') || dt.startsWith('PRODUCT_DEFINITION_SHAPE')) continue;
    let l = pdReps.get(def);
    if (!l) pdReps.set(def, (l = []));
    l.push(r);
    if (!repOwner.has(r)) repOwner.set(r, def);
  }
  const srrLinks = new Map<number, number[]>();
  for (const id of f.idsOfType('SHAPE_REPRESENTATION_RELATIONSHIP')) {
    const e = f.get(id);
    if (!e) continue;
    if (e.parts && partOf(e, 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION')) continue;
    const args = e.parts ? (partOf(e, 'REPRESENTATION_RELATIONSHIP')?.args ?? partOf(e, 'SHAPE_REPRESENTATION_RELATIONSHIP')?.args ?? []) : e.args;
    const r1 = refId(args[2]);
    const r2 = refId(args[3]);
    if (!r1 || !r2) continue;
    for (const [a, b] of [
      [r1, r2],
      [r2, r1],
    ] as const) {
      let l = srrLinks.get(a);
      if (!l) srrLinks.set(a, (l = []));
      l.push(b);
    }
  }
  /** 제품의 표현들(같은 좌표로 이어진 것 포함, 다른 제품의 표현은 넘지 않는다) */
  const repsOfPd = (pd: number): number[] => {
    const start = pdReps.get(pd) ?? [];
    const seen = new Set<number>(start);
    const queue = [...start];
    while (queue.length) {
      const r = queue.shift()!;
      for (const o of srrLinks.get(r) ?? []) {
        if (seen.has(o)) continue;
        const owner = repOwner.get(o);
        if (owner !== undefined && owner !== pd) continue;
        seen.add(o);
        queue.push(o);
      }
    }
    return [...seen];
  };

  interface Usage {
    nauo: number;
    child: number;
    name: string;
  }
  const children = new Map<number, Usage[]>();
  const isChild = new Set<number>();
  for (const id of f.idsOfType('NEXT_ASSEMBLY_USAGE_OCCURRENCE')) {
    const e = f.get(id);
    if (!e) continue;
    const parent = refId(e.args[3]);
    const child = refId(e.args[4]);
    if (!parent || !child) continue;
    let l = children.get(parent);
    if (!l) children.set(parent, (l = []));
    l.push({ nauo: id, child, name: text(e.args[1]) || text(e.args[0]) || text(e.args[5]) });
    isChild.add(child);
  }
  // NAUO → 자리 변환 관계
  const nauoRel = new Map<number, number>();
  for (const id of f.idsOfType('CONTEXT_DEPENDENT_SHAPE_REPRESENTATION')) {
    const e = f.get(id);
    if (!e) continue;
    const pds = f.get(refId(e.args[1]));
    if (!pds) continue;
    nauoRel.set(refId(pds.args[2]), refId(e.args[0]));
  }

  const productName = (pd: number): { name: string; id: string } => {
    const e = f.get(pd);
    const form = e ? f.get(refId(e.args[2])) : undefined;
    const prod = form ? f.get(refId(form.args[2])) : undefined;
    const id = prod ? text(prod.args[0]) : '';
    let name = prod ? text(prod.args[1]) : '';
    if (!name) name = id || (e ? text(e.args[1]) || text(e.args[0]) : '');
    // 이름이 비면 표현 이름, 그다음 파일 머리 이름
    if (!name) for (const r of pdReps.get(pd) ?? []) if (!name) name = text(f.get(r)?.args[0]);
    if (!name) name = baseName(f.header.name);
    return { name: name || `제품 #${pd}`, id };
  };

  // ── 단위 ──
  let sceneUnits: 'mm' | 'inch' | 'm' | 'unknown' = 'unknown';
  let sceneMm = 1;
  let lengthUnit = '';
  const pickUnits = (u: ContextUnits) => {
    if (sceneUnits !== 'unknown' || !u.known) return;
    if (u.lengthMm === 1 || u.lengthMm === 25.4 || u.lengthMm === 1000) sceneUnits = sceneUnitOf(u.lengthMm);
    else sceneUnits = u.lengthMm > 100 ? 'm' : u.lengthMm > 10 ? 'inch' : 'mm';
    sceneMm = sceneUnitMm(sceneUnits);
    lengthUnit = u.lengthName;
  };

  // ── 변환 ──
  /** 배치 행렬(표현 단위 → 장면 단위) */
  const placement = (id: number, repUnits: ContextUnits): M4 | null => {
    const e = f.get(id);
    if (!e) return null;
    const k = repUnits.lengthMm / sceneMm;
    if (e.type === 'AXIS2_PLACEMENT_3D' || e.type === 'AXIS2_PLACEMENT_2D' || e.type === 'AXIS1_PLACEMENT') {
      const fr = geom.frame(id);
      if (!fr) return null;
      return frameMatrix({ ...fr, o: [fr.o[0] * k, fr.o[1] * k, fr.o[2] * k] });
    }
    if (e.type.startsWith('CARTESIAN_TRANSFORMATION_OPERATOR')) {
      // 끝에서부터: (… axis1, axis2, local_origin, scale[, axis3])
      const a = e.args;
      const is3 = e.type.endsWith('_3D');
      const n = a.length;
      const ax3 = is3 ? geom.direction(refId(a[n - 1])) : null;
      const sc = num(a[is3 ? n - 2 : n - 1], 1) || 1;
      const org = geom.point(refId(a[is3 ? n - 3 : n - 2])) ?? [0, 0, 0];
      const ax2 = geom.direction(refId(a[is3 ? n - 4 : n - 3]));
      const ax1 = geom.direction(refId(a[is3 ? n - 5 : n - 4]));
      const z = ax3 ?? (ax1 && ax2 ? crossV(ax1, ax2) : null);
      const fr = makeFrame([org[0] * k, org[1] * k, org[2] * k], z, ax1);
      const m = frameMatrix(fr, sc);
      return m;
    }
    return null;
  };
  /** 배치가 어느 표현의 항목인지 */
  const itemOf = (repIds: number[], item: number) => repIds.some((r) => rep(r)?.items.includes(item));

  /** NAUO 자리의 자식→부모 변환 */
  const nauoTransform = (nauo: number, parentPd: number, childPd: number): M4 => {
    const relId = nauoRel.get(nauo);
    if (!relId) return identity();
    const rel = f.get(relId);
    if (!rel) return identity();
    const rr = rel.parts ? (partOf(rel, 'REPRESENTATION_RELATIONSHIP')?.args ?? []) : rel.args;
    const rwt = rel.parts ? partOf(rel, 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION') : undefined;
    const r1 = refId(rr[2]);
    const r2 = refId(rr[3]);
    const opId = rwt ? refId(rwt.args[0]) : refId(rel.args[rel.args.length - 1]);
    const op = f.get(opId);
    if (!op) return identity();
    const childReps = repsOfPd(childPd);
    const parentReps = repsOfPd(parentPd);
    const u1 = rep(r1)?.units ?? DEFAULT_UNITS;
    const u2 = rep(r2)?.units ?? DEFAULT_UNITS;
    if (op.type === 'ITEM_DEFINED_TRANSFORMATION') {
      const i1 = refId(op.args[2]);
      const i2 = refId(op.args[3]);
      // 어느 배치가 자식 표현 것인지: 항목 소속 → 표현 순서 순으로 판단
      let childItem = i1;
      let parentItem = i2;
      let cu = u1;
      let pu = u2;
      const swap = () => {
        childItem = i2;
        parentItem = i1;
        cu = u2;
        pu = u1;
      };
      const i1Child = itemOf(childReps, i1);
      const i2Child = itemOf(childReps, i2);
      const i1Parent = itemOf(parentReps, i1);
      const i2Parent = itemOf(parentReps, i2);
      if (i2Child && !i1Child && (i1Parent || !i2Parent)) swap();
      else if (!(i1Child && !i2Child) && !childReps.includes(r1) && (childReps.includes(r2) || parentReps.includes(r1))) swap();
      const mc = placement(childItem, cu);
      const mp = placement(parentItem, pu);
      if (!mc || !mp) return identity();
      return mul(mp, invert(mc));
    }
    const m = placement(opId, childReps.includes(r1) ? u1 : u2);
    return m ?? identity();
  };

  // ── 자리별 색 덮어쓰기(CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM) ──
  // 지금 따라가는 길(NAUO·표현 관계·사상 항목)의 개체 수. 덮어쓰기의 context가 모두 길에 있으면 그 자리에서만 쓴다
  const onPath = new Map<number, number>();
  const pathPush = (ids: readonly number[]) => {
    for (const x of ids) if (x) onPath.set(x, (onPath.get(x) ?? 0) + 1);
  };
  const pathPop = (ids: readonly number[]) => {
    for (const x of ids) {
      if (!x) continue;
      const n = (onPath.get(x) ?? 0) - 1;
      if (n > 0) onPath.set(x, n);
      else onPath.delete(x);
    }
  };
  // 길에 오를 수 있는 개체: NAUO·그 자리 변환 관계·사상 항목. context가 이 밖의 것(표현·묶음·층 등 — 스키마가 허용한다)만이면
  // 어느 자리 길에도 나타나지 않으니 예전처럼 항목 전체에 쓴다(섞여 있으면 길에 오를 수 있는 것만 맞춘다)
  const pathable = new Set<number>(f.idsOfType('MAPPED_ITEM'));
  for (const l of children.values()) for (const u of l) pathable.add(u.nauo);
  for (const x of nauoRel.values()) pathable.add(x);
  const overridesOf = new Map<number, { c: ContextColor; need: number[] }[]>();
  for (const c of styles.contextColors) {
    let l = overridesOf.get(c.item);
    if (!l) overridesOf.set(c.item, (l = []));
    l.push({ c, need: c.context.filter((x) => pathable.has(x)) });
  }
  /** 이 자리에서 항목(표현·형상 항목)에 쓸 덮어쓰기: 길이 맞는 것 먼저, 없으면 길과 상관없는 것 */
  const contextOverride = (item: number): ContextColor | undefined => {
    const l = overridesOf.get(item);
    if (!l) return undefined;
    return (l.find((o) => o.need.length > 0 && o.need.every((x) => onPath.has(x))) ?? l.find((o) => o.need.length === 0))?.c;
  };
  /** 따라가는 표현·사상 항목에서 물려받은 덮어쓰기 */
  let curOverride: ContextColor | undefined;

  // ── 그물 캐시와 인스턴스 ──
  const meshCache = new Map<number, ItemMesh | null>();
  const meshes: Mesh3d[] = [];
  const productCount = new Map<number, number>();
  let solids = 0;
  let faces = 0;
  let failedFaces = 0;
  let triangles = 0;
  const failReasons = new Map<string, number>();
  let totalFaceEstimate = 0;
  let facesDone = 0;
  const onFace = () => {
    facesDone++;
    if ((facesDone & 63) === 0 && totalFaceEstimate > 0) progress(0.1 + 0.85 * Math.min(1, facesDone / totalFaceEstimate), '삼각화');
  };
  const scaledMeshes = new Map<string, ItemMesh>();
  const getMesh = (item: number, units: ContextUnits): ItemMesh | null => {
    let m = meshCache.get(item);
    if (m === undefined) {
      geom.angleFactor = units.angleRad;
      m = mesher.meshItem(item, onFace);
      geom.trim();
      meshCache.set(item, m);
      if (m) {
        solids++;
        faces += m.faces;
        failedFaces += m.failedFaces;
        triangles += m.triangles;
        for (const [k, v] of m.failures) failReasons.set(k, (failReasons.get(k) ?? 0) + v);
      }
    }
    if (!m) return null;
    const k = units.lengthMm / sceneMm;
    if (k === 1) return m;
    const key = `${item}@${k}`;
    let sm = scaledMeshes.get(key);
    if (!sm) {
      const pos = m.positions.map((x) => x * k);
      const edges = m.edges.map((x) => x * k);
      sm = { ...m, positions: pos, edges, bbox: m.bbox ? [scaleV(m.bbox[0], k), scaleV(m.bbox[1], k)] : null };
      if (m.faceTable) sm.faceTable = scaleFaceTable(m.faceTable, k);
      if (m.edgeTable) sm.edgeTable = scaleEdgeTable(m.edgeTable, k);
      if (m.origin) sm.origin = scaleV(m.origin, k);
      scaledMeshes.set(key, sm);
    }
    return sm;
  };
  let meshSeq = 0;
  const faceTables: FaceTableData[] = [];
  const faceTableOf = new Map<FaceTableData, number>();
  const meshFaceTable: number[] = [];
  const edgeTables: EdgeTableData[] = [];
  const edgeTableOf = new Map<EdgeTableData, number>();
  const meshEdgeTable: number[] = [];
  const instance = (item: number, r: RepInfo, matrix: M4, node: StepProductNode, inheritedColor: Rgba | undefined) => {
    if (styles.hidden.has(item)) return;
    const m = getMesh(item, r.units);
    if (!m) return;
    const id = `step-${++meshSeq}`;
    const itemName = text(f.get(item)?.args[0]);
    // 자리별 덮어쓰기(이 항목 또는 따라온 표현): 파일 색보다 앞선다
    const ov = contextOverride(item) ?? curOverride;
    const base = m.color ?? styles.colors.get(item) ?? inheritedColor ?? DEFAULT_COLOR;
    const color: Rgba = ov ? (ov.color ? [ov.color[0], ov.color[1], ov.color[2], Math.min(ov.color[3], ov.alpha)] : [base[0], base[1], base[2], Math.min(base[3], ov.alpha)]) : base;
    const mesh: Mesh3d = {
      id,
      name: itemName && itemName !== node.name ? `${node.name} / ${itemName}` : node.name,
      positions: m.positions,
      normals: m.normals,
      indices: m.indices,
      color,
      group: node.name,
      doubleSided: !m.closed,
    };
    if (m.colors && !ov?.color) mesh.colors = m.colors;
    if (opts.edges !== false && m.edges.length) mesh.edges = m.edges;
    // B-rep 면 그물: 와이어프레임·숨은선에 삼각형 변을 그리지 않고 B-rep 모서리만(코어 0.7.1) — 모서리 없는 매끈한 닫힌 면(원환 고리 등)이
    // 숨은선에서 촘촘한 삼각형 그물로 보이지 않게. 모서리 선을 끈 해석(edges: false)·삼각형 형식·다각 고리 면은 삼각형 변 그대로
    if (m.triangleEdges === false && opts.edges !== false) mesh.triangleEdges = false;
    if (!isIdentity(matrix)) mesh.matrix = matrix;
    // 닫힌 입체(틈 없이 맞물린 삼각형) — 단면에서 잘린 면을 채운다
    if (m.solid) mesh.closed = true;
    if (m.origin) mesh.origin = [m.origin[0], m.origin[1], m.origin[2]];
    meshes.push(mesh);
    node.meshIds.push(id);
    if (hasLayers) {
      const li = itemLayer(item);
      if (li >= 0) layerMeshes[li]!.push(id);
    }
    let ti = -1;
    if (wantFaces && m.faceTable) {
      const t = m.faceTable;
      ti = faceTableOf.get(t) ?? -1;
      if (ti < 0) {
        ti = faceTables.length;
        faceTables.push(t);
        faceTableOf.set(t, ti);
      }
    }
    meshFaceTable.push(ti);
    let ei = -1;
    if (wantFaces && m.edgeTable && mesh.edges) {
      const t = m.edgeTable;
      ei = edgeTableOf.get(t) ?? -1;
      if (ei < 0) {
        ei = edgeTables.length;
        edgeTables.push(t);
        edgeTableOf.set(t, ei);
      }
    }
    meshEdgeTable.push(ei);
  };

  // ── 선 형상(와이어프레임·곡선) ──
  const lines: LineSet3d[] = [];
  const points: PointSet3d[] = [];
  let lineSeq = 0;
  const wireCache = new Map<string, WireGeom | null>();
  const wireOf = (item: number, units: ContextUnits): WireGeom | null => {
    const k = units.lengthMm / sceneMm;
    const key = `${item}@${k}`;
    let w = wireCache.get(key);
    if (w === undefined) {
      geom.angleFactor = units.angleRad;
      const base = wire.sample(item);
      w = base && k !== 1 ? { segs: base.segs.map((x) => x * k), points: base.points.map((x) => x * k) } : base;
      geom.trim();
      wireCache.set(key, w);
    }
    return w;
  };
  interface WireAgg {
    segs: number[];
    pts: number[];
    color: Rgba | undefined;
    layer: number;
  }
  /** 표현 하나를 따라가는 동안 모은 선(색·레이어별) → 선 묶음으로 */
  const flushWire = (aggs: Map<string, WireAgg>, name: string, node: StepProductNode) => {
    for (const a of aggs.values()) {
      if (a.segs.length) {
        const id = `step-line-${++lineSeq}`;
        const o = originOf(a.segs);
        const ls: LineSet3d = { id, name, positions: relativeFloat32(a.segs, o), group: node.name };
        if (o) ls.origin = o;
        if (a.color) ls.color = a.color;
        lines.push(ls);
        (node.lineIds ??= []).push(id);
        if (a.layer >= 0) layerLines[a.layer]!.push(id);
      }
      if (a.pts.length) {
        const id = `step-point-${++lineSeq}`;
        const o = originOf(a.pts);
        const ps: PointSet3d = { id, name, positions: relativeFloat32(a.pts, o), group: node.name };
        if (o) ps.origin = o;
        if (a.color) ps.color = a.color;
        points.push(ps);
        (node.lineIds ??= []).push(id);
        if (a.layer >= 0) layerLines[a.layer]!.push(id);
      }
    }
  };
  const addWire = (aggs: Map<string, WireAgg>, item: number, r: RepInfo, matrix: M4) => {
    if (styles.hidden.has(item)) return;
    const w = wireOf(item, r.units);
    if (!w) return;
    pickUnits(r.units);
    const color = styles.curveColors.get(item);
    const layer = itemLayer(item);
    const key = `${color ? color.join(',') : ''}|${layer}`;
    let a = aggs.get(key);
    if (!a) aggs.set(key, (a = { segs: [], pts: [], color, layer }));
    appendWorld(a.segs, w.segs, matrix);
    appendWorld(a.pts, w.points, matrix);
  };

  const visitedReps = new Set<number>();
  const consumedNauo = new Set<number>();
  /** 표현 하나의 항목들 */
  const visitRep = (repId: number, matrix: M4, node: StepProductNode, pd: number, depth: number, color: Rgba | undefined) => {
    const r = rep(repId);
    if (!r || depth > 32) return;
    visitedReps.add(repId);
    const prevLayer = curLayer;
    const rl = hasLayers ? layerOf.get(repId) : undefined;
    if (rl !== undefined) curLayer = rl;
    const prevOverride = curOverride;
    curOverride = contextOverride(repId) ?? curOverride;
    let wires: Map<string, WireAgg> | null = null;
    const hasBrep = r.items.some((it) => {
      const t = f.typeOf(it);
      return isMeshableType(t) && !isTessellatedType(t);
    });
    for (const it of r.items) {
      const t = f.typeOf(it);
      if (isMeshableType(t)) {
        // B-rep과 같은 표현에 함께 있는 삼각형 근사(geometric_link 있음)는 겹치므로 건너뛴다
        if (hasBrep && isTessellatedType(t) && hasGeometricLink(f, it)) continue;
        pickUnits(r.units);
        instance(it, r, matrix, node, color);
      } else if (t === 'MAPPED_ITEM') {
        const mi = f.get(it);
        const src = mi ? f.get(refId(mi.args[1])) : undefined;
        if (!mi || !src) continue;
        const mappedRep = refId(src.args[1]);
        const mr = rep(mappedRep);
        if (!mr) continue;
        const mo = placement(refId(src.args[0]), mr.units);
        const mt = placement(refId(mi.args[2]), r.units);
        const T = mo && mt ? mul(mt, invert(mo)) : identity();
        const owner = repOwner.get(mappedRep);
        const use = owner !== undefined ? children.get(pd)?.find((u) => u.child === owner && !consumedNauo.has(u.nauo)) : undefined;
        const col = styles.colors.get(it) ?? color;
        const saveLayer = curLayer;
        const ml = hasLayers ? layerOf.get(it) : undefined;
        if (ml !== undefined) curLayer = ml;
        const link = [it, use?.nauo ?? 0];
        pathPush(link);
        const saveOverride = curOverride;
        curOverride = contextOverride(it) ?? curOverride;
        if (use && owner !== undefined) {
          consumedNauo.add(use.nauo);
          const child = makeNode(owner, use.name);
          node.children.push(child);
          visitPd(owner, mul(matrix, T), child, depth + 1, col);
        } else visitRep(mappedRep, mul(matrix, T), node, pd, depth + 1, col);
        curOverride = saveOverride;
        pathPop(link);
        curLayer = saveLayer;
      } else if (wantCurves && isWireItemType(f, it)) {
        addWire((wires ??= new Map()), it, r, matrix);
      }
    }
    if (wires) flushWire(wires, text(f.get(repId)?.args[0]) || node.name, node);
    curLayer = prevLayer;
    curOverride = prevOverride;
  };
  const productProps = readProductProps(f);
  const makeNode = (pd: number, instanceName?: string): StepProductNode => {
    const pn = productName(pd);
    productCount.set(pd, (productCount.get(pd) ?? 0) + 1);
    const n: StepProductNode = { name: pn.name, productId: pn.id, meshIds: [], children: [] };
    if (instanceName !== undefined) n.instance = instanceName;
    const pp = productProps.get(pd);
    if (pp) n.props = pp;
    return n;
  };
  const path = new Set<number>();
  /** 제품 정의의 첫 자리 세계 변환(PMI를 그 부품 자리에 놓는다) */
  const pdWorld = new Map<number, M4>();
  const visitPd = (pd: number, matrix: M4, node: StepProductNode, depth: number, color: Rgba | undefined) => {
    if (path.has(pd) || depth > 32) return;
    path.add(pd);
    if (!pdWorld.has(pd)) pdWorld.set(pd, matrix);
    if (!isIdentity(matrix) && !node.matrix) node.matrix = Array.from(matrix);
    for (const r of repsOfPd(pd)) visitRep(r, matrix, node, pd, depth, color);
    for (const use of children.get(pd) ?? []) {
      if (consumedNauo.has(use.nauo)) continue;
      const T = nauoTransform(use.nauo, pd, use.child);
      const child = makeNode(use.child, use.name);
      node.children.push(child);
      // 자리로 가는 길: NAUO와 그 자리 변환 관계(CONTEXT_DEPENDENT_SHAPE_REPRESENTATION의 표현 관계)
      const link = [use.nauo, nauoRel.get(use.nauo) ?? 0];
      pathPush(link);
      visitPd(use.child, mul(matrix, T), child, depth + 1, color);
      pathPop(link);
    }
    path.delete(pd);
  };

  // 뿌리 단위 먼저 정한다(변환 행렬이 장면 단위를 쓴다)
  const pdIds = f.idsOfType('PRODUCT_DEFINITION').concat(
    f.idsOfType('PRODUCT_DEFINITION_WITH_ASSOCIATED_DOCUMENTS'),
    f.idsOfType('COMPOSITE_ASSEMBLY_DEFINITION'),
    f.idsOfType('COMPOSITE_ASSEMBLY_SEQUENCE_DEFINITION'),
  );
  const roots = pdIds.filter((pd) => !isChild.has(pd) && (pdReps.has(pd) || children.has(pd)));
  for (const pd of roots) {
    for (const r of repsOfPd(pd)) {
      const ri = rep(r);
      if (ri) pickUnits(ri.units);
    }
  }
  if (sceneUnits === 'unknown') for (const u of ctxCache.values()) pickUnits(u);
  if (sceneUnits === 'unknown') {
    // 첫 표현 맥락
    for (const id of f.idsOfType('GEOMETRIC_REPRESENTATION_CONTEXT')) {
      pickUnits(contextUnits(f, id));
      if (sceneUnits !== 'unknown') break;
    }
  }

  // 진행률용 면 수 추정
  totalFaceEstimate = f.idsOfType('ADVANCED_FACE').length + f.idsOfType('FACE_SURFACE').length + f.idsOfType('FACE').length + f.idsOfType('COMPLEX_TRIANGULATED_FACE').length + f.idsOfType('TRIANGULATED_FACE').length;
  progress(0.1, '삼각화');
  const tMesh0 = now();
  const products: StepProductNode[] = [];
  for (const pd of roots) {
    const node = makeNode(pd);
    products.push(node);
    visitPd(pd, identity(), node, 0, undefined);
  }
  // 제품 구조 밖의 형상(구조가 없거나 이어지지 않은 표현)
  if (!meshes.length) {
    const mappedReps = new Set<number>();
    for (const id of f.idsOfType('REPRESENTATION_MAP')) {
      const e = f.get(id);
      if (e) mappedReps.add(refId(e.args[1]));
    }
    const orphan: StepProductNode = { name: opts.name ?? 'STEP', productId: '', meshIds: [], children: [] };
    // 제품 구조에서 선 형상을 하나도 못 찾았으면 구조 밖 선 형상도 찾는다
    const orphanWires = wantCurves && lines.length === 0 && points.length === 0;
    for (let q = 0; q < f.count; q++) {
      const id = f.allIds()[q]!;
      if (visitedReps.has(id) || mappedReps.has(id)) continue;
      const t = f.typeOf(id);
      if (!t.endsWith('REPRESENTATION') && t !== 'COMPLEX') continue;
      if (t === 'DRAUGHTING_MODEL' || t === 'MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION') continue;
      const r = rep(id);
      if (!r || !r.items.some((it) => isMeshableType(f.typeOf(it)) || f.typeOf(it) === 'MAPPED_ITEM' || (orphanWires && isWireItemType(f, it)))) continue;
      visitRep(id, identity(), orphan, 0, 0, undefined);
    }
    if (orphan.meshIds.length || orphan.lineIds?.length) products.push(orphan);
  }
  // 표현 밖에 홀로 있는 입체(표현이 없는 파일)
  if (!meshes.length) {
    const lone: StepProductNode = { name: opts.name ?? 'STEP', productId: '', meshIds: [], children: [] };
    const used = new Set<number>();
    for (const t of ['MANIFOLD_SOLID_BREP', 'BREP_WITH_VOIDS', 'FACETED_BREP', 'SHELL_BASED_SURFACE_MODEL', 'TESSELLATED_SOLID']) {
      for (const id of f.idsOfType(t)) {
        if (used.has(id)) continue;
        used.add(id);
        instance(id, { id: 0, type: '', items: [], units: DEFAULT_UNITS }, identity(), lone, undefined);
      }
    }
    if (lone.meshIds.length) products.push(lone);
  }
  // ── PMI ──
  let pmiMeta: StepPmi | undefined;
  let pmiText = 0;
  if (wantPmi) {
    const anns = findAnnotations(f, (id) => rep(id)?.items ?? null);
    const semantic = semanticPmi(f);
    const rawViews = readSavedViews(f, geom);
    if (anns.length || semantic.length || rawViews.length) {
      pmiMeta = { presentations: [], semantic };
      // 제도 모형 → 놓을 자리(그 모형이 딸린 제품의 첫 자리)와 단위
      let links: Map<number, number[]> | null = null;
      const allLinks = (): Map<number, number[]> => {
        if (links) return links;
        links = new Map();
        for (const t of ['REPRESENTATION_RELATIONSHIP', 'SHAPE_REPRESENTATION_RELATIONSHIP']) {
          for (const id of f.idsOfType(t)) {
            const e = f.get(id);
            if (!e || (e.parts && partOf(e, 'REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION'))) continue;
            const args = e.parts ? (partOf(e, 'REPRESENTATION_RELATIONSHIP')?.args ?? []) : e.args;
            const a = refId(args[2]);
            const b = refId(args[3]);
            if (!a || !b) continue;
            for (const [x, y] of [
              [a, b],
              [b, a],
            ] as const) {
              let l = links.get(x);
              if (!l) links.set(x, (l = []));
              l.push(y);
            }
          }
        }
        return links;
      };
      const ownerOfRep = (start: number): number => {
        const direct = repOwner.get(start);
        if (direct !== undefined) return direct;
        const L = allLinks();
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length && seen.size < 64) {
          const x = queue.shift()!;
          for (const y of L.get(x) ?? []) {
            if (seen.has(y)) continue;
            const o = repOwner.get(y);
            if (o !== undefined) return o;
            seen.add(y);
            queue.push(y);
          }
        }
        return 0;
      };
      let dmia: Map<number, number> | null = null;
      const placeOf = new Map<number, { m: M4; k: number; angle: number; name: string }>();
      const place = (model: number) => {
        let p = placeOf.get(model);
        if (p) return p;
        const r = model ? rep(model) : null;
        const u = r?.units.known ? r.units : null;
        let pd = model ? ownerOfRep(model) : 0;
        if (!pd && model) {
          if (!dmia) {
            dmia = new Map();
            for (const id of f.idsOfType('DRAUGHTING_MODEL_ITEM_ASSOCIATION')) {
              const e = f.get(id);
              if (!e) continue;
              const dm = refId(e.args[3]);
              if (dm && !dmia.has(dm)) {
                const owner = productDefinitionOf(f, refId(e.args[2]));
                if (owner) dmia.set(dm, owner);
              }
            }
          }
          pd = dmia.get(model) ?? 0;
        }
        p = { m: (pd && pdWorld.get(pd)) || identity(), k: u ? u.lengthMm / sceneMm : 1, angle: u ? u.angleRad : 1, name: model ? text(f.get(model)?.args[0]) || text(partOf(f.get(model)!, 'REPRESENTATION')?.args[0]) : '' };
        placeOf.set(model, p);
        return p;
      };
      let pmiSeq = 0;
      /** 제도 모형 → 그 모형에 든 표현 PMI 선 묶음 id(저장된 보기용) */
      const modelPmi = new Map<number, string[]>();
      for (const a of anns) {
        if (styles.hidden.has(a.id)) continue;
        const pl = place(a.model);
        geom.angleFactor = pl.angle;
        const w = a.item ? wire.sample(a.item) : null;
        // 글자(TEXT_LITERAL): 내장 획 글꼴로 선분(곡선과 함께 들어 있어도)
        const lits = a.item ? textLiterals(f, a.item) : [];
        const txt = lits.length ? textSegments(f, geom, lits, styleTextHeight(f, a.styles), opts.glyphs) : null;
        if (txt && txt.drawn < lits.length) pmiText += lits.length - txt.drawn;
        const raw = [...(w?.segs ?? []), ...(txt?.segs ?? [])];
        if (!raw.length) {
          if (!lits.length && (a.type === 'ANNOTATION_TEXT_OCCURRENCE' || (a.item && f.typeOf(a.item).startsWith('TEXT_LITERAL')))) pmiText++;
          continue;
        }
        const segs: number[] = [];
        appendWorld(segs, pl.k === 1 ? raw : raw.map((x) => x * pl.k), pl.m);
        const id = `step-pmi-${++pmiSeq}`;
        const o = originOf(segs);
        const ls: LineSet3d = { id, name: a.name || 'PMI', positions: relativeFloat32(segs, o) };
        if (o) ls.origin = o;
        const col = styles.curveColorOf(a.styles);
        if (col) ls.color = col;
        lines.push(ls);
        if (hasLayers) {
          const li = layerOf.get(a.id) ?? layerOf.get(a.item);
          if (li !== undefined) layerLines[li]!.push(id);
        }
        const pres: StepPmiPresentation = { id, name: a.name, type: a.type, stepId: a.id };
        if (a.plane) pres.plane = a.plane;
        if (pl.name) pres.model = pl.name;
        pmiMeta.presentations.push(pres);
        (modelPmi.get(a.model) ?? modelPmi.set(a.model, []).get(a.model)!).push(id);
      }
      // 저장된 보기: 카메라가 든 제도 모형 자리·단위로 옮기고, 그 모형의 표현 PMI를 함께
      if (rawViews.length) {
        const views: StepSavedView[] = [];
        for (const rv of rawViews) {
          const pl = place(rv.model);
          const k = pl.k;
          const m = pl.m;
          const pt = (p: V3): V3 => transformPoint(m, [p[0] * k, p[1] * k, p[2] * k]);
          const dv = (d: V3): V3 => normalize([m[0]! * d[0] + m[4]! * d[1] + m[8]! * d[2], m[1]! * d[0] + m[5]! * d[1] + m[9]! * d[2], m[2]! * d[0] + m[6]! * d[1] + m[10]! * d[2]]);
          const v: StepSavedView = { id: rv.id, name: rv.name, target: pt(rv.target), dir: dv(rv.dir), up: dv(rv.up), distance: rv.distance * k, projection: rv.projection, height: rv.height * k };
          const ids = modelPmi.get(rv.model);
          if (ids?.length) v.pmiIds = ids;
          views.push(v);
        }
        pmiMeta.views = views;
      }
    }
  }
  const tMesh = now();

  // 경고
  const unsupported = new Map<string, number>();
  for (const m of [geom.unsupported, mesher.unsupported]) for (const [k, v] of m) unsupported.set(k, (unsupported.get(k) ?? 0) + v);
  for (const [k, v] of [...unsupported].sort((a, b) => b[1] - a[1])) warnings.push(`지원하지 않는 개체 ${k} ${v}개`);
  if (failedFaces) {
    const why = [...failReasons]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ');
    warnings.push(`삼각화하지 못한 면 ${failedFaces}개 / ${faces}개 (${why})`);
  }
  if (wire.unbounded) warnings.push(`끝이 없는 곡선(LINE 등) ${wire.unbounded}개는 그리지 않았다`);
  const skippedSurf = wire.skipped.get('곡면') ?? 0;
  if (skippedSurf) warnings.push(`선 형상 묶음 안의 곡면 ${skippedSurf}개는 그리지 않았다(경계가 없는 곡면)`);
  if (pmiText) warnings.push(`PMI 글자(ANNOTATION_TEXT 등) ${pmiText}개는 그리지 못했다(글이 비었거나 배치가 없음)`);
  if (!meshes.length && !lines.length && !points.length) warnings.push('그릴 형상을 찾지 못했다(B-rep·삼각형 형식 없음)');

  // 경계 상자
  let bounds: Box3 | undefined;
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const bb = boxOfPositions(m.positions);
    if (!bb) continue;
    const o = m.origin ?? [0, 0, 0];
    const corners: V3[] = [];
    for (let c = 0; c < 8; c++) corners.push([(c & 1 ? bb[1][0] : bb[0][0]) + o[0], (c & 2 ? bb[1][1] : bb[0][1]) + o[1], (c & 4 ? bb[1][2] : bb[0][2]) + o[2]]);
    for (const c of corners) {
      const p = m.matrix ? transformPoint(m.matrix, c) : c;
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k]!, p[k]!);
        hi[k] = Math.max(hi[k]!, p[k]!);
      }
    }
  }
  // 선·점(이미 세계 좌표)
  for (const set of [...lines, ...points]) {
    const p = set.positions;
    const o = set.origin ?? [0, 0, 0];
    for (let i = 0; i + 2 < p.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const v = p[i + k]! + o[k]!;
        if (v < lo[k]!) lo[k] = v;
        if (v > hi[k]!) hi[k] = v;
      }
  }
  if (Number.isFinite(lo[0])) bounds = { min: lo, max: hi };

  const productCounts = [...productCount].map(([pd, n]) => {
    const pn = productName(pd);
    return { name: pn.name, productId: pn.id, instances: n };
  });
  const meta: StepMeta = {
    format: 'STEP',
    schema: f.header.schemas,
    header: f.header,
    products,
    productCounts,
    entityCount: f.count,
    stats: {
      solids,
      faces,
      failedFaces,
      triangles,
      instances: meshes.length,
      parseMs: Math.round(tParse - t0),
      meshMs: Math.round(tMesh - tMesh0),
      totalMs: Math.round(now() - t0),
    },
    lengthUnit: lengthUnit || (sceneUnits === 'unknown' ? '' : sceneUnits),
  };
  if (hasLayers) {
    const layers: StepLayer[] = [];
    layerIdx.layers.forEach((l, i) => {
      if (layerMeshes[i]!.length || layerLines[i]!.length) layers.push({ name: l.name, description: l.description, visible: l.visible, meshIds: layerMeshes[i]!, lineIds: layerLines[i]! });
    });
    if (layers.length) meta.layers = layers;
  }
  if (pmiMeta && (pmiMeta.presentations.length || pmiMeta.semantic.length || pmiMeta.views?.length)) meta.pmi = pmiMeta;
  if (wantFaces && faceTables.length) {
    meta.faceKinds = FACE_KINDS;
    meta.faceTables = faceTables;
    meta.meshFaceTable = Int32Array.from(meshFaceTable);
  }
  if (wantFaces && edgeTables.length) {
    meta.edgeKinds = EDGE_KINDS;
    meta.edgeTables = edgeTables;
    meta.meshEdgeTable = Int32Array.from(meshEdgeTable);
  }
  progress(1, '완료');
  const scene: Scene3d = {
    name: opts.name ?? (baseName(f.header.name) || 'STEP'),
    units: sceneUnits,
    meshes,
    lines,
    warnings,
    meta: meta as unknown as Record<string, unknown>,
  };
  if (points.length) scene.points = points;
  if (bounds) scene.bounds = bounds;
  return scene;
}

function baseName(path: string): string {
  const b = path.split(/[\\/]/).pop() ?? '';
  return b.replace(/\.(stp|step|p21)$/i, '');
}

/** 선·점 묶음(세계 좌표 xyz…)이 큰 좌표면 묶음 원점(상자 가운데), 아니면 undefined — 기준은 brep.ts needsOrigin */
function originOf(src: readonly number[]): [number, number, number] | undefined {
  if (src.length < 3) return undefined;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < src.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = src[i + k]!;
      if (v < lo[k]!) lo[k] = v;
      if (v > hi[k]!) hi[k] = v;
    }
  return needsOrigin(lo, hi) ? [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2] : undefined;
}

/** 형상 항목 좌표 xyz… → 세계 좌표로 out 뒤에 붙인다 */
function appendWorld(out: number[], src: readonly number[], m: M4): void {
  if (isIdentity(m)) {
    for (const v of src) out.push(v);
    return;
  }
  for (let i = 0; i + 2 < src.length; i += 3) {
    const x = src[i]!;
    const y = src[i + 1]!;
    const z = src[i + 2]!;
    out.push(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
  }
}

/** 단위를 바꾼 그물의 면 표(길이 매개변수만 배율, 원뿔 반각은 그대로) */
function scaleFaceTable(t: FaceTableData, k: number): FaceTableData {
  const params = new Float64Array(t.params);
  const cone = FACE_KINDS.indexOf('cone');
  for (let i = 0; i < t.kinds.length; i++) {
    const o = i * FACE_PARAMS;
    params[o] = params[o]! * k;
    if (t.kinds[i] !== cone) params[o + 1] = params[o + 1]! * k;
    for (let q = 5; q < 8; q++) params[o + q] = params[o + q]! * k;
  }
  const out: FaceTableData = { ...t, params };
  if (t.area) out.area = t.area.map((a) => a * k * k);
  if (t.perimeter) out.perimeter = t.perimeter.map((x) => x * k);
  return out;
}

/** 단위를 바꾼 그물의 모서리 표(반지름·중심·길이에 배율) */
function scaleEdgeTable(t: EdgeTableData, k: number): EdgeTableData {
  const params = new Float64Array(t.params);
  for (let i = 0; i < t.kinds.length; i++) {
    const o = i * EDGE_PARAMS;
    params[o] = params[o]! * k;
    params[o + 1] = params[o + 1]! * k;
    for (let q = 5; q < 8; q++) params[o + q] = params[o + q]! * k;
  }
  return { ...t, params, length: t.length.map((x) => x * k) };
}

function hasGeometricLink(f: StepFile, id: number): boolean {
  const e = f.get(id);
  if (!e) return false;
  if (e.type === 'TESSELLATED_SOLID' || e.type === 'TESSELLATED_SHELL') return e.args[2] instanceof StepRef;
  return isA(e, 'TRIANGULATED_FACE') || isA(e, 'COMPLEX_TRIANGULATED_FACE') ? e.args[4] instanceof StepRef : false;
}

function boxOfPositions(p: Float32Array): [V3, V3] | null {
  if (!p.length) return null;
  const lo: V3 = [Infinity, Infinity, Infinity];
  const hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = p[i + k]!;
      if (v < lo[k]!) lo[k] = v;
      if (v > hi[k]!) hi[k] = v;
    }
  return [lo, hi];
}

function scaleV(a: V3, k: number): V3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function crossV(a: V3, b: V3): V3 {
  return normalize([a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
