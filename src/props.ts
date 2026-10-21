/**
 * 제품 속성: 제품 설명·판(formation)·정의 설명, 재질 이름·밀도, 사용자 속성(PROPERTY_DEFINITION → PROPERTY_DEFINITION_REPRESENTATION
 * → REPRESENTATION의 DESCRIPTIVE·MEASURE·VALUE 표현 항목), MATERIAL_DESIGNATION.
 *
 * 밀도는 단위(DERIVED_UNIT: 질량¹·길이⁻³, 또는 질량·길이 이름 있는 단위)를 따라 kg/m³로 바꾼다. 단위가 없으면
 * 값 크기로 짐작한다(30보다 작으면 g/cm³, 아니면 kg/m³). 형상 측면(SHAPE_ASPECT)에 붙은 속성(PMI·검증)은 제품 속성으로 치지 않는다.
 */
import { enumOf, isA, num, partOf, refId, refList, StepTyped, text, type StepEntity, type StepFile, type StepValue } from './part21';

/** 제품 정의 하나의 속성(화면 패널용) */
export interface StepProductProps {
  /** PRODUCT.description */
  description?: string;
  /** 판(PRODUCT_DEFINITION_FORMATION.id) */
  version?: string;
  /** PRODUCT_DEFINITION.description(설명과 다를 때) */
  definition?: string;
  /** 재질 이름 */
  material?: string;
  /** 밀도(kg/m³) */
  density?: number;
  /** 파일에 적힌 밀도 글(값과 단위) */
  densityText?: string;
  /** 그 밖의 속성(이름, 값 글) */
  items?: [string, string][];
}

const PREFIX: Record<string, number> = {
  EXA: 1e18,
  PETA: 1e15,
  TERA: 1e12,
  GIGA: 1e9,
  MEGA: 1e6,
  KILO: 1e3,
  HECTO: 1e2,
  DECA: 1e1,
  DECI: 1e-1,
  CENTI: 1e-2,
  MILLI: 1e-3,
  MICRO: 1e-6,
  NANO: 1e-9,
  PICO: 1e-12,
  FEMTO: 1e-15,
  ATTO: 1e-18,
};

/** 단위 → SI 기본 단위(kg·m) 배율과 질량·길이 차원 */
interface SiUnit {
  factor: number;
  mass: number;
  length: number;
  symbol: string;
}

const SYM: Record<string, string> = { METRE: 'm', GRAM: 'g', SECOND: 's', KELVIN: 'K', NEWTON: 'N', PASCAL: 'Pa' };
const PSYM: Record<string, string> = { KILO: 'k', MILLI: 'm', CENTI: 'c', MICRO: 'µ', MEGA: 'M', DECI: 'd' };

export function siUnit(f: StepFile, id: number, depth = 0): SiUnit | null {
  const e = f.get(id);
  if (!e || depth > 8) return null;
  const si = e.parts ? partOf(e, 'SI_UNIT') : e.type === 'SI_UNIT' ? { type: 'SI_UNIT', args: e.args } : undefined;
  if (si) {
    const n = si.args.length;
    const prefix = enumOf(si.args[n - 2]);
    const name = enumOf(si.args[n - 1]);
    const p = prefix ? (PREFIX[prefix] ?? 1) : 1;
    const sym = `${PSYM[prefix] ?? ''}${SYM[name] ?? name.toLowerCase()}`;
    if (name === 'GRAM') return { factor: p * 1e-3, mass: 1, length: 0, symbol: sym };
    if (name === 'METRE') return { factor: p, mass: 0, length: 1, symbol: sym };
    return { factor: p, mass: 0, length: 0, symbol: sym };
  }
  const cb = e.parts ? partOf(e, 'CONVERSION_BASED_UNIT') : e.type === 'CONVERSION_BASED_UNIT' ? { type: e.type, args: e.args.slice(-2) } : undefined;
  if (cb) {
    const m = f.get(refId(cb.args[1]));
    if (!m) return null;
    const args = m.parts ? (partOf(m, 'MEASURE_WITH_UNIT')?.args ?? []) : m.args;
    const v = args[0];
    const value = v instanceof StepTyped ? num(v.value, 1) : num(v, 1);
    const base = siUnit(f, refId(args[1]), depth + 1);
    if (!base) return null;
    return { ...base, factor: base.factor * value, symbol: text(cb.args[0]).toLowerCase() || base.symbol };
  }
  if (e.type === 'DERIVED_UNIT') {
    let factor = 1;
    let mass = 0;
    let length = 0;
    const sym: string[] = [];
    for (const el of refList(e.args[0])) {
      const de = f.get(el);
      if (!de || de.type !== 'DERIVED_UNIT_ELEMENT') return null;
      const u = siUnit(f, refId(de.args[0]), depth + 1);
      const k = num(de.args[1], 1);
      if (!u) return null;
      factor *= u.factor ** k;
      mass += u.mass * k;
      length += u.length * k;
      sym.push(k === 1 ? u.symbol : `${u.symbol}^${k}`);
    }
    return { factor, mass, length, symbol: sym.join('·') };
  }
  return null;
}

function fmt(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toPrecision(10))) : '?';
}

/** 표현 항목 하나 → (이름, 값 글, 측정값·단위) */
function itemValue(f: StepFile, id: number): { name: string; value: string; measure?: { value: number; unit: number } } | null {
  const e = f.get(id);
  if (!e) return null;
  const nameOf = (x: StepEntity) => text((x.parts ? partOf(x, 'REPRESENTATION_ITEM') : x)?.args[0]);
  if (isA(e, 'DESCRIPTIVE_REPRESENTATION_ITEM')) {
    const p = e.parts ? partOf(e, 'DESCRIPTIVE_REPRESENTATION_ITEM') : e;
    const name = e.parts ? nameOf(e) : text(e.args[0]);
    const desc = e.parts ? text(p?.args[0]) : text(e.args[1]);
    return { name, value: desc || name };
  }
  if (isA(e, 'MEASURE_REPRESENTATION_ITEM') || e.type.endsWith('MEASURE_WITH_UNIT')) {
    let args: StepValue[] | undefined;
    let name = '';
    if (e.parts) {
      args = partOf(e, 'MEASURE_WITH_UNIT')?.args;
      name = nameOf(e);
    } else if (e.type === 'MEASURE_REPRESENTATION_ITEM') {
      name = text(e.args[0]);
      args = e.args.slice(1);
    } else args = e.args;
    if (!args) return null;
    const v = args[0];
    const value = v instanceof StepTyped ? num(v.value) : num(v);
    const unit = refId(args[1]);
    const u = unit ? siUnit(f, unit) : null;
    return { name, value: `${fmt(value)}${u?.symbol ? ` ${u.symbol}` : ''}`, measure: { value, unit } };
  }
  if (isA(e, 'VALUE_REPRESENTATION_ITEM')) {
    const p = e.parts ? partOf(e, 'VALUE_REPRESENTATION_ITEM') : null;
    const v = p ? p.args[0] : e.args[1];
    const name = e.parts ? nameOf(e) : text(e.args[0]);
    const val = v instanceof StepTyped ? v.value : v;
    return { name, value: typeof val === 'string' ? val : typeof val === 'number' ? fmt(val) : '' };
  }
  return null;
}

/** 밀도 측정값 → kg/m³(단위가 질량·길이⁻³이 아니면 null, 단위가 없으면 값 크기로 짐작) */
export function densityKgM3(f: StepFile, value: number, unit: number): number | null {
  if (!(value > 0)) return null;
  if (!unit) return value < 30 ? value * 1000 : value;
  const u = siUnit(f, unit);
  if (!u) return value < 30 ? value * 1000 : value;
  if (u.mass === 1 && u.length === -3) return value * u.factor;
  // 차원 없는 비(POSITIVE_RATIO 등)로 적은 파일: 값 크기로 짐작
  if (u.mass === 0 && u.length === 0) return value < 30 ? value * 1000 : value;
  return null;
}

/** 속성 정의가 붙은 제품 정의(PRODUCT_DEFINITION 또는 PRODUCT_DEFINITION_SHAPE를 거쳐), 아니면 0 */
function definitionPd(f: StepFile, id: number): number {
  const e = f.get(id);
  if (!e) return 0;
  if (e.type === 'PRODUCT_DEFINITION_SHAPE') return definitionPd(f, refId(e.args[2]));
  return e.type.startsWith('PRODUCT_DEFINITION') && !e.type.startsWith('PRODUCT_DEFINITION_SHAPE') && !e.type.startsWith('PRODUCT_DEFINITION_FORMATION') ? id : 0;
}

/** 제품 정의 번호 → 속성 */
export function readProductProps(f: StepFile): Map<number, StepProductProps> {
  const out = new Map<number, StepProductProps>();
  const get = (pd: number) => {
    let p = out.get(pd);
    if (!p) out.set(pd, (p = {}));
    return p;
  };
  // 제품·판·정의 설명
  const pdIds = f.idsOfType('PRODUCT_DEFINITION').concat(f.idsOfType('PRODUCT_DEFINITION_WITH_ASSOCIATED_DOCUMENTS'));
  for (const pd of pdIds) {
    const e = f.get(pd);
    if (!e) continue;
    const form = f.get(refId(e.args[2]));
    const prod = form ? f.get(refId(form.args[2])) : undefined;
    const desc = prod ? text(prod.args[2]) : '';
    const ver = form ? text(form.args[0]) : '';
    const def = text(e.args[1]);
    const name = prod ? text(prod.args[1]) || text(prod.args[0]) : '';
    if (desc && desc !== name) get(pd).description = desc;
    if (ver && ver !== '1' && ver !== name && ver.toLowerCase() !== 'none') get(pd).version = ver;
    if (def && def !== desc && def !== name && def.toLowerCase() !== 'design' && def.toLowerCase() !== 'part definition') get(pd).definition = def;
  }
  // 속성 정의 → 표현
  const reps = new Map<number, number[]>();
  for (const id of f.idsOfType('PROPERTY_DEFINITION_REPRESENTATION')) {
    const e = f.get(id);
    if (!e) continue;
    const pdef = refId(e.args[0]);
    const rep = refId(e.args[1]);
    if (!pdef || !rep) continue;
    let l = reps.get(pdef);
    if (!l) reps.set(pdef, (l = []));
    l.push(rep);
  }
  for (const id of f.idsOfType('PROPERTY_DEFINITION')) {
    const e = f.get(id);
    if (!e) continue;
    const pd = definitionPd(f, refId(e.args[2]));
    if (!pd) continue;
    const pname = text(e.args[0]);
    const pdesc = text(e.args[1]);
    const label = (pdesc || pname).trim();
    const values: string[] = [];
    let measure: { value: number; unit: number } | undefined;
    for (const rid of reps.get(id) ?? []) {
      const r = f.get(rid);
      if (!r) continue;
      const items = r.parts ? refList(r.parts.find((p) => p.args.length >= 3)?.args[1]) : refList(r.args[1]);
      for (const it of items) {
        const v = itemValue(f, it);
        if (!v || !v.value) continue;
        values.push(v.value);
        if (v.measure && !measure) measure = v.measure;
      }
    }
    if (!values.length) continue;
    const p = get(pd);
    const key = `${pname} ${pdesc}`.toLowerCase();
    if (key.includes('material') && key.includes('name')) p.material = values.join(', ');
    else if (key.includes('density') && measure) {
      const d = densityKgM3(f, measure.value, measure.unit);
      if (d) {
        p.density = d;
        p.densityText = values[0];
      }
    } else (p.items ??= []).push([label || '속성', values.join(', ')]);
  }
  // AP214 재질 지정
  for (const id of f.idsOfType('MATERIAL_DESIGNATION')) {
    const e = f.get(id);
    if (!e) continue;
    const name = text(e.args[0]);
    if (!name) continue;
    for (const d of refList(e.args[1])) {
      const pd = definitionPd(f, d);
      if (pd && !get(pd).material) get(pd).material = name;
    }
  }
  for (const [pd, p] of out) if (!Object.keys(p).length) out.delete(pd);
  return out;
}
