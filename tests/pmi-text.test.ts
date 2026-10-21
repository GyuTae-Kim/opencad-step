import { describe, expect, it } from 'vitest';
import { stepToScene, type StepMeta } from '../src/index';
import { createDoc, stepFaceIndex } from '../src/app/doc';
import { faceRangesByStepId } from '../src/app/faces';
import { sampleStepBytes } from '../src/app/sample';
import { glyph, hasGlyph, layoutText } from '../src/strokefont';
import { cube, StepText } from './stepText';

describe('내장 획 글꼴', () => {
  it('글자 칸 높이 6 → 높이 1, 글자 간격 5/6, 소문자는 작은 대문자, 모르는 글자는 상자', () => {
    const t = layoutText('AB');
    expect(t.width).toBeCloseTo((10 - 1) / 6, 9);
    for (let i = 1; i < t.segs.length; i += 2) expect(t.segs[i]!).toBeLessThanOrEqual(1 + 1e-9);
    expect(glyph('a')[0]![1]![1]).toBeCloseTo(6 * 0.75, 9);
    expect(hasGlyph('Ø')).toBe(true);
    expect(hasGlyph('⌖')).toBe(true);
    expect(hasGlyph('한')).toBe(false);
    expect(glyph('한')).toHaveLength(1);
    // 두 줄은 아래로
    expect(Math.min(...layoutText('1\n2').segs.filter((_, i) => i % 2 === 1))).toBeLessThan(-1);
  });
});

describe('PMI 글자(TEXT_LITERAL)·의미 PMI ↔ 면·저장된 보기', () => {
  it('예제의 글 주석은 배치 평면 위 선분으로, 높이는 BOX_HEIGHT, 경고 없음', () => {
    const s = stepToScene(sampleStepBytes());
    const m = s.meta as unknown as StepMeta;
    const note = m.pmi!.presentations.find((p) => p.type === 'ANNOTATION_TEXT_OCCURRENCE')!;
    const ls = s.lines.find((l) => l.id === note.id)!;
    const P = ls.positions;
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    for (let i = 0; i < P.length; i += 3) {
      expect(P[i + 2]!).toBeCloseTo(2, 6);
      minY = Math.min(minY, P[i + 1]!);
      maxY = Math.max(maxY, P[i + 1]!);
      minX = Math.min(minX, P[i]!);
    }
    expect(minX).toBeCloseTo(1, 1);
    // 대문자 높이 0.8, 쉼표·점 없이 기준선 8.6
    expect(maxY - minY).toBeCloseTo(0.8, 1);
    expect(s.warnings ?? []).toEqual([]);
  });

  it('의미 PMI 면 → 그물 삼각형 범위(모든 자리)', () => {
    const s = stepToScene(sampleStepBytes());
    const doc = createDoc('s.stp', 1, { scene: s, ms: 0 });
    const width = doc.pmi.semantic.find((x) => x.name === 'width')!;
    const r = faceRangesByStepId(stepFaceIndex(s), s.meshes.map((x) => x.id), width.faces!);
    expect(r.size).toBe(1);
    expect([...r.values()][0]).toHaveLength(2);
    expect(faceRangesByStepId(null, ['a'], [1]).size).toBe(0);
  });

  it('복합 측면과 TEXT_LITERAL_WITH_EXTENT(높이 = 크기 y), 단위 배율을 저장된 보기에 반영', () => {
    const w = new StepText();
    const ctx = w.context('inch');
    const faces: number[] = [];
    const c = cube(w, 1);
    faces.push(...c.faces);
    const part = w.product('p', [c.solid], ctx);
    const pds = w.add('PRODUCT_DEFINITION_SHAPE', `'','',#${part.pd}`);
    const a1 = w.add('SHAPE_ASPECT', `'a1','',#${pds},.T.`);
    const a2 = w.add('SHAPE_ASPECT', `'a2','',#${pds},.T.`);
    const comp = w.add('COMPOSITE_SHAPE_ASPECT', `'both','',#${pds},.T.`);
    w.add('SHAPE_ASPECT_RELATIONSHIP', `'','',#${comp},#${a1}`);
    w.add('SHAPE_ASPECT_RELATIONSHIP', `'','',#${comp},#${a2}`);
    w.add('GEOMETRIC_ITEM_SPECIFIC_USAGE', `'','',#${a1},#${part.rep},#${faces[0]}`);
    w.add('GEOMETRIC_ITEM_SPECIFIC_USAGE', `'','',#${a2},#${part.rep},#${faces[1]}`);
    const mm = w.raw(`(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.))`);
    w.add('FLATNESS_TOLERANCE', `'flat','',#${w.add('LENGTH_MEASURE_WITH_UNIT', `LENGTH_MEASURE(0.01),#${mm}`)},#${comp}`);
    const ext = w.add('PLANAR_EXTENT', `'',2.,0.5`);
    const font = w.add('DRAUGHTING_PRE_DEFINED_TEXT_FONT', `'ISO 3098'`);
    const lit = w.add('TEXT_LITERAL_WITH_EXTENT', `'','HI',#${w.ax2([0, 0, 1])},'baseline centre',.RIGHT.,#${font},#${ext}`);
    const occ = w.add('ANNOTATION_TEXT_OCCURRENCE', `'n',(),#${lit}`);
    const dm = w.add('DRAUGHTING_MODEL', `'dm',(#${occ}),#${ctx}`);
    w.add('SHAPE_REPRESENTATION_RELATIONSHIP', `'','',#${dm},#${part.rep}`);
    const win = w.add('PLANAR_BOX', `'',4.,2.,#${w.add('AXIS2_PLACEMENT_2D', `'',#${w.add('CARTESIAN_POINT', `'',(-2.,-1.)`)},#${w.add('DIRECTION', `'',(1.,0.)`)}`)}`);
    const vol = w.add('VIEW_VOLUME', `.CENTRAL.,#${w.pt([0, 0, 10])},10.,10.,.F.,0.,.F.,.F.,#${win}`);
    w.add('CAMERA_USAGE', `#${w.add('CAMERA_MODEL_D3', `'v',#${w.ax2([0.5, 0.5, 0.5], [1, 0, 0], [0, 1, 0])},#${vol}`)},#${dm}`);
    const s = stepToScene(w.bytes());
    const m = s.meta as unknown as StepMeta;
    expect(m.pmi!.semantic[0]!.faces!.sort()).toEqual([faces[0], faces[1]].sort());
    const ls = s.lines.find((l) => l.id === m.pmi!.presentations[0]!.id)!;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < ls.positions.length; i += 3) {
      xs.push(ls.positions[i]!);
      ys.push(ls.positions[i + 1]!);
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.5, 6);
    // 가운데 맞춤(글자 칸 기준이라 획 범위 가운데는 글자 높이의 10% 안)
    expect(Math.abs((Math.max(...xs) + Math.min(...xs)) / 2)).toBeLessThan(0.05);
    const v = m.pmi!.views![0]!;
    expect(v.projection).toBe('perspective');
    expect(v.dir).toEqual([1, 0, 0]);
    expect(v.distance).toBeCloseTo(10, 9);
    expect(v.target).toEqual([0.5, 0.5, 0.5]);
  });
});
