/**
 * 퍼징용 STEP 바꾸기(씨앗 고정 — 같은 입력·종류·씨앗이면 같은 바이트). 저장소 시험(tests/fuzz.test.ts)과 로컬 대량 퍼징이 함께 쓴다.
 *
 * 종류: 자르기(여러 자리) · 바이트 바꾸기 · 문법 글자 넣기 · 엔터티 번호 바꾸기(없는 참조·0·아주 큰 번호·자기 참조·다른 개체·순환 참조) ·
 * 숫자 극값(1e300·1e999·NaN 글·아주 긴 숫자) · 매우 긴 목록 · 문자열 이스케이프 깨기 · 개체 이름 바꾸기 · 문장 지우기·겹치기·번호 바꾸기 ·
 * 깊은 괄호 · 조각 옮기기 · 구역(HEADER·DATA·ENDSEC) 깨기 · 압축(gzip·ZIP) 머리·흐름 깨기.
 * 글은 Latin-1 한 글자 = 한 바이트로 다룬다(UTF-8 바이트도 그대로 오간다). 압축은 node:zlib을 쓴다(Node에서만).
 */
import { deflateRawSync, gzipSync } from 'node:zlib';
import { crc32 } from '../src/archive';

export type MutationKind =
  | 'truncate'
  | 'bytes'
  | 'syntax'
  | 'ref'
  | 'number'
  | 'list'
  | 'string'
  | 'type'
  | 'statement'
  | 'nest'
  | 'splice'
  | 'section'
  | 'container';

export const MUTATION_KINDS: readonly MutationKind[] = ['truncate', 'bytes', 'syntax', 'ref', 'number', 'list', 'string', 'type', 'statement', 'nest', 'splice', 'section', 'container'];

export interface Mutation {
  bytes: Uint8Array;
  kind: MutationKind;
  /** 무엇을 바꿨는지 짧게(보고·재현용) */
  detail: string;
}

/** 씨앗 고정 난수(mulberry32) — 0 이상 1 미만 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T>(r: Rand, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
const int = (r: Rand, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

export function toText(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 8192)));
  return s;
}
export function toBytes(s: string): Uint8Array {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

/** 글 한 번 훑은 낱말 자리(바꾸기마다 다시 훑지 않게 입력마다 기억한다) */
export interface Tokens {
  text: string;
  /** DATA; 다음 자리(없으면 0) */
  data: number;
  /** 문장: 번호, '#' 자리, '=' 다음 자리, ';' 자리 */
  stmts: { id: number; start: number; body: number; end: number }[];
  /** 참조 #n [시작, 끝) 과 그 참조가 든 문장 순번 */
  refs: [number, number, number][];
  nums: [number, number, number][];
  strs: [number, number][];
  /** 목록 ( … ) — 여는 괄호·닫는 괄호 자리 */
  lists: [number, number][];
  /** 개체·형식 이름 [시작, 끝) */
  types: [number, number][];
  maxId: number;
}

const tokenCache = new WeakMap<Uint8Array, Tokens>();

const isDigit = (c: number) => c >= 48 && c <= 57;
const isAlpha = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;

export function tokens(bytes: Uint8Array): Tokens {
  const hit = tokenCache.get(bytes);
  if (hit) return hit;
  const t = toText(bytes);
  const n = t.length;
  const m = /\bDATA\s*;/i.exec(t);
  const data = m ? m.index + m[0].length : 0;
  const out: Tokens = { text: t, data, stmts: [], refs: [], nums: [], strs: [], lists: [], types: [], maxId: 0 };
  let i = data;
  while (i < n) {
    const c = t.charCodeAt(i);
    if (c === 0x2f && t.charCodeAt(i + 1) === 0x2a) {
      const e = t.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c !== 0x23) {
      i++;
      continue;
    }
    // #n = 몸 ;
    const start = i;
    let j = i + 1;
    let id = 0;
    while (j < n && isDigit(t.charCodeAt(j))) id = id * 10 + (t.charCodeAt(j++) - 48);
    while (j < n && t.charCodeAt(j) <= 32) j++;
    if (t.charCodeAt(j) !== 0x3d) {
      i = j;
      continue;
    }
    const body = j + 1;
    const si = out.stmts.length;
    const stack: number[] = [];
    let k = body;
    for (; k < n; ) {
      const d = t.charCodeAt(k);
      if (d === 0x3b) break;
      if (d === 0x27) {
        let q = k + 1;
        while (q < n) {
          if (t.charCodeAt(q) === 0x27) {
            if (t.charCodeAt(q + 1) === 0x27) q += 2;
            else break;
          } else q++;
        }
        out.strs.push([k, Math.min(n, q + 1)]);
        k = q + 1;
        continue;
      }
      if (d === 0x22) {
        const q = t.indexOf('"', k + 1);
        k = q < 0 ? n : q + 1;
        continue;
      }
      if (d === 0x23) {
        let q = k + 1;
        while (q < n && isDigit(t.charCodeAt(q))) q++;
        out.refs.push([k, q, si]);
        k = q;
        continue;
      }
      if (d === 0x28) {
        stack.push(k);
        k++;
        continue;
      }
      if (d === 0x29) {
        const o = stack.pop();
        if (o !== undefined) out.lists.push([o, k]);
        k++;
        continue;
      }
      if (d === 0x2e && isAlpha(t.charCodeAt(k + 1))) {
        // 열거 .NAME.
        const q = t.indexOf('.', k + 1);
        k = q < 0 ? n : q + 1;
        continue;
      }
      if (isDigit(d) || ((d === 0x2d || d === 0x2b || d === 0x2e) && (isDigit(t.charCodeAt(k + 1)) || t.charCodeAt(k + 1) === 0x2e))) {
        let q = k + 1;
        while (q < n) {
          const e = t.charCodeAt(q);
          if (isDigit(e) || e === 0x2e) q++;
          else if ((e === 0x45 || e === 0x65) && (isDigit(t.charCodeAt(q + 1)) || t.charCodeAt(q + 1) === 0x2d || t.charCodeAt(q + 1) === 0x2b)) q += 2;
          else break;
        }
        out.nums.push([k, q, si]);
        k = q;
        continue;
      }
      if (isAlpha(d)) {
        let q = k + 1;
        while (q < n && (isAlpha(t.charCodeAt(q)) || isDigit(t.charCodeAt(q)))) q++;
        out.types.push([k, q]);
        k = q;
        continue;
      }
      k++;
    }
    out.stmts.push({ id, start, body, end: Math.min(k, n) });
    if (id > out.maxId) out.maxId = id;
    i = k + 1;
  }
  tokenCache.set(bytes, out);
  return out;
}

/** 겹치지 않는 고치기 [시작, 끝, 바꿀 글]을 뒤에서부터 적용 */
function apply(text: string, edits: [number, number, string][]): string {
  edits.sort((a, b) => b[0] - a[0]);
  let out = text;
  let limit = Infinity;
  for (const [s, e, r] of edits) {
    if (e > limit) continue;
    out = out.slice(0, s) + r + out.slice(e);
    limit = s;
  }
  return out;
}

const EXTREME_NUMBERS = [
  '1.E300',
  '-1.E300',
  '1.E308',
  '1.E999',
  '-1.E999',
  '1.E-300',
  '0.',
  '-0.',
  '5.E-324',
  '1.7976931348623157E308',
  '2147483647',
  '4294967296',
  '-2147483648',
  '9007199254740993',
  '1' + '0'.repeat(400) + '.',
  '0.' + '0'.repeat(400) + '1',
  'NAN',
  'INF',
  '1.#QNAN',
  '-1.#IND',
  '1.#INF',
  '1.E',
  '.',
  '-',
  '1.2.3',
  '1E+',
];

const TYPE_NAMES = [
  'CARTESIAN_POINT',
  'DIRECTION',
  'VECTOR',
  'AXIS2_PLACEMENT_3D',
  'LINE',
  'CIRCLE',
  'ELLIPSE',
  'POLYLINE',
  'TRIMMED_CURVE',
  'COMPOSITE_CURVE',
  'B_SPLINE_CURVE_WITH_KNOTS',
  'B_SPLINE_SURFACE_WITH_KNOTS',
  'PLANE',
  'CYLINDRICAL_SURFACE',
  'CONICAL_SURFACE',
  'SPHERICAL_SURFACE',
  'TOROIDAL_SURFACE',
  'SURFACE_OF_REVOLUTION',
  'SURFACE_OF_LINEAR_EXTRUSION',
  'OFFSET_SURFACE',
  'PCURVE',
  'SURFACE_CURVE',
  'SEAM_CURVE',
  'VERTEX_POINT',
  'EDGE_CURVE',
  'ORIENTED_EDGE',
  'EDGE_LOOP',
  'FACE_BOUND',
  'FACE_OUTER_BOUND',
  'ADVANCED_FACE',
  'CLOSED_SHELL',
  'OPEN_SHELL',
  'MANIFOLD_SOLID_BREP',
  'BREP_WITH_VOIDS',
  'FACETED_BREP',
  'SHELL_BASED_SURFACE_MODEL',
  'TRIANGULATED_FACE',
  'COMPLEX_TRIANGULATED_SURFACE_SET',
  'GEOMETRIC_CURVE_SET',
  'MAPPED_ITEM',
  'REPRESENTATION_MAP',
  'SHAPE_REPRESENTATION',
  'ADVANCED_BREP_SHAPE_REPRESENTATION',
  'SHAPE_REPRESENTATION_RELATIONSHIP',
  'ITEM_DEFINED_TRANSFORMATION',
  'CARTESIAN_TRANSFORMATION_OPERATOR_3D',
  'NEXT_ASSEMBLY_USAGE_OCCURRENCE',
  'PRODUCT_DEFINITION',
  'PRODUCT_DEFINITION_SHAPE',
  'SHAPE_DEFINITION_REPRESENTATION',
  'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION',
  'STYLED_ITEM',
  'COLOUR_RGB',
  'PRESENTATION_LAYER_ASSIGNMENT',
  'DRAUGHTING_CALLOUT',
  'ANNOTATION_CURVE_OCCURRENCE',
  'TESSELLATED_ANNOTATION_OCCURRENCE',
  'CAMERA_MODEL_D3',
  'DIMENSIONAL_SIZE',
  'GEOMETRIC_TOLERANCE',
  'UNKNOWN_ENTITY_X',
];

/** 글 바꾸기 하나(압축 깨기 빼고) */
function mutateText(tk: Tokens, kind: MutationKind, r: Rand): { text: string; detail: string } {
  const t = tk.text;
  const n = t.length;
  const inData = () => (tk.data < n ? int(r, tk.data, n - 1) : int(r, 0, Math.max(0, n - 1)));
  switch (kind) {
    case 'truncate': {
      const how = pick(r, ['uniform', 'token', 'last', 'data']);
      let at: number;
      if (how === 'token' && tk.refs.length + tk.strs.length + tk.nums.length) {
        const all = pick(r, [tk.refs, tk.strs, tk.nums].filter((a) => a.length) as [number, number][][]);
        const [s, e] = pick(r, all);
        at = int(r, s, Math.max(s, e - 1));
      } else if (how === 'last') at = Math.max(0, n - int(r, 1, 40));
      else if (how === 'data') at = inData();
      else at = int(r, 0, Math.max(0, n - 1));
      return { text: t.slice(0, at), detail: `truncate:${how}@${n ? (at / n).toFixed(4) : 0}` };
    }
    case 'bytes': {
      const k = int(r, 1, 8);
      const edits: [number, number, string][] = [];
      for (let q = 0; q < k; q++) {
        const at = r() < 0.8 ? inData() : int(r, 0, Math.max(0, n - 1));
        edits.push([at, at + 1, String.fromCharCode(pick(r, [0, 0xff, int(r, 0, 255), int(r, 0, 255)]))]);
      }
      return { text: apply(t, dedupeEdits(edits)), detail: `bytes:${k}` };
    }
    case 'syntax': {
      const k = int(r, 1, 4);
      const edits: [number, number, string][] = [];
      const ops: string[] = [];
      for (let q = 0; q < k; q++) {
        const at = inData();
        const ch = pick(r, ['(', ')', "'", ',', ';', '#', '=', '$', '*', '.', '/', '\\', '"', ' ', '\n', 'E', '-', '/*']);
        const op = pick(r, ['over', 'insert', 'delete']);
        ops.push(`${op}${JSON.stringify(ch)}`);
        if (op === 'over') edits.push([at, at + 1, ch]);
        else if (op === 'insert') edits.push([at, at, ch]);
        else edits.push([at, at + 1, '']);
      }
      return { text: apply(t, dedupeEdits(edits)), detail: `syntax:${ops.join('+')}` };
    }
    case 'ref': {
      if (!tk.refs.length) return mutateText(tk, 'bytes', r);
      const k = int(r, 1, 3);
      const edits: [number, number, string][] = [];
      const how: string[] = [];
      for (let q = 0; q < k; q++) {
        const [s, e, si] = pick(r, tk.refs);
        const st = tk.stmts[si]!;
        const v = pick(r, ['missing', 'zero', 'huge', 'self', 'other', 'cycle', 'cycle', 'nodigits']);
        how.push(v);
        if (v === 'missing') edits.push([s, e, `#${tk.maxId + int(r, 1, 1000)}`]);
        else if (v === 'zero') edits.push([s, e, '#0']);
        else if (v === 'huge') edits.push([s, e, pick(r, ['#4294967295', '#4294967296', '#99999999999999999999', '#9007199254740993'])]);
        else if (v === 'self') edits.push([s, e, `#${st.id}`]);
        else if (v === 'other') edits.push([s, e, `#${pick(r, tk.stmts).id}`]);
        else if (v === 'nodigits') edits.push([s, e, '#']);
        else {
          // 순환: 이 참조가 가리키는 문장 안의 참조 하나를 이 문장으로 되돌린다(가리키는 문장에 참조가 없으면 자기 참조)
          const target = Number(t.slice(s + 1, e));
          const ts = tk.stmts.findIndex((x) => x.id === target);
          const back = ts >= 0 ? tk.refs.filter((x) => x[2] === ts) : [];
          if (back.length) {
            const [bs, be] = pick(r, back);
            edits.push([bs, be, `#${st.id}`]);
          } else edits.push([s, e, `#${st.id}`]);
        }
      }
      return { text: apply(t, dedupeEdits(edits)), detail: `ref:${how.join('+')}` };
    }
    case 'number': {
      if (!tk.nums.length) return mutateText(tk, 'bytes', r);
      const edits: [number, number, string][] = [];
      let detail: string;
      if (r() < 0.3) {
        // 문장 하나의 숫자를 모두 같은 극값으로(좌표·반지름·매듭 모두)
        const [, , si] = pick(r, tk.nums);
        const v = pick(r, EXTREME_NUMBERS);
        for (const [s, e, sj] of tk.nums) if (sj === si) edits.push([s, e, v]);
        detail = `number:all:${v.slice(0, 12)}`;
      } else {
        const k = int(r, 1, 5);
        const vs: string[] = [];
        for (let q = 0; q < k; q++) {
          const [s, e] = pick(r, tk.nums);
          const v = pick(r, EXTREME_NUMBERS);
          vs.push(v.slice(0, 12));
          edits.push([s, e, v]);
        }
        detail = `number:${vs.join('+')}`;
      }
      return { text: apply(t, dedupeEdits(edits)), detail };
    }
    case 'list': {
      const ls = tk.lists.filter(([o, c]) => c - o > 1 && c - o < 4096);
      if (!ls.length) return mutateText(tk, 'syntax', r);
      const [o, c] = pick(r, ls);
      const inner = t.slice(o + 1, c);
      const how = pick(r, ['repeat', 'repeat', 'empty', 'one', 'numbers', 'refs']);
      let repl: string;
      if (how === 'repeat') {
        const times = Math.max(2, Math.min(pick(r, [10, 100, 1000, 10000, 100000]), Math.floor(8_000_000 / (inner.length + 1))));
        repl = Array.from({ length: times }, () => inner).join(',');
      } else if (how === 'empty') repl = '';
      else if (how === 'one') repl = inner.split(',')[0]!;
      else if (how === 'numbers') repl = Array.from({ length: pick(r, [1000, 100000, 1000000]) }, (_, q) => `${q}.`).join(',');
      else repl = Array.from({ length: pick(r, [1000, 100000]) }, () => `#${tk.stmts.length ? pick(r, tk.stmts).id : 1}`).join(',');
      return { text: t.slice(0, o + 1) + repl + t.slice(c), detail: `list:${how}:${repl.length}` };
    }
    case 'string': {
      if (!tk.strs.length) return mutateText(tk, 'syntax', r);
      const [, e] = pick(r, tk.strs);
      const how = pick(r, ['unterminated', 'x2odd', 'x4big', 'x2surrogate', 'xshort', 'sEnd', 'pEnd', 'backslash', 'utf8', 'long', 'quotes', 'semicolon']);
      const close = e - 1;
      const ins: Record<string, string> = {
        x2odd: '\\X2\\00E',
        x4big: pick(r, ['\\X4\\FFFFFFFF\\X0\\', '\\X4\\0011FFFF\\X0\\', '\\X4\\0001F600']),
        x2surrogate: pick(r, ['\\X2\\D800\\X0\\', '\\X2\\DFFFD800\\X0\\']),
        xshort: pick(r, ['\\X\\', '\\X\\G1', '\\X\\4']),
        sEnd: '\\S\\',
        pEnd: pick(r, ['\\P', '\\PZ\\', '\\P\\']),
        backslash: '\\',
        utf8: pick(r, ['\xC3\x28', '\xFF\xFE', '\xED\xA0\x80', '\xF4\x90\x80\x80', '\xC0']),
        long: 'A'.repeat(pick(r, [65536, 1_000_000])),
        quotes: "''".repeat(pick(r, [1000, 100000])),
        semicolon: ';);(#1=',
      };
      if (how === 'unterminated') return { text: t.slice(0, close) + t.slice(e), detail: 'string:unterminated' };
      return { text: t.slice(0, close) + ins[how]! + t.slice(close), detail: `string:${how}` };
    }
    case 'type': {
      if (!tk.types.length) return mutateText(tk, 'syntax', r);
      const k = int(r, 1, 3);
      const edits: [number, number, string][] = [];
      const names: string[] = [];
      for (let q = 0; q < k; q++) {
        const [s, e] = pick(r, tk.types);
        const v = r() < 0.5 ? pick(r, TYPE_NAMES) : t.slice(...pick(r, tk.types));
        names.push(v);
        edits.push([s, e, v]);
      }
      return { text: apply(t, dedupeEdits(edits)), detail: `type:${names.join('+')}` };
    }
    case 'statement': {
      if (!tk.stmts.length) return mutateText(tk, 'syntax', r);
      const st = pick(r, tk.stmts);
      const how = pick(r, ['delete', 'duplicate', 'swapBody', 'renumberHuge', 'renumberZero', 'renumberOther', 'leadingZeros', 'deleteMany']);
      const stmtText = t.slice(st.start, st.end + 1);
      if (how === 'delete') return { text: t.slice(0, st.start) + t.slice(st.end + 1), detail: 'statement:delete' };
      if (how === 'deleteMany') {
        const edits: [number, number, string][] = [];
        for (const x of tk.stmts) if (r() < 0.05) edits.push([x.start, x.end + 1, '']);
        return { text: apply(t, edits), detail: `statement:deleteMany:${edits.length}` };
      }
      if (how === 'duplicate') {
        // 같은 번호로 다른 몸을 한 번 더(뒤에)
        const other = pick(r, tk.stmts);
        const dup = `#${st.id}=${t.slice(other.body, other.end + 1)}\n`;
        return { text: t.slice(0, st.end + 1) + '\n' + dup + t.slice(st.end + 1), detail: 'statement:duplicate' };
      }
      if (how === 'swapBody') {
        const other = pick(r, tk.stmts);
        return { text: t.slice(0, st.body) + t.slice(other.body, other.end) + t.slice(st.end), detail: 'statement:swapBody' };
      }
      const head = stmtText.indexOf('=');
      const newId = how === 'renumberHuge' ? pick(r, ['4294967296', '99999999999999999999', '4294967295']) : how === 'renumberZero' ? '0' : how === 'leadingZeros' ? `000000${st.id}` : String(pick(r, tk.stmts).id);
      return { text: t.slice(0, st.start) + `#${newId}` + stmtText.slice(head) + t.slice(st.end + 1), detail: `statement:${how}` };
    }
    case 'nest': {
      const depth = pick(r, [100, 1000, 10000, 100000]);
      const ls = tk.lists.length ? tk.lists : [[inData(), inData()] as [number, number]];
      const [o] = pick(r, ls);
      const closed = r() < 0.7;
      const ins = '('.repeat(depth) + (closed ? ')'.repeat(depth) : '');
      return { text: t.slice(0, o + 1) + ins + (closed ? ',' : '') + t.slice(o + 1), detail: `nest:${depth}:${closed ? 'closed' : 'open'}` };
    }
    case 'splice': {
      const len = int(r, 1, Math.max(1, Math.min(4096, Math.floor(n / 10))));
      const a = int(r, 0, Math.max(0, n - len));
      const b = inData();
      const chunk = t.slice(a, a + len);
      const over = r() < 0.5;
      return { text: t.slice(0, b) + chunk + t.slice(over ? b + len : b), detail: `splice:${over ? 'over' : 'insert'}:${len}` };
    }
    case 'section': {
      const how = pick(r, ['noEndsec', 'noData', 'endInMiddle', 'noHeader', 'twoData', 'magicAgain', 'noEnd', 'lowercase']);
      const st = tk.stmts.length ? pick(r, tk.stmts) : null;
      const mid = st ? st.start : inData();
      if (how === 'noEndsec') return { text: t.replace(/ENDSEC\s*;/, ''), detail: 'section:noEndsec' };
      if (how === 'noData') return { text: t.replace(/\bDATA\s*;/, ''), detail: 'section:noData' };
      if (how === 'endInMiddle') return { text: t.slice(0, mid) + 'ENDSEC;\nEND-ISO-10303-21;\n' + t.slice(mid), detail: 'section:endInMiddle' };
      if (how === 'noHeader') return { text: t.replace(/HEADER\s*;[\s\S]*?ENDSEC\s*;/, ''), detail: 'section:noHeader' };
      if (how === 'twoData') return { text: t.slice(0, mid) + 'ENDSEC;\nDATA;\n' + t.slice(tk.data, Math.min(n, tk.data + 20000)) + '\n' + t.slice(mid), detail: 'section:twoData' };
      if (how === 'magicAgain') return { text: t.slice(0, mid) + 'ISO-10303-21;\nHEADER;\n' + t.slice(mid), detail: 'section:magicAgain' };
      if (how === 'noEnd') return { text: t.replace(/END-ISO-10303-21\s*;\s*$/, ''), detail: 'section:noEnd' };
      return { text: t.slice(0, tk.data) + t.slice(tk.data).toLowerCase(), detail: 'section:lowercase' };
    }
    default:
      return { text: t, detail: 'none' };
  }
}

function dedupeEdits(edits: [number, number, string][]): [number, number, string][] {
  const seen = new Set<number>();
  return edits.filter(([s]) => (seen.has(s) ? false : (seen.add(s), true)));
}

/** gzip로 싸기 */
export function gzipWrap(b: Uint8Array): Uint8Array {
  return new Uint8Array(gzipSync(b, { level: 1 }));
}

/** 항목 하나(.stp)를 담은 ZIP(저장 또는 deflate) */
export function zipWrap(b: Uint8Array, method: 0 | 8 = 8, name = 'part.stp'): Uint8Array {
  const nm = toBytes(name);
  const body = method === 8 ? new Uint8Array(deflateRawSync(b, { level: 1 })) : b;
  const crc = crc32(b) >>> 0;
  const lh = new DataView(new ArrayBuffer(30));
  lh.setUint32(0, 0x04034b50, true);
  lh.setUint16(4, 20, true);
  lh.setUint16(8, method, true);
  lh.setUint32(14, crc, true);
  lh.setUint32(18, body.length, true);
  lh.setUint32(22, b.length, true);
  lh.setUint16(26, nm.length, true);
  const ch = new DataView(new ArrayBuffer(46));
  ch.setUint32(0, 0x02014b50, true);
  ch.setUint16(4, 20, true);
  ch.setUint16(6, 20, true);
  ch.setUint16(10, method, true);
  ch.setUint32(16, crc, true);
  ch.setUint32(20, body.length, true);
  ch.setUint32(24, b.length, true);
  ch.setUint16(28, nm.length, true);
  ch.setUint32(42, 0, true);
  const cdOffset = 30 + nm.length + body.length;
  const cdSize = 46 + nm.length;
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, 1, true);
  e.setUint16(10, 1, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, cdOffset, true);
  const parts = [new Uint8Array(lh.buffer), nm, body, new Uint8Array(ch.buffer), nm, new Uint8Array(e.buffer)];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const x of parts) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}

/** 압축을 싸고 머리·흐름을 깬다 */
function mutateContainer(plain: Uint8Array, r: Rand): { bytes: Uint8Array; detail: string } {
  const zip = r() < 0.6;
  const packed = zip ? zipWrap(plain, r() < 0.8 ? 8 : 0) : gzipWrap(plain);
  const b = packed.slice();
  const how = zip
    ? pick(r, ['truncate', 'flip', 'cdCount', 'cdOffset', 'size', 'csize', 'localOffset', 'nameLen', 'crc', 'method', 'eocdGone', 'zip64'])
    : pick(r, ['truncate', 'flip', 'flipHead', 'trailer', 'junk']);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const eocd = b.length - 22;
  const cd = zip ? dv.getUint32(eocd + 16, true) : 0;
  switch (how) {
    case 'truncate':
      return { bytes: b.slice(0, int(r, 0, Math.max(0, b.length - 1))), detail: `container:${zip ? 'zip' : 'gzip'}:truncate` };
    case 'flip': {
      for (let q = int(r, 1, 8); q > 0; q--) b[int(r, 0, b.length - 1)] = int(r, 0, 255);
      return { bytes: b, detail: `container:${zip ? 'zip' : 'gzip'}:flip` };
    }
    case 'flipHead':
      b[int(r, 0, 9)] = int(r, 0, 255);
      return { bytes: b, detail: 'container:gzip:flipHead' };
    case 'trailer':
      dv.setUint32(b.length - 4, pick(r, [0, 0xffffffff, 1]), true);
      return { bytes: b, detail: 'container:gzip:trailer' };
    case 'junk': {
      const out = new Uint8Array(b.length + 64);
      out.set(b);
      for (let q = b.length; q < out.length; q++) out[q] = int(r, 0, 255);
      return { bytes: out, detail: 'container:gzip:junk' };
    }
    case 'cdCount':
      dv.setUint16(eocd + 10, pick(r, [0, 2, 0xffff]), true);
      dv.setUint16(eocd + 8, pick(r, [0, 2, 0xffff]), true);
      return { bytes: b, detail: 'container:zip:cdCount' };
    case 'cdOffset':
      dv.setUint32(eocd + 16, pick(r, [0, 0xffffffff, b.length, b.length - 10]), true);
      return { bytes: b, detail: 'container:zip:cdOffset' };
    case 'size':
      dv.setUint32(cd + 24, pick(r, [0, 0xffffffff, 1]), true);
      return { bytes: b, detail: 'container:zip:size' };
    case 'csize':
      dv.setUint32(cd + 20, pick(r, [0, 0xffffffff, 1, b.length * 2]), true);
      return { bytes: b, detail: 'container:zip:csize' };
    case 'localOffset':
      dv.setUint32(cd + 42, pick(r, [0xffffffff, b.length, 1, cd]), true);
      return { bytes: b, detail: 'container:zip:localOffset' };
    case 'nameLen':
      dv.setUint16(cd + 28, pick(r, [0, 0xffff, 200]), true);
      return { bytes: b, detail: 'container:zip:nameLen' };
    case 'crc':
      dv.setUint32(cd + 16, dv.getUint32(cd + 16, true) ^ 1, true);
      return { bytes: b, detail: 'container:zip:crc' };
    case 'method':
      dv.setUint16(cd + 10, pick(r, [1, 9, 12, 14, 99, 0xffff]), true);
      return { bytes: b, detail: 'container:zip:method' };
    case 'eocdGone':
      return { bytes: b.slice(0, eocd), detail: 'container:zip:eocdGone' };
    default: {
      // ZIP64 표시(0xFFFF·0xFFFFFFFF)만 적고 ZIP64 끝 목록은 없게
      dv.setUint16(eocd + 10, 0xffff, true);
      dv.setUint32(eocd + 16, 0xffffffff, true);
      return { bytes: b, detail: 'container:zip:zip64' };
    }
  }
}

/** 바꾸기 하나. container는 STEP 글을 gzip·ZIP으로 싸서 그 머리·흐름을 깬다 */
export function mutate(input: Uint8Array, kind: MutationKind, seed: number): Mutation {
  const r = rng(seed ^ 0x5bd1e995);
  if (kind === 'container') {
    const { bytes, detail } = mutateContainer(input, r);
    return { bytes, kind, detail };
  }
  const tk = tokens(input);
  const { text, detail } = mutateText(tk, kind, r);
  return { bytes: toBytes(text), kind, detail };
}
