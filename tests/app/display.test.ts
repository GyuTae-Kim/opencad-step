import { describe, expect, it } from 'vitest';
import { DEFAULT_DISPLAY, DISPLAY_KEY, Fmt, numberLocale, readDisplaySettings, sceneMm, writeDisplaySettings } from '../../src/app/display';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('표시 설정(길이 단위·소수 자리)', () => {
  it('기억하고 읽는다, 꼴이 틀리면 기본', () => {
    const s = memory();
    expect(readDisplaySettings(s)).toEqual(DEFAULT_DISPLAY);
    writeDisplaySettings(s, { unit: 'in', decimals: 4, quality: 'fine' });
    expect(readDisplaySettings(s)).toEqual({ unit: 'in', decimals: 4, quality: 'fine' });
    s.setItem(DISPLAY_KEY, '{"unit":"km","decimals":99,"quality":"ultra"}');
    expect(readDisplaySettings(s)).toEqual({ unit: 'file', decimals: 6, quality: 'normal' });
    s.setItem(DISPLAY_KEY, 'not json');
    expect(readDisplaySettings(s)).toEqual(DEFAULT_DISPLAY);
    expect(readDisplaySettings(null)).toEqual(DEFAULT_DISPLAY);
  });

  it('장면 단위 → 표시 단위(mm·in), 넓이·부피는 배율의 제곱·세제곱', () => {
    expect(sceneMm('inch')).toBe(25.4);
    expect(Number.isNaN(sceneMm('unknown'))).toBe(true);
    const mmToIn = new Fmt('mm', { unit: 'in', decimals: 3, quality: 'normal' });
    expect(mmToIn.unit).toBe('in');
    expect(mmToIn.len(25.4)).toBe('1 in');
    expect(mmToIn.area(25.4 * 25.4 * 2)).toBe('2 in²');
    expect(mmToIn.vol(25.4 ** 3)).toBe('1 in³');
    const inToMm = new Fmt('inch', { unit: 'mm', decimals: 2, quality: 'normal' });
    expect(inToMm.len(1)).toBe('25.4 mm');
    expect(inToMm.toScene(25.4)).toBeCloseTo(1, 12);
    const file = new Fmt('m', { unit: 'file', decimals: 3, quality: 'normal' });
    expect(file.len(1.23456)).toBe('1.235 m');
    // 단위를 모르면 바꾸지 않고 단위 글 없이
    const unknown = new Fmt('unknown', { unit: 'in', decimals: 3, quality: 'normal' });
    expect(unknown.factor).toBe(1);
    expect(unknown.len(10)).toBe('10');
  });

  it('소수 자리와 언어별 수 꼴(독일어는 소수점 쉼표, 좌표 구분은 "; ")', () => {
    expect(new Fmt('mm', { unit: 'file', decimals: 1, quality: 'normal' }).len(1234.56)).toBe('1,234.6 mm');
    expect(new Fmt('mm', { unit: 'file', decimals: 0, quality: 'normal' }).len(0.4)).toBe('0 mm');
    expect(new Fmt('mm', { unit: 'file', decimals: 3, quality: 'normal' }).num(-0.0001)).toBe('0');
    const de = new Fmt('mm', { unit: 'file', decimals: 2, quality: 'normal' }, numberLocale('de'));
    expect(de.len(1234.5)).toBe('1.234,5 mm');
    expect(de.pt([1.5, 2, -3])).toBe('1,5; 2; -3');
    expect(new Fmt('mm').pt([1.5, 2, -3])).toBe('1.5, 2, -3');
    expect(new Fmt('mm').deg(30)).toBe('30°');
    expect(numberLocale('ko')).toBe('ko-KR');
    expect(numberLocale('zh-CN')).toBe('zh-CN');
  });
});

describe('곡면 품질(다시 삼각화)', () => {
  it('세밀할수록 삼각형이 늘고, 다시 삼각화한 문서는 앞 문서의 상태를 이어 간다', async () => {
    const { parseStepFile } = await import('../../src/app/job');
    const { sampleStepBytes } = await import('../../src/app/sample');
    const { QUALITY_OPTIONS } = await import('../../src/app/display');
    const { carryDocState, createDoc } = await import('../../src/app/doc');
    const tri = (r: Awaited<ReturnType<typeof parseStepFile>>) => r.scene.meshes.reduce((n, m) => n + (m.indices?.length ?? 0) / 3, 0);
    const a = await parseStepFile('s.stp', sampleStepBytes(), () => {}, QUALITY_OPTIONS.normal);
    const b = await parseStepFile('s.stp', sampleStepBytes(), () => {}, QUALITY_OPTIONS.finest);
    expect(tri(b)).toBeGreaterThan(tri(a) * 1.5);
    const da = createDoc('s.stp', 1, a);
    const db = createDoc('s.stp', 1, b);
    da.selKey = '0/1';
    da.vis.userHidden.add(a.scene.meshes[2]!.id);
    da.vis.isolated = new Set([a.scene.meshes[0]!.id]);
    da.density = 7850;
    da.panelTab = 'props';
    // 부품 겉모습(흐리게·불투명도·분해)도 이어 간다
    da.dim = new Set([a.scene.meshes[1]!.id, 'gone']);
    da.opacity.set(a.scene.meshes[3]!.id, 0.25);
    da.explode = 0.4;
    carryDocState(da, db);
    expect([...db.dim!]).toEqual([b.scene.meshes[1]!.id]);
    expect([...db.opacity]).toEqual([[b.scene.meshes[3]!.id, 0.25]]);
    expect(db.explode).toBe(0.4);
    expect(db.selKey).toBe('0/1');
    expect([...db.vis.userHidden]).toEqual([b.scene.meshes[2]!.id]);
    expect([...db.vis.isolated!]).toEqual([b.scene.meshes[0]!.id]);
    expect(db.density).toBe(7850);
    expect(db.panelTab).toBe('props');
  });
});
