import { describe, expect, it } from 'vitest';
import { csvCell, measureRows, meshesToObj, meshesToStl, toCsv } from '../../src/app/export';
import { decodeViewLink, encodeViewLink, viewUrl } from '../../src/app/viewlink';

const tri = (extra: Record<string, unknown> = {}) => ({ id: 't', name: 'part a', positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint32Array.from([0, 1, 2]), color: [1, 1, 1, 1] as [number, number, number, number], ...extra });

describe('내보내기: STL·OBJ·CSV', () => {
  it('이진 STL: 머리·삼각형 수·법선·세계 좌표(자리 변환·원점), 거울 변환은 감기를 뒤집는다', () => {
    const m = tri({ matrix: Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1]), origin: [0, 0, 5] });
    const buf = meshesToStl([m]);
    expect(buf.byteLength).toBe(84 + 50);
    const dv = new DataView(buf);
    expect(dv.getUint32(80, true)).toBe(1);
    expect([dv.getFloat32(84, true), dv.getFloat32(88, true), dv.getFloat32(92, true)]).toEqual([0, 0, 1]);
    expect([dv.getFloat32(96, true), dv.getFloat32(100, true), dv.getFloat32(104, true)]).toEqual([10, 0, 5]);
    const mir = new DataView(meshesToStl([tri({ matrix: Float64Array.from([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) })]));
    // 거울: 법선이 +Z로 남는다
    expect(mir.getFloat32(92, true)).toBeCloseTo(1, 6);
  });

  it('OBJ: 그물마다 o, 정점 번호는 앞 그물 뒤로 이어진다', () => {
    const obj = meshesToObj([tri(), tri({ id: 'u', name: 'b' })]);
    expect(obj).toContain('o part_a');
    expect(obj).toContain('f 1 2 3');
    expect(obj).toContain('f 4 5 6');
    expect(obj.split('\n').filter((l) => l.startsWith('v ')).length).toBe(6);
  });

  it('CSV: 쉼표·따옴표 감싸기, 측정 기록은 표시 단위로', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(toCsv([['a', 1.5], ['b', 2]])).toBe('a,1.5\r\nb,2\r\n');
    const rows = measureRows(
      [
        { type: 'distance', a: [0, 0, 0], b: [25.4, 0, 0], distance: 25.4, dx: 25.4, dy: 0, dz: 0 },
        { type: 'face', kind: 'cylinder', stepId: 7, radius: 2, area: 10, perimeter: 4, exact: false },
      ],
      { factor: 1 / 25.4, unit: 'in' },
    );
    expect(rows[1]!.slice(0, 5)).toEqual([1, '거리', 1, 'in', 1]);
    expect(rows[2]![2]).toBeCloseTo(4 / 25.4, 9);
    expect(String(rows[2]![9]).startsWith('≈')).toBe(true);
  });
});

describe('보기 링크(카메라·단면·고른 것만)', () => {
  it('되돌려 읽기, 다른 해시 인자는 남긴다, 틀린 값은 버린다', () => {
    const v = { cam: { target: [1, 2, 3] as [number, number, number], distance: 50, yaw: 0.5, pitch: -0.25, projection: 'orthographic' as const }, sec: { normal: [0, 0, 1] as [number, number, number], offset: 2.5 }, sel: '0/2', iso: true };
    const enc = encodeViewLink(v);
    expect(enc).toBe('view=cam:1,2,3,50,0.5,-0.25,o;sec:0,0,1,2.5;sel:0/2;iso:1');
    expect(decodeViewLink(`#${enc}`)).toEqual(v);
    expect(decodeViewLink('#view=cam:1,2;sec:0,0,0,1')).toBeNull();
    expect(decodeViewLink('#other=1')).toBeNull();
    expect(decodeViewLink('#view=sel:../x')).toBeNull();
    expect(viewUrl('https://x.test/a/?sample#keep=1&view=old', { sel: '1' })).toBe('https://x.test/a/?sample#keep=1&view=sel:1');
    // iso는 고른 것이 있어야
    expect(encodeViewLink({ iso: true })).toBe('');
  });
});
