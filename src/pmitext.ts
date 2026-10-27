/**
 * PMI 글자(TEXT_LITERAL과 아형)를 내장 획 글꼴(strokefont.ts)로 선분으로 그린다(내장 글꼴에 없는 글자는 받은 글자 모양으로).
 * TEXT_LITERAL(name, literal, placement, alignment, path, font[, extent …]) — 배치(AXIS2_PLACEMENT_3D/2D)의 x축이 글줄 방향,
 * y축이 글자 위쪽이다. 글자 높이는 TEXT_LITERAL_WITH_EXTENT의 높이, 주석 양식의 TEXT_STYLE_WITH_BOX_CHARACTERISTICS BOX_HEIGHT,
 * 그것도 없으면 기본 2.5(모형 단위). 맞춤(alignment)은 'baseline left'를 기본으로 centre·right·top·middle을 따른다.
 */
import type { Geometry } from './geometry';
import { isA, num, partOf, refId, refList, StepTyped, text, type StepFile } from './part21';
import { layoutText, type GlyphSource } from './strokefont';

/** 기본 글자 높이(모형 단위, 대문자 높이) */
export const DEFAULT_TEXT_HEIGHT = 2.5;

const CONTAINERS = ['COMPOSITE_TEXT', 'COMPOSITE_TEXT_WITH_EXTENT', 'COMPOSITE_TEXT_WITH_ASSOCIATED_CURVES', 'COMPOSITE_TEXT_WITH_BLANKING_BOX', 'COMPOSITE_TEXT_WITH_DELINEATION'];

/** 항목 아래(글 묶음·기하 집합·주석 글)에서 TEXT_LITERAL을 모은다(너비 우선, 몇 단계만) */
export function textLiterals(f: StepFile, root: number, limit = 256): number[] {
  const out: number[] = [];
  const seen = new Set<number>([root]);
  const queue = [root];
  while (queue.length && out.length < limit && seen.size < limit * 4) {
    const id = queue.shift()!;
    const e = f.get(id);
    if (!e) continue;
    // TEXT_LITERAL과 아형(…_WITH_EXTENT·_WITH_BLANKING_BOX·_WITH_ASSOCIATED_CURVES·_WITH_DELINEATION — 단순 인스턴스면 형식 이름이 다르다)
    if (isA(e, 'TEXT_LITERAL') || e.type.startsWith('TEXT_LITERAL')) {
      out.push(id);
      continue;
    }
    let kids: number[] = [];
    const ct = CONTAINERS.find((t) => isA(e, t)) ?? (e.type.startsWith('COMPOSITE_TEXT') ? e.type : undefined);
    if (ct) kids = refList((e.parts ? partOf(e, 'COMPOSITE_TEXT') : e)?.args[e.parts ? 0 : 1]);
    else if (isA(e, 'GEOMETRIC_SET') || isA(e, 'GEOMETRIC_CURVE_SET') || isA(e, 'ANNOTATION_TEXT') || isA(e, 'ANNOTATION_TEXT_CHARACTER')) kids = refList(e.args[1]);
    else if (e.type === 'MAPPED_ITEM') {
      // 글을 담은 사상 항목: 바탕 표현의 항목들
      const map = f.get(refId(e.args[1]));
      const rep = map ? f.get(refId(map.args[1])) : undefined;
      if (rep) kids = refList(rep.args[1]);
    }
    for (const k of kids)
      if (!seen.has(k)) {
        seen.add(k);
        queue.push(k);
      }
  }
  return out;
}

/** 주석 양식(PRESENTATION_STYLE_ASSIGNMENT 등)에서 글자 높이(BOX_HEIGHT), 없으면 null */
export function styleTextHeight(f: StepFile, styleIds: readonly number[]): number | null {
  const seen = new Set<number>();
  const visit = (id: number, depth: number): number | null => {
    if (depth > 6 || seen.has(id)) return null;
    seen.add(id);
    const e = f.get(id);
    if (!e) return null;
    if (e.type === 'TEXT_STYLE_WITH_BOX_CHARACTERISTICS') {
      for (const v of Array.isArray(e.args[2]) ? e.args[2] : []) if (v instanceof StepTyped && v.type === 'BOX_HEIGHT') return num(v.value);
    }
    for (const r of [...refList(e.args[0]), ...refList(e.args[1])]) {
      const h = visit(r, depth + 1);
      if (h) return h;
    }
    return null;
  };
  for (const s of styleIds) {
    const h = visit(s, 0);
    if (h && h > 0) return h;
  }
  return null;
}

/**
 * 글자들 → 3D 선분 쌍(모형 좌표). 그리지 못한 글자 개수도.
 * glyphs: 내장 글꼴에 없는 글자(한글·일본어·중국어·그 밖의 기호)의 모양 — 없으면 그 글자는 빈 상자(boxes에 센다)
 */
export function textSegments(f: StepFile, g: Geometry, literals: readonly number[], styleHeight: number | null, glyphs?: GlyphSource | null): { segs: number[]; drawn: number; boxes: number } {
  const segs: number[] = [];
  let drawn = 0;
  let boxes = 0;
  for (const id of literals) {
    const e = f.get(id);
    if (!e) continue;
    const a = e.parts ? (partOf(e, 'TEXT_LITERAL')?.args ?? []) : e.args;
    // 단순 인스턴스: (name, literal, placement, alignment, path, font[, extent])
    const lit = e.parts ? text(a[0]) : text(a[1]);
    const place = e.parts ? refId(a[1]) : refId(a[2]);
    const align = (e.parts ? text(a[2]) : text(a[3])).toLowerCase();
    if (!lit.trim()) continue;
    const fr = g.frame(place);
    if (!fr) continue;
    let height = styleHeight ?? DEFAULT_TEXT_HEIGHT;
    // TEXT_LITERAL_WITH_EXTENT: PLANAR_EXTENT(size_in_x, size_in_y) — 글자 높이로 쓴다
    const extId = e.parts ? refId(partOf(e, 'TEXT_LITERAL_WITH_EXTENT')?.args[0]) : e.type === 'TEXT_LITERAL_WITH_EXTENT' ? refId(e.args[6]) : 0;
    const ext = extId ? f.get(extId) : undefined;
    if (ext) {
      // PLANAR_EXTENT(name, size_in_x, size_in_y) · PLANAR_BOX(…, placement)
      const sy = num(ext.args[2]);
      if (sy > 0) height = sy;
    }
    const lay = layoutText(lit, glyphs);
    boxes += lay.boxes;
    let dx = 0;
    let dy = 0;
    if (align.includes('cent')) dx = -lay.width / 2;
    else if (align.includes('right')) dx = -lay.width;
    if (align.includes('top')) dy = -1;
    else if (align.includes('middle') || align.includes('centre centre') || align.includes('center center')) dy = -0.5;
    const s = lay.segs;
    for (let i = 0; i + 1 < s.length; i += 2) {
      const u = (s[i]! + dx) * height;
      const v = (s[i + 1]! + dy) * height;
      segs.push(fr.o[0] + fr.x[0] * u + fr.y[0] * v, fr.o[1] + fr.x[1] * u + fr.y[1] * v, fr.o[2] + fr.x[2] * u + fr.y[2] * v);
    }
    drawn++;
  }
  return { segs, drawn, boxes };
}
