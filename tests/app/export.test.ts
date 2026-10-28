import { describe, expect, it } from 'vitest';
import { csvCell, imageFileName, imageSizeLabel, measureRows, meshesToObj, meshesToStl, toCsv } from '../../src/app/export';
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
    // 수식 주입: = + - @ 탭·CR로 시작하는 글은 '를 앞에(수·점 좌표 글은 그대로)
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(csvCell('+1+cmd|calc')).toBe("'+1+cmd|calc");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\t=1')).toBe("'\t=1");
    expect(csvCell('\r=1')).toBe('"\'\r=1"');
    expect(csvCell('a=b')).toBe('a=b');
    expect(csvCell(-3.5)).toBe('-3.5');
    expect(csvCell('-3.5')).toBe('-3.5');
    expect(csvCell('-12.5 3 -4e-7')).toBe('-12.5 3 -4e-7');
    expect(csvCell('+.5')).toBe('+.5');
    const rows = measureRows(
      [
        { type: 'distance', a: [0, 0, 0], b: [25.4, 0, 0], distance: 25.4, dx: 25.4, dy: 0, dz: 0 },
        { type: 'face', kind: 'cylinder', stepId: 7, radius: 2, area: 10, perimeter: 4, exact: false },
        { type: 'edge', kind: 'circle', stepId: 9, length: 50.8, radius: 25.4 },
        { type: 'edge', kind: 'line', stepId: 11, length: 12.7 },
        { type: 'entity', label: '축 사이 거리', unit: 'length', value: 50.8, a: '원기둥 면', b: '원기둥 면' },
        { type: 'entity', label: '면 사이 각', unit: 'angle', value: 45, a: '평면', b: '평면' },
        { type: 'entity', label: '최소 거리', unit: 'length', value: 25.4, approx: true, a: '곡면', b: '평면' },
      ],
      { factor: 1 / 25.4, unit: 'in' },
    );
    expect(rows[1]!.slice(0, 5)).toEqual([1, '거리', 1, 'in', 1]);
    expect(rows[2]![2]).toBeCloseTo(4 / 25.4, 9);
    expect(String(rows[2]![9]).startsWith('≈')).toBe(true);
    // 모서리: 값은 길이, 원은 종류 칸에 반지름(표시 단위)
    expect(rows[3]!.slice(0, 4)).toEqual([3, '모서리 circle #9 R1', 2, 'in']);
    expect(rows[4]!.slice(0, 4)).toEqual([4, '모서리 line #11', 0.5, 'in']);
    // 개체 측정: 이름표(두 개체), 길이는 표시 단위·각은 도, 근삿값은 ≈
    expect(rows[5]!.slice(0, 4)).toEqual([5, '축 사이 거리 (원기둥 면 ↔ 원기둥 면)', 2, 'in']);
    expect(rows[6]!.slice(0, 4)).toEqual([6, '면 사이 각 (평면 ↔ 평면)', 45, '°']);
    expect(rows[7]!.slice(0, 4)).toEqual([7, '최소 거리 (곡면 ↔ 평면) ≈', 1, 'in']);
  });
});

describe('큰·투명 그림 저장', () => {
  it('크기 글은 실제 화소, 코어가 한도에 맞춰 줄이면 알린다 · 파일 이름에 배율·투명', () => {
    expect(imageSizeLabel(2, { width: 2560, height: 1600, scale: 2 })).toBe('2배 — 2560 × 1600 화소');
    expect(imageSizeLabel(4, { width: 4096, height: 2560, scale: 3.2 })).toBe('4배 — 4096 × 2560 화소(최대 크기로 줄임)');
    expect(imageFileName('part', { scale: 1, transparent: false })).toBe('part.png');
    expect(imageFileName('part', { scale: 3, transparent: true })).toBe('part@3x-transparent.png');
  });
});

describe('보기 링크(카메라·단면·고른 것만)', () => {
  it('되돌려 읽기, 다른 해시 인자는 남긴다, 틀린 값은 버린다', () => {
    const v = { cam: { target: [1, 2, 3] as [number, number, number], distance: 50, yaw: 0.5, pitch: -0.25, projection: 'orthographic' as const }, sec: { normal: [0, 0, 1] as [number, number, number], offset: 2.5 }, sel: ['0/2'], iso: true };
    const enc = encodeViewLink(v);
    expect(enc).toBe('view=cam:1,2,3,50,0.5,-0.25,o;sec:0,0,1,2.5;sel:0/2;iso:1');
    expect(decodeViewLink(`#${enc}`)).toEqual(v);
    expect(decodeViewLink('#view=cam:1,2;sec:0,0,0,1')).toBeNull();
    expect(decodeViewLink('#other=1')).toBeNull();
    expect(decodeViewLink('#view=sel:../x')).toBeNull();
    expect(viewUrl('https://x.test/a/?sample#keep=1&view=old', { sel: ['1'] })).toBe('https://x.test/a/?sample#keep=1&view=sel:1');
    // iso는 고른 것이 있어야
    expect(encodeViewLink({ iso: true })).toBe('');
  });
});
