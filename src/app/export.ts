/**
 * 내보내기(순수, DOM 없음): 화면용 삼각형을 STL(이진)·OBJ로, 측정 기록·의미 PMI 표를 CSV로.
 * 좌표는 세계 좌표(자리 변환 matrix·묶음 원점 origin 반영), 단위는 장면 단위 그대로(STL은 단위가 없어 머리에 적는다).
 * 화면용 삼각형이라 곡면은 면을 현으로 근사한 것이다(3D 프린트·미리 보기용 — 정밀 형상은 STEP 원본).
 */
import type { Mesh3d } from 'opencad-viewer3d/types';

type V3 = [number, number, number];

/** 그물 정점 i의 세계 좌표 */
function worldPoint(m: Mesh3d, i: number): V3 {
  const P = m.positions;
  const o = m.origin ?? [0, 0, 0];
  const x = P[i * 3]! + o[0];
  const y = P[i * 3 + 1]! + o[1];
  const z = P[i * 3 + 2]! + o[2];
  const M = m.matrix;
  if (!M) return [x, y, z];
  return [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!];
}

/** 거울 변환(행렬식 < 0)이면 감기를 뒤집어야 바깥 법선이 지켜진다 */
function mirrored(m: Mesh3d): boolean {
  const M = m.matrix;
  if (!M) return false;
  return M[0]! * (M[5]! * M[10]! - M[9]! * M[6]!) - M[4]! * (M[1]! * M[10]! - M[9]! * M[2]!) + M[8]! * (M[1]! * M[6]! - M[5]! * M[2]!) < 0;
}

function triCount(m: Mesh3d): number {
  return Math.floor((m.indices ? m.indices.length : m.positions.length / 3) / 3);
}

/** 이진 STL(80바이트 머리 + 삼각형 수 + 삼각형마다 법선·세 점·속성 2바이트) */
export function meshesToStl(meshes: readonly Mesh3d[], header = 'OpenCAD STEP viewer'): ArrayBuffer {
  let n = 0;
  for (const m of meshes) n += triCount(m);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = new TextEncoder().encode(header.slice(0, 79));
  new Uint8Array(buf, 0, 80).set(head.subarray(0, 80));
  dv.setUint32(80, n, true);
  let off = 84;
  for (const m of meshes) {
    const I = m.indices;
    const flip = mirrored(m);
    for (let t = 0; t < triCount(m); t++) {
      const ia = I ? I[t * 3]! : t * 3;
      let ib = I ? I[t * 3 + 1]! : t * 3 + 1;
      let ic = I ? I[t * 3 + 2]! : t * 3 + 2;
      if (flip) [ib, ic] = [ic, ib];
      const a = worldPoint(m, ia);
      const b = worldPoint(m, ib);
      const c = worldPoint(m, ic);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = u[1]! * w[2]! - u[2]! * w[1]!;
      const ny = u[2]! * w[0]! - u[0]! * w[2]!;
      const nz = u[0]! * w[1]! - u[1]! * w[0]!;
      const l = Math.hypot(nx, ny, nz) || 1;
      for (const v of [nx / l, ny / l, nz / l, ...a, ...b, ...c]) {
        dv.setFloat32(off, v, true);
        off += 4;
      }
      dv.setUint16(off, 0, true);
      off += 2;
    }
  }
  return buf;
}

/** OBJ 글(그물마다 o 이름, 정점·면 — 1부터 세는 번호) */
export function meshesToObj(meshes: readonly Mesh3d[], comment = 'OpenCAD STEP viewer'): string {
  const out: string[] = [`# ${comment}`];
  let base = 1;
  for (const m of meshes) {
    out.push(`o ${(m.name || m.id).replace(/\s+/g, '_')}`);
    const nv = m.positions.length / 3;
    for (let i = 0; i < nv; i++) {
      const p = worldPoint(m, i);
      out.push(`v ${num(p[0])} ${num(p[1])} ${num(p[2])}`);
    }
    const I = m.indices;
    const flip = mirrored(m);
    for (let t = 0; t < triCount(m); t++) {
      const a = (I ? I[t * 3]! : t * 3) + base;
      const b = (I ? I[t * 3 + 1]! : t * 3 + 1) + base;
      const c = (I ? I[t * 3 + 2]! : t * 3 + 2) + base;
      out.push(flip ? `f ${a} ${c} ${b}` : `f ${a} ${b} ${c}`);
    }
    base += nv;
  }
  return `${out.join('\n')}\n`;
}

function num(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toPrecision(9))) : '0';
}

/** CSV 칸 하나(쉼표·따옴표·줄바꿈이 있으면 따옴표로) */
export function csvCell(v: string | number): string {
  const s = typeof v === 'number' ? num(v) : v;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 줄들 → CSV(줄바꿈 CRLF, 엑셀이 한글을 읽게 BOM은 부르는 쪽이 붙인다) */
export function toCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** 측정 기록 한 줄(장면 단위 값 — CSV를 만들 때 표시 단위로 바꾼다) */
export type MeasureRecord =
  | { type: 'distance'; a: V3; b: V3; distance: number; dx: number; dy: number; dz: number }
  | { type: 'face'; kind: string; stepId: number; radius?: number; area: number; perimeter: number; exact: boolean }
  | { type: 'edge'; kind: string; stepId: number; length: number; radius?: number };

/** 측정 기록 → CSV 줄(머리 줄 포함). f는 표시 단위로 바꾸는 배율과 단위 글, label은 이름표 번역 */
export function measureRows(records: readonly MeasureRecord[], f: { factor: number; unit: string }, label: (ko: string) => string = (x) => x): (string | number)[][] {
  const u = f.unit;
  // 단위 배율에서 생기는 끝자리 오차(0.9999999999999999)를 지운다
  const k0 = f.factor;
  const sc = (x: number) => Number((x * k0).toPrecision(12));
  const rows: (string | number)[][] = [[label('순번'), label('종류'), label('값'), label('단위'), 'dx', 'dy', 'dz', label('점 A'), label('점 B'), label('넓이'), label('둘레')]];
  records.forEach((r, i) => {
    if (r.type === 'distance') rows.push([i + 1, label('거리'), sc(r.distance), u, sc(r.dx), sc(r.dy), sc(r.dz), r.a.map((x) => num(sc(x))).join(' '), r.b.map((x) => num(sc(x))).join(' '), '', '']);
    else if (r.type === 'face') rows.push([i + 1, `${label('면')} ${r.kind} #${r.stepId}`, r.radius !== undefined ? sc(r.radius * 2) : '', r.radius !== undefined ? `${u} (Ø)` : '', '', '', '', '', '', `${r.exact ? '' : '≈'}${num(r.area * k0 * k0)}`, `${r.exact ? '' : '≈'}${num(sc(r.perimeter))}`]);
    // 모서리: 값 = 길이, 원·원호면 종류 칸에 반지름
    else rows.push([i + 1, `${label('모서리')} ${r.kind} #${r.stepId}${r.radius !== undefined ? ` R${num(sc(r.radius))}` : ''}`, sc(r.length), u, '', '', '', '', '', '', '']);
  });
  return rows;
}
