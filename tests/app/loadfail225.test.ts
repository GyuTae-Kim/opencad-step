// @vitest-environment jsdom
/**
 * 225차(WCAG 3.3.1·4.1.3): 224차가 남긴 받지 못한 조각 알림의 빈틈(README 개발 절 225차 표).
 * (ㄱ) 예제 열기·뷰어 조각(ensureViewer) 열기 오류 알림에 「다시 시도」가 없었다 — 다시 열 길(예제·주소·최근 문서)이 있으면 다시 시도(그 문서 열기를 처음부터),
 *      앱이 바이트를 따로 두지 않은 파일(고르기·끌어다 놓기·연결 프로그램·넣은 쪽 파일)은 지금처럼(버튼 없음).
 * (ㄴ) 받은 보기 링크의 고른 것·분해 조각을 받지 못해도 「주소의 보기(…)를 적용했습니다」가 먼저 떴다 — 다 걸었을 때만.
 * (ㄷ) 최근 문서·받은 링크의 분해 손질 되살리기가 조각을 받지 못하면 알림 없이 빠졌다 — 같은 분해 알림 하나(다시 시도 = 되살리기·링크를 처음부터).
 * (ㄹ) 다시 시도가 또 받지 못하면(브라우저가 같은 문서에서 받지 못한 모듈을 기억 — HTML module map) 그 알림의 단추를 「새로 고침」으로(글 그대로·알림 하나·되풀이 없음).
 * 앱 전체는 띄우지 않는다: app.ts 원문을 잘라 가짜 this로 돌린다(loadfail224·viewlink 꼴). 받기는 가짜 약속이라 실제 import()가 없다(ci-guard 5번 닿지 않음).
 * dom.ts는 다시 시도를 누른 글을 모듈 안에 기억하므로 시험마다 새로 받는다(vi.resetModules — 맨 위 곁효과 없음).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductNode } from '../../src/app/doc';
import { multiLabel } from '../../src/app/doc';
import { isolateText } from '../../src/app/ftext';
import { errorText, friendlyError } from '../../src/app/protocol';
import { resolveTokens } from '../../src/app/selink';
import { revealKey } from '../../src/app/tree';
import type { ViewLink } from '../../src/app/viewlink';
import { warningNodes } from '../../src/app/warnparts';

type Dom = typeof import('../../src/app/dom');
type Action = { label: string; run: () => void };
type Fn = (...args: unknown[]) => unknown;

const ROOT = join(__dirname, '../..');
const APP = readFileSync(join(ROOT, 'src/app/app.ts'), 'utf8');
/** 브라우저가 조각을 받지 못할 때의 까닭 글(Chrome 꼴 — 영어) */
const REASON = 'Failed to fetch dynamically imported module: https://example.test/opencad-step/assets/x-0.js';
const EXPLODE = '분해 보기를 받지 못했습니다.';

/** app.ts 원문 자르기(시험 안에서 — 고치기 전에는 그 시험만 실패) */
const cut = (re: RegExp): string => {
  const m = re.exec(APP)?.[1];
  if (!m) throw new Error(`app.ts에서 찾지 못함: ${re}`);
  return m;
};
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => Fn;

let dom: Dom;
beforeEach(async () => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  vi.resetModules();
  dom = await import('../../src/app/dom');
});

/** 앱 알림 칸과 app.ts toast·fail·showError(가짜 this). 앱은 loadFailed에 reload를 주지 않는다(기본 location.reload) — 시험은 가짜 reload를 끼운다 */
function fakeApp(reload: () => void) {
  const toasts = dom.h('div', { class: 'toasts', 'aria-live': 'polite' });
  document.body.append(toasts);
  const toastFn = new Function('h', 'icon', 'pushToast', 'warningNodes', 'msg', 'kind', 'ms', 'action', 'keep',
    cut(/\n {2}toast\(msg: string \| string\[\], kind[^\n]*\{\n([\s\S]*?)\n {2}\}\n/).replace(/\baction!\./g, 'action.'));
  const failFn = new Function('loadFailed', 'msg', 'retry', cut(/\n {2}fail\(msg: string, retry: \(\) => unknown\): \(e: unknown\) => undefined \{\n([\s\S]*?)\n {2}\}\n/));
  const showErrorFn = new Function('parts', 'action', cut(/\n {2}private showError\(parts: string\[\], action\?: \{ label: string; run: \(\) => void \}\): \(\) => void \{\n([\s\S]*?)\n {2}\}\n/));
  const loadFailed: Dom['loadFailed'] = (e, msg, retry, show) => dom.loadFailed(e, msg, retry, show, reload);
  const self: Record<string, unknown> = { toasts, doc: null, viewer: null, startOpen: null, lastError: null, lastErrorParts: [], updateAll: () => undefined };
  self.toast = function (this: unknown, msg: string | string[], kind = 'info', ms = 3500, action?: Action, keep = false) {
    return toastFn.call(this, dom.h, dom.icon, dom.pushToast, warningNodes, msg, kind, ms, action, keep);
  };
  self.fail = function (this: unknown, msg: string, retry: () => unknown) {
    return failFn.call(this, loadFailed, msg, retry);
  };
  self.showError = function (this: unknown, parts: string[], action?: Action) {
    return showErrorFn.call(this, parts, action);
  };
  const shown = () =>
    [...toasts.children].map((t) => [t.querySelector('span')?.textContent, t.className, t.getAttribute('role'), t.querySelector('.toast-act')?.textContent ?? null]);
  const press = (): void => (toasts.querySelector('.toast-act') as HTMLButtonElement).click();
  return { self, loadFailed, shown, press };
}

describe('225차 (ㄹ): 다시 시도가 또 받지 못하면 같은 글 알림 하나의 단추가 「새로 고침」(dom.ts loadFailed)', () => {
  it('다시 시도 전에 거듭 받지 못하면 다시 시도 그대로, 다시 시도 뒤 또 받지 못하면 새로 고침 — 누르면 reload만(다시 시도를 부르지 않음), 그 글은 이 문서 동안 새로 고침, 다른 글은 따로', () => {
    const box = dom.h('div');
    const show = (msg: string, action: Action) => {
      const act = dom.h('button', { type: 'button', class: 'toast-act' }, action.label);
      const close = dom.pushToast(box, dom.h('div', { class: 'toast warn', role: 'status' }, dom.h('span', {}, msg), act), 3);
      act.addEventListener('click', () => {
        close();
        action.run();
      });
      return close;
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reload = vi.fn();
    let retries = 0;
    // 앱 명령 꼴: 받지 못하면 알림, 다시 시도는 그 명령을 처음부터(이 시험에서는 늘 또 받지 못함)
    const command = (msg: string): undefined => dom.loadFailed(new TypeError(REASON), msg, () => (retries++, command(msg)), show, reload);
    const labels = () => [...box.children].map((t) => [t.querySelector('span')!.textContent, t.querySelector('.toast-act')!.textContent]);
    const press = () => (box.querySelector('.toast-act') as HTMLButtonElement).click();
    command(EXPLODE);
    command(EXPLODE);
    expect(labels()).toEqual([[EXPLODE, '다시 시도']]);
    press();
    expect(retries).toBe(1);
    expect(labels()).toEqual([[EXPLODE, '새로 고침']]);
    expect(errors).toHaveBeenCalledTimes(3);
    press();
    expect([reload.mock.calls.length, retries, box.children.length]).toEqual([1, 1, 0]);
    // 그 글은 이 문서 동안 새로 고침(같은 조각이 한 번 받지 못한 뒤 다시 시도도 받지 못함), 다른 글은 처음이면 다시 시도
    command(EXPLODE);
    command('보기 링크 기능을 받지 못했습니다.');
    expect(labels()).toEqual([[EXPLODE, '새로 고침'], ['보기 링크 기능을 받지 못했습니다.', '다시 시도']]);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('225차 (ㄱ): 예제·뷰어 조각 열기 오류 알림의 「다시 시도」(app.ts load 오류 자리·showError·toast)', () => {
  /** load의 오류 알림 자리(catch — 파일 이름·까닭 조각과 다시 시도) */
  function opener(self: Record<string, unknown>, loadFailed: Dom['loadFailed']) {
    const body = cut(/\n\s*(const parts = \[`\$\{isolateText\(name\)\}: 파일을 열지 못했습니다\.`[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*if \(again && e instanceof ChunkGone\)[^\n]*\n\s*else this\.showError\(parts\);)\n/);
    const fn = new Function('name', 'e', 'detail', 'again', 'isolateText', 'friendlyError', 'errorText', 'loadFailed', 'ChunkGone', body);
    return (name: string, e: unknown, again?: () => unknown) => fn.call(self, name, e, undefined, again, isolateText, friendlyError, errorText, loadFailed, dom.ChunkGone);
  }

  it('예제 조각을 받지 못하면 열기 오류 알림(role=alert)에 「다시 시도」 — 누르면 예제 열기를 처음부터, 또 받지 못하면 같은 글 하나에 「새로 고침」(까닭은 콘솔에만)', () => {
    const reload = vi.fn();
    const { self, loadFailed, shown, press } = fakeApp(reload);
    const open = opener(self, loadFailed);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const gone = new dom.ChunkGone('예제 모형을 받지 못했습니다.', { cause: new TypeError(REASON) });
    let opens = 0;
    // 앱 openSample 꼴: 다시 시도는 예제 열기를 처음부터(이 시험에서는 또 받지 못함)
    const openSample = (): unknown => (opens++, open('opencad-sample.stp', gone, openSample));
    openSample();
    const text = `${isolateText('opencad-sample.stp')}: 파일을 열지 못했습니다. 예제 모형을 받지 못했습니다.`;
    expect(shown()).toEqual([[text, 'toast error', 'alert', '다시 시도']]);
    // 시작 화면 오류 줄도 같은 글(showError), 까닭 글은 알림에 없이 콘솔에만(cause)
    expect(self.lastError).toBe(text);
    expect(document.body.textContent).not.toMatch(/Failed to fetch|TypeError|example\.test/);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String((errors.mock.calls[0]![0] as Error).cause)).toContain(REASON);
    press();
    expect(opens).toBe(2);
    expect(shown()).toEqual([[text, 'toast error', 'alert', '새로 고침']]);
    press();
    expect([reload.mock.calls.length, opens, shown()]).toEqual([1, 2, []]);
  });

  it('뷰어 조각을 받지 못하면 다시 열 길(주소·최근 문서)이 있을 때만 다시 시도, 고르기·끌어다 놓은 파일은 지금처럼(버튼 없음), 조각 밖 오류는 다시 열 길이 있어도 버튼 없음', () => {
    const { self, loadFailed, shown } = fakeApp(vi.fn());
    const open = opener(self, loadFailed);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const viewer = '3D 보기를 받지 못했습니다. 인터넷 연결을 확인한 뒤 다시 여십시오.';
    open('model.stp', new dom.ChunkGone(viewer), () => undefined);
    open('picked.stp', new dom.ChunkGone(viewer));
    open('recent.stp', new Error('그릴 형상(B-rep·삼각형)을 찾지 못했습니다.'), () => undefined);
    expect(shown().map((r) => [r[0], r[3]])).toEqual([
      [`${isolateText('model.stp')}: 파일을 열지 못했습니다. ${viewer}`, '다시 시도'],
      [`${isolateText('picked.stp')}: 파일을 열지 못했습니다. ${viewer}`, null],
      [`${isolateText('recent.stp')}: 파일을 열지 못했습니다. 그릴 형상(B-rep·삼각형)을 찾지 못했습니다.`, null],
    ]);
    // 다시 시도를 단 알림만 loadFailed가 콘솔에 까닭을 남긴다(지금처럼인 둘은 전과 같이 남기지 않음)
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it('앱 원문: 예제·뷰어 조각은 표지 오류(ChunkGone — cause에 까닭)로 던지고, 다시 열 길은 예제·주소·최근 문서만 넘긴다', () => {
    expect(APP).toMatch(/await import\('\.\/sample'\)\.catch\(\(e: unknown\) => \{\n\s*throw new ChunkGone\('예제 모형을 받지 못했습니다\.', \{ cause: e \}\);\n\s*\}\)/);
    expect(APP).toContain("throw new ChunkGone('3D 보기를 받지 못했습니다. 인터넷 연결을 확인한 뒤 다시 여십시오.', { cause: e });");
    expect(APP).toMatch(/'sample',\n\s*undefined,\n\s*null,\n\s*\(\) => this\.openSample\(\),\n\s*\);/);
    expect(APP).toContain("}, 'url', undefined, null, () => this.openUrl(url));");
    expect(APP).toContain("const ok = await this.load(file.name, () => file.arrayBuffer(), 'local', attempt, null, again);");
    // 셋째 인자(다시 열 길)를 넘기는 openFile은 최근 문서 하나 — 고르기·끌어다 놓기(둘)·연결 프로그램·넣은 쪽 파일은 지금처럼
    expect(APP.match(/this\.openFile\([^)]*\)/g)).toEqual(['this.openFile(f)', 'this.openFile(got.file, false, ()', 'this.openFile(f)', 'this.openFile(files[0]!)', 'this.openFile(files[0]!, false)']);
    expect(APP).toContain('const ok = await this.openFile(got.file, false, () => this.openRecent(r));');
  });
});

describe('225차 (ㄷ): 최근 문서 손질 되살리기(app.ts restoreTweaks)', () => {
  function restorer(entries: { id: string; explode?: unknown }[], reload = vi.fn()) {
    const app = fakeApp(reload);
    const fn = new Function('d', cut(/\n {2}private restoreTweaks\(d: StepDoc\): Promise<unknown> \{\n([\s\S]*?)\n {2}\}\n/));
    const d = { recentKey: 'a.stp:10' };
    const state = { chunk: false, last: Promise.resolve() as Promise<unknown> };
    const s = app.self;
    Object.assign(s, {
      doc: d,
      recent: { list: async () => entries },
      tweakTool: { restore: vi.fn(async () => true) },
      redrawExplode: vi.fn(),
      // 분해 조각 받기(받지 못하면 다음에 다시 — app.ts loadExplode 꼴)
      loadExplode: () => (state.chunk ? Promise.resolve() : Promise.reject(new TypeError(REASON))),
      restoreTweaks(this: unknown, x: unknown) {
        return (state.last = fn.call(this, x) as Promise<unknown>);
      },
    });
    return { ...app, d, state, run: () => (s.restoreTweaks as (x: unknown) => Promise<unknown>).call(s, d) };
  }

  it('조각을 받지 못했는데 그 항목에 손질이 있으면 분해 알림 하나와 다시 시도 — 받으면 되살려 다시 그리고 알림을 닫는다(전에는 알림 없이 빠짐)', async () => {
    const r = restorer([{ id: 'a.stp:10', explode: { v: 1 } }]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await r.run();
    expect(r.shown()).toEqual([[EXPLODE, 'toast warn', 'status', '다시 시도']]);
    const tool = r.self.tweakTool as { restore: ReturnType<typeof vi.fn> };
    expect(tool.restore).not.toHaveBeenCalled();
    r.state.chunk = true;
    r.press();
    await r.state.last;
    expect([tool.restore.mock.calls[0]?.[0], (r.self.redrawExplode as ReturnType<typeof vi.fn>).mock.calls.length, r.shown()]).toEqual([r.d, 1, []]);
  });

  it('다시 시도도 받지 못하면 같은 글 하나에 새로 고침, 손질이 없는 항목·그새 다른 문서는 알림 없음(빠지는 것이 없다 — 분해를 켜면 applyLooks가 알린다)', async () => {
    const reload = vi.fn();
    const r = restorer([{ id: 'a.stp:10', explode: { v: 1 } }], reload);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await r.run();
    r.press();
    await r.state.last;
    expect(r.shown()).toEqual([[EXPLODE, 'toast warn', 'status', '새로 고침']]);
    r.press();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(errors).toHaveBeenCalledTimes(2);
    for (const entries of [[{ id: 'a.stp:10' }], [{ id: 'b.stp:10', explode: { v: 1 } }], []]) {
      const q = restorer(entries);
      await q.run();
      expect(q.shown(), JSON.stringify(entries)).toEqual([]);
    }
    const moved = restorer([{ id: 'a.stp:10', explode: { v: 1 } }]);
    const p = moved.run();
    moved.self.doc = { recentKey: 'a.stp:10' };
    await p;
    expect(moved.shown()).toEqual([]);
    expect(errors).toHaveBeenCalledTimes(2);
  });
});

describe('225차 (ㄴ)·(ㄷ): 받은 보기 링크(app.ts applyViewLink) — 다 걸었을 때만 true(주소 안내), 손질의 분해 알림 다시 시도는 이 링크', () => {
  const N = (name: string, meshIds: string[] = [], children: ProductNode[] = []): ProductNode => ({ name, productId: name, meshIds, children });
  const tree: ProductNode[] = [N('asm', [], [N('p0', ['m0']), N('p1', ['m1'])])];

  function linkApp(opts: { chunk: boolean; sel: boolean }) {
    const app = fakeApp(vi.fn());
    const run = new AsyncFunction('link', 'screenAxis', 'revealKey', 'multiLabel', cut(/\n {2}async applyViewLink\(link: ViewLink\): Promise<boolean \| undefined> \{\n([\s\S]*?)\n {2}\}\n/));
    // app.ts applyLooks의 분해 받기 줄(받지 못하면 같은 분해 알림 — 다시 시도는 applyLooks)
    const looks = new Function('d', 'ui', cut(/\n\s*(if \(d\.explode > 0 && !ui\) void this\.loadExplode\(\)\.catch\(this\.fail\('분해 보기를 받지 못했습니다\.', \(\) => this\.applyLooks\(\)\)\);)\n/));
    const d = { products: tree, vis: { isolated: null as Set<string> | null }, dim: null, explode: 0, expanded: new Set<string>() };
    const state = { ...opts, attempts: 0, pending: null as Promise<unknown> | null };
    const s = app.self;
    Object.assign(s, {
      doc: d,
      explodeOpen: false,
      explodeMode: 'step',
      explodeAxis: 'free',
      explodeView: null,
      explodeUi: null,
      viewer: { setProjection: () => {}, setCamera: () => {}, getCamera: () => ({}), setSection: () => {} },
      toolbar: { refresh: () => {} },
      panel: { onSelection: () => {} },
      tweakTool: { cancel: () => {}, applyLink: vi.fn() },
      aimExplode: () => {},
      toggleExplode: () => {},
      unisolate: () => {},
      isolateSelection: () => true,
      selectKey: vi.fn(),
      selectBody: () => {},
      selectItems: () => {},
      redrawExplode: vi.fn(),
      setExplode(this: { applyLooks: () => void }, t: number) {
        d.explode = t;
        this.applyLooks();
      },
      applyLooks: vi.fn(function (this: { explodeUi: unknown }) {
        looks.call(this, d, d.explode > 0 ? this.explodeUi : null);
      }),
      // app.ts loadExplode 꼴: 받는 동안은 같은 약속(받기 한 번), 받지 못하면 다음에 다시 받는다
      loadExplode(this: { explodeUi: unknown }) {
        return (state.pending ??= (state.attempts++, state.chunk ? Promise.resolve() : Promise.reject(new TypeError(REASON))).then(
          () => void (this.explodeUi = {}),
          (e: unknown) => {
            state.pending = null;
            throw e;
          },
        ));
      },
      // app.ts linker 꼴: 받지 못하면 알림과 다시 시도(그 명령)를 띄우고 undefined
      linker(this: { fail: (m: string, r: () => unknown) => (e: unknown) => undefined }, retry: () => unknown) {
        return state.sel ? Promise.resolve({ resolveTokens }) : Promise.reject(new TypeError(REASON)).catch(this.fail('보기 링크 기능을 받지 못했습니다.', retry));
      },
      applyViewLink: vi.fn(),
    });
    const apply = (link: ViewLink) => run.call(s, link, () => false, revealKey, multiLabel) as Promise<boolean | undefined>;
    return { ...app, d, state, apply };
  }

  it('고른 것 조각을 받지 못하면 true가 아니다(받지 못함 알림만 — 전에는 그 앞에 「적용했습니다」), 받으면·고른 것이 없는 링크는 true', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const bad = linkApp({ chunk: true, sel: false });
    expect(await bad.apply({ sel: ['0/0'] })).toBeFalsy();
    expect(bad.shown().map((r) => [r[0], r[3]])).toEqual([['보기 링크 기능을 받지 못했습니다.', '다시 시도']]);
    const good = linkApp({ chunk: true, sel: true });
    expect([await good.apply({ sel: ['0/0'] }), await good.apply({ cam: { target: [0, 0, 0], distance: 5, yaw: 0, pitch: 0, projection: 'perspective' } }), good.shown()]).toEqual([true, true, []]);
    expect((good.self.selectKey as ReturnType<typeof vi.fn>).mock.calls).toEqual([['0/0']]);
    // 주소의 보기 안내는 다 건 뒤 true일 때만(한 곳)
    expect(APP).toContain("void this.applyViewLink(link).then((ok) => ok && this.toast('주소의 보기(카메라·단면·고른 것·분해)를 적용했습니다.'));");
    expect(APP.match(/주소의 보기\(카메라·단면·고른 것·분해\)를 적용했습니다\./g)).toHaveLength(1);
  });

  const TWEAKED: ViewLink = { exp: { t: 0.6, mode: 'step' }, exm: 'tweaks' };

  it('손질(exm)이 있는 링크의 분해 조각을 받지 못하면 받기 한 번·분해 알림 하나 — 다시 시도는 이 링크(손질까지 처음부터 — 전에는 손질이 알림 없이 빠지고 남은 알림의 다시 시도는 applyLooks)', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const link = TWEAKED;
    const a = linkApp({ chunk: false, sel: true });
    expect(await a.apply(link)).toBeFalsy();
    // setExplode → applyLooks가 시작한 받기를 함께 기다려 다시 받지 않고, 같은 받기의 뒤 손잡이라 applyLooks 알림을 갈아 끼운다
    expect([a.state.attempts, errors.mock.calls.length, a.shown().map((r) => [r[0], r[3]])]).toEqual([1, 2, [[EXPLODE, '다시 시도']]]);
    expect((a.self.tweakTool as { applyLink: ReturnType<typeof vi.fn> }).applyLink).not.toHaveBeenCalled();
    a.press();
    expect((a.self.applyViewLink as ReturnType<typeof vi.fn>).mock.calls).toEqual([[link]]);
    expect((a.self.applyLooks as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('손질 링크의 다시 시도가 실제로 링크를 다시 걸어 또 받지 못하면(같은 받기의 두 손잡이 모두) 같은 글 하나에 새로 고침', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const link = TWEAKED;
    const b = linkApp({ chunk: false, sel: true });
    let again: Promise<unknown> = Promise.resolve();
    b.self.applyViewLink = (l: ViewLink) => (again = b.apply(l));
    await b.apply(link);
    b.press();
    await again;
    expect([b.state.attempts, b.shown().map((r) => [r[0], r[3]])]).toEqual([2, [[EXPLODE, '새로 고침']]]);
  });

  it('조각을 받으면 손질을 링크대로 걸고 다시 그린다(받기 한 번, true), 손질 없는 링크가 받지 못하면 true가 아니고 알림은 applyLooks의 것(다시 시도 = 벌리기)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ok = linkApp({ chunk: true, sel: true });
    expect(await ok.apply({ exp: { t: 0.6, mode: 'step' }, exm: 'tweaks' })).toBe(true);
    expect([(ok.self.tweakTool as { applyLink: ReturnType<typeof vi.fn> }).applyLink.mock.calls, (ok.self.redrawExplode as ReturnType<typeof vi.fn>).mock.calls.length, ok.state.attempts, ok.d.explode, ok.shown()]).toEqual([[[ok.d, 'tweaks']], 1, 1, 0.6, []]);
    const plain = linkApp({ chunk: false, sel: true });
    expect(await plain.apply({ exp: { t: 0.4, mode: 'all' } })).toBeFalsy();
    expect(plain.shown().map((r) => [r[0], r[3]])).toEqual([[EXPLODE, '다시 시도']]);
    plain.press();
    expect([(plain.self.applyLooks as ReturnType<typeof vi.fn>).mock.calls.length, (plain.self.applyViewLink as ReturnType<typeof vi.fn>).mock.calls.length]).toEqual([2, 0]);
  });
});
