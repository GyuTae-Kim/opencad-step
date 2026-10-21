import { describe, expect, it } from 'vitest';
import { measureEntities, type Entity } from '../../src/app/entmeasure';

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
});
