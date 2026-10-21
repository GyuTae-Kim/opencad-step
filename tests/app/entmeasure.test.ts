import { describe, expect, it } from 'vitest';
import { closestSegments, measureEntities, type Entity } from '../../src/app/entmeasure';

const plane = (point: [number, number, number], normal: [number, number, number]): Entity => ({ type: 'plane', label: 'p', point, normal });
const axis = (origin: [number, number, number], dir: [number, number, number], radius = 1): Entity => ({ type: 'axis', label: 'a', origin, dir, radius });
const circle = (center: [number, number, number], normal: [number, number, number] = [0, 0, 1], radius = 1): Entity => ({ type: 'circle', label: 'c', center, normal, radius });
const point = (p: [number, number, number]): Entity => ({ type: 'point', label: 'x', point: p });
const line = (a: [number, number, number], b: [number, number, number]): Entity => ({ type: 'line', label: 'l', a, b });

describe('두 개체 사이 측정(해석적)', () => {
  it('평면–평면: 나란하면 거리, 아니면 사이 각', () => {
    const r = measureEntities(plane([0, 0, 0], [0, 0, 1]), plane([3, 4, 7], [0, 0, -1]));
    expect(r.lines).toEqual([{ label: '평행 면 거리', unit: 'length', value: 7 }]);
    expect(r.annotations[0]).toMatchObject({ kind: 'distance', a: [0, 0, 0], b: [0, 0, 7] });
    const g = measureEntities(plane([5, 0, 0], [0, 0, 1]), plane([0, 0, 5], [1, 0, 0]));
    expect(g.lines[0]!.label).toBe('면 사이 각');
    expect(g.lines[0]!.value).toBeCloseTo(90, 9);
    expect(g.annotations[0]!.kind).toBe('angle');
    expect(measureEntities(plane([0, 0, 0], [0, 0, 1]), plane([0, 0, 0], [0, Math.SQRT1_2, Math.SQRT1_2])).lines[0]!.value).toBeCloseTo(45, 9);
  });

  it('축–축: 나란한 구멍 피치, 꼬인 축의 각과 최단 거리', () => {
    const r = measureEntities(axis([0, 0, 0], [0, 0, 1]), axis([30, 40, 5], [0, 0, -1]));
    expect(r.lines).toEqual([{ label: '축 사이 거리', unit: 'length', value: 50 }]);
    const s = measureEntities(axis([0, 0, 0], [1, 0, 0]), axis([0, 0, 10], [0, 1, 0]));
    expect(s.lines.map((l) => l.label)).toEqual(['축 사이 각', '최단 거리']);
    expect(s.lines[0]!.value).toBeCloseTo(90, 9);
    expect(s.lines[1]!.value).toBeCloseTo(10, 9);
  });

  it('원–원 중심 거리, 원 중심–면, 축–면(나란하면 거리, 아니면 각), 점–축, 점–점, 직선', () => {
    expect(measureEntities(circle([0, 0, 0]), circle([3, 4, 0])).lines).toEqual([{ label: '중심 거리', unit: 'length', value: 5 }]);
    expect(measureEntities(circle([1, 1, 2]), plane([0, 0, 0], [0, 0, 1])).lines[0]).toEqual({ label: '중심–면 거리', unit: 'length', value: 2 });
    expect(measureEntities(axis([0, 0, 3], [1, 0, 0]), plane([0, 0, 0], [0, 0, 1])).lines[0]).toEqual({ label: '축–면 거리', unit: 'length', value: 3 });
    const tilt = measureEntities(plane([0, 0, 0], [0, 0, 1]), axis([0, 0, 5], [0, Math.SQRT1_2, Math.SQRT1_2]));
    expect(tilt.lines[0]!.label).toBe('축–면 각');
    expect(tilt.lines[0]!.value).toBeCloseTo(45, 9);
    expect(measureEntities(point([3, 4, 9]), axis([0, 0, 0], [0, 0, 1])).lines[0]).toEqual({ label: '점–축 거리', unit: 'length', value: 5 });
    expect(measureEntities(point([0, 0, 0]), point([1, 2, 2])).lines[0]!.value).toBe(3);
    // 점–모서리는 선분까지(끝을 넘으면 끝점)
    expect(measureEntities(line([0, 0, 0], [10, 0, 0]), point([13, 4, 0])).lines[0]!.value).toBe(5);
    expect(measureEntities(line([0, 0, 0], [10, 0, 0]), line([0, 5, 0], [10, 5, 0])).lines[0]).toEqual({ label: '평행 모서리 거리', unit: 'length', value: 5 });
    const cr = measureEntities(line([0, 0, 0], [10, 0, 0]), line([5, -5, 2], [5, 5, 2]));
    expect(cr.lines.map((l) => l.label)).toEqual(['모서리 사이 각', '최단 거리']);
    expect(cr.lines[1]!.value).toBeCloseTo(2, 9);
  });

  it('꼬인 직선 모서리의 최단 거리는 닫힌 꼴(거의 나란해도 정확): 0°·1°·5°·20°·90°', () => {
    for (const deg of [0, 1, 5, 20, 90]) {
      const t = (deg * Math.PI) / 180;
      const d = [Math.cos(t), Math.sin(t)];
      // A: x축 −50~50, B: (20, 0, 3)을 지나며 t만큼 돈 길이 100 선분 — 참 거리 3
      const r = measureEntities(line([-50, 0, 0], [50, 0, 0]), line([-50 * d[0]! + 20, -50 * d[1]!, 3], [50 * d[0]! + 20, 50 * d[1]!, 3]));
      const dist = r.lines.find((l) => l.unit === 'length')!;
      expect(dist.label).toBe(deg === 0 ? '평행 모서리 거리' : '최단 거리');
      expect(dist.value).toBeCloseTo(3, 9);
      if (deg) expect(r.lines[0]!.value).toBeCloseTo(deg, 6);
    }
  });

  it('선분 최근접점: 끝을 넘으면 끝점, 길이 0 선분은 점, 둘 다 점', () => {
    const near = (p: [number, number, number][], q: [number, number, number][]) => p.forEach((v, i) => v.forEach((x, k) => expect(x).toBeCloseTo(q[i]![k]!, 9)));
    // 꼬였지만 가장 가까운 곳이 B의 끝 밖: A 위 (5,0,0)과 B 끝 (5,2,1)
    near(closestSegments([0, 0, 0], [10, 0, 0], [5, 2, 1], [5, 10, 1]), [
      [5, 0, 0],
      [5, 2, 1],
    ]);
    // 나란하고 겹치지 않음: 끝끼리
    near(closestSegments([0, 0, 0], [1, 0, 0], [3, 1, 0], [5, 1, 0]), [
      [1, 0, 0],
      [3, 1, 0],
    ]);
    // 길이 0 선분(점)과 선분
    near(closestSegments([2, 3, 0], [2, 3, 0], [0, 0, 0], [10, 0, 0]), [
      [2, 3, 0],
      [2, 0, 0],
    ]);
    near(closestSegments([0, 0, 0], [10, 0, 0], [12, 4, 0], [12, 4, 0]), [
      [10, 0, 0],
      [12, 4, 0],
    ]);
    near(closestSegments([1, 1, 1], [1, 1, 1], [4, 5, 1], [4, 5, 1]), [
      [1, 1, 1],
      [4, 5, 1],
    ]);
    // 길이 0 모서리는 점으로 잰다(각을 만들지 않는다)
    expect(measureEntities(line([0, 0, 0], [0, 0, 0]), line([3, 4, 0], [3, 4, 0])).lines).toEqual([{ label: '거리', unit: 'length', value: 5 }]);
    expect(measureEntities(line([0, 0, 0], [10, 0, 0]), line([3, 4, 0], [3, 4, 0])).lines).toEqual([{ label: '점–모서리 거리', unit: 'length', value: 4 }]);
  });

  it('누른 차례와 상관없이 같은 결과: 원–축·원–직선·평면–점 등', () => {
    const c = circle([10, 0, 0], [0, 0, 1]);
    const x = axis([0, 0, 0], [1, 0, 0]);
    // 원 축(세로)이 x축과 나란하지 않음: 중심–축 거리 0과 축 사이 각 90°
    const r1 = measureEntities(c, x);
    expect(r1.lines).toEqual([
      { label: '중심–축 거리', unit: 'length', value: 0 },
      { label: '축 사이 각', unit: 'angle', value: 90 },
    ]);
    expect(measureEntities(x, c).lines).toEqual(r1.lines);
    // 원 축이 나란한 축(구멍 모서리와 다른 구멍): 축 사이 거리
    const z = axis([0, 0, 0], [0, 0, 1]);
    const c2 = circle([3, 4, 7], [0, 0, -1]);
    expect(measureEntities(c2, z).lines).toEqual([{ label: '축 사이 거리', unit: 'length', value: 5 }]);
    expect(measureEntities(z, c2).lines).toEqual([{ label: '축 사이 거리', unit: 'length', value: 5 }]);
    // 원–직선 모서리: 선분까지
    const l = line([0, 5, 0], [0, 5, 10]);
    expect(measureEntities(c, l).lines).toEqual(measureEntities(l, c).lines);
    expect(measureEntities(c, l).lines[0]!.label).toBe('중심–모서리 거리');
    expect(measureEntities(c, l).lines[0]!.value).toBeCloseTo(Math.hypot(10, 5), 9);
    // 그 밖의 짝도 순서를 바꿔도 같다
    const P = plane([0, 0, 1], [0, 0, 1]);
    const pt = point([3, 4, 9]);
    const all: Entity[] = [P, x, z, l, c, c2, pt];
    for (const a of all) for (const b of all) if (a !== b) expect(measureEntities(a, b).lines).toEqual(measureEntities(b, a).lines);
  });
});
