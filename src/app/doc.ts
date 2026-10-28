/**
 * 열린 STEP 문서의 상태와 장면 meta(StepMeta) 읽기(순수, DOM 없음).
 * 워커에서 넘어온 meta는 구조적 복제를 거친 자료이므로 꼴을 하나씩 확인하며 읽는다.
 */
import type { CameraState, MeasureResult, Pick3d, Scene3d } from 'opencad-viewer3d';
import type { StepHeader } from '../part21';
import type { StepProductProps } from '../props';
import type { StepEdgeTable, StepFaceTable, StepMeta, StepPmiPresentation, StepPmiSemantic, StepProductNode, StepSavedView } from '../scene';
import type { MeasureRecord } from './export';
import type { InterferenceResult } from './interference';
import type { EdgePick } from './edges';
import type { Picked, PickedMeasure } from './entpick';
import type { FacePick } from './faces';
import { formatBytes, formatMs, fmtCount } from './format';
import type { ParseResult, ParseSource, PropsProgress } from './protocol';
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

/** 모서리 고르기용 표(meta.edgeKinds·edgeTables·meshEdgeTable) */
export interface EdgeIndex {
  kinds: readonly string[];
  tables: StepEdgeTable[];
  /** 그물 id → 표 번호 */
  tableOf: Map<string, number>;
}

/**
 * 닫힌 입체의 질량 속성(면 표 props) 적분 상태: 워커가 문서를 보인 뒤 따로 구한다(src/worker/parse.worker.ts).
 * - running: 구하는 중 — pending의 면 표는 값을 기다린다(물리 속성은 "계산 중")
 * - done: 다 구했다(또는 처음부터 장면에 들었다)
 * - stopped: 다른 파일을 여느라(또는 워커가 멈춰) 그만뒀다 — 남은 면 표는 화면용 삼각형으로 잰다
 */
export interface DocProps {
  state: 'running' | 'done' | 'stopped';
  /** 값을 기다리는 면 표 번호 */
  pending: Set<number>;
  /** 끝낸·모든 입체 수 */
  done: number;
  total: number;
  /** 시간 한도로 삼각형 값을 쓴 입체 수 */
  timedOut: number;
  /** 적분 시간(ms) */
  ms: number;
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
  /** 고른 몸체 하나(그물 id): 나무의 몸체 줄에서, 또는 몸체 단위로 3D에서(그때는 pick도) 골랐을 때 */
  body: string | null;
  /**
   * 두 점 측정 결과(tangentB = 둘째 점을 곡선 모서리 끝의 접선 잠금으로 찍었다 — 이름만 "접선 방향",
   * refinedA·refinedB = 그 점을 곡선 위로 다듬어 찍었다 — 붙잡지 않은 점이면 "곡선 위 점")
   */
  measure: (MeasureResult & { tangentB?: boolean; refinedA?: boolean; refinedB?: boolean }) | null;
  panelTab: PanelTab;
  /** 레이어(없으면 빈 배열) */
  readonly layers: DocLayer[];
  readonly pmi: DocPmi;
  /** 면 표(없으면 null — 면 고르기를 못 한다) */
  readonly faces: FaceIndex | null;
  /** 모서리 표(없으면 null — 모서리 고르기를 못 한다) */
  readonly edges: EdgeIndex | null;
  /** 압축을 풀어 열었으면 그 내력 */
  readonly source: ParseSource | null;
  /** 보이기 상태(나무 눈 단추·레이어·PMI) */
  readonly vis: Visibility;
  /** 3D에서 고른 면 */
  face: FacePick | null;
  /** 3D에서 고른 모서리(면 고르기 중 모서리 가까이 눌렀을 때) */
  edge: EdgePick | null;
  /** 개체 측정: 누른 개체(0~2)와 두 개 사이 결과 */
  ent: { picks: Picked[]; result: PickedMeasure | null };
  /** 레이어·PMI 목록에서 고른 항목 */
  items: ItemSelection | null;
  /** 제품 나무 이름 거르기 */
  treeFilter: string;
  /** 제품 나무에 그리는 최대 줄 수 */
  treeLimit: number;
  /** 파일에 밀도가 없는 부품에 쓸 고른 재질 밀도(kg/m³), 안 골랐으면 null */
  density: number | null;
  /** 격리(이것만 보기·나머지 흐리게)한 것의 이름(격리 띠) */
  isoLabel?: string;
  /** 격리의 "나머지 흐리게": 초점 항목(그 밖은 흐리고 고를 수 없다), 아니면 null */
  dim: Set<string> | null;
  /** 부품별 불투명도(그물·선 id → 0~1) */
  opacity: Map<string, number>;
  /** 분해 보기 0~1(0 = 제자리) */
  explode: number;
  /** 홈 뷰(처음 맞춘 보기 또는 "지금 보기를 홈으로") */
  home?: CameraState;
  /** 측정 기록(거리·고른 면 — CSV 복사용) */
  measureLog: MeasureRecord[];
  /** 간섭 검사 상태·결과(돌린 적이 없으면 없음) */
  interference?: { running: boolean; done: number; total: number; result?: InterferenceResult; error?: string };
  /** 질량 속성 적분 상태 */
  readonly props: DocProps;
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
    body: null,
    measure: null,
    panelTab: 'tree',
    layers,
    pmi,
    faces: stepFaceIndex(res.scene),
    edges: stepEdgeIndex(res.scene),
    source: res.source ?? null,
    vis: createVisibility(layers, pmi),
    face: null,
    edge: null,
    ent: { picks: [], result: null },
    items: null,
    treeFilter: '',
    treeLimit: TREE_LIMIT,
    density: null,
    dim: null,
    opacity: new Map(),
    explode: 0,
    measureLog: [],
    props: res.props
      ? { state: 'running', pending: new Set(res.props.tables), done: 0, total: res.props.solids, timedOut: 0, ms: 0 }
      : { state: 'done', pending: new Set(), done: 0, total: 0, timedOut: 0, ms: 0 },
  };
}

/**
 * 워커가 보낸 질량 속성 적분 소식을 문서에 넣는다: 값은 면 표(faces.tables[i].props)에, 기다리던 표에서 빼고,
 * 다 했으면 done(시간 한도 수는 정보 탭 통계에도), 'stopped'면 멈춤(남은 표는 삼각형 값)
 */
export function applyDocProps(d: StepDoc, u: PropsProgress | 'stopped'): void {
  const st = d.props;
  if (st.state !== 'running') return;
  if (u === 'stopped') {
    st.state = 'stopped';
    return;
  }
  for (const r of u.results) {
    const t = d.faces?.tables[r.table];
    if (t) t.props = r.props;
    st.pending.delete(r.table);
  }
  st.done = u.done;
  st.total = u.total;
  st.timedOut = u.timedOut;
  st.ms = u.ms;
  if (u.finished) {
    st.state = 'done';
    st.pending.clear();
    if (d.info.stats && u.timedOut) d.info.stats.propsTimedOut = u.timedOut;
  }
}

/** 고른 그물(null이면 모두) 가운데 질량 속성 값이 아직 없는(기다리거나 멈춘) 닫힌 입체가 있는지 */
export function propsPendingFor(d: Pick<StepDoc, 'props' | 'faces' | 'scene'>, ids: ReadonlySet<string> | null): boolean {
  const st = d.props;
  if (!st.pending.size || !d.faces) return false;
  for (const m of d.scene.meshes) {
    if (!m.closed || (ids && !ids.has(m.id))) continue;
    const ti = d.faces.tableOf.get(m.id);
    if (ti !== undefined && st.pending.has(ti)) return true;
  }
  return false;
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

/** 처음 펼침: 뿌리와 그 바로 아래(두 단계) — 몸체가 여럿인 뿌리 부품(부품 하나짜리 파일)은 몸체 줄까지 */
export function defaultExpanded(roots: readonly ProductNode[]): Set<string> {
  const exp = new Set<string>();
  roots.forEach((r, i) => {
    if (r.children.length || hasBodies(r)) exp.add(String(i));
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
    !!t && typeof t === 'object' && (t as StepFaceTable).triStart instanceof Uint32Array && (t as StepFaceTable).kinds instanceof Uint8Array && (t as StepFaceTable).params instanceof Float64Array && (t as StepFaceTable).stepIds instanceof Uint32Array;
  if (!tables.every(ok)) return null;
  const tableOf = new Map<string, number>();
  scene.meshes.forEach((mesh, i) => {
    const t = mt[i] ?? -1;
    if (t >= 0 && t < tables.length) tableOf.set(mesh.id, t);
  });
  return { kinds: kinds.map(String), tables, tableOf };
}
/** meta의 모서리 표를 읽는다(꼴이 맞지 않으면 null) */
export function stepEdgeIndex(scene: Scene3d): EdgeIndex | null {
  const m = (scene.meta ?? {}) as Record<string, unknown>;
  const kinds = m.edgeKinds;
  const tables = m.edgeTables;
  const mt = m.meshEdgeTable;
  if (!Array.isArray(kinds) || !Array.isArray(tables) || !(mt instanceof Int32Array)) return null;
  const ok = (t: unknown): t is StepEdgeTable =>
    !!t && typeof t === 'object' && (t as StepEdgeTable).segStart instanceof Uint32Array && (t as StepEdgeTable).kinds instanceof Uint8Array && (t as StepEdgeTable).params instanceof Float64Array && (t as StepEdgeTable).length instanceof Float64Array;
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
export function selectionMeshIds(d: Pick<StepDoc, 'products' | 'selKey' | 'pick'> & { body?: string | null }): string[] {
  const node = d.selKey ? productAt(d.products, d.selKey) : null;
  if (node) return subtreeMeshIds(node);
  // 윤곽선(모서리)을 골랐어도 그 그물
  if (d.pick?.kind === 'mesh' || d.pick?.kind === 'edge') return [d.pick.id];
  return d.body ? [d.body] : [];
}

/**
 * 고른 것의 모든 항목 id(맞춰 보기용): 나무 마디면 그 아래 그물·선 모두, 레이어·PMI에서 골랐으면 그 항목들,
 * 아니면 3D에서 고른 항목 하나(나무 몸체 줄에서 고른 몸체).
 */
export function selectionItemIds(d: Pick<StepDoc, 'products' | 'selKey' | 'pick' | 'items'> & { body?: string | null }): string[] {
  const node = d.selKey ? productAt(d.products, d.selKey) : null;
  if (node) return subtreeItemIds(node);
  if (d.items) return d.items.ids;
  if (d.pick) return [d.pick.id];
  return d.body ? [d.body] : [];
}

/**
 * 고른 몸체 하나: 나무 몸체 줄에서 고른 것(입체·선 형상), 또는 마디·묶음 없이 3D에서 고른 그물·선 형상(몸체 단위로 누름), 아니면 null.
 * 나무에 없는 표현 PMI 선을 누른 것도 돌려주지만 나무에는 그 줄이 없다
 */
export function selectedBody(d: Pick<StepDoc, 'selKey' | 'items' | 'pick'> & { body?: string | null }): string | null {
  if (d.selKey || d.items) return null;
  if (d.pick) return d.pick.id;
  return d.body ?? null;
}

/** 고르기를 모두 푼다(나무 마디·3D·몸체·묶음·면·모서리) */
export function resetSelection(d: StepDoc): void {
  d.selKey = d.pick = d.body = d.items = d.face = d.edge = null;
}

/**
 * 마디에 바로 놓인 형상 항목(몸체 줄 차례): 입체(meshIds) 다음 선 형상(lineIds — 와이어프레임 곡선·점 묶음).
 * 몸체 줄 열쇠·보기 링크 몸체 낱말의 차례("0/2.3")가 이 차례다
 */
export const nodeItems = (n: ProductNode): string[] => (n.lineIds?.length ? [...n.meshIds, ...n.lineIds] : n.meshIds);

/** 나무에 몸체 줄을 둘 부품: 바로 놓인 형상(입체·선 형상)이 둘 이상 */
export const hasBodies = (n: ProductNode): boolean => n.meshIds.length + (n.lineIds?.length ?? 0) > 1;

/**
 * 몸체(형상 항목)의 파일 이름: 그물 이름 "부품 / 항목"의 항목, 선 형상(wire)은 그 표현 이름(부품 이름과 같으면 없음), 이름이 없으면 ''
 */
export function bodyName(node: ProductNode, item: { name?: string } | undefined, wire = false): string {
  const pre = `${node.name} / `;
  if (item?.name?.startsWith(pre)) return item.name.slice(pre.length);
  return wire && item?.name && item.name !== node.name ? item.name : '';
}

/** 장면 묶음의 종류 */
export type ItemKind = 'mesh' | 'line' | 'point';
type SceneItem = Scene3d['meshes'][number] | Scene3d['lines'][number] | NonNullable<Scene3d['points']>[number];
const meshMaps = new WeakMap<Scene3d, Map<string, Scene3d['meshes'][number]>>();
const itemMaps = new WeakMap<Scene3d, Map<string, [SceneItem, ItemKind]>>();
/** 그물 id → 그물(장면마다 한 번 만든다 — 큰 나무에서 줄마다 찾지 않게) */
export function meshById(scene: Scene3d, id: string): Scene3d['meshes'][number] | undefined {
  let m = meshMaps.get(scene);
  if (!m) meshMaps.set(scene, (m = new Map(scene.meshes.map((x) => [x.id, x]))));
  return m.get(id);
}
/** 묶음 id → 그물·선·점 묶음과 그 종류(장면마다 한 번 만든다) */
export function itemById(scene: Scene3d, id: string): [SceneItem, ItemKind] | undefined {
  let m = itemMaps.get(scene);
  if (!m) {
    m = new Map();
    for (const x of scene.meshes) m.set(x.id, [x, 'mesh']);
    for (const x of scene.lines) m.set(x.id, [x, 'line']);
    for (const x of scene.points ?? []) m.set(x.id, [x, 'point']);
    itemMaps.set(scene, m);
  }
  return m.get(id);
}

/** 선 형상 몸체 줄의 이름: 표현 이름, 없으면 "선 형상 2"·"점 형상 3"(마디 선 형상 차례 — 1부터) */
export function wireLabel(node: ProductNode, item: { name?: string } | undefined, kind: ItemKind | undefined, j: number): string {
  return bodyName(node, item, true) || `${kind === 'point' ? '점 형상' : '선 형상'} ${j}`;
}

/**
 * 고르기 단위(도구 막대 "고르기" 메뉴): 부품 = 형상이 놓인 나무 마디(그 아래 형상) 통째, 몸체 = 형상 항목 하나
 * (MANIFOLD_SOLID_BREP·BREP_WITH_VOIDS·면 모형 등 — 해석기가 항목마다 그물 하나를 만든다), 면 = B-rep 면·모서리(면 고르기)
 */
export type PickUnit = 'part' | 'body' | 'face';

/**
 * 누른 항목 id → 그 단위로 고를 항목 id: 몸체는 그것 하나, 부품은 그 항목이 바로 놓인 마디 아래 모두(나무에서 그 마디를 고른 것과 같다).
 * 나무에 없는 항목(표현 PMI 선 등)은 그것 하나
 */
export function unitItemIds(roots: readonly ProductNode[], id: string, unit: PickUnit): string[] {
  if (unit === 'body') return [id];
  const key = productKeyOf(roots, id);
  const node = key ? productAt(roots, key) : null;
  return node ? subtreeItemIds(node) : [id];
}

/**
 * 몸체 이름(id = 그물·선·점 묶음): 형상 항목에 이름이 있으면 그물 이름("부품 / 항목") 그대로, 없으면(그물 이름 = 부품 이름) 형상 항목이 여럿인 부품에서
 * "부품 · 몸체 2"(나무 마디의 입체 차례). 선 형상은 형상 항목이 여럿인 부품에서 "부품 / 표현 이름" 또는 "부품 · 선 형상 1"(마디 선 형상 차례)
 */
export function bodyTitle(roots: readonly ProductNode[], scene: Scene3d, id: string): string {
  const found = itemById(scene, id);
  const name = found?.[0].name ?? id;
  const key = productKeyOf(roots, id);
  const node = key ? productAt(roots, key) : null;
  if (!node || !hasBodies(node)) return name;
  const i = node.meshIds.indexOf(id);
  if (i >= 0) return name !== node.name ? name : `${name} · 몸체 ${i + 1}`;
  const j = node.lineIds?.indexOf(id) ?? -1;
  if (j < 0) return name;
  const own = bodyName(node, found?.[0], true);
  return own ? `${node.name} / ${own}` : `${node.name} · ${wireLabel(node, undefined, found?.[1], j + 1)}`;
}

/**
 * 여러 개 고르기 한 번: 지금 고른 것(cur)에 ids를 더하고, 이미 모두 들어 있으면 뺀다. 고른 차례를 지킨다(먼저 고른 것 앞)
 */
export function toggledItems(cur: readonly string[], ids: readonly string[]): string[] {
  const set = new Set(cur);
  const all = ids.every((id) => set.has(id));
  for (const id of ids) {
    if (all) set.delete(id);
    else set.add(id);
  }
  const had = new Set(cur);
  return [...cur.filter((id) => set.has(id)), ...ids.filter((id) => set.has(id) && !had.has(id))];
}

/**
 * 여러 개 고른 항목의 이름표: 서로 다른 부품 자리(형상이 바로 놓인 마디) 수 — "부품 3개", 몸체 단위면 항목 수 — "몸체 3개".
 * 부품 단위라도 나무 몸체 줄로 부품의 일부 몸체만 골랐으면 그것은 몸체로 센다 — "부품 2개 · 몸체 1개"
 */
export function multiLabel(roots: readonly ProductNode[], ids: readonly string[], unit: PickUnit = 'part'): string {
  if (unit === 'body') return `몸체 ${ids.length}개`;
  const owner = new Map<string, [string, number]>();
  const walk = (l: readonly ProductNode[], prefix: string) =>
    l.forEach((n, i) => {
      const key = prefix ? `${prefix}/${i}` : String(i);
      const own = n.meshIds.length + (n.lineIds?.length ?? 0);
      for (const id of n.meshIds) owner.set(id, [key, own]);
      for (const id of n.lineIds ?? []) owner.set(id, [key, own]);
      walk(n.children, key);
    });
  walk(roots, '');
  const groups = new Map<string, [number, number]>();
  for (const id of ids) {
    const [k, own] = owner.get(id) ?? [id, 1];
    const g = groups.get(k);
    if (g) g[0]++;
    else groups.set(k, [1, own]);
  }
  let parts = 0;
  let bodies = 0;
  for (const [n, own] of groups.values())
    if (n >= own) parts++;
    else bodies += n;
  return bodies ? (parts ? `부품 ${parts}개 · 몸체 ${bodies}개` : `몸체 ${bodies}개`) : `부품 ${parts}개`;
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
  // 고른 몸체(나무 몸체 줄·몸체 단위 3D 고르기 — 입체·선 형상)는 몸체로 잇는다(3D에서 누른 점은 새 삼각형에 맞지 않아 버린다)
  const body = selectedBody(from);
  if (!to.selKey && body && itemById(to.scene, body) && !to.vis.pmiIds.has(body)) to.body = body;
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
  // 부품 겉모습(흐리게·불투명도·분해) — 코어는 새 장면에서 겉모습을 풀므로 앱이 다시 건다
  if (from.dim) to.dim = new Set([...from.dim].filter((id) => ids.has(id)));
  for (const [id, a] of from.opacity) if (ids.has(id)) to.opacity.set(id, a);
  to.explode = from.explode;
}

