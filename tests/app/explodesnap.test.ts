// 분해 끌기의 붙잡기(47차 — explodesnap.ts): 끄는 축에 수직인 평면 모으기, 닿음(마주 보고 넓이를 갖고 겹침)·같은 높이, 화면 붙잡기 거리,
// 닿음이 먼저, 경계만 맞닿은 면·구멍 안의 면은 닿음이 아님, 숨긴 그물·끌기 한도, 분해 이동, 큰 좌표, 안내 선
import { describe, expect, it } from 'vitest';
import { PICK_TOLERANCE_PX, pickTolerance, TOUCH_PICK_TOLERANCE_PX } from 'opencad-viewer3d/pointer';
import { perpBasis, snapAlong, snapGuide, snapIndex, snapPx, SNAP_PAR, type SnapIndex } from '../../src/app/explodesnap';
import { boxMesh, faceIndexOf, ringMesh } from './snapscene';

it('붙잡기 거리는 코어 측정 붙잡기 규칙(pickTolerance)과 같다 — 마우스·펜 10, 손가락 14화소', () => {
  expect(snapPx(false)).toBe(pickTolerance('mouse', PICK_TOLERANCE_PX, TOUCH_PICK_TOLERANCE_PX).snap);
  expect(snapPx(true)).toBe(pickTolerance('touch', PICK_TOLERANCE_PX, TOUCH_PICK_TOLERANCE_PX).snap);
  expect([snapPx(false), snapPx(true)]).toEqual([10, 14]);
});

const X = [1, 0, 0];
/** 평행 투영: 축 위 1이 k화소 */
const flat = (k: number) => (s: number) => [100 + s * k, 50];

describe('끄는 축에 수직인 평면 모으기', () => {
  it('수직인 두 방향은 축과 서로에 수직인 단위', () => {
    for (const a of [X, [0, 1, 0], [0, 0, 1], [0.6, 0.8, 0], [0.48, -0.6, 0.64]]) {
      const [e1, e2] = perpBasis(a);
      const d = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
      for (const [u, v] of [
        [e1, a],
        [e2, a],
        [e1, e2],
      ] as const)
        expect(Math.abs(d(u, v))).toBeLessThan(1e-15);
      expect(Math.abs(d(e1, e1) - 1) + Math.abs(d(e2, e2) - 1)).toBeLessThan(1e-15);
    }
  });

  it('끄는 그물과 다른 그물의 X에 수직인 면만(부호·높이·지금 분해 이동), 숨긴 그물은 빼고 다른 쪽은 높이 차례', () => {
    const a = boxMesh('a', [0, 0, 0], [1, 1, 1]);
    const b = boxMesh('b', [3, 0, 0], [4, 1, 1]);
    const c = boxMesh('c', [-5, 0, 0], [-4, 1, 1]);
    const ix = snapIndex([a.mesh, b.mesh, c.mesh], faceIndexOf([a, b, c]), X, new Set(['a']), (id) => id !== 'c', new Map([['b', [0.5, 0, 0]]]), 10)!;
    expect([...ix.drag.h]).toEqual([0, 1]);
    expect([...ix.drag.s]).toEqual([-1, 1]);
    expect([...ix.other.h]).toEqual([3.5, 4.5]);
    expect([...ix.other.s]).toEqual([-1, 1]);
    // 끄는 쪽에 평면이 없으면(면 표 없음) null
    expect(snapIndex([a.mesh], null, X, new Set(['a']), () => true, new Map(), 10)).toBeNull();
    expect(snapIndex([a.mesh, b.mesh], faceIndexOf([a, b]), X, new Set(['zz']), () => true, new Map(), 10)).toBeNull();
  });

  it('법선이 축에서 0.0057° 넘게 기운 평면은 빼고, 그 안(내보낸 프로그램의 반올림)은 받는다', () => {
    const tilt = (deg: number) => {
      const a = boxMesh('a', [0, 0, 0], [1, 1, 1]);
      const r = (deg * Math.PI) / 180;
      // +X 면 법선만 Y쪽으로 기울인다
      a.table.params.set([Math.cos(r), Math.sin(r), 0], 8 + 2);
      return snapIndex([a.mesh], faceIndexOf([a]), X, new Set(['a']), () => true, new Map(), 10)!.drag.h.length;
    };
    expect(1 - Math.cos((0.0057 * Math.PI) / 180)).toBeLessThan(SNAP_PAR);
    expect(tilt(0.005)).toBe(2);
    expect(tilt(0.01)).toBe(1);
  });
});

describe('붙잡기(snapAlong)', () => {
  /** a(0~1)를 X로 끈다, b는 3~4(같은 Y·Z) */
  const pair = (bLo: [number, number, number] = [3, 0, 0], bHi: [number, number, number] = [4, 1, 1]): SnapIndex => {
    const a = boxMesh('a', [0, 0, 0], [1, 1, 1]);
    const b = boxMesh('b', bLo, bHi);
    return snapIndex([a.mesh, b.mesh], faceIndexOf([a, b]), X, new Set(['a']), () => true, new Map(), 10)!;
  };

  it('마주 본 두 면이 겹치면 닿음(a의 +X 면이 b의 −X 면에) — 커서가 붙잡기 거리 안일 때만', () => {
    const ix = pair();
    // 축 위 1이 20화소: s = 1.6은 닿는 자리 2에서 8화소
    const hit = snapAlong(ix, 1.6, flat(20), 10)!;
    expect(hit).toMatchObject({ s: 2, kind: 'touch' });
    expect(hit.px).toBeCloseTo(8, 12);
    expect(ix.drag.h[hit.i]! + hit.s).toBe(ix.other.h[hit.j]);
    expect(snapAlong(ix, 1.45, flat(20), 10)).toBeNull();
    // 손가락(14화소)이면 그 자리도 붙는다
    expect(snapAlong(ix, 1.45, flat(20), 14)).toMatchObject({ s: 2, kind: 'touch' });
    // 반대쪽에서 다가와도(a가 b를 지나 b의 +X 면 뒤에 닿는 자리 4 + 0 = a의 −X 면)
    expect(snapAlong(ix, 4.1, flat(20), 10)).toMatchObject({ s: 4, kind: 'touch' });
  });

  it('같은 쪽을 보는 면은 같은 높이(s = 3: a의 +X가 b의 +X와) — 닿음과 둘 다 붙잡기 거리 안이면 닿음이 먼저', () => {
    const ix = pair();
    expect(snapAlong(ix, 2.95, flat(20), 10)).toMatchObject({ s: 3, kind: 'flush' });
    // 축 위 1이 5화소면 s = 2.6에서 닿는 자리 2(3화소)와 같은 높이 3(2화소)이 둘 다 안 — 닿음
    expect(snapAlong(ix, 2.6, flat(5), 10)).toMatchObject({ s: 2, kind: 'touch' });
  });

  it('겹치지 않는 마주 본 면(옆으로 비켜 있음)과 경계만 맞닿은 면은 같은 높이', () => {
    expect(snapAlong(pair([3, 5, 0], [4, 6, 1]), 1.9, flat(20), 10)).toMatchObject({ s: 2, kind: 'flush' });
    // b가 Y로 꼭 1만큼 옆(경계 y = 1에서만 맞닿음)
    expect(snapAlong(pair([3, 1, 0], [4, 2, 1]), 1.9, flat(20), 10)).toMatchObject({ s: 2, kind: 'flush' });
    // 조금이라도 겹치면 닿음
    expect(snapAlong(pair([3, 0.999, 0], [4, 2, 1]), 1.9, flat(20), 10)).toMatchObject({ s: 2, kind: 'touch' });
  });

  it('구멍 둘레만 있는 고리 판: 구멍 안에서 다가오는 핀 끝은 같은 높이, 판 위에서 다가오는 상자는 닿음(사각형 범위로만 보면 둘 다 닿음)', () => {
    const ring = ringMesh('ring', 2, 1, 0);
    const pin = boxMesh('pin', [-0.5, -0.5, 3], [0.5, 0.5, 6]);
    const blk = boxMesh('blk', [1.2, -0.5, 3], [1.8, 0.5, 6]);
    const Z = [0, 0, 1];
    const at = (id: string) => snapIndex([ring.mesh, pin.mesh, blk.mesh], faceIndexOf([ring, pin, blk]), Z, new Set([id]), (x) => x === 'ring', new Map(), 10)!;
    // 판 면(z = 0, 법선 −Z)에 핀의 −Z 면(z = 3)이 같은 높이: s = −3
    expect(snapAlong(at('pin'), -2.9, flat(20), 10)).toMatchObject({ s: -3, kind: 'flush' });
    // 판 면 법선이 −Z라 마주 보는 것은 +Z 면(z = 6) — s = −6에서 구멍 안이면 같은 높이, 판 위면 닿음
    expect(snapAlong(at('pin'), -5.9, flat(20), 10)).toMatchObject({ s: -6, kind: 'flush' });
    expect(snapAlong(at('blk'), -5.9, flat(20), 10)).toMatchObject({ s: -6, kind: 'touch' });
  });

  it('끌기 한도 밖·눈 뒤 자리는 붙지 않고, 다른 쪽에 평면이 없으면 없다', () => {
    const ix = pair();
    expect(snapAlong(ix, 1.9, flat(20), 10, 1.5)).toBeNull();
    expect(snapAlong(ix, 1.9, () => null, 10)).toBeNull();
    const a = boxMesh('a', [0, 0, 0], [1, 1, 1]);
    const lone = snapIndex([a.mesh], faceIndexOf([a]), X, new Set(['a']), () => true, new Map(), 10)!;
    expect(snapAlong(lone, 0.01, flat(20), 10)).toBeNull();
  });

  it('지금 분해 이동을 더한 자리로 재고, 큰 좌표(묶음 원점)에서도 붙은 두 높이가 같다', () => {
    const o: [number, number, number] = [1e6, 2e6, 0];
    const a = boxMesh('a', [1e6, 2e6, 0], [1e6 + 1, 2e6 + 1, 1], o);
    const b = boxMesh('b', [1e6 + 3, 2e6, 0], [1e6 + 4, 2e6 + 1, 1], o);
    const ix = snapIndex([a.mesh, b.mesh], faceIndexOf([a, b]), X, new Set(['a']), () => true, new Map([['a', [0.25, 0, 0]]]), 10)!;
    const hit = snapAlong(ix, 1.7, flat(20), 10)!;
    expect(hit.kind).toBe('touch');
    expect(hit.s).toBe(1.75);
    expect(ix.drag.h[hit.i]! + hit.s).toBe(ix.other.h[hit.j]);
  });

  it('안내 선: 다른 면 경계는 그 자리, 끄는 면 경계는 붙은 자리(origin 기준)', () => {
    const ix = pair();
    const hit = snapAlong(ix, 1.9, flat(20), 10)!;
    const g = snapGuide(ix, hit)!;
    // 사각형 면 경계 넷씩, 두 면
    expect(g.segs.length).toBe(2 * 4 * 6);
    const xs = new Set<number>();
    for (let i = 0; i < g.segs.length; i += 3) xs.add(g.segs[i]! + g.origin[0]);
    // 닿은 두 면은 모두 x = 3 평면
    expect([...xs]).toEqual([3]);
  });
});
