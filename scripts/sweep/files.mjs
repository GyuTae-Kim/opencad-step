/**
 * 훑기 표본 고르기: 폴더를 재귀로 훑어 앱이 여는 파일만 고르고 내용 sha256으로 중복을 뺀다.
 * - .stp·.step·.p21(앱 STEP_EXTENSIONS)과 압축 .stpz·.stp.gz·.step.gz·.p21.gz는 이름만 보고 고른다.
 * - 이름이 그냥 .gz면 gzip 머리의 원래 이름(FNAME)이 STEP일 때만, .zip은 끝의 목록에 STEP 항목이 있을 때만 고른다
 *   (앱의 열기 상자는 .gz·.zip을 모두 받지만 표본 폴더의 다른 압축 파일까지 넣으면 "STEP 아님"만 늘어난다).
 * - 숨은 폴더(.git·.runtime 등)와 node_modules는 들어가지 않고, 바로 가기(심볼릭 링크)는 따라가지 않는다.
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** 앱이 여는 STEP 확장자(src/app/files.ts STEP_EXTENSIONS와 같게 — 시험이 확인한다) */
export const STEP_EXTENSIONS = ['.stp', '.step', '.p21'];
/** 이름만 보고 고르는 압축 STEP */
const PACKED_STEP_RE = /\.(stpz|stp\.gz|step\.gz|p21\.gz)$/i;
/** ZIP 안에서 STEP으로 칠 항목(앱이 열거나 STEP-XML이라고 알려 주는 것) */
const ZIP_STEP_ENTRY_RE = /\.(stp|step|p21|stpz|stpx|stpxz)$|\.(stp|step|p21)\.gz$/i;
const SKIP_DIRS = new Set(['node_modules']);

/** 이름으로 정해지는 종류: 'step'·'packed'(이름만으로 고름)·'gz'·'zip'(안을 봐야 앎)·null(고르지 않음) */
export function nameKind(name) {
  const n = name.toLowerCase();
  if (STEP_EXTENSIONS.some((e) => n.endsWith(e))) return 'step';
  if (PACKED_STEP_RE.test(n)) return 'packed';
  if (n.endsWith('.gz')) return 'gz';
  if (n.endsWith('.zip')) return 'zip';
  return null;
}

/** 확장자 이름(통계용): .stp.gz처럼 두 마디 압축은 둘 다 */
export function extensionOf(name) {
  const n = name.toLowerCase();
  const m = /(\.(?:stp|step|p21)\.gz|\.[^./\\]+)$/.exec(n);
  return m ? m[1] : '';
}

async function readRange(fh, pos, len) {
  const buf = Buffer.alloc(len);
  const { bytesRead } = await fh.read(buf, 0, len, pos);
  return buf.subarray(0, bytesRead);
}

/** gzip 머리의 원래 이름(FNAME)이 STEP인지 */
export async function gzipHasStepName(path) {
  const fh = await open(path, 'r');
  try {
    const b = await readRange(fh, 0, 4096);
    if (b.length < 10 || b[0] !== 0x1f || b[1] !== 0x8b) return false;
    const flags = b[3];
    if (!(flags & 0x08)) return false;
    let p = 10;
    if (flags & 0x04) p += 2 + b.readUInt16LE(10);
    const end = b.indexOf(0, p);
    if (end < 0) return false;
    const name = b.subarray(p, end).toString('latin1');
    return nameKind(name) === 'step';
  } finally {
    await fh.close();
  }
}

/** ZIP 끝의 목록(중앙 디렉터리, ZIP64 포함)에 STEP 항목이 있는지 — 목록만 읽고 내용은 풀지 않는다 */
export async function zipHasStepEntry(path) {
  const fh = await open(path, 'r');
  try {
    const size = (await fh.stat()).size;
    if (size < 22) return false;
    const tailLen = Math.min(size, 22 + 0xffff + 20);
    const tailPos = size - tailLen;
    const t = await readRange(fh, tailPos, tailLen);
    let eocd = -1;
    for (let i = t.length - 22; i >= 0; i--) {
      if (t[i] === 0x50 && t[i + 1] === 0x4b && t[i + 2] === 5 && t[i + 3] === 6) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return false;
    let count = t.readUInt16LE(eocd + 10);
    let cdSize = t.readUInt32LE(eocd + 12);
    let cdOffset = t.readUInt32LE(eocd + 16);
    if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      const loc = eocd - 20;
      if (loc < 0 || t.readUInt32LE(loc) !== 0x07064b50) return false;
      const z = Number(t.readBigUInt64LE(loc + 8));
      const z64 = await readRange(fh, z, 56);
      if (z64.length < 56 || z64.readUInt32LE(0) !== 0x06064b50) return false;
      count = Number(z64.readBigUInt64LE(32));
      cdSize = Number(z64.readBigUInt64LE(40));
      cdOffset = Number(z64.readBigUInt64LE(48));
    }
    if (cdOffset + cdSize > size || cdSize > 256 * 1024 * 1024) return false;
    const cd = await readRange(fh, cdOffset, cdSize);
    let p = 0;
    for (let k = 0; k < count && p + 46 <= cd.length; k++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) return false;
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString('latin1');
      const base = name.split('/').pop() ?? '';
      if (!name.startsWith('__MACOSX/') && !base.startsWith('._') && ZIP_STEP_ENTRY_RE.test(base)) return true;
      p += 46 + nameLen + extraLen + commentLen;
    }
    return false;
  } catch {
    return false;
  } finally {
    await fh.close();
  }
}

/** 폴더들을 재귀로 훑어 이름이 맞는 파일 경로(정렬)를 돌려준다 */
export async function walkDirs(dirs) {
  const out = [];
  const visit = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await visit(p);
      } else if (e.isFile() && nameKind(e.name)) out.push(p);
    }
  };
  for (const d of dirs) {
    const s = await stat(d).catch(() => null);
    if (s?.isDirectory()) await visit(d);
    else if (s?.isFile() && nameKind(d)) out.push(d);
  }
  return [...new Set(out)].sort();
}

/** 이름만으로 못 정한 압축 파일(.gz·.zip)은 안을 보고 STEP일 때만 남긴다 */
export async function keepOpenable(paths) {
  const out = [];
  for (const p of paths) {
    const k = nameKind(p);
    if (k === 'step' || k === 'packed') out.push(p);
    else if (k === 'gz' ? await gzipHasStepName(p) : k === 'zip' ? await zipHasStepEntry(p) : false) out.push(p);
  }
  return out;
}

/** 파일 내용 sha256(16진수) */
export function hashFile(path) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    createReadStream(path)
      .on('data', (d) => h.update(d))
      .on('error', reject)
      .on('end', () => resolve(h.digest('hex')));
  });
}

/**
 * 경로들을 내용 sha256으로 묶는다: [{ hash, path(정렬 순 첫 경로), size, copies }] — 해시 순.
 * 읽지 못한 파일은 unreadable에 센다.
 */
export async function dedupe(paths) {
  const byHash = new Map();
  let unreadable = 0;
  for (const p of paths) {
    let hash;
    let size;
    try {
      size = (await stat(p)).size;
      hash = await hashFile(p);
    } catch {
      unreadable++;
      continue;
    }
    const cur = byHash.get(hash);
    if (cur) cur.copies++;
    else byHash.set(hash, { hash, path: p, size, copies: 1 });
  }
  return { files: [...byHash.values()].sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0)), unreadable };
}
