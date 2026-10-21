/**
 * 색: STYLED_ITEM·OVER_RIDING_STYLED_ITEM → PRESENTATION_STYLE_ASSIGNMENT → SURFACE_STYLE_USAGE → SURFACE_SIDE_STYLE
 * → SURFACE_STYLE_FILL_AREA → FILL_AREA_STYLE → FILL_AREA_STYLE_COLOUR → COLOUR_RGB·DRAUGHTING_PRE_DEFINED_COLOUR,
 * 투명도는 SURFACE_STYLE_RENDERING_WITH_PROPERTIES → SURFACE_STYLE_TRANSPARENT.
 * 면 색이 없을 때 CURVE_STYLE 색은 쓰지 않는다(선 색 — 곡선·와이어프레임·PMI 선 색으로 따로 모은다).
 * CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM은 항목 전체 색이 아니라 style_context가 가리키는 자리(인스턴스)에서만 쓰도록
 * contextColors로 따로 넘긴다(해석기가 조립 길을 따라가며 맞춘다).
 */
import type { Rgba } from 'opencad-viewer3d/types';
import { num, refId, refList, text, type StepFile } from './part21';

const PREDEFINED: Record<string, [number, number, number]> = {
  red: [1, 0, 0],
  green: [0, 1, 0],
  blue: [0, 0, 1],
  yellow: [1, 1, 0],
  magenta: [1, 0, 1],
  cyan: [0, 1, 1],
  black: [0, 0, 0],
  white: [1, 1, 1],
};

export interface StyleInfo {
  /** 대상 개체(면·껍질·입체·사상 항목 등) → 색 */
  colors: Map<number, Rgba>;
  /** 숨김(INVISIBILITY) 대상 */
  hidden: Set<number>;
  /** 대상 개체 → 선 색(CURVE_STYLE). 곡선·와이어프레임 형상에 쓴다 */
  curveColors: Map<number, Rgba>;
  /** 양식 배정(PRESENTATION_STYLE_ASSIGNMENT 등) 번호들 → 선 색(없으면 면 색). PMI 주석처럼 양식이 붙은 항목에 직접 쓴다 */
  curveColorOf(styleIds: readonly number[]): Rgba | undefined;
  /**
   * 자리별 색 덮어쓰기(CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM). item은 표현(그 아래 모두) 또는 형상 항목,
   * context는 그 자리로 가는 길의 개체들(NEXT_ASSEMBLY_USAGE_OCCURRENCE·REPRESENTATION_RELATIONSHIP·MAPPED_ITEM 등)이다.
   * 해석기(scene.ts)는 지금 따라가는 길에 context가 모두 있을 때만 그 자리의 그물에 색을 칠한다.
   */
  contextColors: ContextColor[];
}

/** 자리별 색 덮어쓰기 하나 */
export interface ContextColor {
  item: number;
  context: number[];
  /** 덮어쓸 색(투명도만 바꾸면 null) */
  color: Rgba | null;
  alpha: number;
}

export function readStyles(f: StepFile): StyleInfo {
  const colors = new Map<number, Rgba>();
  const hidden = new Set<number>();
  const curveColors = new Map<number, Rgba>();
  const colourCache = new Map<number, [number, number, number] | null>();
  const colour = (id: number): [number, number, number] | null => {
    const hit = colourCache.get(id);
    if (hit !== undefined) return hit;
    const e = f.get(id);
    let c: [number, number, number] | null = null;
    if (e) {
      if (e.type === 'COLOUR_RGB') {
        let r = num(e.args[1], 0);
        let g = num(e.args[2], 0);
        let b = num(e.args[3], 0);
        if (r > 1 || g > 1 || b > 1) {
          r /= 255;
          g /= 255;
          b /= 255;
        }
        c = [clamp01(r), clamp01(g), clamp01(b)];
      } else if (e.type === 'DRAUGHTING_PRE_DEFINED_COLOUR' || e.type === 'PRE_DEFINED_COLOUR') {
        c = PREDEFINED[text(e.args[0]).toLowerCase()] ?? null;
      }
    }
    colourCache.set(id, c);
    return c;
  };
  // 표현 양식 하나에서 면 색·투명도
  type StyleOut = { rgb: [number, number, number] | null; alpha: number; curve: [number, number, number] | null };
  const surfaceStyle = (id: number, depth = 0): StyleOut => {
    const out: StyleOut = { rgb: null, alpha: 1, curve: null };
    if (depth > 8) return out;
    const e = f.get(id);
    if (!e) return out;
    const merge = (o: StyleOut) => {
      if (o.rgb && !out.rgb) out.rgb = o.rgb;
      if (o.alpha < 1) out.alpha = Math.min(out.alpha, o.alpha);
      if (o.curve && !out.curve) out.curve = o.curve;
    };
    switch (e.type) {
      case 'PRESENTATION_STYLE_ASSIGNMENT':
      case 'PRESENTATION_STYLE_BY_CONTEXT':
        for (const s of refList(e.args[0])) merge(surfaceStyle(s, depth + 1));
        break;
      case 'SURFACE_STYLE_USAGE':
        merge(surfaceStyle(refId(e.args[1]), depth + 1));
        break;
      case 'SURFACE_SIDE_STYLE':
        for (const s of refList(e.args[1])) merge(surfaceStyle(s, depth + 1));
        break;
      case 'SURFACE_STYLE_FILL_AREA':
        merge(surfaceStyle(refId(e.args[0]), depth + 1));
        break;
      case 'FILL_AREA_STYLE':
        for (const s of refList(e.args[1])) merge(surfaceStyle(s, depth + 1));
        break;
      case 'FILL_AREA_STYLE_COLOUR':
        out.rgb = colour(refId(e.args[1]));
        break;
      case 'CURVE_STYLE':
        // (name, curve_font, curve_width, curve_colour)
        out.curve = colour(refId(e.args[3]));
        break;
      case 'SURFACE_STYLE_RENDERING':
      case 'SURFACE_STYLE_RENDERING_WITH_PROPERTIES': {
        const c = colour(refId(e.args[1]));
        if (c) out.rgb = c;
        for (const pid of refList(e.args[2])) {
          const p = f.get(pid);
          if (p && p.type === 'SURFACE_STYLE_TRANSPARENT') out.alpha = clamp01(1 - num(p.args[0], 0));
        }
        break;
      }
      default:
        break;
    }
    return out;
  };
  const styleOf = (styleIds: readonly number[]) => {
    let rgb: [number, number, number] | null = null;
    let alpha = 1;
    let curve: [number, number, number] | null = null;
    for (const s of styleIds) {
      const st = surfaceStyle(s);
      if (st.rgb && !rgb) rgb = st.rgb;
      if (st.curve && !curve) curve = st.curve;
      alpha = Math.min(alpha, st.alpha);
    }
    return { rgb, alpha, curve };
  };
  const apply = (type: string) => {
    for (const id of f.idsOfType(type)) {
      const e = f.get(id);
      if (!e || e.parts) continue;
      const item = refId(e.args[2]);
      if (!item) continue;
      const { rgb, alpha, curve } = styleOf(refList(e.args[1]));
      if (curve) curveColors.set(item, [curve[0], curve[1], curve[2], 1]);
      if (rgb) colors.set(item, [rgb[0], rgb[1], rgb[2], alpha]);
      else if (alpha < 1) {
        const prev = colors.get(item);
        if (prev) colors.set(item, [prev[0], prev[1], prev[2], alpha]);
      }
    }
  };
  apply('STYLED_ITEM');
  apply('OVER_RIDING_STYLED_ITEM');
  // 자리(인스턴스)별 덮어쓰기: (이름, 양식, 항목, 덮어쓸 양식, style_context) — 항목 전체가 아니라 그 자리에서만 쓴다
  const contextColors: ContextColor[] = [];
  for (const id of f.idsOfType('CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM')) {
    const e = f.get(id);
    if (!e || e.parts) continue;
    const item = refId(e.args[2]);
    const context = refList(e.args[4]);
    if (!item || !context.length) continue;
    const { rgb, alpha } = styleOf(refList(e.args[1]));
    if (!rgb && alpha >= 1) continue;
    contextColors.push({ item, context, color: rgb ? [rgb[0], rgb[1], rgb[2], alpha] : null, alpha });
  }
  for (const id of f.idsOfType('INVISIBILITY')) {
    const e = f.get(id);
    if (!e) continue;
    for (const r of refList(e.args[0])) {
      // 숨긴 것이 양식 항목이면 그 대상
      const t = f.get(r);
      if (t && (t.type === 'STYLED_ITEM' || t.type === 'OVER_RIDING_STYLED_ITEM')) hidden.add(refId(t.args[2]));
      else hidden.add(r);
    }
  }
  const curveColorOf = (styleIds: readonly number[]): Rgba | undefined => {
    let fill: [number, number, number] | null = null;
    for (const s of styleIds) {
      const st = surfaceStyle(s);
      if (st.curve) return [st.curve[0], st.curve[1], st.curve[2], 1];
      if (st.rgb && !fill) fill = st.rgb;
    }
    // 채운 글자(삼각형 주석)는 면 색만 있을 수 있다
    return fill ? [fill[0], fill[1], fill[2], 1] : undefined;
  };
  return { colors, hidden, curveColors, curveColorOf, contextColors };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
