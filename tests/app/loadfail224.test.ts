// @vitest-environment jsdom
/**
 * 224차(WCAG 3.3.1·4.1.3): 열 때 받는 조각(import())을 받지 못했을 때(오프라인에서 새 판과 옛 캐시가 엇갈림·네트워크 끊김) 사용자가 보는 것.
 * 전에는 내보내기(STL·OBJ·CSV)·보기 링크 복사·받은 보기 링크의 고른 것·분해 손질 파일 끌어 놓기·언어 메뉴가 아무 알림 없이 끝났고(처리하지 않은 거절),
 * 처음 사전을 받지 못하면 번역층·언어 메뉴가 서지 않았으며, 분해 경고는 다시 시도 없이 밀대를 움직일 때마다 쌓였고,
 * 예제 열기 오류 알림에는 브라우저 까닭 글(TypeError — 영어)이 그대로 들어갔다(README 개발 절 224차 표).
 * 이제 알림 상자에 이미 있는 꼴(「3D 보기를 받지 못했습니다.」·「분해 보기를 받지 못했습니다.」)의 글과 「다시 시도」(그 명령을 처음부터 다시),
 * 같은 글 알림은 하나(앞 알림을 떼고 새로), 까닭은 콘솔에만. 언어 사전은 바꾸기 전 화면 언어로(처음 받기에 실패하면 원문 한국어로 세운다).
 * 앱 전체는 띄우지 않는다: 알림·받기 함수는 app.ts 원문을 잘라 가짜 this로 돌리고(filecells209·viewlink 꼴), 번역층은 실제 i18n.ts.
 * 가짜 import 실패는 vi.doMock 공장이 던지게(던진 공장은 기억하지 않아 다음 받기에 다시 부른다) — 같은 조각을 둘이 동시에 받지 않게 차례로(ci-guard 5번 — NC 211차).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, icon, loadFailed, pushToast } from '../../src/app/dom';
import { warningNodes } from '../../src/app/warnparts';

const ROOT = join(__dirname, '../..');
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');
const EXPORT = join(ROOT, 'src/app/export.ts');
const DE = join(ROOT, 'site/locales/de.json');
/** 브라우저가 조각을 받지 못할 때의 까닭 글(Chrome 꼴 — 영어) */
const REASON = 'Failed to fetch dynamically imported module: https://example.test/opencad-step/assets/x-0.js';
/** 받기가 거절한 까닭(vitest는 공장이 던진 것을 cause에 담아 다시 던진다 — 브라우저에서는 TypeError 그대로) */
const why = (e: unknown): string => String((e as { cause?: unknown } | null)?.cause ?? e);
const LANGS = ['en', 'ja', 'zh-CN', 'de'] as const;
const CATALOG = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(read(`site/locales/${l}.json`)) as Record<string, string>]));

/** app.ts 원문을 잘라 돌린다(시험 안에서 — 고치기 전에는 그 시험만 실패) */
const cut = (re: RegExp): string => {
  const m = re.exec(read('src/app/app.ts'))?.[1];
  if (!m) throw new Error(`app.ts에서 찾지 못함: ${re}`);
  return m;
};

/** 앱 알림 칸과 app.ts toast·fail·exporter(가짜 this) */
function fakeApp() {
  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  document.body.append(toasts);
  const toastFn = new Function('h', 'icon', 'pushToast', 'warningNodes', 'msg', 'kind', 'ms', 'action', 'keep',
    cut(/\n {2}toast\(msg: string \| string\[\], kind[^\n]*\{\n([\s\S]*?)\n {2}\}\n/).replace(/\baction!\./g, 'action.'));
  const failFn = new Function('loadFailed', 'msg', 'retry', cut(/\n {2}fail\(msg: string, retry: \(\) => unknown\): \(e: unknown\) => undefined \{\n([\s\S]*?)\n {2}\}\n/));
  const exporterText = cut(/\n {2}private exporter\(retry: \(\) => unknown\) \{\n([\s\S]*?)\n {2}\}\n/);
  expect(exporterText).toContain("import('./export')");
  const exporterFn = new Function('load', 'retry', exporterText.replace("import('./export')", 'load()'));
  const self: Record<string, unknown> = { toasts, doc: null, viewer: null, startOpen: null };
  self.toast = function (this: unknown, msg: string, kind = 'info', ms = 3500, action?: unknown, keep = false) {
    return toastFn.call(this, h, icon, pushToast, warningNodes, msg, kind, ms, action, keep);
  };
  self.fail = function (this: unknown, msg: string, retry: () => unknown) {
    return failFn.call(this, loadFailed, msg, retry);
  };
  const exporter = (retry: () => unknown): Promise<typeof import('../../src/app/export') | undefined> => exporterFn.call(self, () => import('../../src/app/export'), retry);
  const shown = () => [...toasts.children].map((t) => t.querySelector('span')?.textContent);
  return { toasts, exporter, shown };
}

afterEach(() => {
  vi.doUnmock(EXPORT);
  vi.doUnmock(DE);
  vi.restoreAllMocks();
  document.body.replaceChildren();
  history.replaceState(null, '', '/');
  document.documentElement.lang = 'ko';
});

describe('224차: 조각을 받지 못하면 알림 상자에 글과 「다시 시도」(app.ts fail → dom.ts loadFailed)', () => {
  it('내보내기 조각(export.ts)을 받지 못하면 경고 알림 하나와 「다시 시도」, 까닭은 콘솔에만 — 같은 명령을 다시 눌러도 같은 글은 하나, 다시 시도로 받으면 알림이 닫힌다', async () => {
    const { toasts, exporter, shown } = fakeApp();
    let failing = true;
    vi.doMock(EXPORT, async () => {
      if (failing) throw new TypeError(REASON);
      return vi.importActual(EXPORT);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let retries = 0;
    let last: Promise<unknown> = Promise.resolve();
    // 앱 명령 꼴: 다시 시도는 그 명령을 처음부터 다시(또 받지 못하면 같은 길)
    const command = (): Promise<unknown> => (last = exporter(retry));
    const retry = (): Promise<unknown> => {
      retries++;
      return command();
    };
    expect(await command()).toBeUndefined();
    expect(shown()).toEqual(['내보내기 기능을 받지 못했습니다.']);
    const first = toasts.firstElementChild as HTMLElement;
    // 경고(상태 알림 — 4.1.3), 까닭 글은 알림에 없고 콘솔에만
    expect([first.className, first.getAttribute('role')]).toEqual(['toast warn', 'status']);
    expect(first.textContent).not.toMatch(/Failed to fetch|TypeError|example\.test|\[vitest\]/);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(why(errors.mock.calls[0]![0])).toContain(REASON);
    expect((first.querySelector('.toast-act') as HTMLButtonElement).textContent).toBe('다시 시도');
    // 같은 명령을 다시 눌러도(또 받지 못함) 같은 글 알림은 하나 — 앞 알림을 떼고 새로
    expect(await command()).toBeUndefined();
    expect(shown()).toEqual(['내보내기 기능을 받지 못했습니다.']);
    expect(first.isConnected).toBe(false);
    expect(errors).toHaveBeenCalledTimes(2);
    // 다시 시도: 이번에는 받는다 — 알림을 닫고 명령이 조각을 받는다
    failing = false;
    (toasts.querySelector('.toast-act') as HTMLButtonElement).click();
    expect(retries).toBe(1);
    const got = (await last) as typeof import('../../src/app/export') | undefined;
    expect(typeof got?.meshesToStl).toBe('function');
    expect(shown()).toEqual([]);
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it('글이 다른 알림은 따로 남고, 같은 글만 하나로(dom.ts loadFailed)', () => {
    const box = h('div');
    const show = (msg: string, action: { label: string; run: () => void }) =>
      pushToast(box, h('div', { class: 'toast warn', role: 'status' }, h('span', {}, msg), h('button', { type: 'button', class: 'toast-act' }, action.label)), 3);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    for (const msg of ['분해 보기를 받지 못했습니다.', '보기 링크 기능을 받지 못했습니다.', '분해 보기를 받지 못했습니다.']) loadFailed(new TypeError(REASON), msg, () => undefined, show);
    expect([...box.children].map((t) => t.querySelector('span')!.textContent)).toEqual(['보기 링크 기능을 받지 못했습니다.', '분해 보기를 받지 못했습니다.']);
  });
});

describe('224차: 언어 사전 조각을 받지 못하면(실제 i18n.ts) — 바꾸기 전 화면 언어로 알리고 다시 시도로 그 언어로', () => {
  /** 새 번역층(사전 받기 상태는 모듈마다 하나)과 독일어 사전 받기(failing이면 거절) */
  async function fresh(state: { failing: boolean }) {
    vi.resetModules();
    vi.doMock(DE, async () => {
      if (state.failing) throw new TypeError(REASON);
      return vi.importActual(DE);
    });
    return (await import('../../src/app/i18n')).installLocalization;
  }
  function page() {
    const root = document.createElement('div');
    root.innerHTML = '<header class="titlebar"></header><div class="views"><span class="t">파일 열기</span></div>';
    document.body.append(root);
    return { root, text: root.querySelector('.t')! };
  }

  it('언어 메뉴로 바꾸다 받지 못하면 지금 언어 그대로 알림(failed)을 부르고, 다시 시도로 받으면 그 언어로 바꾼다', async () => {
    const state = { failing: true };
    const install = await fresh(state);
    const { root, text } = page();
    const fails: { e: unknown; retry: () => void }[] = [];
    const dispose = await install(root, (e, retry) => fails.push({ e, retry }));
    try {
      (document.querySelector('.language-list [data-language="de"]') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(fails).toHaveLength(1), { timeout: 3000 });
      expect(why(fails[0]!.e)).toContain(REASON);
      // 바꾸기 전 화면 언어(한국어) 그대로 — 알림 글도 그 언어로 옮겨진다
      expect([document.documentElement.lang, text.textContent]).toEqual(['ko', '파일 열기']);
      state.failing = false;
      fails[0]!.retry();
      await vi.waitFor(() => expect([document.documentElement.lang, text.textContent]).toEqual(['de', CATALOG.de!['파일 열기']]), { timeout: 3000 });
      expect(fails).toHaveLength(1);
    } finally {
      dispose();
      root.remove();
    }
  });

  it('처음 사전을 받지 못하면 원문(한국어)으로 번역층·언어 메뉴를 세우고 알림(failed), 다시 시도로 받으면 그 언어로(전에는 거절로 끝나 언어 메뉴가 없었다)', async () => {
    const state = { failing: true };
    const install = await fresh(state);
    history.replaceState(null, '', '/de/');
    const { root, text } = page();
    const fails: { e: unknown; retry: () => void }[] = [];
    const dispose = await install(root, (e, retry) => fails.push({ e, retry }));
    try {
      expect(fails).toHaveLength(1);
      expect(why(fails[0]!.e)).toContain(REASON);
      expect([document.documentElement.lang, text.textContent]).toEqual(['ko', '파일 열기']);
      expect(root.querySelector('.titlebar .language-control')).not.toBeNull();
      expect(document.querySelector('.language-list [data-language="ko"]')?.getAttribute('aria-checked')).toBe('true');
      state.failing = false;
      fails[0]!.retry();
      await vi.waitFor(() => expect([document.documentElement.lang, text.textContent]).toEqual(['de', CATALOG.de!['파일 열기']]), { timeout: 3000 });
      expect(location.pathname).toBe('/de/');
      expect(document.querySelector('.language-list [data-language="de"]')?.getAttribute('aria-checked')).toBe('true');
    } finally {
      dispose();
      root.remove();
    }
  });
});

describe('224차: 앱 원문 — 받기 자리마다 같은 길(app.ts·main.ts)과 새 원문의 네 사전', () => {
  it('내보내기 셋·보기 링크 둘·분해 둘·예제·언어 사전이 알림과 다시 시도로 잇는다(미리 받기·접선·곡면·뷰어 조각은 그대로 — 표)', () => {
    const app = read('src/app/app.ts');
    const fail = (msg: string, retry: string) => `this.fail('${msg}', () => this.${retry})`;
    // 조각마다 받기 함수 하나(내보내기·보기 링크) — 동적 import는 미리 받기 줄과 그 함수에만(타입 자리 typeof import는 받지 않음)
    expect(app.match(/(?<!typeof )import\('\.\/export'\)/g)).toHaveLength(2);
    expect(app.match(/(?<!typeof )import\('\.\/selink'\)/g)).toHaveLength(2);
    expect(app).toContain("void Promise.all([import('./export'), import('./selink'), this.loadExplode()]).catch(() => {});");
    expect(app).toContain("return import('./export').catch(this.fail('내보내기 기능을 받지 못했습니다.', retry));");
    expect(app).toContain("return import('./selink').catch(this.fail('보기 링크 기능을 받지 못했습니다.', retry));");
    for (const call of ['exportMesh(format, which)', 'copyMeasureCsv()', 'copyPmiCsv()'])
      expect(app, call).toMatch(new RegExp(`const x = await this\\.exporter\\(\\(\\) => this\\.${call.replace(/[()]/g, '\\$&')}\\);\\n\\s*if \\(!x\\) return;`));
    expect(app).toMatch(/\? await this\.linker\(\(\) => this\.copyViewLink\(\)\) : null;\n(\s*\/\/[^\n]*\n)*\s*if \(sel === undefined\) return;/);
    expect(app).toContain('const sel = await this.linker(() => this.applyViewLink(link));');
    // 분해: 같은 글(이미 있는 원문)에 다시 시도 — 경고만 내던 줄은 없다
    expect(app).toContain(`void this.loadExplode().catch(${fail('분해 보기를 받지 못했습니다.', 'applyLooks()')});`);
    expect(app).toContain(`await this.loadExplode().catch(${fail('분해 보기를 받지 못했습니다.', 'dropTweaks(f)')});`);
    expect(app).not.toContain("this.toast('분해 보기를 받지 못했습니다.'");
    // 예제: 까닭은 콘솔에만, 열기 오류 알림은 알기 쉬운 글(ensureViewer 꼴) — 225차: 까닭은 표지 오류(ChunkGone)의 cause로 넘기고
    // 콘솔에는 load가 다시 시도를 달며 loadFailed로 남긴다(loadfail225)
    expect(app).toMatch(/await import\('\.\/sample'\)\.catch\(\(e: unknown\) => \{\n\s*throw new ChunkGone\('예제 모형을 받지 못했습니다\.', \{ cause: e \}\);/);
    // 언어 사전: 앱 입구가 번역층의 실패를 앱 알림으로
    expect(read('src/app/main.ts')).toContain("void installLocalization(root, (e, retry) => app.fail('고른 언어를 받지 못했습니다.', retry)(e));");
    expect(read('src/app/main.ts').match(/installLocalization\(/g)).toHaveLength(1);
  });

  it('새 원문 다섯은 네 사전에 한글 없는 값으로 있고, 같은 언어의 다른 값과 겹치지 않는다', () => {
    const NEW = ['다시 시도', '내보내기 기능을 받지 못했습니다.', '보기 링크 기능을 받지 못했습니다.', '고른 언어를 받지 못했습니다.', '예제 모형을 받지 못했습니다.'];
    for (const lang of LANGS) {
      const c = CATALOG[lang]!;
      const values = Object.values(c).map((v) => v.replace(/\s+/g, ' ').trim());
      for (const key of NEW) {
        expect(c[key], `${lang}: ${key}`).toBeTruthy();
        expect(c[key], `${lang}: ${key}`).not.toMatch(/[가-힣]/);
        expect(values.filter((v) => v === c[key]).length, `${lang}: ${key}`).toBe(1);
      }
    }
    expect(LANGS.map((l) => CATALOG[l]!['다시 시도'])).toEqual(['Try again', '再試行', '重试', 'Erneut versuchen']);
  });
});
