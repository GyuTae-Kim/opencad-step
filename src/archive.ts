/**
 * 압축 STEP 풀기(DOM 없음 — 웹 워커·Node에서 돈다).
 *
 * - gzip(.stp.gz·.stpZ, 첫 바이트 1f 8b)은 `DecompressionStream('gzip')`으로 푼다.
 * - ZIP 꾸러미는 끝의 목록(중앙 디렉터리, ZIP64 포함)을 직접 읽어 안의 .stp·.step·.p21(또는 그 gzip)을 찾고,
 *   저장(방식 0)은 그대로, deflate(방식 8)는 `DecompressionStream('deflate-raw')`로 풀어 CRC-32를 맞춰 본다.
 * - STEP-XML(ISO 10303-28, .stpx)은 지원하지 않으므로 알아보고 알기 쉬운 이유로 거절한다.
 * - 58차: 풀린 크기를 미리 알 수 있으면(ZIP 목록의 크기·gzip 끝 ISIZE) 믿지 않고 deflate가 낼 수 있는 크기인지 본 뒤 그만큼 한 번에 잡아 그 안에 푼다
 *   (덩이를 모은 뒤 잇느라 최고 메모리가 풀린 크기의 두 배가 되던 것을 한 배로). ZIP 목록의 크기가 상한을 넘으면 풀기 전에 거절한다.
 *   앞 64 KiB를 풀었을 때 STEP·gzip·ZIP이 아니면(0바이트 폭탄 등) 더 풀지 않는다 — 앞 64 KiB만으로 거절이 정해지므로 알림 글은 같다.
 *   압축 바이트는 64 KiB씩 넣는다(브라우저 DecompressionStream이 넣은 조각 하나를 한꺼번에 풀어 줄 세우므로 — 폭탄이면 1 MiB가 1 GB).
 */

/** 파일 앞부분으로 가린 종류 */
export type ContainerKind = 'step' | 'gzip' | 'zip' | 'xml' | 'unknown' | 'empty';

/** 압축을 푼 결과 크기 상한(바이트). 해석기 색인이 32비트 위치를 쓰고, 브라우저 메모리도 한계가 있다 */
export const MAX_UNPACKED_BYTES = 2 * 1024 * 1024 * 1024 - 1;

/**
 * deflate가 압축 바이트 하나에서 낼 수 있는 가장 큰 배수(RFC 1951 — 길이 258 일치 하나가 고정 허프만으로 2비트 남짓이라 이론 최대 약 1032:1).
 * 풀린 크기 예상값(ZIP 목록·gzip ISIZE)이 압축 크기 × 이 배수 + 머리 몫을 넘으면 나올 수 없는 값이라 쓰지 않는다
 */
export const MAX_DEFLATE_RATIO = 1032;

/** 판정에 쓰는 앞부분 길이(sniffContainer·앱 sniffStep이 보는 64 KiB) */
const HEAD_BYTES = 64 * 1024;

/** 압축 바이트 n개가 deflate로 풀려 나올 수 있는 가장 큰 크기 */
export function maxInflatedSize(packed: number): number {
  return packed * MAX_DEFLATE_RATIO + HEAD_BYTES;
}

/** 상한 넘음 알림(풀다가 넘었을 때와 ZIP 목록의 크기로 미리 알았을 때 같은 글) */
function overLimitError(limit: number): Error {
  return new Error(`압축을 푼 크기가 ${Math.round(limit / 1024 / 1024)} MB를 넘어 열 수 없습니다.`);
}

/**
 * 앞부분만 풀고 멈췄다(InflateOptions.accept가 false — 앞 64 KiB로 STEP·압축이 아님이 정해짐). head는 그때까지 푼 앞부분(64 KiB 넘게)
 */
export class InflateStopped extends Error {
  constructor(readonly head: Uint8Array) {
    super('앞부분만 풀고 멈췄습니다.');
    this.name = 'InflateStopped';
  }
}

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
  /**
   * 풀린 크기 예상값(ZIP 목록의 크기·gzip 끝 ISIZE). 믿지 않는다: 상한 안이고 압축 크기로 나올 수 있는 값(maxInflatedSize)일 때만
   * 그만큼 한 번에 잡아 그 안에 푼다(최고 메모리 한 배). 넘치면 나머지 덩이를 모아 끝에 잇고, 모자라면 푼 만큼만 잘라 돌려준다
   */
  sizeHint?: number;
  /** 앞 64 KiB를 풀었을 때 계속 풀지(false면 더 풀지 않고 InflateStopped를 던진다 — head에 앞부분). 64 KiB보다 짧은 결과는 묻지 않는다 */
  accept?: (head: Uint8Array) => boolean;
}

/**
 * gzip·deflate-raw 바이트를 푼다(DecompressionStream). 상한을 넘으면 멈추고 오류.
 * gzip 뒤에 붙은 군더더기(일부 내보내기)는 이미 푼 내용이 있으면 무시한다.
 * 결과는 sizeHint로 잡은 버퍼에 바로 채우거나(맞으면 최고 메모리 한 배), 없으면 덩이를 모아 끝에 한 번 잇는다(두 배).
 */
export async function inflate(data: Uint8Array, format: 'gzip' | 'deflate-raw', opts: InflateOptions = {}): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 풀기(DecompressionStream)를 지원하지 않습니다. 압축을 푼 .stp 파일을 여십시오.');
  const limit = opts.limit ?? MAX_UNPACKED_BYTES;
  const hint = opts.sizeHint ?? 0;
  /** 예상 크기로 잡은 결과 버퍼(앞에서부터 filled만큼 찼다) — 예상값이 없거나 나올 수 없는 값이면 null */
  let out: Uint8Array | null = null;
  if (hint > 0 && hint <= limit && hint <= maxInflatedSize(data.length)) {
    try {
      out = new Uint8Array(hint);
    } catch {
      // 메모리가 모자라 한 번에 잡지 못하면 덩이를 모은다(예전 길)
      out = null;
    }
  }
  let filled = 0;
  /** out을 다 채운 뒤(또는 out이 없을 때) 모은 덩이 */
  const rest: Uint8Array[] = [];
  const ds = new DecompressionStream(format);
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  let total = 0;
  let readError: unknown = null;
  let overLimit = false;
  let asked = !opts.accept;
  let stoppedHead: Uint8Array | null = null;
  /** 지금까지 푼 앞 n바이트 */
  const firstBytes = (n: number): Uint8Array => {
    const h = new Uint8Array(Math.min(n, total));
    let p = 0;
    if (out) {
      p = Math.min(filled, h.length);
      h.set(out.subarray(0, p));
    }
    for (const c of rest) {
      if (p >= h.length) break;
      const k = Math.min(c.length, h.length - p);
      h.set(c.subarray(0, k), p);
      p += k;
    }
    return h;
  };
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
        let v = value;
        if (out && filled < out.length) {
          const k = Math.min(out.length - filled, v.length);
          out.set(k === v.length ? v : v.subarray(0, k), filled);
          filled += k;
          v = v.subarray(k);
        }
        if (v.length) rest.push(v);
        if (!asked && total >= HEAD_BYTES) {
          asked = true;
          const head = firstBytes(HEAD_BYTES);
          if (!opts.accept!(head)) {
            stoppedHead = head;
            await reader.cancel();
            break;
          }
        }
      }
    } catch (e) {
      readError = e;
    }
  })();
  // 압축 바이트를 64 KiB씩 넣는다: 브라우저의 DecompressionStream은 넣은 조각 하나를 다 풀어 덩이들을 한꺼번에 줄 세우므로(받는 쪽이 읽기 전에),
  // 압축 폭탄(약 1000:1)이면 1 MiB 조각 하나가 1 GB 덩이가 되어 최고 메모리가 그만큼 늘었다(58차 헤드리스 Chrome — 앞 64 KiB에서 멈춰도 1.2 GB).
  // 64 KiB면 한 번에 66 MB 안쪽
  const CHUNK = 64 * 1024;
  let writeError: unknown = null;
  try {
    for (let off = 0; off < data.length && !overLimit && !stoppedHead && !readError; off += CHUNK) {
      await writer.write(data.subarray(off, Math.min(data.length, off + CHUNK)) as Uint8Array<ArrayBuffer>);
      opts.onProgress?.(Math.min(1, (off + CHUNK) / data.length));
    }
    if (!overLimit && !stoppedHead && !readError) await writer.close();
  } catch (e) {
    writeError = e;
  }
  await readAll;
  if (overLimit) throw overLimitError(limit);
  if (stoppedHead) throw new InflateStopped(stoppedHead);
  const err = readError ?? writeError;
  if (err && !(total > 0 && /junk|trailing|extra|after end/i.test(String((err as Error)?.message ?? err)))) {
    throw new Error(`압축을 풀지 못했습니다(파일이 손상되었거나 잘렸을 수 있습니다). ${String((err as Error)?.message ?? err)}`.trim());
  }
  if (out && !rest.length) return filled === out.length ? out : out.slice(0, filled);
  if (!out && rest.length === 1) return rest[0]!;
  // 예상값이 없었거나 모자랐다(여러 조각 gzip 등): 덩이를 잇는다
  const all = new Uint8Array(total);
  let p = 0;
  if (out) {
    all.set(out.subarray(0, filled));
    p = filled;
    out = null;
  }
  for (const c of rest) {
    all.set(c, p);
    p += c.length;
  }
  return all;
}

/** gzip 끝 ISIZE(풀린 크기 mod 2^32 — 뒤에 군더더기가 붙었으면 아무 값). 예상값으로만 쓴다 */
export function gzipSizeHint(b: Uint8Array): number {
  return b.length >= 18 ? u32(b, b.length - 4) : 0;
}

/** 앞 64 KiB로 계속 풀지: STEP 글·gzip·ZIP이면 끝까지 풀어야 안다. 그 밖(XML·알 수 없음)은 앞부분만으로 거절이 정해진다 */
function worthUnpacking(head: Uint8Array): boolean {
  const k = sniffContainer(head);
  return k === 'step' || k === 'gzip' || k === 'zip';
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
  else if (e.method === 8) {
    // 목록의 크기는 압축 크기로 나올 수 있는 값일 때만 믿는다: 상한을 넘으면 풀기 전에 거절하고, 아니면 그만큼 잡아 그 안에 푼다
    const limit = opts.limit ?? MAX_UNPACKED_BYTES;
    const plausible = e.size > 0 && e.size <= maxInflatedSize(raw.length);
    if (plausible && e.size > limit) throw overLimitError(limit);
    out = await inflate(raw, 'deflate-raw', plausible ? { ...opts, sizeHint: e.size } : opts);
  } else throw new Error(`ZIP 압축 방식 ${e.method}${ZIP_METHODS[e.method] ? `(${ZIP_METHODS[e.method]})` : ''}은 지원하지 않습니다(저장·deflate만). 압축을 푼 .stp 파일을 여십시오.`);
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
      try {
        out.bytes = await inflate(out.bytes, 'gzip', { onProgress, sizeHint: gzipSizeHint(out.bytes), accept: worthUnpacking });
      } catch (e) {
        // 앞 64 KiB가 STEP·압축이 아니다: 그 앞부분으로 다음 차례가 거절을 정한다(다 푼 것과 같은 판정·같은 글)
        if (!(e instanceof InflateStopped)) throw e;
        out.bytes = e.head;
      }
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
      // 다섯 개 넘는 나머지는 "… +N"(언어와 무관한 꼴 — 다른 언어 화면에서 문장 틀만 옮기고 자리 값은 그대로 두므로)
      out.notes.push(`ZIP 안 STEP 파일 ${cands.length}개 가운데 가장 큰 ${pick.name}을(를) 열었습니다(나머지: ${rest.slice(0, 5).join(', ')}${rest.length > 5 ? `, … +${rest.length - 5}` : ''}).`);
    }
    out.entry = pick.name;
    try {
      out.bytes = await zipEntryData(out.bytes, pick, { onProgress, accept: worthUnpacking });
    } catch (e) {
      if (!(e instanceof InflateStopped)) throw e;
      out.bytes = e.head;
    }
  }
  return out;
}
