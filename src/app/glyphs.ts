/**
 * 내장 획 글꼴에 없는 PMI 글자(한글·일본어·중국어·그 밖의 기호)의 모양: 해석 워커 안에서 브라우저 글꼴로 글자 하나를
 * 화면 밖 캔버스(OffscreenCanvas)에 그리고, 알파 값을 윤곽선으로 따라가(src/glyphtrace.ts) 내장 글꼴과 같은 글자 칸 좌표로 바꾼다.
 * 글꼴 파일을 내려받지 않고 기기의 글꼴을 쓴다. 글자마다 한 번만 그리고 기억한다. 결과는 PMI 선분이라 확대·단면·숨김·강조·
 * 그림 저장을 다른 PMI 선과 똑같이 따른다(무늬 그림을 붙이면 그물이 되어 고르기·측정·내보내기·물리 속성에 섞인다).
 * OffscreenCanvas가 없는 곳(Node — 훑기·시험)이나 기기에 그 글자 글꼴이 없으면 null — 해석기가 예전처럼 빈 상자로 그린다.
 */
import { traceGlyph } from '../glyphtrace';
import type { GlyphShape, GlyphSource } from '../strokefont';

/** 글자 그리기(브라우저 캔버스 또는 시험용 가짜) */
export interface GlyphRaster {
  /** 그림 한 장의 크기(화소) */
  width: number;
  height: number;
  /** 글자를 그리는 기준선 왼쪽 점(화소) */
  originX: number;
  baselineY: number;
  /** 대문자 높이(화소) — 내장 글꼴의 글자 칸 높이 6에 맞춘다 */
  capHeight: number;
  /** 글자 하나를 그려 알파 값(행 우선, 0~255)과 나아갈 거리(화소)를 돌려준다 */
  draw(ch: string): { alpha: ArrayLike<number>; advance: number };
}

/** 한 문서에서 그릴 서로 다른 글자 수 한도(넘으면 빈 상자) */
export const MAX_GLYPHS = 2048;

/** 그림 → 글자 모양. 빈 그림이면 빈칸(나아가기만), 글꼴이 없어 대신 그린 모양(notdef)과 같으면 null */
export function glyphsFromRaster(raster: GlyphRaster, notdef?: string): GlyphSource {
  const cache = new Map<string, GlyphShape | null>();
  const k = 6 / raster.capHeight;
  const sameAs = (a: ArrayLike<number>, b: ArrayLike<number> | null) => {
    if (!b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  let missing: ArrayLike<number> | null | undefined;
  return (ch: string): GlyphShape | null => {
    const hit = cache.get(ch);
    if (hit !== undefined) return hit;
    if (cache.size >= MAX_GLYPHS) return null;
    let shape: GlyphShape | null = null;
    try {
      const { alpha, advance } = raster.draw(ch);
      if (missing === undefined) missing = notdef ? raster.draw(notdef).alpha : null;
      let ink = false;
      for (let i = 0; i < alpha.length; i++)
        if (alpha[i]! >= 128) {
          ink = true;
          break;
        }
      if (!ink) shape = { strokes: [], advance: advance * k };
      else if (!sameAs(alpha, missing)) {
        const contours = traceGlyph(alpha, raster.width, raster.height);
        shape = {
          strokes: contours.map((c) => c.map(([x, y]) => [(x - raster.originX) * k, (raster.baselineY - y) * k] as [number, number])),
          advance: advance * k,
        };
      }
    } catch {
      shape = null;
    }
    cache.set(ch, shape);
    return shape;
  };
}

/** 글자 그림 크기(글꼴 크기 화소) — 크게 그릴수록 윤곽이 매끈하지만 선분이 는다 */
const FONT_PX = 64;
const FONT = `${FONT_PX}px system-ui, -apple-system, "Segoe UI", "Noto Sans", "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", "Hiragino Sans", "Microsoft YaHei", sans-serif`;

let shared: GlyphSource | null | undefined;

/** 이 실행 환경(워커)의 브라우저 글꼴로 만든 글자 모양(한 번 만들고 함께 쓴다). 캔버스가 없으면 null */
export function browserGlyphs(): GlyphSource | null {
  if (shared !== undefined) return shared;
  shared = null;
  try {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const width = Math.ceil(FONT_PX * 2.2);
    const height = Math.ceil(FONT_PX * 1.6);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.font = FONT;
    ctx.textBaseline = 'alphabetic';
    const cap = ctx.measureText('H').actualBoundingBoxAscent;
    const originX = Math.round(FONT_PX * 0.3);
    const baselineY = Math.round(FONT_PX * 1.15);
    const raster: GlyphRaster = {
      width,
      height,
      originX,
      baselineY,
      capHeight: cap > 0 ? cap : FONT_PX * 0.7,
      draw(ch) {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillText(ch, originX, baselineY);
        const data = ctx.getImageData(0, 0, width, height).data;
        const alpha = new Uint8ClampedArray(width * height);
        for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]!;
        return { alpha, advance: ctx.measureText(ch).width };
      },
    };
    // 글꼴에 없는 글자를 브라우저가 대신 그리는 모양(빈 상자·물음표 등): 개인 영역의 쓰이지 않는 글자로 잰다
    shared = glyphsFromRaster(raster, '\u{10FFFD}');
  } catch {
    shared = null;
  }
  return shared;
}
