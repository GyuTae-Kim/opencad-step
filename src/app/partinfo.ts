/**
 * 부품 속성 줄(순수, DOM 없음): 고른 제품 나무 마디의 경로·제품 번호·설명·판·재질·밀도·사용자 속성·놓인 자리(위치·회전).
 * 속성 패널 탭(panel.ts)이 이 줄들을 그대로 그린다. 이름표는 번역할 화면 글, 값은 파일 글·숫자(번역하지 않는다).
 */
import type { Fmt } from './display';
import type { ProductNode } from './doc';
import { nodeLabel } from './tree';

export type V3 = [number, number, number];

/** 열쇠("0/2/1")의 마디와 그 조상들(뿌리부터) */
export function nodePath(roots: readonly ProductNode[], key: string): ProductNode[] {
  const out: ProductNode[] = [];
  let list = roots;
  for (const part of key.split('/')) {
    if (!/^\d+$/.test(part)) return [];
    const n = list[Number(part)];
    if (!n) return [];
    out.push(n);
    list = n.children;
  }
  return out;
}

/** 경로 글: "조립 › 하위 조립 › 부품 · 자리 이름" */
export function pathText(path: readonly ProductNode[]): string {
  return path
    .map((n) => {
      const l = nodeLabel(n);
      return l.instance ? `${l.name} · ${l.instance}` : l.name;
    })
    .join(' › ');
}

export interface Placement {
  /** 원점 이동(장면 단위) */
  origin: V3;
  /** 회전축(단위 벡터, 회전이 없으면 null) */
  axis: V3 | null;
  /** 회전각(도) */
  angleDeg: number;
  /** 고른 배율(1이면 크기 그대로) */
  scale: number;
}

/** 열 우선 4×4 변환 → 원점 이동·회전축·각·배율 */
export function placementOf(m: readonly number[] | undefined): Placement {
  if (!m || m.length < 16) return { origin: [0, 0, 0], axis: null, angleDeg: 0, scale: 1 };
  const sx = Math.hypot(m[0]!, m[1]!, m[2]!);
  const sy = Math.hypot(m[4]!, m[5]!, m[6]!);
  const sz = Math.hypot(m[8]!, m[9]!, m[10]!);
  const scale = Math.cbrt(Math.max(sx * sy * sz, 1e-300));
  const r = (i: number, j: number) => m[j * 4 + i]! / [sx, sy, sz][j]!;
  const tr = r(0, 0) + r(1, 1) + r(2, 2);
  const c = Math.max(-1, Math.min(1, (tr - 1) / 2));
  const angle = Math.acos(c);
  let axis: V3 | null = null;
  if (angle > 1e-9) {
    // 비대칭 부분 = 2·sinθ·축
    let a: V3 = [r(2, 1) - r(1, 2), r(0, 2) - r(2, 0), r(1, 0) - r(0, 1)];
    if (angle > (3 * Math.PI) / 4) {
      // 180° 가까이: sinθ가 작아 비대칭 부분이 흐리다 — 대칭 부분 (R + Rᵀ)/2 = cosθ·I + (1 − cosθ)·n nᵀ에서
      // 가장 큰 대각 성분 k로 n_k를 구하고 나머지는 n_k n_j로 나눈다(축의 x가 0이어도 부호가 맞게). 방향은 비대칭 부분 쪽(정확히 180°면 n_k > 0)
      const nn = (i: number, j: number) => ((r(i, j) + r(j, i)) / 2 - (i === j ? c : 0)) / (1 - c);
      const k = [0, 1, 2].reduce((b, i) => (nn(i, i) > nn(b, b) ? i : b), 0);
      const nk = Math.sqrt(Math.max(0, nn(k, k)));
      const n: V3 = [0, 0, 0];
      for (let j = 0; j < 3; j++) n[j] = j === k ? nk : nk > 0 ? nn(k, j) / nk : 0;
      const sgn = n[0] * a[0] + n[1] * a[1] + n[2] * a[2] < 0 ? -1 : 1;
      a = [n[0] * sgn, n[1] * sgn, n[2] * sgn];
    }
    const l = Math.hypot(...a);
    axis = l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : null;
  }
  return { origin: [m[12]!, m[13]!, m[14]!], axis, angleDeg: axis ? (angle * 180) / Math.PI : 0, scale };
}

/** 밀도(kg/m³) → "7.85 g/cm³" */
export function densityText(kgm3: number, f: Fmt): string {
  return `${f.num(kgm3 / 1000, Math.max(2, f.decimals))} g/cm³`;
}

/** 속성 한 줄: 이름표·값. kData·vData면 파일에서 읽은 글(번역하지 않는다) */
export interface PropRow {
  k: string;
  v: string;
  kData?: boolean;
  vData?: boolean;
}

/**
 * 마디 속성 줄. 경로·제품 번호·설명·판·정의·재질·밀도·사용자 속성, 자리면 놓인 위치·회전.
 * count는 같은 제품이 모형에 놓인 수.
 */
export function partRows(path: readonly ProductNode[], f: Fmt, count = 1): PropRow[] {
  const node = path[path.length - 1];
  if (!node) return [];
  const rows: PropRow[] = [];
  const data = (k: string, v: string) => rows.push({ k, v, vData: true });
  const l = nodeLabel(node);
  data('이름', l.name);
  if (l.instance) data('자리 이름', l.instance);
  if (path.length > 1) data('경로', pathText(path));
  if (node.productId && node.productId !== l.name) data('제품 번호', node.productId);
  const p = node.props;
  if (p?.description) data('설명', p.description);
  if (p?.version) data('버전', p.version);
  if (p?.definition) data('정의', p.definition);
  if (p?.material) data('재질', p.material);
  if (p?.density) rows.push({ k: '밀도', v: `${densityText(p.density, f)}${p.densityText ? ` (${p.densityText})` : ''}`, vData: true });
  for (const [k, v] of p?.items ?? []) rows.push({ k, v, kData: true, vData: true });
  if (count > 1) rows.push({ k: '놓인 수', v: `×${count}`, vData: true });
  if (node.matrix) {
    const pl = placementOf(node.matrix);
    rows.push({ k: '놓인 위치', v: `${f.pt(pl.origin)}${f.unit ? ` ${f.unit}` : ''}`, vData: true });
    rows.push(pl.axis ? { k: '회전', v: `${f.deg(pl.angleDeg)} · 축 ${f.dir(pl.axis)}` } : { k: '회전', v: '없음' });
    if (Math.abs(pl.scale - 1) > 1e-9) rows.push({ k: '배율', v: f.num(pl.scale, 6), vData: true });
  }
  return rows;
}
