/**
 * 측정 거리 글상자가 3D 보기 위 앱 화면 요소를 비켜 그리기(코어 0.13.0 setMeasureLabelAvoid의 rects — 접선 조각과 함께 문서를 열 때 받는다).
 *
 * 3D 보기(캔버스) 위에는 측정 띠(휴대폰에서는 두 줄 — 측정 종류·단추와 안내·결과), 분해·격리 띠, 단면 막대와 코어 뷰 큐브가 겹쳐 있다.
 * 코어 거리 글상자(두 점 화면 가운데의 오른쪽 위, 캔버스 안으로 당김)는 이것들을 몰라, 휴대폰에서 위쪽을 재면 글상자 오른쪽이 뷰 큐브 밑으로,
 * 잰 뒤 보기를 옮기거나 아래쪽 두 점의 가운데가 띠 높이에 오면 측정 띠 밑으로 들어갔다.
 * 이 요소들의 화면 사각형을 캔버스 왼쪽 위 기준으로 코어에 알려 코어가 정해진 차례(기준점 네 귀 → 선분 위 → 피할 자리 위아래)로 비켜 그리게 한다.
 * - 기본 자리가 어느 요소와도 겹치지 않으면 코어는 옮기지 않는다(넓은 화면의 보통 측정 그림은 그대로). 그림 저장은 늘 기본 자리다(코어)
 * - 요소·캔버스 크기가 바뀔 때(ResizeObserver — 띠가 나타나고 사라지거나 글 줄 수가 바뀔 때, 뷰 큐브를 끄고 켤 때, 화면을 돌릴 때) 다시 알린다.
 *   요소 자리는 모두 3D 보기 안에서 크기로만 정해진다(아래 가운데 띠, 위 가운데·왼쪽 위 띠, 오른쪽 위 큐브)
 * - 정밀 조준(aim.ts)의 십자선 둘레·손가락 자리와 합쳐 알린다
 * - 알림(토스트)은 잠깐 나왔다 사라지므로 넣지 않는다(글상자가 따라 뛰지 않게)
 * 앱 측정 덧그림(개체 측정 — 코어 setAnnotations)의 글상자는 코어가 비키지 않는다.
 */
import type { MeasureLabelAvoid, MeasureLabelRect, Viewer3d } from 'opencad-viewer3d';
import type { AimLabelAvoid } from './aim';

/** 글상자가 비킬 요소: 3D 보기(.view)의 측정 띠·위 띠(분해·격리)·단면 막대와 코어 뷰 큐브 캔버스 */
export const LABEL_AVOID_SELECTOR = ':scope > .measure-bar, :scope > .top-bars, :scope > .section-bar, .v3d-cube';

/** 화면 상자(getBoundingClientRect 꼴) */
export type ScreenBox = Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>;

/**
 * 요소 상자들을 캔버스 왼쪽 위 기준 사각형으로. 바깥쪽으로 정수에 맞추고(왼쪽·위는 내림, 오른쪽·아래는 올림 — 같은 자리면 같은 값이라
 * 코어가 다시 그리지 않는다) 캔버스 밖은 잘라 낸다. 크기가 0인 것(숨긴 요소 — display: none)과 캔버스와 겹치지 않는 것은 뺀다
 * (NC 앱의 coverRects와 같은 규칙)
 */
export function overlayRects(canvas: ScreenBox, boxes: readonly ScreenBox[]): MeasureLabelRect[] {
  const out: MeasureLabelRect[] = [];
  for (const b of boxes) {
    if (!(b.width > 0 && b.height > 0)) continue;
    const x0 = Math.max(0, Math.floor(b.left - canvas.left));
    const y0 = Math.max(0, Math.floor(b.top - canvas.top));
    const x1 = Math.min(Math.ceil(canvas.width), Math.ceil(b.left - canvas.left + b.width));
    const y1 = Math.min(Math.ceil(canvas.height), Math.ceil(b.top - canvas.top + b.height));
    if (x1 > x0 && y1 > y0) out.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  }
  return out;
}

/** 화면 요소 사각형과 정밀 조준 자리를 합친 setMeasureLabelAvoid 값(둘 다 없으면 null — 코어 0.12.0 자리) */
export function mergeLabelAvoid(ui: readonly MeasureLabelRect[], aim: AimLabelAvoid | null): MeasureLabelAvoid | null {
  const rects = [...ui, ...(aim?.rects ?? [])];
  if (aim) return { rects, pointerRadius: aim.pointerRadius };
  return rects.length ? { rects } : null;
}

/** 3D 보기 위 요소 자리를 지켜보다 코어에 알린다(뷰어 하나에 하나) */
export class LabelAvoid {
  private aimAt: AimLabelAvoid | null = null;

  constructor(
    private readonly v: Pick<Viewer3d, 'canvas' | 'setMeasureLabelAvoid'>,
    private readonly view: ParentNode,
  ) {
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => this.update());
      ro.observe(v.canvas);
      for (const e of this.els()) ro.observe(e);
    }
    this.update();
  }

  private els(): Element[] {
    return [...this.view.querySelectorAll(LABEL_AVOID_SELECTOR)];
  }

  /** 정밀 조준 자리(aim.ts labelAvoid — 십자선을 옮길 때마다, 마치면 null) */
  aim(a: AimLabelAvoid | null): void {
    this.aimAt = a;
    this.update();
  }

  /** 지금 요소 자리로 다시 알린다(같은 값이면 코어가 다시 그리지 않는다) */
  update(): void {
    const boxes = this.els().map((e) => e.getBoundingClientRect());
    this.v.setMeasureLabelAvoid(mergeLabelAvoid(overlayRects(this.v.canvas.getBoundingClientRect(), boxes), this.aimAt));
  }
}
