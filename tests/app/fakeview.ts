/**
 * 시험용 가짜 DOM·WebGL2: 브라우저 없이 실제 코어 Viewer3d를 만들어 측정 붙잡기·잠금 판정을 그대로 돌린다.
 * opencad-viewer3d 저장소의 tests/fakedom.ts·tests/fakegl.ts(MIT)를 줄여 옮겼다 — 그리기 기록 없이 호출만 받는다.
 * 그리기는 시험이 renderNow()로 부른다(requestAnimationFrame은 쌓아 두기만). 캔버스는 왼쪽 위 (0, 0)의 800×600.
 */

type Listener = (e: unknown) => void;

/** 가짜 WebGL2: 대문자 상수는 이름마다 다른 수, create*는 새 객체, 그 밖의 없는 메서드는 아무것도 하지 않는다 */
export function fakeGL(canvas: { width: number; height: number }): WebGL2RenderingContext {
  const consts = new Map<string, number>();
  let ids = 0;
  let fb: unknown = null;
  const C = (name: string): number => {
    let v = consts.get(name);
    if (v === undefined) consts.set(name, (v = 0x1000 + consts.size));
    return v;
  };
  const known: Record<string, unknown> = {
    getParameter: (p: number) => {
      if (p === C('MAX_TEXTURE_SIZE') || p === C('MAX_RENDERBUFFER_SIZE')) return 4096;
      if (p === C('MAX_VIEWPORT_DIMS')) return new Int32Array([4096, 4096]);
      if (p === C('MAX_SAMPLES')) return 4;
      if (p === C('FRAMEBUFFER_BINDING')) return fb;
      return 0;
    },
    getShaderParameter: () => true,
    getProgramParameter: () => true,
    getContextAttributes: () => ({ stencil: true }),
    getExtension: () => null,
    isContextLost: () => false,
    checkFramebufferStatus: () => C('FRAMEBUFFER_COMPLETE'),
    bindFramebuffer: (_t: number, f: unknown) => void (fb = f),
    getUniformLocation: (_p: unknown, name: string) => ({ name }),
    canvas,
  };
  return new Proxy(known, {
    get: (t, k) => {
      if (typeof k !== 'string') return undefined;
      if (k in t) return t[k];
      if (k === 'drawingBufferWidth') return canvas.width;
      if (k === 'drawingBufferHeight') return canvas.height;
      if (/^[A-Z][A-Z0-9_]*$/.test(k)) return C(k);
      if (k.startsWith('create')) return () => ({ id: ++ids });
      return () => undefined;
    },
  }) as unknown as WebGL2RenderingContext;
}

/** 가짜 2D 문맥(덧그림·뷰 큐브): 모든 호출을 받아 넘기고 값은 들고만 있는다 */
export function fake2d(): CanvasRenderingContext2D {
  const store: Record<string | symbol, unknown> = { fillStyle: '#000000', strokeStyle: '#000000', font: '10px sans-serif', globalAlpha: 1 };
  const ret = { width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2, addColorStop() {} };
  return new Proxy(store, {
    get: (t, k) => (k in t ? t[k] : () => ret),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

export class FakeElement {
  tagName: string;
  className = '';
  tabIndex = -1;
  title = '';
  textContent = '';
  width = 300;
  height = 150;
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  attrs = new Map<string, string>();
  listeners = new Map<string, Set<Listener>>();
  style: Record<string, string> & { setProperty(k: string, v: string): void; cssText: string };
  rect = { left: 0, top: 0, width: 800, height: 600 };
  ownerDocument: FakeDocument;
  private gl: WebGL2RenderingContext | null = null;

  constructor(tag: string, doc: FakeDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    const st: Record<string, string> = { cssText: '' };
    this.style = Object.assign(st, { setProperty: (k: string, v: string) => void (st[k] = v) }) as FakeElement['style'];
  }
  append(...c: FakeElement[]): void {
    for (const x of c) {
      x.parent = this;
      this.children.push(x);
    }
  }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  hasAttribute(k: string): boolean {
    return this.attrs.has(k);
  }
  addEventListener(type: string, fn: Listener): void {
    let s = this.listeners.get(type);
    if (!s) this.listeners.set(type, (s = new Set()));
    s.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  /** 듣는 함수들에 사건 객체를 넘긴다 */
  fire(type: string, e: Record<string, unknown>): void {
    const ev = { preventDefault() {}, stopPropagation() {}, target: this, currentTarget: this, ...e };
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(ev);
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number; right: number; bottom: number; x: number; y: number } {
    const r = this.rect;
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
  }
  getContext(type: string): unknown {
    if (type === 'webgl2') return (this.gl ??= fakeGL(this));
    if (type === '2d') return fake2d();
    return null;
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  blur(): void {}
  setPointerCapture(): void {}
  releasePointerCapture(): void {}
  hasPointerCapture(): boolean {
    return false;
  }
  querySelector(sel: string): FakeElement | null {
    const cls = sel.split('.').pop()!;
    const walk = (e: FakeElement): FakeElement | null => {
      for (const c of e.children) {
        if (c.className.split(/\s+/).includes(cls)) return c;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(this);
  }
}

export class FakeDocument {
  activeElement: unknown = null;
  visibilityState = 'visible';
  listeners = new Map<string, Set<Listener>>();
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
  addEventListener(type: string, fn: Listener): void {
    let s = this.listeners.get(type);
    if (!s) this.listeners.set(type, (s = new Set()));
    s.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
}

/** 전역에 가짜 DOM을 깐다(창 사건 듣기는 받기만 한다). 돌려준 restore로 걷는다 */
export function installDom(): { host: () => FakeElement; restore: () => void } {
  const g = globalThis as Record<string, unknown>;
  const keys = ['document', 'window', 'getComputedStyle', 'ResizeObserver', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'devicePixelRatio', 'addEventListener', 'removeEventListener'];
  const saved = new Map(keys.map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const doc = new FakeDocument();
  let raf = 0;
  const set = (k: string, v: unknown): void => void Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  set('document', doc);
  set('window', g);
  set('devicePixelRatio', 1);
  set('getComputedStyle', () => ({ position: 'relative', getPropertyValue: () => '' }));
  set(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  set('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  set('requestAnimationFrame', () => ++raf);
  set('cancelAnimationFrame', () => undefined);
  set('addEventListener', () => undefined);
  set('removeEventListener', () => undefined);
  return {
    host: () => doc.createElement('div'),
    restore: () => {
      for (const [k, d] of saved) {
        if (d) Object.defineProperty(g, k, d);
        else delete g[k];
      }
    },
  };
}
