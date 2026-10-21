import { describe, expect, it } from 'vitest';
import { stepToScene, type StepMeta } from '../src/index';
import { cube, r, StepText, type P3 } from './stepText';

/** 면·입체 색 양식(PRESENTATION_STYLE_ASSIGNMENT) */
function fillStyle(w: StepText, rgb: P3): number {
  const c = w.add('COLOUR_RGB', `'',${rgb.map(r).join(',')}`);
  const fc = w.add('FILL_AREA_STYLE_COLOUR', `'',#${c}`);
  const fs = w.add('FILL_AREA_STYLE', `'',(#${fc})`);
  const sfa = w.add('SURFACE_STYLE_FILL_AREA', `#${fs}`);
  const sss = w.add('SURFACE_SIDE_STYLE', `'',(#${sfa})`);
  const ssu = w.add('SURFACE_STYLE_USAGE', `.BOTH.,#${sss}`);
  return w.add('PRESENTATION_STYLE_ASSIGNMENT', `(#${ssu})`);
}

describe('활꼴 면(짧은 호 + 현)', () => {
  it('처진 높이가 허용 오차보다 작은 호도 두 토막 이상으로 나눠 면이 삼각화된다(실패 면 없음)', () => {
    // 반지름 12.975 원의 활꼴: 현 반 길이 0.805, 처진 높이 ≈ 0.025 — 현 허용 오차 0.13(큰 조립의 실제 값)보다 작다
    const w = new StepText();
    const ctx = w.context();
    const R = 12.975;
    const hx = 0.805062111016913;
    const y = Math.sqrt(R * R - hx * hx);
    const A = w.vertex([hx, y, 0]);
    const B = w.vertex([-hx, y, 0]);
    const arc = w.edge(A, B, w.circle([0, 0, 0], R, [0, 0, 1], [-1, 0, 0]));
    const chord = w.edge(B, A, w.line([-hx, y, 0], [hx, y, 0]));
    const face = w.face([w.bound(w.loop([w.oe(arc, true), w.oe(chord, true)]))], w.plane([0, 0, 0]));
    const shell = w.add('OPEN_SHELL', `'',(#${face})`);
    w.product('sliver', [w.add('SHELL_BASED_SURFACE_MODEL', `'',(#${shell})`)], ctx, 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    const s = stepToScene(w.bytes(), { chordTolerance: 0.13 });
    const st = (s.meta as unknown as StepMeta).stats;
    expect(st.failedFaces).toBe(0);
    expect(st.triangles).toBeGreaterThan(0);
    expect(s.warnings ?? []).toEqual([]);
  });
});

describe('자리별 색 덮어쓰기(CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM)', () => {
  it('표현을 가리키고 자리 변환 관계를 context로 둔 덮어쓰기는 그 자리에만 칠한다', () => {
    const w = new StepText();
    const ctx = w.context();
    const solid = cube(w, 2).solid;
    const base = w.color(solid, [0, 0, 1]);
    const part = w.product('part', [solid], ctx);
    const g1 = w.ax2([0, 0, 0]);
    const g2 = w.ax2([5, 0, 0]);
    const root = w.product('asm', [g1, g2], ctx, 'SHAPE_REPRESENTATION');
    w.place(root, part, g1, 'part-1');
    const n2 = w.place(root, part, g2, 'part-2');
    // place: NAUO, ITEM_DEFINED_TRANSFORMATION, 표현 관계(복합) 차례
    const rel2 = n2 + 2;
    w.add('CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM', `'',(#${fillStyle(w, [1, 0, 0])}),#${part.rep},#${base},(#${rel2})`);
    const s = stepToScene(w.bytes());
    expect(s.meshes).toHaveLength(2);
    expect(s.meshes[0]!.color.slice(0, 3)).toEqual([0, 0, 1]);
    expect(s.meshes[1]!.color.slice(0, 3)).toEqual([1, 0, 0]);
  });

  it('형상 항목을 가리키고 사상 항목을 context로 둔 덮어쓰기도 그 자리에만, 다른 자리는 파일 색 그대로', () => {
    const w = new StepText();
    const ctx = w.context();
    const solid = cube(w, 5).solid;
    w.color(solid, [0, 1, 0]);
    const src = w.add('ADVANCED_BREP_SHAPE_REPRESENTATION', `'src',(#${solid},#${w.ax2([0, 0, 0])}),#${ctx}`);
    const map = w.add('REPRESENTATION_MAP', `#${w.ax2([0, 0, 0])},#${src}`);
    const m1 = w.add('MAPPED_ITEM', `'m1',#${map},#${w.ax2([0, 0, 0])}`);
    const m2 = w.add('MAPPED_ITEM', `'m2',#${map},#${w.ax2([10, 0, 0])}`);
    w.product('asm', [m1, m2], ctx, 'SHAPE_REPRESENTATION');
    w.add('CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM', `'',(#${fillStyle(w, [1, 1, 0])}),#${solid},$,(#${m1})`);
    const s = stepToScene(w.bytes());
    expect(s.meshes).toHaveLength(2);
    expect(s.meshes[0]!.color.slice(0, 3)).toEqual([1, 1, 0]);
    expect(s.meshes[1]!.color.slice(0, 3)).toEqual([0, 1, 0]);
  });
});
