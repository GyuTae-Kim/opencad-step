/**
 * PMI(제품 제조 정보) 읽기.
 *
 * 표현 PMI(그림): DRAUGHTING_MODEL(과 MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION)의 항목 가운데
 * 주석 자리(ANNOTATION_CURVE_OCCURRENCE·ANNOTATION_OCCURRENCE·TESSELLATED_ANNOTATION_OCCURRENCE·
 * ANNOTATION_FILL_AREA_OCCURRENCE 등 STYLED_ITEM 아형)를 모은다. ANNOTATION_PLANE의 elements와
 * DRAUGHTING_CALLOUT의 contents 안으로도 들어간다. 그림 자체(곡선·삼각형 글자)는 wire.ts가 선분으로 만든다.
 *
 * 의미 PMI(목록): 치수(DIMENSIONAL_SIZE·DIMENSIONAL_LOCATION과 아형 — 값은 DIMENSIONAL_CHARACTERISTIC_REPRESENTATION
 * → SHAPE_DIMENSION_REPRESENTATION, 공차는 PLUS_MINUS_TOLERANCE → TOLERANCE_VALUE·LIMITS_AND_FITS),
 * 기하 공차(GEOMETRIC_TOLERANCE 아형 — 크기와 데이텀 글자), 데이텀(DATUM).
 */
import { enumOf, isA, num, partOf, refId, refList, StepRef, StepTyped, text, type StepEntity, type StepFile, type StepValue } from './part21';

/** 표현 PMI 주석 자리 하나 */
export interface AnnotationRef {
  /** 주석 자리 개체 번호 */
  id: number;
  /** 개체 이름(복합이면 주석 쪽 부분 이름) */
  type: string;
  name: string;
  /** 그림 항목(곡선·집합·삼각형 집합 등) */
  item: number;
  /** 양식 배정 번호들(선 색) */
  styles: number[];
  /** 담긴 주석 평면 이름 */
  plane?: string;
  /** 담긴 제도 모형(표현) 번호, 없으면 0 */
  model: number;
}

/** 의미 PMI 한 줄 */
export interface StepPmiSemantic {
  kind: 'dimension' | 'tolerance' | 'datum';
  /** STEP 개체 이름(예: DIMENSIONAL_SIZE, FLATNESS_TOLERANCE, DATUM) */
  type: string;
  /** 이름(예: diameter, 'linear distance', 데이텀 이름) */
  name: string;
  /** 값 글(예: "25 mm +0.1/-0.05", "0.05 mm | A|B", 데이텀 글자) */
  value: string;
  /** STEP 인스턴스 번호 */
  stepId: number;
}

const ANNOTATION_TYPES = [
  'ANNOTATION_OCCURRENCE',
  'ANNOTATION_CURVE_OCCURRENCE',
  'ANNOTATION_FILL_AREA_OCCURRENCE',
  'DRAUGHTING_ANNOTATION_OCCURRENCE',
  'TESSELLATED_ANNOTATION_OCCURRENCE',
  'ANNOTATION_PLACEHOLDER_OCCURRENCE',
  'ANNOTATION_SYMBOL_OCCURRENCE',
  'ANNOTATION_TEXT_OCCURRENCE',
  'ANNOTATION_POINT_OCCURRENCE',
];
const ANNOTATION_SET = new Set(ANNOTATION_TYPES);
const MODEL_TYPES = ['DRAUGHTING_MODEL', 'MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION'];

/** 주석 자리 개체인지(평면 제외) */
function annotationType(e: StepEntity): string | null {
  if (isA(e, 'ANNOTATION_PLANE')) return null;
  if (!e.parts) return ANNOTATION_SET.has(e.type) ? e.type : null;
  // 복합: 가장 구체적인(목록 뒤쪽이 아닌 첫) 주석 부분
  let best: string | null = null;
  for (const p of e.parts) if (ANNOTATION_SET.has(p.type) && (best === null || best === 'ANNOTATION_OCCURRENCE')) best = p.type;
  return best;
}

/** STYLED_ITEM 아형의 (이름, 양식들, 항목) — 단순·복합 */
function styledArgs(e: StepEntity): { name: string; styles: number[]; item: number } {
  if (e.parts) {
    const st = partOf(e, 'STYLED_ITEM');
    return { name: text(partOf(e, 'REPRESENTATION_ITEM')?.args[0]), styles: refList(st?.args[0]), item: refId(st?.args[1]) };
  }
  return { name: text(e.args[0]), styles: refList(e.args[1]), item: refId(e.args[2]) };
}

/** 주석 평면: 이름과 elements */
function planeArgs(e: StepEntity): { name: string; elements: number[] } {
  if (e.parts) return { name: text(partOf(e, 'REPRESENTATION_ITEM')?.args[0]), elements: refList(partOf(e, 'ANNOTATION_PLANE')?.args[0]) };
  return { name: text(e.args[0]), elements: refList(e.args[3]) };
}

/** 제도 설명선 묶음(DRAUGHTING_CALLOUT과 아형)의 contents */
function calloutContents(e: StepEntity): number[] | null {
  if (e.parts) {
    const p = partOf(e, 'DRAUGHTING_CALLOUT');
    return p ? refList(p.args[0]) : null;
  }
  if (e.type.endsWith('CALLOUT') || e.type.endsWith('_DIMENSION') || e.type === 'DRAUGHTING_CALLOUT') return refList(e.args[1]);
  return null;
}

/**
 * 표현 PMI 주석 자리들. 제도 모형에 담긴 것을 먼저(모형 번호와 함께), 어느 모형에도 없는 것은 model 0으로.
 * rep(id)는 표현의 항목 목록(scene.ts의 표현 읽기)을 돌려준다.
 */
export function findAnnotations(f: StepFile, repItems: (id: number) => number[] | null): AnnotationRef[] {
  const all = new Set<number>();
  for (const t of ANNOTATION_TYPES) for (const id of f.idsOfType(t)) all.add(id);
  if (!all.size) return [];
  const out: AnnotationRef[] = [];
  const done = new Set<number>();
  const visit = (id: number, model: number, plane: string | undefined, depth: number) => {
    if (depth > 6 || done.has(id)) return;
    const e = f.get(id);
    if (!e) return;
    if (isA(e, 'ANNOTATION_PLANE')) {
      done.add(id);
      const p = planeArgs(e);
      for (const el of p.elements) visit(el, model, p.name || plane, depth + 1);
      return;
    }
    const at = annotationType(e);
    if (at) {
      done.add(id);
      const s = styledArgs(e);
      const a: AnnotationRef = { id, type: at, name: s.name, item: s.item, styles: s.styles, model };
      if (plane) a.plane = plane;
      out.push(a);
      return;
    }
    const contents = calloutContents(e);
    if (contents) {
      done.add(id);
      for (const c of contents) visit(c, model, plane, depth + 1);
    }
  };
  for (const t of MODEL_TYPES)
    for (const m of f.idsOfType(t)) {
      const items = repItems(m);
      if (items) for (const it of items) visit(it, m, undefined, 0);
    }
  for (const id of all) if (!done.has(id)) visit(id, 0, undefined, 0);
  return out;
}

// ───────────────────────── 의미 PMI ─────────────────────────

const PREFIX_SYM: Record<string, string> = { MILLI: 'm', CENTI: 'c', MICRO: 'µ', KILO: 'k', DECI: 'd', NANO: 'n' };

/** 단위 개체 → 짧은 기호(mm, in, °, rad …) */
function unitSymbol(f: StepFile, id: number, depth = 0): string {
  const e = f.get(id);
  if (!e || depth > 4) return '';
  const si = e.parts ? partOf(e, 'SI_UNIT') : e.type === 'SI_UNIT' ? { args: e.args } : undefined;
  if (si) {
    const n = si.args.length;
    const pv = enumOf(si.args[n - 2]);
    const nv = enumOf(si.args[n - 1]);
    const base = nv === 'METRE' ? 'm' : nv === 'RADIAN' ? 'rad' : nv === 'STERADIAN' ? 'sr' : nv.toLowerCase();
    return (PREFIX_SYM[pv] ?? '') + base;
  }
  const cb = e.parts ? partOf(e, 'CONVERSION_BASED_UNIT') : e.type === 'CONVERSION_BASED_UNIT' ? { args: e.args.slice(-2) } : undefined;
  if (cb) {
    const nm = text(cb.args[0]).toUpperCase();
    if (nm.startsWith('INCH')) return 'in';
    if (nm.startsWith('DEGREE')) return '°';
    if (nm.startsWith('FOOT')) return 'ft';
    return text(cb.args[0]).toLowerCase();
  }
  return '';
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '?';
  return String(Number(v.toPrecision(10)));
}

/** 측정값(…_MEASURE_WITH_UNIT, MEASURE_REPRESENTATION_ITEM — 단순·복합) → { 값, 단위, 이름 } */
function measure(f: StepFile, id: number): { value: number; unit: string; name: string } | null {
  const e = f.get(id);
  if (!e) return null;
  let args: StepValue[] | undefined;
  let name = '';
  if (e.parts) {
    args = partOf(e, 'MEASURE_WITH_UNIT')?.args;
    name = text(partOf(e, 'REPRESENTATION_ITEM')?.args[0]);
  } else if (e.type === 'MEASURE_REPRESENTATION_ITEM') {
    name = text(e.args[0]);
    args = e.args.slice(1);
  } else if (e.type.endsWith('MEASURE_WITH_UNIT')) args = e.args;
  if (!args) return null;
  const v = args[0];
  const value = v instanceof StepTyped ? num(v.value) : num(v);
  return { value, unit: unitSymbol(f, refId(args[1])), name };
}

function measureText(f: StepFile, id: number): string {
  const m = measure(f, id);
  if (!m) return '';
  return `${fmt(m.value)}${m.unit ? (m.unit === '°' ? '°' : ` ${m.unit}`) : ''}`;
}

const DIM_TYPES = [
  'DIMENSIONAL_SIZE',
  'DIMENSIONAL_LOCATION',
  'ANGULAR_SIZE',
  'ANGULAR_LOCATION',
  'DIMENSIONAL_SIZE_WITH_PATH',
  'DIMENSIONAL_LOCATION_WITH_PATH',
  'DIMENSIONAL_SIZE_WITH_DATUM_FEATURE',
  'DIRECTED_DIMENSIONAL_LOCATION',
];

const GT_TYPES = [
  'FLATNESS_TOLERANCE',
  'STRAIGHTNESS_TOLERANCE',
  'ROUNDNESS_TOLERANCE',
  'CYLINDRICITY_TOLERANCE',
  'LINE_PROFILE_TOLERANCE',
  'SURFACE_PROFILE_TOLERANCE',
  'ANGULARITY_TOLERANCE',
  'PARALLELISM_TOLERANCE',
  'PERPENDICULARITY_TOLERANCE',
  'POSITION_TOLERANCE',
  'CONCENTRICITY_TOLERANCE',
  'COAXIALITY_TOLERANCE',
  'SYMMETRY_TOLERANCE',
  'CIRCULAR_RUNOUT_TOLERANCE',
  'TOTAL_RUNOUT_TOLERANCE',
  'GEOMETRIC_TOLERANCE',
];

/** 데이텀 글자(데이텀 체계·참조 칸·참조 요소·데이텀 참조를 따라간다) */
function datumLetters(f: StepFile, id: number, depth = 0): string {
  if (depth > 5) return '';
  const e = f.get(id);
  if (!e) return '';
  if (isA(e, 'DATUM')) {
    const d = e.parts ? partOf(e, 'DATUM') : e;
    return text(d?.args[4]) || text(d?.args[0]);
  }
  if (e.type === 'DATUM_REFERENCE') return datumLetters(f, refId(e.args[1]), depth + 1);
  if (e.type === 'DATUM_SYSTEM') return refList(e.args[4]).map((c) => datumLetters(f, c, depth + 1)).filter(Boolean).join('|');
  if (e.type === 'DATUM_REFERENCE_COMPARTMENT' || e.type === 'DATUM_REFERENCE_ELEMENT' || e.type === 'GENERAL_DATUM_REFERENCE') {
    const base = e.args[4];
    if (base instanceof StepRef) return datumLetters(f, base.id, depth + 1);
    if (Array.isArray(base)) return refList(base).map((c) => datumLetters(f, c, depth + 1)).filter(Boolean).join('-');
  }
  return '';
}

/** 의미 PMI 목록(많으면 limit개까지) */
export function semanticPmi(f: StepFile, limit = 2000): StepPmiSemantic[] {
  const out: StepPmiSemantic[] = [];
  // 치수 → 값(공칭·위아래 한계), 공차
  const dimValue = new Map<number, string>();
  for (const id of f.idsOfType('DIMENSIONAL_CHARACTERISTIC_REPRESENTATION')) {
    const e = f.get(id);
    if (!e) continue;
    const rep = f.get(refId(e.args[1]));
    if (!rep) continue;
    const items = rep.parts ? refList(rep.parts.find((p) => p.args.length >= 3)?.args[1]) : refList(rep.args[1]);
    let nominal = '';
    let lower = '';
    let upper = '';
    for (const it of items) {
      const m = measure(f, it);
      if (!m) continue;
      const t = `${fmt(m.value)}${m.unit ? (m.unit === '°' ? '°' : ` ${m.unit}`) : ''}`;
      const n = m.name.toLowerCase();
      if (n.includes('lower')) lower = t;
      else if (n.includes('upper')) upper = t;
      else if (!nominal) nominal = t;
    }
    const v = nominal || (lower && upper ? `${lower} ~ ${upper}` : lower || upper);
    if (v) dimValue.set(refId(e.args[0]), v);
  }
  const dimTol = new Map<number, string>();
  for (const id of f.idsOfType('PLUS_MINUS_TOLERANCE')) {
    const e = f.get(id);
    if (!e) continue;
    const range = f.get(refId(e.args[0]));
    const dim = refId(e.args[1]);
    if (!range || !dim) continue;
    if (range.type === 'TOLERANCE_VALUE') {
      const lo = measure(f, refId(range.args[0]));
      const hi = measure(f, refId(range.args[1]));
      if (lo && hi) {
        const sign = (v: number) => (v > 0 ? `+${fmt(v)}` : v === 0 ? '0' : fmt(v));
        dimTol.set(dim, hi.value > 0 && Math.abs(hi.value + lo.value) < 1e-12 ? `±${fmt(hi.value)}` : `${sign(hi.value)}/${sign(lo.value)}`);
      }
    } else if (range.type === 'LIMITS_AND_FITS') dimTol.set(dim, `${text(range.args[1])}${text(range.args[2])}`.trim() || text(range.args[0]));
  }
  const seen = new Set<number>();
  for (const t of DIM_TYPES)
    for (const id of f.idsOfType(t)) {
      if (seen.has(id) || out.length >= limit) continue;
      seen.add(id);
      const e = f.get(id);
      if (!e) continue;
      const part = e.parts ? (e.parts.find((p) => DIM_TYPES.includes(p.type)) ?? e.parts[0]!) : { type: e.type, args: e.args };
      // DIMENSIONAL_SIZE(applies_to, name) · DIMENSIONAL_LOCATION(name, description, relating, related)
      const isSize = part.type.includes('SIZE');
      const name = isSize ? text(part.args[1]) : text(part.args[0]);
      const tol = dimTol.get(id);
      const value = [dimValue.get(id) ?? '', tol ?? ''].filter(Boolean).join(' ');
      out.push({ kind: 'dimension', type: part.type, name, value, stepId: id });
    }
  for (const t of GT_TYPES)
    for (const id of f.idsOfType(t)) {
      if (seen.has(id) || out.length >= limit) continue;
      seen.add(id);
      const e = f.get(id);
      if (!e) continue;
      let type = e.type;
      let gt: StepValue[] = e.args;
      let datums: number[] = [];
      if (e.parts) {
        type = e.parts.find((p) => GT_TYPES.includes(p.type) && p.type !== 'GEOMETRIC_TOLERANCE')?.type ?? 'GEOMETRIC_TOLERANCE';
        gt = partOf(e, 'GEOMETRIC_TOLERANCE')?.args ?? [];
        datums = refList(partOf(e, 'GEOMETRIC_TOLERANCE_WITH_DATUM_REFERENCE')?.args[0]);
      } else if (e.args.length >= 5) datums = refList(e.args[4]);
      const mag = measureText(f, refId(gt[2]));
      const letters = datums.map((d) => datumLetters(f, d)).filter(Boolean);
      const value = [mag, ...letters].filter(Boolean).join(' | ');
      out.push({ kind: 'tolerance', type, name: text(gt[0]), value, stepId: id });
    }
  for (const t of ['DATUM', 'COMMON_DATUM'])
    for (const id of f.idsOfType(t)) {
      if (seen.has(id) || out.length >= limit) continue;
      seen.add(id);
      const e = f.get(id);
      if (!e) continue;
      const d = e.parts ? partOf(e, 'DATUM') : e;
      out.push({ kind: 'datum', type: t, name: text(d?.args[0]), value: text(d?.args[4]), stepId: id });
    }
  return out;
}

/**
 * 제도 모형(또는 주석이 가리키는 모양 측면)에서 PRODUCT_DEFINITION_SHAPE를 찾아 그 제품 정의 번호를 돌려준다.
 * 인자 참조를 너비 우선으로 몇 단계만 따라간다(없으면 0).
 */
export function productDefinitionOf(f: StepFile, start: number, maxNodes = 40): number {
  const queue = [start];
  const seen = new Set<number>(queue);
  while (queue.length && seen.size <= maxNodes) {
    const id = queue.shift()!;
    const e = f.get(id);
    if (!e) continue;
    if (e.type === 'PRODUCT_DEFINITION_SHAPE') {
      const def = refId(e.args[2]);
      const t = f.typeOf(def);
      return t.startsWith('PRODUCT_DEFINITION') && !t.startsWith('PRODUCT_DEFINITION_SHAPE') ? def : 0;
    }
    const args = e.parts ? e.parts.flatMap((p) => p.args) : e.args;
    const push = (v: StepValue) => {
      if (v instanceof StepRef && !seen.has(v.id)) {
        seen.add(v.id);
        queue.push(v.id);
      } else if (Array.isArray(v)) for (const x of v) push(x);
    };
    for (const a of args) push(a);
  }
  return 0;
}
