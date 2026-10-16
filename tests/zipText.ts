/**
 * 시험용 ZIP 글쓴이(저장·deflate, 필요하면 ZIP64 끝 목록). node:zlib의 deflate-raw를 쓴다(시험에서만).
 */
import { deflateRawSync } from 'node:zlib';
import { crc32 } from '../src/archive';

export interface ZipFile {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  flags?: number;
  /** 머리에 적을 CRC를 일부러 틀리게 */
  badCrc?: boolean;
  /** 압축 방식 번호를 이 값으로 적는다(지원하지 않는 방식 시험) */
  fakeMethod?: number;
}

export function makeZip(files: ZipFile[], opts: { zip64?: boolean } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name);
    const method = f.method ?? 8;
    const body = method === 8 ? new Uint8Array(deflateRawSync(f.data)) : f.data;
    const crc = (crc32(f.data) ^ (f.badCrc ? 1 : 0)) >>> 0;
    const flags = (f.flags ?? 0) | 0x800;
    const m = f.fakeMethod ?? method;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, flags, true);
    lh.setUint16(8, m, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, name.length, true);
    parts.push(new Uint8Array(lh.buffer), name, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, flags, true);
    ch.setUint16(10, m, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, body.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + body.length;
  }
  const cdOffset = offset;
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  parts.push(...central);
  if (opts.zip64) {
    const z = new DataView(new ArrayBuffer(56));
    z.setUint32(0, 0x06064b50, true);
    z.setBigUint64(4, 44n, true);
    z.setBigUint64(24, BigInt(files.length), true);
    z.setBigUint64(32, BigInt(files.length), true);
    z.setBigUint64(40, BigInt(cdSize), true);
    z.setBigUint64(48, BigInt(cdOffset), true);
    const loc = new DataView(new ArrayBuffer(20));
    loc.setUint32(0, 0x07064b50, true);
    loc.setBigUint64(8, BigInt(cdOffset + cdSize), true);
    loc.setUint32(16, 1, true);
    parts.push(new Uint8Array(z.buffer), new Uint8Array(loc.buffer));
  }
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, opts.zip64 ? 0xffff : files.length, true);
  e.setUint16(10, opts.zip64 ? 0xffff : files.length, true);
  e.setUint32(12, cdSize, true);
  e.setUint32(16, opts.zip64 ? 0xffffffff : cdOffset, true);
  parts.push(new Uint8Array(e.buffer));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const x of parts) {
    out.set(x, p);
    p += x.length;
  }
  return out;
}
