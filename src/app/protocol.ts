/**
 * 해석 워커(src/worker/parse.worker.ts)와 화면 사이의 메시지 꼴과 도움 함수(순수 함수, DOM 없음).
 *
 * 파일 바이트는 화면 → 워커로 이전(transfer)하고, 결과 장면의 형식 배열은 워커 → 화면으로 이전한다(복사 없이).
 * STEP은 같은 그물을 여러 자리에 놓으므로(Mesh3d.matrix) 여러 그물이 같은 버퍼를 가리킨다 —
 * 이전 목록에는 버퍼마다 한 번만 넣는다(같은 버퍼를 두 번 넣으면 postMessage가 실패한다).
 */
import type { Scene3d } from 'opencad-viewer3d/types';
import type { FaceSurfacePayload } from '../facesurf';
import { TRUNCATED_WARNING } from '../messages';

export interface ParseRequest {
  id: number;
  type: 'parse';
  /** 파일 이름(장면 이름) */
  name: string;
  /** 파일 바이트(이전된다) */
  bytes: ArrayBuffer;
  /** 삼각화 선택(곡면 품질) */
  options?: ParseOptions;
}

/**
 * 질량 속성 적분 요청: 워커가 해석(id)과 함께 남긴 적분 거리를 면 단위로 나눠 적분하고 'props' 응답으로 보낸다.
 * 앱은 문서를 보인 뒤 보낸다. 워커는 새 해석 요청을 받으면 앞 문서의 적분을 그만둔다
 */
export interface PropsRequest {
  id: number;
  type: 'props';
}

/**
 * 곡면 정의 요청: 해석(id)의 면 표에 식이 없는 곡면(B-스플라인 등 — 측정에서 축이 곡면을 뚫는 점을 그 곡면 위로 옮긴다)을 'surfaces' 응답으로 받는다.
 * 그 해석의 것이 워커에 없으면(새 해석을 받았다) data는 null
 */
export interface SurfacesRequest {
  id: number;
  type: 'surfaces';
}

/** 구한 질량 속성 하나: 면 표 번호(meta.faceTables) → 값(massprops.ts PROPS_LEN칸, 장면 단위) */
export interface PropsValue {
  table: number;
  props: Float64Array;
}

/** 질량 속성 적분 진행(이번에 끝낸 입체의 값, 끝낸·모든 입체 수, 다 했는지, 시간 한도로 삼각형 값을 쓴 입체 수, 적분 시간 ms) */
export interface PropsProgress {
  results: PropsValue[];
  done: number;
  total: number;
  finished: boolean;
  timedOut: number;
  ms: number;
}

/** 삼각화 선택: 크기 대비 현 높이(기본 0.001)와 이웃 법선 사이 최대 각(도, 기본 20) */
export interface ParseOptions {
  tolerance?: number;
  angleTolerance?: number;
}

export type ParseResponse =
  | { id: number; type: 'progress'; fraction: number; stage: string }
  | { id: number; type: 'done'; result: ParseResult }
  | { id: number; type: 'error'; message: string }
  | ({ id: number; type: 'props' } & PropsProgress)
  | { id: number; type: 'surfaces'; data: FaceSurfacePayload | null };

export interface ParseResult {
  scene: Scene3d;
  /** 워커 안 해석 시간(ms) */
  ms: number;
  /** 압축을 풀어 열었으면 그 내력(gzip·ZIP) */
  source?: ParseSource;
  /**
   * 질량 속성을 나중에 구하면(워커) 값을 기다리는 면 표 번호와 입체 수 — 면 표 props는 아직 없다(PropsRequest로 구한다).
   * 없으면 장면에 이미 들었거나 구할 것이 없다
   */
  props?: { tables: number[]; solids: number };
  /** 면 표에 식이 없는 곡면을 워커가 남겼으면 그 면 수(SurfacesRequest로 받는다) */
  surfaces?: number;
}

/** 압축 STEP을 풀어 연 내력 */
export interface ParseSource {
  /** 풀었던 압축 형식(바깥부터) */
  containers: ('gzip' | 'zip')[];
  /** ZIP 안에서 연 항목 이름 */
  entry?: string;
  /** 압축된 파일 크기(바이트) */
  packedSize: number;
  /** 풀어 낸 STEP 글 크기(바이트) */
  size: number;
}

/**
 * 값 안의 모든 ArrayBuffer(형식 배열의 버퍼 포함)를 한 번씩 모은다 — postMessage 이전 목록.
 * 일반 객체·배열·Map·Set을 따라 들어가고, 같은 객체는 한 번만 본다. SharedArrayBuffer와 빈 버퍼는 넣지 않는다.
 */
export function collectTransfers(value: unknown): ArrayBuffer[] {
  const out = new Set<ArrayBuffer>();
  const seen = new Set<object>();
  const stack: unknown[] = [value];
  while (stack.length) {
    const v = stack.pop();
    if (v === null || typeof v !== 'object') continue;
    if (seen.has(v)) continue;
    seen.add(v);
    if (v instanceof ArrayBuffer) {
      if (v.byteLength > 0) out.add(v);
      continue;
    }
    if (ArrayBuffer.isView(v)) {
      const b = v.buffer;
      if (b instanceof ArrayBuffer && b.byteLength > 0) out.add(b);
      continue;
    }
    if (Array.isArray(v)) {
      for (const x of v) if (x !== null && typeof x === 'object') stack.push(x);
      continue;
    }
    if (v instanceof Map) {
      for (const [k, x] of v) {
        stack.push(k);
        stack.push(x);
      }
      continue;
    }
    if (v instanceof Set) {
      for (const x of v) stack.push(x);
      continue;
    }
    for (const x of Object.values(v)) if (x !== null && typeof x === 'object') stack.push(x);
  }
  return [...out];
}

/** 장면에 그릴 것이 있는지(그물·선분·점) */
export function sceneHasGeometry(s: Scene3d): boolean {
  return (
    s.meshes.some((m) => m.positions.length >= 9) ||
    s.lines.some((l) => l.positions.length >= 6) ||
    (s.points ?? []).some((p) => p.positions.length >= 3)
  );
}

/** 오류 값 → 사람이 읽는 글 */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  return String(e);
}

export type SniffResult = { ok: true } | { ok: false; reason: string };

const MAGIC = 'ISO-10303-21';

/**
 * 파일 앞부분을 보고 STEP(ISO 10303-21 교환 구조) 글인지 가린다.
 * 앞의 BOM·공백·주석(/* *\/) 다음에 `ISO-10303-21;`이 와야 한다. gzip·zip 압축 파일은 알기 쉬운 이유를 돌려준다.
 */
export function sniffStep(head: Uint8Array): SniffResult {
  if (head.length === 0) return { ok: false, reason: '빈 파일입니다.' };
  if (head[0] === 0x1f && head[1] === 0x8b) return { ok: false, reason: 'gzip으로 압축된 파일입니다(.stpZ 등). 압축을 푼 .stp 파일을 여십시오.' };
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04)
    return { ok: false, reason: 'zip 압축 파일입니다(.stpx·.zip 등). 압축을 푼 .stp 파일을 여십시오.' };
  let i = 0;
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) i = 3;
  const n = Math.min(head.length, 64 * 1024);
  while (i < n) {
    const c = head[i]!;
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c) {
      i++;
      continue;
    }
    if (c === 0x2f && head[i + 1] === 0x2a) {
      // 주석 건너뛰기
      let j = i + 2;
      while (j + 1 < n && !(head[j] === 0x2a && head[j + 1] === 0x2f)) j++;
      i = j + 2;
      continue;
    }
    break;
  }
  if (i >= n) return { ok: false, reason: 'STEP 파일이 아닙니다(ISO-10303-21 머리가 없습니다).' };
  for (let k = 0; k < MAGIC.length; k++) {
    if (head[i + k] !== MAGIC.charCodeAt(k)) return { ok: false, reason: 'STEP 파일이 아닙니다(ISO-10303-21 머리가 없습니다).' };
  }
  return { ok: true };
}

/** IFC(건축 BIM) 안내 — Part 21 글이지만 기계 CAD STEP이 아니다 */
export const IFC_MESSAGE = 'IFC(건축 BIM) 파일입니다. 이 앱은 기계 CAD STEP(AP203·AP214·AP242)만 엽니다 — IFC 뷰어로 여십시오.';

/** 파일 앞부분 FILE_SCHEMA의 스키마 이름들(대문자, 없으면 빈 배열) */
export function headSchemas(head: Uint8Array): string[] {
  const n = Math.min(head.length, 64 * 1024);
  let text = '';
  for (let i = 0; i < n; i++) text += String.fromCharCode(head[i]!);
  const m = /FILE_SCHEMA\s*\(\s*\(([^;]*?)\)\s*\)\s*;/i.exec(text);
  if (!m) return [];
  return [...m[1]!.matchAll(/'([^']*)'/g)].map((x) => x[1]!.trim().toUpperCase()).filter(Boolean);
}

/**
 * 그릴 형상이 없을 때 까닭 한 문장: 끊긴 파일이면 그것(면 실패·형상 없음은 그 결과), 제품 구조만 있으면 그렇다고,
 * 아니면 해석기 경고 가운데 첫 것(형상 없음이라는 같은 말은 빼고). 없으면 undefined
 */
export function emptyReason(s: Pick<Scene3d, 'warnings' | 'meta'>): string | undefined {
  const w = s.warnings ?? [];
  if (w.includes(TRUNCATED_WARNING)) return TRUNCATED_WARNING;
  const other = w.filter((x) => !x.startsWith('그릴 형상을 찾지 못했다'));
  // 다른 경고 없이 형상이 없는데 제품 나무는 있다 — 제품 구조(PRODUCT…)만 내보낸 파일
  if (!other.length && ((s.meta as { products?: unknown[] } | undefined)?.products?.length ?? 0) > 0)
    return '제품 구조만 있고 형상이 없는 파일입니다 — CAD에서 형상(솔리드·면)을 함께 내보내 보십시오.';
  return other[0];
}

/** 워커·해석기 오류 글 → 화면에 보일 알기 쉬운 글 */
export function friendlyError(message: string): string {
  const m = message.trim();
  if (/out of memory|allocation failed|Array buffer allocation|Invalid array length|Invalid typed array length/i.test(m))
    return '메모리가 모자라 파일을 끝까지 읽지 못했습니다. 다른 탭을 닫거나 더 작은 파일로 해 보십시오.';
  if (/Maximum call stack/i.test(m)) return '파일 구조가 너무 깊어 읽지 못했습니다.';
  if (/WebGL2/i.test(m)) return m;
  if (!m) return '알 수 없는 오류로 파일을 열지 못했습니다.';
  return m;
}
