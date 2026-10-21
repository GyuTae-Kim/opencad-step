/**
 * 열린 STEP 문서의 상태와 장면 meta(StepMeta) 읽기(순수, DOM 없음).
 * 워커에서 넘어온 meta는 구조적 복제를 거친 자료이므로 꼴을 하나씩 확인하며 읽는다.
 */
import type { CameraState, MeasureResult, Pick3d, Scene3d } from 'opencad-viewer3d';
import type { StepHeader } from '../part21';
import type { StepProductProps } from '../props';
import type { StepFaceTable, StepMeta, StepPmiPresentation, StepPmiSemantic, StepProductNode, StepSavedView } from '../scene';
import type { MeasureRecord } from './export';
import type { InterferenceResult } from './interference';
import type { FacePick } from './faces';
import { formatBytes, formatMs, fmtCount } from './format';
import type { ParseResult, ParseSource } from './protocol';
import { Visibility } from './visibility';

export type ProductNode = StepProductNode;
export type PanelTab = 'tree' | 'props' | 'layers' | 'pmi' | 'info';

/** 화면용 레이어(meta.layers) */
export interface DocLayer {
  name: string;
  description: string;
  /** 파일이 정한 처음 보이기 */
  visible: boolean;
  /** 그물·선 묶음 id */
  itemIds: string[];
}

/** 화면용 PMI(meta.pmi) */
export interface DocPmi {
  presentations: StepPmiPresentation[];
  semantic: StepPmiSemantic[];
  /** 저장된 보기 */
  views: StepSavedView[];
}

/** 면 고르기용 표(meta.faceKinds·faceTables·meshFaceTable) */
export interface FaceIndex {
  kinds: readonly string[];
  tables: StepFaceTable[];
  /** 그물 id → 표 번호 */
  tableOf: Map<string, number>;
}

/** 고른 항목 묶음(레이어·PMI 목록에서 고른 것) */
export interface ItemSelection {
  ids: string[];
  label: string;
}

/** 정보 탭·상태 막대에 쓰는 meta 요약 */
export interface StepInfo {
  schema: string[];
  header: StepHeader | null;
  /** 원래 파일의 길이 단위 이름(예: millimetre), 모르면 '' */
  lengthUnit: string;
  entityCount: number | null;
  stats: StepMeta['stats'] | null;
  productCounts: StepMeta['productCounts'];
}

export interface StepDoc {
  readonly id: number;
  /** 파일 이름 */
  readonly name: string;
  /** 파일 크기(바이트) */
  readonly size: number;
  readonly scene: Scene3d;
  readonly products: ProductNode[];
  readonly info: StepInfo;
  /** 워커 안 해석 시간(ms) */
  readonly parseMs: number;
  /** 파일 고른 뒤 화면에 올라가기까지(ms) — 열기 끝에 채운다 */
  openMs: number;
  /** 펼친 제품 나무 마디 열쇠("0/2/1") */
  expanded: Set<string>;
  /** 나무에서 고른 마디 열쇠 */
  selKey: string | null;
  /** 3D에서 고른 것 */
  pick: Pick3d | null;
  measure: MeasureResult | null;
  panelTab: PanelTab;
  /** 레이어(없으면 빈 배열) */
  readonly layers: DocLayer[];
  readonly pmi: DocPmi;
  /** 면 표(없으면 null — 면 고르기를 못 한다) */
  readonly faces: FaceIndex | null;
  /** 압축을 풀어 열었으면 그 내력 */
  readonly source: ParseSource | null;
  /** 보이기 상태(나무 눈 단추·레이어·PMI) */
  readonly vis: Visibility;
  /** 3D에서 고른 면 */
  face: FacePick | null;
  /** 레이어·PMI 목록에서 고른 항목 */
  items: ItemSelection | null;
  /** 제품 나무 이름 거르기 */
  treeFilter: string;
  /** 제품 나무에 그리는 최대 줄 수 */
  treeLimit: number;
  /** 파일에 밀도가 없는 부품에 쓸 고른 재질 밀도(kg/m³), 안 골랐으면 null */
  density: number | null;
  /** 격리(이것만 보기)한 것의 이름(격리 띠) */
  isoLabel?: string;
  /** 홈 뷰(처음 맞춘 보기 또는 "지금 보기를 홈으로") */
  home?: CameraState;
  /** 측정 기록(거리·고른 면 — CSV 복사용) */
  measureLog: MeasureRecord[];
  /** 간섭 검사 상태·결과(돌린 적이 없으면 없음) */
  interference?: { running: boolean; done: number; total: number; result?: InterferenceResult; error?: string };
}

/** 제품 나무 기본 줄 수 제한 */
export const TREE_LIMIT = 3000;

let serial = 0;

export function createDoc(name: string, size: number, res: ParseResult): StepDoc {
  const products = stepProducts(res.scene);
  const layers = stepLayers(res.scene);
  const pmi = stepPmi(res.scene);
  return {
    id: ++serial,
    name,
    size,
    scene: res.scene,
    products,
    info: stepInfo(res.scene),
    parseMs: res.ms,
    openMs: res.ms,
    expanded: defaultExpanded(products),
    selKey: null,
    pick: null,
    measure: null,
    panelTab: 'tree',
    layers,
    pmi,
    faces: stepFaceIndex(res.scene),
    source: res.source ?? null,
    vis: createVisibility(layers, pmi),
    face: null,
    items: null,
    treeFilter: '',
    treeLimit: TREE_LIMIT,
    density: null,
    measureLog: [],
  };
}

/** 문서의 보이기 상태: 파일이 숨긴 레이어는 처음부터 끈다 */
export function createVisibility(layers: readonly DocLayer[], pmi: DocPmi): Visibility {
  const layerOf = new Map<string, number>();
  layers.forEach((l, i) => {
    for (const id of l.itemIds) if (!layerOf.has(id)) layerOf.set(id, i);
  });
  const v = new Visibility(layerOf, new Set(pmi.presentations.map((p) => p.id)), layers.length > 0);
  layers.forEach((l, i) => {
    if (!l.visible) v.layerHidden.add(i);
  });
  return v;
}

/** 처음 펼침: 뿌리와 그 바로 아래(두 단계) */
export function defaultExpanded(roots: readonly ProductNode[]): Set<string> {
  const exp = new Set<string>();
  roots.forEach((r, i) => {
    if (r.children.length) exp.add(String(i));
    r.children.forEach((c, j) => {
      if (c.children.length && roots.length === 1) exp.add(`${i}/${j}`);
    });
  });
  return exp;
}

// ───────────────────────── meta 읽기 ─────────────────────────

/** meta.products를 안전하게 읽는다 */
export function stepProducts(scene: Scene3d): ProductNode[] {
  const p = (scene.meta as { products?: unknown } | undefined)?.products;
  if (!Array.isArray(p)) return [];
  const read = (x: unknown, depth: number): ProductNode | null => {
    if (!x || typeof x !== 'object' || depth > 64) return null;
    const o = x as Record<string, unknown>;
    const node: ProductNode = {
      name: String(o.name ?? ''),
      productId: String(o.productId ?? ''),
      meshIds: Array.isArray(o.meshIds) ? (o.meshIds as unknown[]).map(String) : [],
      children: [],
    };
    if (typeof o.instance === 'string' && o.instance) node.instance = o.instance;
    if (Array.isArray(o.lineIds) && o.lineIds.length) node.lineIds = (o.lineIds as unknown[]).map(String);
    const props = readProps(o.props);
    if (props) node.props = props;
    if (Array.isArray(o.matrix) && o.matrix.length === 16 && o.matrix.every((v) => typeof v === 'number' && Number.isFinite(v))) node.matrix = o.matrix as number[];
    if (Array.isArray(o.children))
      for (const c of o.children) {
        const n = read(c, depth + 1);
        if (n) node.children.push(n);
      }
    return node;
  };
  return p.map((x) => read(x, 0)).filter((x): x is ProductNode => !!x);
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);

/** 제품 속성(meta.products[].props)을 꼴을 보며 읽는다 */
function readProps(v: unknown): StepProductProps | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const out: StepProductProps = {};
  for (const k of ['description', 'version', 'definition', 'material', 'densityText'] as const) if (typeof o[k] === 'string' && o[k]) out[k] = o[k] as string;
  if (typeof o.density === 'number' && o.density > 0 && Number.isFinite(o.density)) out.density = o.density;
  if (Array.isArray(o.items)) {
    const items = o.items.filter((x): x is [string, string] => Array.isArray(x) && x.length === 2).map(([a, b]) => [String(a), String(b)] as [string, string]);
    if (items.length) out.items = items;
  }
  return Object.keys(out).length ? out : null;
}

/** meta.layers를 안전하게 읽는다 */
export function stepLayers(scene: Scene3d): DocLayer[] {
  const l = (scene.meta as { layers?: unknown } | undefined)?.layers;
  if (!Array.isArray(l)) return [];
  return l
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      name: String(x.name ?? ''),
      description: typeof x.description === 'string' ? x.description : '',
      visible: x.visible !== false,
      itemIds: [...strList(x.meshIds), ...strList(x.lineIds)],
    }));
}

/** meta.pmi를 안전하게 읽는다 */
export function stepPmi(scene: Scene3d): DocPmi {
  const p = (scene.meta as { pmi?: unknown } | undefined)?.pmi as Record<string, unknown> | undefined;
  if (!p || typeof p !== 'object') return { presentations: [], semantic: [], views: [] };
  const rec = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);
  const presentations: StepPmiPresentation[] = rec(p.presentations).map((x) => {
    const o: StepPmiPresentation = { id: String(x.id ?? ''), name: String(x.name ?? ''), type: String(x.type ?? ''), stepId: Number(x.stepId) || 0 };
    if (typeof x.plane === 'string' && x.plane) o.plane = x.plane;
    if (typeof x.model === 'string' && x.model) o.model = x.model;
    return o;
  });
  const semantic: StepPmiSemantic[] = rec(p.semantic).map((x) => {
    const o: StepPmiSemantic = {
      kind: x.kind === 'tolerance' || x.kind === 'datum' ? x.kind : 'dimension',
      type: String(x.type ?? ''),
      name: String(x.name ?? ''),
      value: String(x.value ?? ''),
      stepId: Number(x.stepId) || 0,
    };
    if (Array.isArray(x.faces) && x.faces.length) o.faces = x.faces.map(Number).filter((n) => n > 0);
    return o;
  });
  const v3 = (v: unknown): [number, number, number] | null => (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? (v as [number, number, number]) : null);
  const views: StepSavedView[] = [];
  for (const x of rec(p.views)) {
    const target = v3(x.target);
    const dir = v3(x.dir);
    const up = v3(x.up);
    if (!target || !dir || !up) continue;
    const view: StepSavedView = {
      id: Number(x.id) || 0,
      name: String(x.name ?? ''),
      target,
      dir,
      up,
      distance: Number(x.distance) || 0,
      projection: x.projection === 'perspective' ? 'perspective' : 'orthographic',
      height: Number(x.height) || 0,
    };
    if (Array.isArray(x.pmiIds) && x.pmiIds.length) view.pmiIds = x.pmiIds.map(String);
    views.push(view);
  }
  return { presentations, semantic, views };
}

/** meta의 면 표를 읽는다(꼴이 맞지 않으면 null) */
export function stepFaceIndex(scene: Scene3d): FaceIndex | null {
  const m = (scene.meta ?? {}) as Record<string, unknown>;
  const kinds = m.faceKinds;
  const tables = m.faceTables;
  const mt = m.meshFaceTable;
  if (!Array.isArray(kinds) || !Array.isArray(tables) || !(mt instanceof Int32Array)) return null;
  const ok = (t: unknown): t is StepFaceTable =>
    !!t && typeof t === 'object' && (t as StepFaceTable).triStart instanceof Uint32Array && (t as StepFaceTable).kinds instanceof Uint8Array && (t as StepFaceTable).params instanceof Float32Array && (t as StepFaceTable).stepIds instanceof Uint32Array;
  if (!tables.every(ok)) return null;
  const tableOf = new Map<string, number>();
  scene.meshes.forEach((mesh, i) => {
    const t = mt[i] ?? -1;
    if (t >= 0 && t < tables.length) tableOf.set(mesh.id, t);
  });
  return { kinds: kinds.map(String), tables, tableOf };
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** meta의 머리·단위·통계 */
export function stepInfo(scene: Scene3d): StepInfo {
  const m = (scene.meta ?? {}) as Record<string, unknown>;
  const h = m.header as Record<string, unknown> | undefined;
  const header: StepHeader | null =
    h && typeof h === 'object'
      ? {
          description: strList(h.description),
          implementationLevel: str(h.implementationLevel),
          name: str(h.name),
          timeStamp: str(h.timeStamp),
          author: strList(h.author),
          organization: strList(h.organization),
          preprocessorVersion: str(h.preprocessorVersion),
          originatingSystem: str(h.originatingSystem),
          authorization: str(h.authorization),
          schemas: strList(h.schemas),
        }
      : null;
  const s = m.stats as Record<string, unknown> | undefined;
  const stats: StepMeta['stats'] | null =
    s && typeof s === 'object'
      ? {
          solids: numOrNull(s.solids) ?? 0,
          faces: numOrNull(s.faces) ?? 0,
          failedFaces: numOrNull(s.failedFaces) ?? 0,
          triangles: numOrNull(s.triangles) ?? 0,
          instances: numOrNull(s.instances) ?? 0,
          parseMs: numOrNull(s.parseMs) ?? 0,
          meshMs: numOrNull(s.meshMs) ?? 0,
          totalMs: numOrNull(s.totalMs) ?? 0,
        }
      : null;
  const productCounts = Array.isArray(m.productCounts)
    ? (m.productCounts as unknown[])
        .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
        .map((x) => ({ name: String(x.name ?? ''), productId: String(x.productId ?? ''), instances: numOrNull(x.instances) ?? 0 }))
    : [];
  return {
    schema: strList(m.schema),
    header,
    lengthUnit: str(m.lengthUnit),
    entityCount: numOrNull(m.entityCount),
    stats,
    productCounts,
  };
}

/** STEP 스키마 이름 → 짧은 이름(AP203·AP214·AP242), 모르면 { } 앞부분 */
export function stepSchemaLabel(schema: string): string {
  const s = schema.toUpperCase().trim();
  if (s.startsWith('AUTOMOTIVE_DESIGN')) return 'AP214';
  if (s.startsWith('CONFIG_CONTROL_DESIGN') || s.startsWith('AP203')) return 'AP203';
  if (s.startsWith('AP242')) return 'AP242';
  if (s.startsWith('AP214')) return 'AP214';
  if (s.startsWith('AP238') || s.startsWith('INTEGRATED_CNC_SCHEMA')) return 'AP238';
  if (s.startsWith('AP209') || s.startsWith('STRUCTURAL_ANALYSIS_DESIGN')) return 'AP209';
  return schema.replace(/\s*\{.*$/, '').trim();
}

/** 스키마 목록 → "AP214"(여럿이면 쉼표) */
export function schemaSummary(schemas: readonly string[]): string {
  return [...new Set(schemas.map(stepSchemaLabel).filter(Boolean))].join(', ');
}

/** 장면 단위 → 글 */
export function unitLabel(u: Scene3d['units']): string {
  return u === 'mm' ? 'mm' : u === 'inch' ? 'in' : u === 'm' ? 'm' : '';
}

/** 장면 크기 요약 */
export function sceneCounts(s: Scene3d): { triangles: number; meshes: number } {
  let triangles = 0;
  for (const m of s.meshes) triangles += (m.indices ? m.indices.length : m.positions.length / 3) / 3;
  return { triangles: Math.round(triangles), meshes: s.meshes.length };
}

// ───────────────────────── 제품 나무 ─────────────────────────

/** 마디와 그 아래 모든 그물 id */
export function subtreeMeshIds(n: ProductNode, out: string[] = []): string[] {
  out.push(...n.meshIds);
  for (const c of n.children) subtreeMeshIds(c, out);
  return out;
}

/** 마디와 그 아래 모든 그물·선 묶음 id */
export function subtreeItemIds(n: ProductNode, out: string[] = []): string[] {
  out.push(...n.meshIds);
  if (n.lineIds) out.push(...n.lineIds);
  for (const c of n.children) subtreeItemIds(c, out);
  return out;
}

/** 그물(또는 선 묶음) id가 든 첫 마디의 경로 열쇠("0/2/1") */
export function productKeyOf(nodes: readonly ProductNode[], meshId: string, prefix = ''): string | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const key = prefix ? `${prefix}/${i}` : String(i);
    if (n.meshIds.includes(meshId) || n.lineIds?.includes(meshId)) return key;
    const k = productKeyOf(n.children, meshId, key);
    if (k) return k;
  }
  return null;
}

/** 경로 열쇠로 마디 찾기 */
export function productAt(nodes: readonly ProductNode[], key: string): ProductNode | null {
  if (!key) return null;
  let list = nodes;
  let node: ProductNode | null = null;
  for (const part of key.split('/')) {
    if (!/^\d+$/.test(part)) return null;
    node = list[Number(part)] ?? null;
    if (!node) return null;
    list = node.children;
  }
  return node;
}

/**
 * 고른 것의 그물 id("고른 부품 보기"·두 번 누르기 확대에 쓴다):
 * 나무 마디를 골랐으면 그 아래 모두, 아니면 3D에서 고른 그물 하나, 없으면 빈 배열.
 */
export function selectionMeshIds(d: Pick<StepDoc, 'products' | 'selKey' | 'pick'>): string[] {
  const node = d.selKey ? productAt(d.products, d.selKey) : null;
  if (node) return subtreeMeshIds(node);
  return d.pick?.kind === 'mesh' ? [d.pick.id] : [];
}

/**
 * 고른 것의 모든 항목 id(맞춰 보기용): 나무 마디면 그 아래 그물·선 모두, 레이어·PMI에서 골랐으면 그 항목들,
 * 아니면 3D에서 고른 항목 하나.
 */
export function selectionItemIds(d: Pick<StepDoc, 'products' | 'selKey' | 'pick' | 'items'>): string[] {
  const node = d.selKey ? productAt(d.products, d.selKey) : null;
  if (node) return subtreeItemIds(node);
  if (d.items) return d.items.ids;
  return d.pick ? [d.pick.id] : [];
}

/** 형상이 바로 놓인 마디(부품 자리) 수 */
export function partCount(nodes: readonly ProductNode[]): number {
  let n = 0;
  const walk = (list: readonly ProductNode[]) => {
    for (const x of list) {
      if (x.meshIds.length || x.lineIds?.length) n++;
      walk(x.children);
    }
  };
  walk(nodes);
  return n;
}

/** 제품(이름·번호)별 인스턴스 수 */
export function instanceCounts(info: StepInfo): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of info.productCounts) {
    const k = productCountKey(c.name, c.productId);
    out.set(k, (out.get(k) ?? 0) + c.instances);
  }
  return out;
}

export function productCountKey(name: string, productId: string): string {
  return `${productId}\u0000${name}`;
}

// ───────────────────────── 상태 막대 ─────────────────────────

export interface StatusItem {
  text: string;
  title?: string;
}

/** 상태 막대 왼쪽: 형식·스키마·단위·파일 크기·삼각형·부품 수·읽은 시간 */
export function docStatus(d: StepDoc): StatusItem[] {
  const items: StatusItem[] = [{ text: 'STEP', title: 'ISO 10303-21 교환 구조' }];
  const schema = schemaSummary(d.info.schema);
  if (schema) items.push({ text: schema, title: `FILE_SCHEMA: ${d.info.schema.join(', ')}` });
  const u = unitLabel(d.scene.units);
  items.push({ text: u ? `단위 ${u}` : '단위 모름', title: d.info.lengthUnit ? `파일 길이 단위: ${d.info.lengthUnit}` : '파일에 길이 단위가 없습니다' });
  items.push({ text: formatBytes(d.size), title: `파일 크기 ${fmtCount(d.size)} 바이트` });
  const c = sceneCounts(d.scene);
  items.push({ text: `삼각형 ${fmtCount(c.triangles)}`, title: `그물 ${fmtCount(c.meshes)}개` });
  items.push({ text: `부품 ${fmtCount(partCount(d.products))}`, title: `제품 ${fmtCount(d.info.productCounts.length)}종, 놓인 형상 ${fmtCount(c.meshes)}개` });
  const st = d.info.stats;
  items.push({
    // NC·SKP 앱과 같게 워커 해석 시간을 보인다(화면에 올라가기까지는 말풍선과 정보 탭에)
    text: `읽기 ${formatMs(d.parseMs)}`,
    title: `${st ? `해석 ${formatMs(st.parseMs)} · 삼각화 ${formatMs(st.meshMs)} · ` : ''}워커 전체 ${formatMs(d.parseMs)} · 화면까지 ${formatMs(d.openMs)}`,
  });
  return items;
}

/** 다시 삼각화한 문서에 앞 문서의 상태(펼침·고르기·보이기·격리·밀도·홈 뷰·측정 기록·패널 탭)를 옮긴다 — 그물 id·나무 열쇠는 해석 순서가 같아 그대로다 */
export function carryDocState(from: StepDoc, to: StepDoc): void {
  to.expanded = new Set(from.expanded);
  to.selKey = from.selKey && productAt(to.products, from.selKey) ? from.selKey : null;
  to.panelTab = from.panelTab;
  to.treeFilter = from.treeFilter;
  to.density = from.density;
  if (from.home) to.home = from.home;
  to.measureLog = from.measureLog;
  if (from.isoLabel) to.isoLabel = from.isoLabel;
  const ids = new Set([...to.scene.meshes.map((m) => m.id), ...to.scene.lines.map((l) => l.id), ...(to.scene.points ?? []).map((p) => p.id)]);
  for (const id of from.vis.userHidden) if (ids.has(id)) to.vis.userHidden.add(id);
  to.vis.layerHidden.clear();
  for (const l of from.vis.layerHidden) to.vis.layerHidden.add(l);
  for (const id of from.vis.pmiHidden) if (to.vis.pmiIds.has(id)) to.vis.pmiHidden.add(id);
  to.vis.pmiOff = from.vis.pmiOff;
  if (from.vis.isolated) to.vis.isolated = new Set([...from.vis.isolated].filter((id) => ids.has(id)));
}

