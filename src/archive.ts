/**
 * 압축 STEP 풀기(DOM 없음 — 웹 워커·Node에서 돈다).
 *
 * - gzip(.stp.gz·.stpZ, 첫 바이트 1f 8b)은 `DecompressionStream('gzip')`으로 푼다.
 * - ZIP 꾸러미는 끝의 목록(중앙 디렉터리, ZIP64 포함)을 직접 읽어 안의 .stp·.step·.p21(또는 그 gzip)을 찾고,
 *   저장(방식 0)은 그대로, deflate(방식 8)는 `DecompressionStream('deflate-raw')`로 풀어 CRC-32를 맞춰 본다.
 * - STEP-XML(ISO 10303-28, .stpx)은 지원하지 않으므로 알아보고 알기 쉬운 이유로 거절한다.
 */

/** 파일 앞부분으로 가린 종류 */
export type ContainerKind = 'step' | 'gzip' | 'zip' | 'xml' | 'unknown' | 'empty';

/** 압축을 푼 결과 크기 상한(바이트). 해석기 색인이 32비트 위치를 쓰고, 브라우저 메모리도 한계가 있다 */
export const MAX_UNPACKED_BYTES = 2 * 1024 * 1024 * 1024 - 1;

/** STEP-XML 안내 */
export const STEP_XML_MESSAGE =
  'STEP-XML(ISO 10303-28, .stpx) 파일은 지원하지 않습니다. CAD 프로그램에서 STEP Part 21 형식(.stp·.step — AP242·AP214·AP203)으로 다시 내보내 여십시오.';

const MAGIC = 'ISO-10303-21';

/** BOM·공백·주석(/* *\/) 뒤 첫 바이트 위치(끝까지 없으면 길이) */
function skipLead(b: Uint8Array): number {
  let i = 0;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) i = 3;
  while (i < b.length) {
    const c = b[i]!;
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c) {
      i++;
      continue;
    }
    if (c === 0x2f && b[i + 1] === 0x2a) {
      let j = i + 2;
      while (j + 1 < b.length && !(b[j] === 0x2a && b[j + 1] === 0x2f)) j++;
      i = j + 2;
      continue;
    }
    break;
  }
  return i;
}

/** 파일 앞부분(수십 KB면 충분)으로 종류를 가린다 */
export function sniffContainer(head: Uint8Array): ContainerKind {
  if (!head.length) return 'empty';
  if (head[0] === 0x1f && head[1] === 0x8b) return 'gzip';
  if (head[0] === 0x50 && head[1] === 0x4b && ((head[2] === 3 && head[3] === 4) || (head[2] === 5 && head[3] === 6) || (head[2] === 7 && head[3] === 8))) return 'zip';
  // UTF-16 XML(FF FE / FE FF 다음 '<')
  if ((head[0] === 0xff && head[1] === 0xfe && head[2] === 0x3c) || (head[0] === 0xfe && head[1] === 0xff && head[3] === 0x3c)) return 'xml';
  const i = skipLead(head);
  if (i >= head.length) return 'unknown';
  let ok = true;
  for (let k = 0; k < MAGIC.length; k++) if (head[i + k] !== MAGIC.charCodeAt(k)) ok = false;
  if (ok) return 'step';
  if (head[i] === 0x3c) return 'xml';
  return 'unknown';
}

/** XML 앞부분이 STEP-XML(ISO 10303-28)인지 */
export function isStepXml(head: Uint8Array): boolean {
  const n = Math.min(head.length, 64 * 1024);
  let s = '';
  // UTF-16이면 짝수(또는 홀수) 바이트만 모은다
  const wide = (head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff);
  for (let i = wide ? 2 : 0; i < n; i += wide ? 2 : 1) {
    const c = wide && head[0] === 0xfe ? head[i + 1]! : head[i]!;
    s += String.fromCharCode(c);
  }
  return /10303[-_]28|urn:oid:1\.0\.10303\.28|iso_10303_28/i.test(s);
}

/** 이름이 STEP-XML 확장자인지 */
export function isStepXmlName(name: string): boolean {
  return /\.stpx(z)?$/i.test(name);
}

// ───────────────────────── CRC-32 ─────────────────────────

let crcTable: Uint32Array | null = null;

/** CRC-32(ZIP·gzip과 같은 다항식 0xEDB88320) */
export function crc32(b: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  const t = crcTable;
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ───────────────────────── 풀기 ─────────────────────────

export interface InflateOptions {
  /** 결과 크기 상한(기본 MAX_UNPACKED_BYTES) */
  limit?: number;
  /** 넣은 압축 바이트 비율(0~1) */
  onProgress?: (fraction: number) => void;
}

/**
 * gzip·deflate-raw 바이트를 푼다(DecompressionStream). 상한을 넘으면 멈추고 오류.
 * gzip 뒤에 붙은 군더더기(일부 내보내기)는 이미 푼 내용이 있으면 무시한다.
 */
export async function inflate(data: Uint8Array, format: 'gzip' | 'deflate-raw', opts: InflateOptions = {}): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 풀기(DecompressionStream)를 지원하지 않습니다. 압축을 푼 .stp 파일을 여십시오.');
  const limit = opts.limit ?? MAX_UNPACKED_BYTES;
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let readError: unknown = null;
  let overLimit = false;
  const readAll = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > limit) {
          overLimit = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    } catch (e) {
      readError = e;
    }
  })();
  const CHUNK = 1 << 20;
  let writeError: unknown = null;
  try {
    for (let off = 0; off < data.length && !overLimit && !readError; off += CHUNK) {
      await writer.write(data.subarray(off, Math.min(data.length, off + CHUNK)) as Uint8Array<ArrayBuffer>);
      opts.onProgress?.(Math.min(1, (off + CHUNK) / data.length));
    }
    if (!overLimit && !readError) await writer.close();
  } catch (e) {
    writeError = e;
  }
  await readAll;
  if (overLimit) throw new Error(`압축을 푼 크기가 ${Math.round(limit / 1024 / 1024)} MB를 넘어 열 수 없습니다.`);
  const err = readError ?? writeError;
  if (err && !(total > 0 && /junk|trailing|extra|after end/i.test(String((err as Error)?.message ?? err)))) {
    throw new Error(`압축을 풀지 못했습니다(파일이 손상되었거나 잘렸을 수 있습니다). ${String((err as Error)?.message ?? err)}`.trim());
  }
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

// ───────────────────────── ZIP ─────────────────────────

export interface ZipEntry {
  name: string;
  /** 0 저장, 8 deflate, … */
  method: number;
  flags: number;
  crc: number;
  compressedSize: number;
  size: number;
  /** 지역 머리 위치 */
  localOffset: number;
}

const ZIP_METHODS: Record<number, string> = { 9: 'Deflate64', 12: 'BZIP2', 14: 'LZMA', 93: 'Zstandard', 95: 'XZ', 98: 'PPMd', 99: 'AES 암호' };

function u16(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
function u32(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}
function u64(b: Uint8Array, o: number): number {
  return u32(b, o) + u32(b, o + 4) * 0x100000000;
}

let utf8Fatal: TextDecoder | null = null;
let eucKr: TextDecoder | null | undefined;
function zipName(b: Uint8Array, utf8Flag: boolean): string {
  try {
    utf8Fatal ??= new TextDecoder('utf-8', { fatal: true });
    return utf8Fatal.decode(b);
  } catch {
    if (utf8Flag) return new TextDecoder('utf-8').decode(b);
  }
  // 한국어 Windows가 만든 ZIP(UTF-8 표시 없이 CP949)
  if (eucKr === undefined) {
    try {
      eucKr = new TextDecoder('euc-kr', { fatal: true });
    } catch {
      eucKr = null;
    }
  }
  if (eucKr) {
    try {
      return eucKr.decode(b);
    } catch {
      /* 아래로 */
    }
  }
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
  return s;
}

/** ZIP 끝의 목록(중앙 디렉터리)을 읽는다. ZIP이 아니거나 목록이 없으면 오류 */
export function zipEntries(b: Uint8Array): ZipEntry[] {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP 끝의 목록(중앙 디렉터리)을 찾지 못했습니다. 파일이 잘렸거나 손상되었을 수 있습니다.');
  let count = u16(b, eocd + 10);
  let cdOffset = u32(b, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    // ZIP64: 끝 목록 위치표(locator) → ZIP64 끝 목록
    const loc = eocd - 20;
    if (loc >= 0 && u32(b, loc) === 0x07064b50) {
      const z = u64(b, loc + 8);
      if (z + 56 <= b.length && u32(b, z) === 0x06064b50) {
        count = u64(b, z + 32);
        cdOffset = u64(b, z + 48);
      }
    }
  }
  const out: ZipEntry[] = [];
  let p = cdOffset;
  for (let k = 0; k < count; k++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) throw new Error('ZIP 목록이 손상되었습니다.');
    const flags = u16(b, p + 8);
    const method = u16(b, p + 10);
    const crc = u32(b, p + 16);
    let compressedSize = u32(b, p + 20);
    let size = u32(b, p + 24);
    const nameLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const commentLen = u16(b, p + 32);
    let localOffset = u32(b, p + 42);
    const name = zipName(b.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    // ZIP64 덧붙임(0x0001): 크기·압축 크기·지역 머리 위치 가운데 0xFFFFFFFF인 것만 차례로
    let e = p + 46 + nameLen;
    const eEnd = e + extraLen;
    while (e + 4 <= eEnd) {
      const id = u16(b, e);
      const sz = u16(b, e + 2);
      if (id === 0x0001) {
        let q = e + 4;
        if (size === 0xffffffff && q + 8 <= e + 4 + sz) {
          size = u64(b, q);
          q += 8;
        }
        if (compressedSize === 0xffffffff && q + 8 <= e + 4 + sz) {
          compressedSize = u64(b, q);
          q += 8;
        }
        if (localOffset === 0xffffffff && q + 8 <= e + 4 + sz) localOffset = u64(b, q);
      }
      e += 4 + sz;
    }
    out.push({ name, method, flags, crc, compressedSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** ZIP 항목 하나의 내용(풀어서) */
export async function zipEntryData(b: Uint8Array, e: ZipEntry, opts: InflateOptions = {}): Promise<Uint8Array> {
  const lo = e.localOffset;
  if (lo + 30 > b.length || u32(b, lo) !== 0x04034b50) throw new Error(`ZIP 항목 ${e.name}의 머리가 손상되었습니다.`);
  if (e.flags & 1) throw new Error(`암호가 걸린 ZIP 항목(${e.name})은 열 수 없습니다. 압축을 푼 .stp 파일을 여십시오.`);
  const start = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28);
  const end = start + e.compressedSize;
  if (end > b.length) throw new Error(`ZIP 항목 ${e.name}이(가) 잘렸습니다.`);
  const raw = b.subarray(start, end);
  let out: Uint8Array;
  if (e.method === 0) out = raw;
  else if (e.method === 8) out = await inflate(raw, 'deflate-raw', opts);
  else throw new Error(`ZIP 압축 방식 ${e.method}${ZIP_METHODS[e.method] ? `(${ZIP_METHODS[e.method]})` : ''}은 지원하지 않습니다(저장·deflate만). 압축을 푼 .stp 파일을 여십시오.`);
  if (crc32(out) !== e.crc) throw new Error(`ZIP 항목 ${e.name}이(가) 손상되었습니다(CRC 불일치).`);
  return out;
}

const STEP_RE = /\.(stp|step|p21)$/i;
const PACKED_STEP_RE = /\.(stpz|stp\.gz|step\.gz|p21\.gz)$/i;

/** ZIP 항목 가운데 STEP 후보(디렉터리·macOS 부스러기 빼고) */
function isJunk(name: string): boolean {
  const base = name.split('/').pop() ?? '';
  return name.endsWith('/') || name.startsWith('__MACOSX/') || base.startsWith('._') || !base;
}

// ───────────────────────── STEP 꺼내기 ─────────────────────────

export interface Unpacked {
  /** STEP 글 바이트 */
  bytes: Uint8Array;
  /** 풀었던 압축 형식(바깥부터). 압축이 아니면 빈 배열 */
  containers: ('gzip' | 'zip')[];
  /** ZIP 안에서 연 항목 이름 */
  entry?: string;
  /** 처음(압축된) 크기 */
  packedSize: number;
  /** 알림(ZIP 안 STEP이 여럿이라 하나만 연 것 등) */
  notes: string[];
}

/**
 * 바이트가 gzip·ZIP이면 풀어 STEP 글을 꺼낸다(압축이 아니면 그대로). STEP-XML이면 STEP_XML_MESSAGE로 거절한다.
 * onProgress는 0~1(압축 바이트 기준).
 */
export async function unpackStep(bytes: Uint8Array, onProgress?: (fraction: number) => void): Promise<Unpacked> {
  const out: Unpacked = { bytes, containers: [], packedSize: bytes.length, notes: [] };
  for (let depth = 0; depth < 3; depth++) {
    const kind = sniffContainer(out.bytes.subarray(0, 64 * 1024));
    if (kind === 'xml') {
      if (isStepXml(out.bytes.subarray(0, 64 * 1024))) throw new Error(STEP_XML_MESSAGE);
      return out;
    }
    if (kind === 'gzip') {
      out.containers.push('gzip');
      out.bytes = await inflate(out.bytes, 'gzip', { onProgress });
      continue;
    }
    if (kind !== 'zip') return out;
    out.containers.push('zip');
    const entries = zipEntries(out.bytes).filter((e) => !isJunk(e.name));
    const plain = entries.filter((e) => STEP_RE.test(e.name));
    const packed = entries.filter((e) => PACKED_STEP_RE.test(e.name));
    const cands = (plain.length ? plain : packed).slice().sort((a, b) => b.size - a.size);
    if (!cands.length) {
      if (entries.some((e) => isStepXmlName(e.name))) throw new Error(STEP_XML_MESSAGE);
      const names = entries.map((e) => e.name);
      const list = names.slice(0, 6).join(', ') + (names.length > 6 ? ` 외 ${names.length - 6}개` : '');
      throw new Error(`ZIP 안에 STEP 파일(.stp·.step·.p21)이 없습니다.${names.length ? ` 들어 있는 파일: ${list}` : ' 빈 ZIP입니다.'}`);
    }
    const pick = cands[0]!;
    if (cands.length > 1) {
      const rest = cands.slice(1).map((e) => e.name);
      out.notes.push(`ZIP 안 STEP 파일 ${cands.length}개 가운데 가장 큰 ${pick.name}을(를) 열었습니다(나머지: ${rest.slice(0, 5).join(', ')}${rest.length > 5 ? ` 외 ${rest.length - 5}개` : ''}).`);
    }
    out.entry = pick.name;
    out.bytes = await zipEntryData(out.bytes, pick, { onProgress });
  }
  return out;
}
