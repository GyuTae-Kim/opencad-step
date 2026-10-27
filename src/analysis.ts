/**
 * 그물 점검 도구: 물샐틈없음(삼각형 모서리 짝), 넓이, 경계 상자.
 */

export interface WatertightReport {
  /** 넓이 있는 삼각형 수 */
  triangles: number;
  /** 서로 다른 모서리 수(위치로 용접) */
  edges: number;
  /** 정확히 두 삼각형이 반대 방향으로 쓰는 모서리 */
  paired: number;
  /** 한 삼각형만 쓰는 모서리(틈) */
  open: number;
  /** 셋 이상이 쓰거나 같은 방향으로 두 번 쓰는 모서리 */
  bad: number;
  /** paired / edges */
  ratio: number;
}

/**
 * 정점을 위치로 용접한 뒤 모서리마다 쓰임을 센다. 닫힌 입체면 모든 모서리가 짝을 이뤄야 한다.
 * @param weld 용접 격자 크기(기본: 상자 대각선 × 1e-7)
 */
export function watertightness(positions: ArrayLike<number>, indices?: ArrayLike<number>, weld?: number): WatertightReport {
  const nv = positions.length / 3;
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nv; i++)
    for (let k = 0; k < 3; k++) {
      const v = positions[i * 3 + k]!;
      if (v < lo[k]!) lo[k] = v;
      if (v > hi[k]!) hi[k] = v;
    }
  if (!Number.isFinite(lo[0]!)) {
    lo = [0, 0, 0];
    hi = [0, 0, 0];
  }
  const diag = Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) || 1;
  const q = weld ?? diag * 1e-7;
  const ids = new Int32Array(nv);
  const map = new Map<string, number>();
  for (let i = 0; i < nv; i++) {
    const key = `${Math.round(positions[i * 3]! / q)},${Math.round(positions[i * 3 + 1]! / q)},${Math.round(positions[i * 3 + 2]! / q)}`;
    let id = map.get(key);
    if (id === undefined) map.set(key, (id = map.size));
    ids[i] = id;
  }
  const idx = indices ?? Array.from({ length: nv }, (_, i) => i);
  const fwd = new Map<number, number>();
  const K = 2 ** 26;
  let tris = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = ids[idx[t]!]!;
    const b = ids[idx[t + 1]!]!;
    const c = ids[idx[t + 2]!]!;
    if (a === b || b === c || c === a) continue;
    tris++;
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = x * K + y;
      fwd.set(k, (fwd.get(k) ?? 0) + 1);
    }
  }
  let edges = 0;
  let paired = 0;
  let open = 0;
  let bad = 0;
  const seen = new Set<number>();
  for (const [k, n] of fwd) {
    const x = Math.floor(k / K);
    const y = k - x * K;
    const canon = x < y ? x * K + y : y * K + x;
    if (seen.has(canon)) continue;
    seen.add(canon);
    edges++;
    const r = fwd.get(y * K + x) ?? 0;
    if (n === 1 && r === 1) paired++;
    else if (n + r === 1) open++;
    else bad++;
  }
  return { triangles: tris, edges, paired, open, bad, ratio: edges ? paired / edges : 0 };
}

/** 삼각형 넓이 합 */
export function meshArea(positions: ArrayLike<number>, indices?: ArrayLike<number>): number {
  const n = indices ? indices.length : positions.length / 3;
  const at = (i: number) => (indices ? indices[i]! : i);
  let s = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = at(t) * 3;
    const b = at(t + 1) * 3;
    const c = at(t + 2) * 3;
    const ux = positions[b]! - positions[a]!;
    const uy = positions[b + 1]! - positions[a + 1]!;
    const uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!;
    const vy = positions[c + 1]! - positions[a + 1]!;
    const vz = positions[c + 2]! - positions[a + 2]!;
    s += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return s;
}

/** 부호 있는 부피(바깥 법선 닫힌 그물이면 양수) */
export function meshVolume(positions: ArrayLike<number>, indices?: ArrayLike<number>): number {
  const n = indices ? indices.length : positions.length / 3;
  const at = (i: number) => (indices ? indices[i]! : i);
  let s = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = at(t) * 3;
    const b = at(t + 1) * 3;
    const c = at(t + 2) * 3;
    const ax = positions[a]!, ay = positions[a + 1]!, az = positions[a + 2]!;
    const bx = positions[b]!, by = positions[b + 1]!, bz = positions[b + 2]!;
    const cx = positions[c]!, cy = positions[c + 1]!, cz = positions[c + 2]!;
    s += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return s / 6;
}

/** 정점을 float32 비트가 같은 것끼리(정확히, -0 = 0) 용접한 번호(열린 주소 해시) */
export function weldExact(positions: Float32Array): Int32Array {
  const nv = Math.floor(positions.length / 3);
  const bits = new Uint32Array(positions.buffer, positions.byteOffset, nv * 3);
  let cap = 1;
  while (cap < nv * 2) cap <<= 1;
  const mask = cap - 1;
  const vt = new Int32Array(cap).fill(-1);
  const weld = new Int32Array(nv);
  const rep = new Int32Array(nv);
  let n = 0;
  for (let i = 0; i < nv; i++) {
    let x = bits[i * 3]!;
    let y = bits[i * 3 + 1]!;
    let z = bits[i * 3 + 2]!;
    // -0과 0은 같은 자리로
    if (x === 0x80000000) x = 0;
    if (y === 0x80000000) y = 0;
    if (z === 0x80000000) z = 0;
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask;
    for (;;) {
      const t = vt[h]!;
      if (t < 0) {
        vt[h] = n;
        rep[n] = i;
        weld[i] = n++;
        break;
      }
      const j = rep[t]! * 3;
      let jx = bits[j]!;
      let jy = bits[j + 1]!;
      let jz = bits[j + 2]!;
      if (jx === 0x80000000) jx = 0;
      if (jy === 0x80000000) jy = 0;
      if (jz === 0x80000000) jz = 0;
      if (jx === x && jy === y && jz === z) {
        weld[i] = t;
        break;
      }
      h = (h + 1) & mask;
    }
  }
  return weld;
}

/**
 * 빠른 닫힘 검사: 정점을 float32 비트가 같은 것끼리(정확히) 용접하고, 모든 모서리를 두 삼각형이 반대 방향으로
 * 한 번씩 쓰는지 본다(문자열 열쇠·정렬 없이 형식 배열 해시 표 — 큰 그물에서도 빠르다). 삼각형이 없으면 false.
 */
export function isClosedMesh(positions: Float32Array, indices?: ArrayLike<number>): boolean {
  const nv = Math.floor(positions.length / 3);
  if (nv < 3) return false;
  // 1) 정점 용접
  const weld = weldExact(positions);
  let cap = 1;
  let mask = 0;
  // 2) 방향 있는 모서리 표: 같은 방향 모서리가 두 번 나오면 바로 실패, 끝에 모든 모서리의 역방향이 있는지
  const nt = Math.floor((indices ? indices.length : nv) / 3);
  cap = 1;
  while (cap < nt * 6) cap <<= 1;
  mask = cap - 1;
  const ka = new Int32Array(cap).fill(-1);
  const kb = new Int32Array(cap);
  const hash = (a: number, b: number) => (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 0x7f4a7c15, 0x85ebca6b)) & mask;
  const find = (a: number, b: number): number => {
    let h = hash(a, b);
    for (;;) {
      const x = ka[h]!;
      if (x < 0 || (x === a && kb[h] === b)) return h;
      h = (h + 1) & mask;
    }
  };
  let edges = 0;
  for (let t = 0; t < nt; t++) {
    const a = weld[indices ? indices[t * 3]! : t * 3]!;
    const b = weld[indices ? indices[t * 3 + 1]! : t * 3 + 1]!;
    const c = weld[indices ? indices[t * 3 + 2]! : t * 3 + 2]!;
    if (a === b || b === c || c === a) continue;
    for (let e = 0; e < 3; e++) {
      const x = e === 0 ? a : e === 1 ? b : c;
      const y = e === 0 ? b : e === 1 ? c : a;
      const h = find(x, y);
      if (ka[h]! >= 0) return false;
      ka[h] = x;
      kb[h] = y;
      edges++;
    }
  }
  if (!edges) return false;
  for (let h = 0; h < cap; h++) {
    const a = ka[h]!;
    if (a < 0) continue;
    if (ka[find(kb[h]!, a)]! < 0) return false;
  }
  return true;
}

/**
 * 닫힌 껍질의 면 방향 맞추기(면 묶음 단위): 이웃한 두 면이 같은 경계 선분을 같은 방향으로 쓰면 한쪽이 뒤집힌 것이다.
 * 이웃끼리 방향을 맞춘 뒤, 이어진 덩어리마다 부호 있는 부피로 바깥을 정한다 — 가장 큰 덩어리(바깥 껍질)는 양수, 나머지(빈 곳
 * BREP_WITH_VOIDS)는 음수. 고칠 것이 없거나 맞출 수 없으면(모순 — 뒤틀린 면 모임) null, 아니면 면마다 뒤집을지(1).
 * faceTri: 면 i의 삼각형은 [faceTri[i], faceTri[i+1]). suspect: 이 면이 든 덩어리는 부피 부호까지 따진다(나머지 덩어리는
 * 이웃끼리 어긋날 때만 고친다).
 */
export function orientFaces(positions: Float32Array, indices: ArrayLike<number>, faceTri: ArrayLike<number>, suspect?: ArrayLike<number>): Uint8Array | null {
  const nf = faceTri.length - 1;
  const nv = Math.floor(positions.length / 3);
  if (nf < 1 || nv < 3 || nv >= 2 ** 26) return null;
  const weld = weldExact(positions);
  const K = 2 ** 26;
  const owner = new Map<number, number>();
  /** [면, 면, 뒤집힘(1)] */
  const links: number[] = [];
  for (let f = 0; f < nf; f++)
    for (let t = faceTri[f]!; t < faceTri[f + 1]!; t++) {
      const a = weld[indices[t * 3]!]!;
      const b = weld[indices[t * 3 + 1]!]!;
      const c = weld[indices[t * 3 + 2]!]!;
      if (a === b || b === c || c === a) continue;
      for (let e = 0; e < 3; e++) {
        const x = e === 0 ? a : e === 1 ? b : c;
        const y = e === 0 ? b : e === 1 ? c : a;
        const k = x * K + y;
        const o = owner.get(k);
        if (o === undefined) owner.set(k, f);
        else if (o !== f) links.push(o, f, 1);
      }
    }
  for (const [k, f] of owner) {
    const x = Math.floor(k / K);
    const y = k - x * K;
    const g = owner.get(y * K + x);
    if (g !== undefined && f < g) links.push(f, g, 0);
  }
  const adj: number[][] = Array.from({ length: nf }, () => []);
  for (let i = 0; i < links.length; i += 3) {
    adj[links[i]!]!.push(links[i + 1]!, links[i + 2]!);
    adj[links[i + 1]!]!.push(links[i]!, links[i + 2]!);
  }
  const flip = new Int8Array(nf).fill(-1);
  const comp = new Int32Array(nf);
  const comps: { faces: number[]; conflict: boolean }[] = [];
  for (let r = 0; r < nf; r++) {
    if (flip[r]! >= 0) continue;
    const id = comps.length;
    const c = { faces: [r], conflict: false };
    comps.push(c);
    flip[r] = 0;
    comp[r] = id;
    for (let q = 0; q < c.faces.length; q++) {
      const f = c.faces[q]!;
      const l = adj[f]!;
      for (let j = 0; j < l.length; j += 2) {
        const g = l[j]!;
        const want = flip[f]! ^ l[j + 1]!;
        if (l[j + 1]) c.conflict = true;
        if (flip[g]! < 0) {
          flip[g] = want;
          comp[g] = id;
          c.faces.push(g);
        } else if (flip[g] !== want) return null;
      }
    }
  }
  // 덩어리마다 부호 있는 부피(맞춘 방향으로)
  const vol = new Float64Array(comps.length);
  const P = positions;
  for (let f = 0; f < nf; f++) {
    let v = 0;
    for (let t = faceTri[f]!; t < faceTri[f + 1]!; t++) {
      const a = indices[t * 3]! * 3;
      const b = indices[t * 3 + 1]! * 3;
      const c = indices[t * 3 + 2]! * 3;
      v += P[a]! * (P[b + 1]! * P[c + 2]! - P[b + 2]! * P[c + 1]!) - P[a + 1]! * (P[b]! * P[c + 2]! - P[b + 2]! * P[c]!) + P[a + 2]! * (P[b]! * P[c + 1]! - P[b + 1]! * P[c]!);
    }
    vol[comp[f]!] += flip[f] ? -v : v;
  }
  const sus = new Set<number>();
  if (suspect) for (let i = 0; i < suspect.length; i++) sus.add(comp[suspect[i]!]!);
  let big = 0;
  for (let i = 1; i < comps.length; i++) if (Math.abs(vol[i]!) > Math.abs(vol[big]!)) big = i;
  const out = new Uint8Array(nf);
  let any = false;
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i]!;
    // 바깥 껍질은 양수, 빈 곳은 음수 — 의심 덩어리와 어긋난 덩어리만, 나머지는 손대지 않는다
    if (!c.conflict && !sus.has(i)) continue;
    const invert = i === big ? vol[i]! < 0 : vol[i]! > 0;
    for (const f of c.faces) {
      const x = (flip[f]! ^ (invert ? 1 : 0)) as 0 | 1;
      out[f] = x;
      if (x) any = true;
    }
  }
  return any ? out : null;
}
