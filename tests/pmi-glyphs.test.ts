/**
 * 내장 획 글꼴에 없는 PMI 글자(한글·일본어·중국어·그 밖의 기호): 브라우저 글꼴 그림 → 윤곽선(traceGlyph) → 글자 칸 좌표(glyphsFromRaster)
 * → PMI 선분(layoutText·stepToScene의 glyphs). 브라우저 캔버스 대신 알파 격자를 직접 만드는 가짜 그림으로 시험한다.
 */
import { describe, expect, it } from 'vitest';
import { glyphsFromRaster, type GlyphRaster } from '../src/app/glyphs';
import { traceGlyph } from '../src/glyphtrace';
import { stepToScene, type StepMeta } from '../src/index';
import { layoutText, type GlyphSource } from '../src/strokefont';
import { stepString } from '../src/app/stepText';
import { cube, StepText } from './stepText';

/** w×h 알파 격자에 채운 사각형들(x0..x1, y0..y1 포함) */
function grid(w: number, h: number, rects: [number, number, number, number][]): Uint8Array {
  const a = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of rects) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * w + x] = 255;
  return a;
}

const bbox = (c: [number, number][]) => {
  const xs = c.map((p) => p[0]);
  const ys = c.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

describe('글자 그림 → 윤곽선(traceGlyph)', () => {
  it('채운 사각형 하나는 닫힌 윤곽선 하나(화소 가운데 사이 반 칸 밖)로, 곧은 변은 점 몇 개로 줄인다', () => {
    const c = traceGlyph(grid(20, 20, [[5, 5, 14, 14]]), 20, 20);
    expect(c).toHaveLength(1);
    const loop = c[0]!;
    expect(loop[0]).toEqual(loop[loop.length - 1]);
    const [x0, y0, x1, y1] = bbox(loop);
    expect(x0).toBeCloseTo(4.5, 1);
    expect(y0).toBeCloseTo(4.5, 1);
    expect(x1).toBeCloseTo(14.5, 1);
    expect(y1).toBeCloseTo(14.5, 1);
    expect(loop.length).toBeLessThanOrEqual(10);
  });

  it('구멍 난 사각형(ㅁ)은 바깥·안쪽 윤곽선 둘, 떨어진 두 덩이(ㅣㅣ)도 둘, 빈 그림은 없음', () => {
    expect(traceGlyph(grid(20, 20, [[2, 2, 17, 4], [2, 15, 17, 17], [2, 2, 4, 17], [15, 2, 17, 17]]), 20, 20)).toHaveLength(2);
    expect(traceGlyph(grid(20, 20, [[2, 2, 4, 17], [10, 2, 12, 17]]), 20, 20)).toHaveLength(2);
    expect(traceGlyph(new Uint8Array(400), 20, 20)).toEqual([]);
  });

  it('그림 끝에 닿은 글자도 닫힌다(격자 밖은 글자 밖)', () => {
    const c = traceGlyph(grid(10, 10, [[0, 0, 9, 9]]), 10, 10);
    expect(c).toHaveLength(1);
    expect(bbox(c[0]!)).toEqual([-0.5, -0.5, 9.5, 9.5].map((v) => expect.closeTo(v, 1)));
  });
});

/** 가짜 브라우저 그림: 대문자 높이 20화소, 기준선 y = 30. '가'는 기준선부터 높이 20 정사각형, 'ㅁ'은 구멍 난 것, 공백은 빈 그림 */
function fakeRaster(): GlyphRaster & { calls: string[] } {
  const W = 40;
  const H = 40;
  const calls: string[] = [];
  return {
    width: W,
    height: H,
    originX: 5,
    baselineY: 30,
    capHeight: 20,
    calls,
    draw(ch) {
      calls.push(ch);
      if (ch === '가') return { alpha: grid(W, H, [[5, 10, 24, 29]]), advance: 24 };
      if (ch === '　') return { alpha: new Uint8Array(W * H), advance: 24 };
      // 글꼴에 없는 글자(와 notdef 재기 글자)는 브라우저가 같은 상자를 그린다
      return { alpha: grid(W, H, [[6, 12, 8, 29], [16, 12, 18, 29]]), advance: 12 };
    },
  };
}

describe('브라우저 글꼴 그림 → 글자 칸 모양(glyphsFromRaster)', () => {
  it('대문자 높이를 6, 기준선을 0으로 맞추고 나아갈 거리도 같은 배율, 한 글자는 한 번만 그린다', () => {
    const r = fakeRaster();
    const src = glyphsFromRaster(r, '\u{10FFFD}');
    const g = src('가')!;
    expect(g.strokes).toHaveLength(1);
    const [x0, y0, x1, y1] = bbox(g.strokes[0]!);
    // 사각형 x 5..24 → (4.5 − 5)·0.3 … (24.5 − 5)·0.3, y 10..29 → (30 − 29.5)·0.3 … (30 − 9.5)·0.3
    expect(x0).toBeCloseTo(-0.15, 2);
    expect(x1).toBeCloseTo(5.85, 2);
    expect(y0).toBeCloseTo(0.15, 2);
    expect(y1).toBeCloseTo(6.15, 2);
    expect(g.advance).toBeCloseTo(24 * 0.3, 9);
    src('가');
    expect(r.calls.filter((c) => c === '가')).toHaveLength(1);
  });

  it('빈 그림(넓은 공백)은 나아가기만, 브라우저가 글꼴이 없어 대신 그린 모양(notdef)과 같으면 null(빈 상자)', () => {
    const src = glyphsFromRaster(fakeRaster(), '\u{10FFFD}');
    expect(src('　')).toEqual({ strokes: [], advance: 24 * 0.3 });
    expect(src('\u{E123}')).toBeNull();
    // notdef을 주지 않으면 그 모양이라도 그린다
    expect(glyphsFromRaster(fakeRaster())('\u{E123}')!.strokes).toHaveLength(2);
  });
});

describe('PMI 글자 배치에 모양 잇기(layoutText)', () => {
  // 모르는 글자마다 대각선 하나, 나아갈 거리 8
  const diag: GlyphSource = () => ({ strokes: [[[0, 0], [6, 6]]], advance: 8 });

  it('내장 글꼴에 있는 글자는 그대로, 없는 글자만 받은 모양(그 나아갈 거리)으로, 못 받으면 빈 상자로 센다', () => {
    const plain = layoutText('A한B');
    expect(plain.boxes).toBe(1);
    const t = layoutText('A한B', diag);
    expect(t.boxes).toBe(0);
    // 너비: A 5 + 한 8 + B 5 − 끝 간격 1 → 17/6
    expect(t.width).toBeCloseTo(17 / 6, 9);
    // 한의 대각선: (5,0)→(11,6)
    const segs = t.segs;
    let found = false;
    for (let i = 0; i < segs.length; i += 4) if (Math.abs(segs[i]! - 5 / 6) < 1e-9 && Math.abs(segs[i + 2]! - 11 / 6) < 1e-9 && Math.abs(segs[i + 3]! - 1) < 1e-9) found = true;
    expect(found).toBe(true);
    // 숫자·영문·GD&T 기호는 받은 모양을 쓰지 않는다
    expect(layoutText('Ø10 ±0.1', () => null).boxes).toBe(0);
    expect(layoutText('日本', () => null).boxes).toBe(2);
  });

  it('STEP: 한글·일본어·특수 기호가 든 TEXT_LITERAL은 glyphs가 있으면 그 모양으로, 없으면 빈 상자로(경고 없음)', () => {
    const w = new StepText();
    const ctx = w.context();
    const c = cube(w, 10);
    const part = w.product('p', [c.solid], ctx);
    const font = w.add('DRAUGHTING_PRE_DEFINED_TEXT_FONT', `'ISO 3098'`);
    const text = '모따기 C0.5 · 日本語 ≤ ½';
    const lit = w.add('TEXT_LITERAL', `'','${stepString(text)}',#${w.ax2([0, 0, 10])},'baseline left',.RIGHT.,#${font}`);
    const occ = w.add('ANNOTATION_TEXT_OCCURRENCE', `'note',(),#${lit}`);
    const dm = w.add('DRAUGHTING_MODEL', `'dm',(#${occ}),#${ctx}`);
    w.add('SHAPE_REPRESENTATION_RELATIONSHIP', `'','',#${dm},#${part.rep}`);
    const bytes = w.bytes();
    const segCount = (s: ReturnType<typeof stepToScene>) => {
      const id = (s.meta as unknown as StepMeta).pmi!.presentations[0]!.id;
      return s.lines.find((l) => l.id === id)!.positions.length / 6;
    };
    const boxes = stepToScene(bytes);
    const asked: string[] = [];
    const drawn = stepToScene(bytes, {
      glyphs: (ch) => {
        asked.push(ch);
        return diag(ch);
      },
    });
    // 내장 글꼴에 없는 글자: 모 따 기 · 日 本 語 ≤ ½ — 상자(선분 4개) 대신 대각선 하나
    const missing = [...new Set(asked)];
    expect(missing.sort()).toEqual(['기', '따', '모', '本', '日', '語', '½', '·', '≤'].sort());
    expect(segCount(boxes) - segCount(drawn)).toBe(asked.length * 3);
    expect(drawn.warnings ?? []).toEqual([]);
    // 글줄 너비: 대각선 글자 9개가 8씩 나아가 상자(5)보다 길다
    const xs = (s: ReturnType<typeof stepToScene>) => {
      const id = (s.meta as unknown as StepMeta).pmi!.presentations[0]!.id;
      const P = s.lines.find((l) => l.id === id)!.positions;
      let m = -Infinity;
      for (let i = 0; i < P.length; i += 3) m = Math.max(m, P[i]!);
      return m;
    };
    expect(xs(drawn)).toBeGreaterThan(xs(boxes));
  });
});
