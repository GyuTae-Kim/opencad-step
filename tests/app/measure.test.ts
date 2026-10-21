import { describe, expect, it } from 'vitest';
import { Fmt } from '../../src/app/display';
import type { FacePick } from '../../src/app/faces';
import { faceHint, faceSummary, measureHint, measureLines, panelMeasureHint, selectionSize } from '../../src/app/measure';

const MM = new Fmt('mm');
const NONE = new Fmt('unknown');

const face = (kind: string, extra: Partial<FacePick> = {}): FacePick => ({
  meshId: 'm',
  face: 0,
  stepId: 12,
  kind,
  triStart: 0,
  triangles: 4,
  area: 150.79645,
  perimeter: 62.83185,
  exact: true,
  center: [0, 0, 0],
  boundary: new Float32Array(),
  ...extra,
});

describe('측정 띠 안내(휴대폰·터치)', () => {
  it('손가락 기기는 키(Esc·Shift) 설명 대신 길게 누르기를 알리고, 마우스 글은 그대로', () => {
    for (const [n, has] of [[0, false], [1, false], [2, true], [0, true]] as const) {
      const t = measureHint(n, has, true);
      expect(t).not.toMatch(/Esc|Shift/);
      // 앞부분(다음에 누를 곳)은 같다
      expect(t.split(' · ')[0]).toBe(measureHint(n, has).split(' · ')[0]);
    }
    expect(measureHint(0, false, true)).toBe('측정: 잴 시작점을 누르십시오 · 길게 누르면 정밀 조준');
    expect(measureHint(1, false, true)).toBe('측정: 끝점을 누르십시오');
    expect(measureHint(1, false)).toBe('측정: 끝점을 누르십시오 · Esc 취소');
    expect(measureHint(2, false)).toContain('Esc 지우기');
    expect(faceHint(true)).toContain('길게 누르면 정밀 조준');
    expect(faceHint(false)).not.toContain('길게');
    // 패널 아래 띠: 마우스 글은 예전 그대로, 손가락 기기는 Esc 대신 길게 누르기
    expect(panelMeasureHint()).toBe('측정: 모형 위 두 점을 누르십시오(꼭짓점 가까우면 붙습니다). Esc = 지우기');
    expect(panelMeasureHint(true)).not.toMatch(/Esc/);
    expect(panelMeasureHint(true)).toContain('길게 누르면 정밀 조준');
  });

  it('거리와 dx·dy·dz(패널 아래 띠와 같은 꼴)', () => {
    expect(measureLines({ distance: 50, dx: 30, dy: -40, dz: 0 }, MM)).toEqual({ value: '50 mm', axes: 'dx 30 · dy -40 · dz 0' });
    expect(measureLines({ distance: 1234.56789, dx: 1, dy: 0, dz: 0 }, NONE).value).toBe('1,234.568');
  });

  it('고른 면의 주요 치수: 원기둥·구는 지름, 원환은 큰 반지름, 원뿔은 반각, 그 밖은 둘레 — 넓이는 늘', () => {
    expect(faceSummary(face('cylinder', { radius: 6 }), MM)).toEqual({
      kind: '원기둥 면',
      main: 'Ø12 mm',
      facts: [
        ['반지름', '6 mm'],
        ['넓이', '150.796 mm²'],
      ],
    });
    expect(faceSummary(face('sphere', { radius: 2.5 }), MM).main).toBe('Ø5 mm');
    expect(faceSummary(face('torus', { radius: 20, minorRadius: 3 }), MM)).toMatchObject({ kind: '원환 면', main: 'R20 mm', facts: [['작은 반지름', '3 mm'], ['넓이', '150.796 mm²']] });
    expect(faceSummary(face('cone', { radius: 4, halfAngleDeg: 30 }), MM)).toMatchObject({ kind: '원뿔 면', main: null, facts: [['반각', '30°'], ['넓이', '150.796 mm²']] });
    expect(faceSummary(face('plane'), NONE)).toEqual({
      kind: '평면',
      main: null,
      facts: [
        ['넓이', '150.796'],
        ['둘레', '62.832'],
      ],
    });
    // B-rep에서 정확히 구하지 못한 값(B-스플라인 등)은 ≈
    expect(faceSummary(face('bspline', { exact: false }), MM).facts).toEqual([
      ['넓이', '≈ 150.796 mm²'],
      ['둘레', '≈ 62.832 mm'],
    ]);
  });
});

describe('고른 부품 외형 크기', () => {
  it('고른 그물·선의 축에 나란한 범위를 합치고, 고른 형상이 없으면 null', () => {
    const mesh = (id: string, pts: number[]) => ({ id, positions: Float32Array.from(pts), indices: Uint32Array.from([0, 1, 2]), color: [1, 1, 1, 1] as [number, number, number, number] });
    const scene = {
      meshes: [mesh('a', [0, 0, 0, 10, 0, 0, 0, 5, 0]), mesh('b', [0, 0, 2, 1, 1, 3, 2, 2, 7])],
      lines: [{ id: 'l', positions: Float32Array.from([-4, 0, 0, 0, 0, 0]) }],
    };
    expect(selectionSize(scene, ['a'])).toEqual([10, 5, 0]);
    expect(selectionSize(scene, ['a', 'b', 'l'])).toEqual([14, 5, 7]);
    expect(selectionSize(scene, ['없음'])).toBeNull();
  });
});
