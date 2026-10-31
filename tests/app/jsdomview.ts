/**
 * 시험용(jsdom 환경): 실제 코어 Viewer3d를 jsdom 문서에 만든다. 사건 전달(캡처·버블)이 진짜라 캔버스 부모의 캡처 단계에서 듣는 앱 모듈(정밀 조준·분해 끌기)과
 * 코어 포인터 처리(0.32.0 포인터 맡기 훅 포함)를 함께 돌린다. 그리기는 fakeview.ts의 가짜 WebGL2·2D 문맥이고, 요소 자리는 모두 왼쪽 위 (0, 0)의 800 × 600이다.
 * requestAnimationFrame은 쌓기만 한다(그리기는 시험이 renderNow()로). restore()가 뷰어를 버리고 바꾼 전역을 되돌린다.
 */
import { Viewer3d } from 'opencad-viewer3d';
import { fake2d, fakeGL } from './fakeview';

export const VIEW_W = 800;
export const VIEW_H = 600;

export function jsdomViewer(opts: ConstructorParameters<typeof Viewer3d>[1] = {}): { viewer: Viewer3d; host: HTMLElement; restore: () => void } {
  const proto = HTMLCanvasElement.prototype as unknown as { getContext: unknown };
  const saved = {
    getContext: proto.getContext,
    rect: Element.prototype.getBoundingClientRect,
    ro: (globalThis as { ResizeObserver?: unknown }).ResizeObserver,
    mm: window.matchMedia,
    raf: window.requestAnimationFrame,
    caf: window.cancelAnimationFrame,
  };
  const gls = new WeakMap<object, unknown>();
  proto.getContext = function (this: HTMLCanvasElement, type: string): unknown {
    if (type === '2d') return fake2d();
    if (type !== 'webgl2') return null;
    let gl = gls.get(this);
    if (!gl) gls.set(this, (gl = fakeGL(this)));
    return gl;
  };
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    return { left: 0, top: 0, right: VIEW_W, bottom: VIEW_H, width: VIEW_W, height: VIEW_H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  let raf = 0;
  window.requestAnimationFrame = (() => ++raf) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
  const host = document.createElement('div');
  document.body.append(host);
  const viewer = new Viewer3d(host, { animate: false, keyboard: false, ...opts });
  return {
    viewer,
    host,
    restore: () => {
      viewer.dispose();
      host.remove();
      proto.getContext = saved.getContext;
      Element.prototype.getBoundingClientRect = saved.rect;
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = saved.ro;
      window.matchMedia = saved.mm;
      window.requestAnimationFrame = saved.raf;
      window.cancelAnimationFrame = saved.caf;
    },
  };
}
