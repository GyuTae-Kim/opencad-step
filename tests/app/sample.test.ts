import { describe, expect, it } from 'vitest';
import { stepToScene, watertightness, type StepMeta } from '../../src/index';
import { SAMPLE_NAME, sampleStepBytes, sampleStepText } from '../../src/app/sample';
import { stepString } from '../../src/app/stepText';
import { sniffStep } from '../../src/app/protocol';

describe('예제 STEP 모형', () => {
  const bytes = sampleStepBytes();
  const scene = stepToScene(bytes, { name: SAMPLE_NAME });
  const meta = scene.meta as unknown as StepMeta;

  it('작은 ASCII STEP 글이고 머리를 알아본다', () => {
    expect(bytes.length).toBeLessThan(200 * 1024);
    expect(bytes.every((b) => b < 0x80)).toBe(true); // 한글은 \X2\로 부호화
    expect(sniffStep(bytes).ok).toBe(true);
    expect(sampleStepText()).toBe(sampleStepText()); // 늘 같은 글
    expect(meta.header.name).toBe(SAMPLE_NAME);
    expect(meta.header.originatingSystem).toBe('OpenCAD STEP 뷰어');
    expect(meta.header.description).toEqual(['OpenCAD 예제 조립 모형']);
    expect(meta.schema[0]).toMatch(/^AUTOMOTIVE_DESIGN/);
  });

  it('조립 나무: 받침판·블록 둘·핀 묶음(핀·고리)', () => {
    expect(meta.products).toHaveLength(1);
    const root = meta.products[0]!;
    expect(root.name).toBe('OpenCAD 예제 조립');
    expect(root.children.map((c) => c.name)).toEqual(['받침판', '블록', '블록', '핀 묶음']);
    expect(root.children.map((c) => c.instance)).toEqual(['받침판-1', '블록-1', '블록-2', '핀 묶음-1']);
    const group = root.children[3]!;
    expect(group.children.map((c) => c.name)).toEqual(['핀', '고리']);
    expect(meta.productCounts.find((p) => p.name === '블록')!.instances).toBe(2);
    expect(meta.lengthUnit).toBe('millimetre');
    expect(scene.units).toBe('mm');
  });

  it('형상: 그물 5개, 실패한 면 없음, 모두 틈 없음, 색', () => {
    expect(scene.meshes).toHaveLength(5);
    expect(meta.stats.failedFaces).toBe(0);
    expect(scene.warnings ?? []).toEqual([]);
    for (const m of scene.meshes) {
      const wt = watertightness(m.positions, m.indices!);
      expect(wt.open + wt.bad).toBe(0);
      expect(m.color[0]).not.toBeCloseTo(0.75, 2); // 기본 회색이 아님
    }
    // 같은 블록 그물을 두 번 놓는다
    const blocks = scene.meshes.filter((m) => m.group === '블록');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.positions).toBe(blocks[1]!.positions);
    // 범위: 판 20×10, 핀이 판 밑 1까지, 고리 위 4.7까지(핀 위 6)
    expect(scene.bounds!.min[0]).toBeCloseTo(0, 6);
    expect(scene.bounds!.max[0]).toBeCloseTo(20, 6);
    expect(scene.bounds!.min[2]).toBeCloseTo(-1, 6);
    expect(scene.bounds!.max[2]).toBeCloseTo(6, 6);
  });
});

describe('stepString', () => {
  it('따옴표·역빗금·한글·BMP 밖 글자', () => {
    expect(stepString("it's")).toBe("it''s");
    expect(stepString('a\\b')).toBe('a\\\\b');
    expect(stepString('핀')).toBe('\\X2\\D540\\X0\\');
    expect(stepString('핀 묶음')).toBe('\\X2\\D540\\X0\\ \\X2\\BB36C74C\\X0\\');
    expect(stepString('😀')).toBe('\\X4\\0001F600\\X0\\');
  });
});
