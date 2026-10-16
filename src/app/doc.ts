/**
 * 열린 STEP 문서의 상태와 장면 meta(StepMeta) 읽기(순수, DOM 없음).
 * 워커에서 넘어온 meta는 구조적 복제를 거친 자료이므로 꼴을 하나씩 확인하며 읽는다.
 */
import type { MeasureResult, Pick3d, Scene3d } from 'opencad-viewer3d';
import type { StepHeader } from '../part21';
import type { StepMeta, StepProductNode } from '../scene';
import { formatBytes, formatMs, fmtCount } from './format';
import type { ParseResult } from './protocol';

export type ProductNode = StepProductNode;
export type PanelTab = 'tree' | 'info';

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
}

let serial = 0;

export function createDoc(name: string, size: number, res: ParseResult): StepDoc {
  const products = stepProducts(res.scene);
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
  };
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

/** 그물 id가 든 첫 마디의 경로 열쇠("0/2/1") */
export function productKeyOf(nodes: readonly ProductNode[], meshId: string, prefix = ''): string | null {
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const key = prefix ? `${prefix}/${i}` : String(i);
    if (n.meshIds.includes(meshId)) return key;
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

/** 형상이 바로 놓인 마디(부품 자리) 수 */
export function partCount(nodes: readonly ProductNode[]): number {
  let n = 0;
  const walk = (list: readonly ProductNode[]) => {
    for (const x of list) {
      if (x.meshIds.length) n++;
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
    text: `읽기 ${formatMs(d.openMs)}`,
    title: st ? `해석 ${formatMs(st.parseMs)} · 삼각화 ${formatMs(st.meshMs)} · 워커 전체 ${formatMs(d.parseMs)}` : `워커 ${formatMs(d.parseMs)}`,
  });
  return items;
}
