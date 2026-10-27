/**
 * 글자 그림(알파 값 격자) → 윤곽선 꺾은선(DOM 없음). 내장 획 글꼴에 없는 PMI 글자(한글·일본어·중국어·그 밖의 기호)를
 * 브라우저 글꼴로 그려 받은 알파 값을 행진 사각형(marching squares)으로 따라가 닫힌 윤곽선으로 만들고,
 * 더글러스-포이커로 줄인다. 결과는 선분이라 PMI 선 묶음에 그대로 들어가 확대·단면·숨김·강조·그림 저장을 함께 따른다.
 */

/** 닫힌 꺾은선(처음 점을 끝에 한 번 더) — 그림 화소 좌표(x 오른쪽, y 아래) */
export type Contour = [number, number][];

/**
 * 알파 격자(행 우선, 0~255) → 닫힌 윤곽선들. threshold 이상을 글자 안으로 본다. 격자 밖은 0(글자 밖)으로 보아 모든 윤곽선이 닫힌다.
 * @param tolerance 줄이기 허용 거리(화소)
 */
export function traceGlyph(alpha: ArrayLike<number>, w: number, h: number, threshold = 128, tolerance = 0.35): Contour[] {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : alpha[y * w + x]!);
  // 격자 모서리 번호: 가로(x,y)–(x+1,y)는 짝수, 세로(x,y)–(x,y+1)는 홀수. x·y는 -1부터
  const W = w + 2;
  const hEdge = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2;
  const vEdge = (x: number, y: number) => ((y + 1) * W + (x + 1)) * 2 + 1;
  /** 모서리 번호 → 그 위의 점 */
  const point = new Map<number, [number, number]>();
  /** 모서리 번호 → 그 점을 쓰는 선분(다른 끝 모서리 번호) 둘까지 */
  const link = new Map<number, number[]>();
  const lerp = (a: number, b: number) => (a === b ? 0.5 : (threshold - a) / (b - a));
  const ensure = (id: number, p: () => [number, number]) => {
    if (!point.has(id)) point.set(id, p());
  };
  const seg = (a: number, b: number) => {
    (link.get(a) ?? link.set(a, []).get(a)!).push(b);
    (link.get(b) ?? link.set(b, []).get(b)!).push(a);
  };
  for (let y = -1; y < h; y++)
    for (let x = -1; x < w; x++) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const code = (tl >= threshold ? 8 : 0) | (tr >= threshold ? 4 : 0) | (br >= threshold ? 2 : 0) | (bl >= threshold ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const T = hEdge(x, y);
      const B = hEdge(x, y + 1);
      const L = vEdge(x, y);
      const R = vEdge(x + 1, y);
      const top = () => ensure(T, () => [x + lerp(tl, tr), y]);
      const bottom = () => ensure(B, () => [x + lerp(bl, br), y + 1]);
      const left = () => ensure(L, () => [x, y + lerp(tl, bl)]);
      const right = () => ensure(R, () => [x + 1, y + lerp(tr, br)]);
      const pair = (a: number, fa: () => void, b: number, fb: () => void) => {
        fa();
        fb();
        seg(a, b);
      };
      switch (code) {
        case 1:
        case 14:
          pair(L, left, B, bottom);
          break;
        case 2:
        case 13:
          pair(B, bottom, R, right);
          break;
        case 3:
        case 12:
          pair(L, left, R, right);
          break;
        case 4:
        case 11:
          pair(T, top, R, right);
          break;
        case 6:
        case 9:
          pair(T, top, B, bottom);
          break;
        case 7:
        case 8:
          pair(L, left, T, top);
          break;
        case 5:
        case 10: {
          // 안장: 가운데 값으로 어느 쪽을 이을지 정한다
          const center = (tl + tr + br + bl) / 4 >= threshold;
          if ((code === 5) === center) {
            pair(L, left, T, top);
            pair(B, bottom, R, right);
          } else {
            pair(L, left, B, bottom);
            pair(T, top, R, right);
          }
          break;
        }
      }
    }
  // 잇기: 점마다 선분 둘 — 쓰지 않은 점에서 시작해 한 바퀴
  const used = new Set<number>();
  const out: Contour[] = [];
  for (const start of link.keys()) {
    if (used.has(start)) continue;
    const loop: [number, number][] = [];
    let prev = -1;
    let cur = start;
    for (;;) {
      used.add(cur);
      loop.push(point.get(cur)!);
      const nb = link.get(cur)!;
      const next = nb[0] === prev ? nb[1] : nb[0];
      if (next === undefined || next === start || used.has(next)) break;
      prev = cur;
      cur = next;
    }
    if (loop.length < 3) continue;
    loop.push(loop[0]!);
    out.push(simplifyClosed(loop, tolerance));
  }
  return out;
}

/** 닫힌 꺾은선 줄이기(더글러스-포이커, 처음 점과 가장 먼 점에서 둘로 나눠) */
export function simplifyClosed(loop: Contour, tol: number): Contour {
  const n = loop.length - 1;
  if (n < 4) return loop;
  let far = 0;
  let best = -1;
  for (let i = 1; i < n; i++) {
    const d = (loop[i]![0] - loop[0]![0]) ** 2 + (loop[i]![1] - loop[0]![1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdp(loop.slice(0, far + 1), tol);
  const b = rdp(loop.slice(far), tol);
  return [...a.slice(0, -1), ...b];
}

function rdp(pts: Contour, tol: number): Contour {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = pts[s]!;
    const [bx, by] = pts[e]!;
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.hypot(dx, dy);
    let idx = -1;
    let dmax = tol;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = pts[i]!;
      const d = l > 0 ? Math.abs((px - ax) * dy - (py - ay) * dx) / l : Math.hypot(px - ax, py - ay);
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
