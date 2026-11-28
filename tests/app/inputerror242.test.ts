// @vitest-environment jsdom
/**
 * 242차(WCAG 3.3.1 Error Identification·3.3.3 Error Suggestion — 재발 막기): 사용자가 값을 넣는 칸에 받을 수 없는 값을 넣으면
 * (가) 오류가 글로 알려지고(색·모양만이 아니라), (나) 그 칸에 이어지며(aria-invalid·aria-describedby 등), (다) 고칠 길(받는 꼴·범위)이 제안된다.
 * 받지 못한 값을 보이던 값으로 되돌리고 그 값이 칸에 보이면 오류가 아닌 것 — 그때는 되돌렸다는 것이 화면 읽기에도 들리는지(알림 칸 role=status)만 본다.
 * - 표(README 개발 절 242차 문단·.runtime/r242 표): src에서 값을 받는 칸을 만드는 자리(h('input'|'select'|'textarea', …)) 13 — 파일 · 칸 꼴(type·class)마다 판정.
 *   표 밖에 새 칸이 생기면 실패한다(그 칸의 받을 수 없는 값 처리를 보고 표에 더한다). textarea·contenteditable·createElement 입력 칸·index.html 입력 칸은 0.
 *   오류 글·맞춤 칸은 그 처리 코드가 그대로인지 소스 글로 본다(ci-guard 12번 — 그 줄을 바꾸면 이 시험도).
 * - 242차에 고친 것: 분해 거리 칸(explodebar.ts — 43·45차)은 받지 못한 글을 Enter로 걸면 경고 알림(까닭·받는 꼴)을 내고 칸에 그 글을 그대로 두어(고름) 다시 쳐 넣게 하는데,
 *   칸에는 오류 표시가 없어(aria-invalid·설명 이음 없음) 알림이 5초 뒤 사라지면 칸으로 돌아와도 무엇이 틀렸는지 다시 들을 길이 없었다
 *   → 받지 못한 글이 칸에 남는 동안만 aria-invalid="true" + aria-describedby → 숨은 글 칸(그 알림과 같은 원문 — 있는 사전 열쇠, 번역층이 옮김).
 *   고쳐 쓰면(input)·떠나면(보일 값으로 되돌림)·Esc·맞는 값이면 뗀다. 새 원문 0.
 * - 단면 위치 숫자 칸·밀도 칸(155차)은 보이던 값으로 되돌리고 경고 알림(keynav·physpanel 155차 시험) — 맞춤이라 둠.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Mesh3d, Viewer3d } from 'opencad-viewer3d';
import { Fmt } from '../../src/app/display';
import type { ProductNode, StepDoc } from '../../src/app/doc';
import { h } from '../../src/app/dom';
import { explodePlan, type ExplodeAxis } from '../../src/app/explode';
import { ExplodeControls, ExplodeTweakTool } from '../../src/app/explodebar';
import type { TweakHost } from '../../src/app/explodetool';
import { installLocalization } from '../../src/app/i18n';
import { translate } from '../../site/i18n.mjs';

const ROOT = join(__dirname, '../..');
const LANGS = ['ko', 'en', 'ja', 'zh-CN', 'de'];
const noop = (): void => {};

// ───────────────────────── 표(소스 글) ─────────────────────────

/** 판정: error 받지 못한 글이 칸에 남음(칸에 오류를 잇는다) · revert 보이던 값으로 되돌리고 알림 · any 어떤 값도 받음 · none 받을 수 없는 값을 넣을 길 없음 · out 숨은 파일 칸(값을 치지 않음) */
type Verdict = 'error' | 'revert' | 'any' | 'none' | 'out';
const TABLE: [site: string, verdict: Verdict, what: string][] = [
  ['src/app/explodebar.ts input.explode-num[text]', 'error', '분해 거리 칸 — 받지 못한 글이 칸에 남는 동안 aria-invalid + 알림 글 설명(242차), 떠나면 되돌림 + 알림'],
  ['src/app/sectionbar.ts input.section-num[number]', 'revert', '단면 위치 숫자 칸 — 빈 칸·읽지 못한 글은 보이던 위치로 되돌리고 경고 알림(155차), 범위 밖 수는 코어가 받는 값'],
  ['src/app/propsview.ts input.dlg-input[number]', 'revert', '밀도 직접 입력 — 0·음수·읽지 못한 글은 보이던 값으로 되돌리고 경고 알림(155차)'],
  ['src/app/panel.ts input.tree-filter[search]', 'any', '이름 거르기 — 어떤 글도 받음(맞는 마디가 없으면 결과 안내 「맞는 마디가 없습니다.」)'],
  ['src/app/app.ts input.explode-slider[range]', 'none', '분해 정도 밀대(0~100 — 브라우저가 범위 안으로만)'],
  ['src/app/sectionbar.ts input.section-slider[range]', 'none', '단면 위치 밀대(0~1000)'],
  ['src/app/dialog.ts select.dlg-select[select]', 'none', '고르기 칸(selectRow — 표시 설정·그림 저장·속성 탭 재질, 목록 안 값만)'],
  ['src/app/panelview.ts input[checkbox]', 'none', '레이어 보이기(켬·끔)'],
  ['src/app/pmiview.ts input[checkbox]', 'none', '표현 PMI 모두 보이기'],
  ['src/app/pmiview.ts input[checkbox]', 'none', '표현 PMI 줄 보이기'],
  ['src/app/treeview.ts input[checkbox]', 'none', '부품 보이기'],
  ['src/app/app.ts input[file]', 'out', '파일 열기(숨은 칸 — 열지 못한 파일은 오류 알림)'],
  ['src/app/explodetool.ts input.explode-file[file]', 'out', '손질 불러오기(숨은 칸 — 받지 못한 파일은 경고 알림)'],
];
/** 오류 글·맞춤 칸의 처리 코드(그대로인지) */
const PROOF: [file: string, re: RegExp][] = [
  ['src/app/explodebar.ts', /this\.distInput\.setAttribute\('aria-invalid', 'true'\);\s*this\.distInput\.setAttribute\('aria-describedby', this\.distError\.id\)/],
  ['src/app/explodetool.ts', /this\.host\.toast\(msg, 'warn', 5000\);\s*(?:\/\/[^\n]*\n\s*)*this\.field\?\.invalid\?\.\(msg\)/],
  ['src/app/sectionbar.ts', /this\.num\.value = this\.shown;\s*this\.host\.toast\?\.\('단면 위치를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오\.'/],
  ['src/app/propsview.ts', /inp\.value = shown;\s*host\.toast\?\.\('밀도를 바꾸지 않았습니다 — 0보다 큰 수를 쳐 넣으십시오\(g\/cm³\)\.'/],
];

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (n.endsWith('.ts')) out.push(p);
  }
  return out;
}
const SOURCES = tsFiles(join(ROOT, 'src')).map((f) => [relative(ROOT, f), readFileSync(f, 'utf8')] as const);

/** 값을 받는 칸을 만드는 자리(파일 · 칸 꼴 — input은 type·class, 속성 묶음은 그 문장 끝 쌍반점까지) */
function fieldSites(): string[] {
  const out: string[] = [];
  for (const [f, t] of SOURCES)
    for (const m of t.matchAll(/\bh\(\s*'(input|select|textarea)'\s*,\s*\{/g)) {
      const attrs = t.slice(m.index, t.indexOf(';', m.index));
      const type = /\btype:\s*'(\w+)'/.exec(attrs)?.[1] ?? m[1];
      const cls = /\bclass:\s*'([\w-]+)'/.exec(attrs)?.[1];
      out.push(`${f} ${m[1]}${cls ? `.${cls}` : ''}[${type}]`);
    }
  return out.sort();
}

describe('242차: 값을 받는 칸 표(소스 글)', () => {
  it('src에서 값을 받는 칸을 만드는 자리가 표와 같다(새 칸이면 받을 수 없는 값 처리를 보고 표에) — 다른 길(textarea·contenteditable·createElement·innerHTML·index.html)은 0', () => {
    expect(fieldSites()).toEqual(TABLE.map(([s]) => s).sort());
    const other: string[] = [];
    for (const [f, t] of SOURCES) {
      if (/createElement\(\s*['"](?:input|select|textarea)['"]/.test(t)) other.push(`${f} createElement`);
      if (/contentEditable\s*=|['"]contenteditable['"]\s*:|setAttribute\(\s*['"]contenteditable/.test(t)) other.push(`${f} contenteditable`);
      if (/<(?:input|select|textarea)\b/.test(t)) other.push(`${f} 글 마크업`);
    }
    expect(other).toEqual([]);
    expect(readFileSync(join(ROOT, 'index.html'), 'utf8')).not.toMatch(/<(?:input|select|textarea)\b/i);
    // 셈이 비지 않음: 쳐 넣는 칸 넷(오류 글 하나·맞춤 둘·모두 받음 하나)
    expect(TABLE.filter(([, v]) => v === 'error' || v === 'revert' || v === 'any').map(([, v]) => v)).toEqual(['error', 'revert', 'revert', 'any']);
  });

  it('오류 글·맞춤 칸의 처리 코드가 그대로다(분해 거리 칸 aria-invalid·설명, 단면·밀도 칸 되돌림 + 알림)', () => {
    for (const [file, re] of PROOF) expect(readFileSync(join(ROOT, file), 'utf8'), file).toMatch(re);
  });
});

// ───────────────────────── 분해 거리 칸(실제 손질 도구 + 실제 막대, 사건으로) ─────────────────────────

const box = (id: string, c: [number, number, number]): Mesh3d => ({
  id,
  positions: Float32Array.from([c[0] - 1, c[1] - 1, c[2] - 1, c[0] + 1, c[1] + 1, c[2] + 1, c[0] + 1, c[1] - 1, c[2] - 1]),
  indices: Uint32Array.from([0, 1, 2]),
  color: [0.7, 0.7, 0.7, 1],
});
const N = (name: string, meshIds: string[] = [], children: ProductNode[] = []): ProductNode => ({ name, productId: name, meshIds, children });

/** 손질 도구가 알리는 받지 못한 글(explodetool.ts TYPED_HELP·FRESH_HELP·방향 없음·너무 멂 — 있는 사전 열쇠) */
const LINE = '거리를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오(음수는 반대쪽, 25mm처럼 단위를 붙여도 됩니다).';
const FREE = '거리를 읽지 못했습니다 — ΔX; ΔY; ΔZ 세 수를 쳐 넣으십시오.';
const DIR = '아직 끈 방향이 없어 거리 하나로는 옮기지 못합니다 — 성분으로 쳐 넣으십시오.';
const FAR = '너무 멀어 옮기지 않았습니다 — 조립 대각선의 20배까지 옮깁니다.';

/** 문서 하나(부품 a·b, b를 고름)·손질 도구·분해 막대·알림 칸(앱 toast 꼴 — 경고는 role=status, 칸은 aria-live) */
function rig(axis: ExplodeAxis) {
  const meshes = [box('a', [-3, 0, 0]), box('b', [3, 0, 0])];
  const products = [N('R', [], [N('a', ['a']), N('b', ['b'])])];
  const doc = { id: 1, name: 'f.stp', size: 10, scene: { units: 'mm' }, products, vis: { pmiIds: new Set() }, explode: 0.5, selKey: '0/1', items: null, pick: null, body: null } as unknown as StepDoc;
  const plan = explodePlan(meshes, products, 'all', axis);
  const canvas = document.createElement('canvas');
  const viewer = { canvas, getCamera: () => ({ target: [0, 0, 0], distance: 40, yaw: 0, pitch: 0, projection: 'perspective', fovY: 0.7 }) } as unknown as Viewer3d;
  const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
  const host = {
    live: () => ({ doc, viewer }),
    opened: () => doc,
    setup: () => ({ mode: 'all', axis, view: null }),
    pick: () => null,
    select: noop,
    plan: () => plan,
    redraw: noop,
    looks: noop,
    toast: (m: string, kind = 'info') => void toasts.append(h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, h('span', {}, m))),
    menu: noop,
    aim: noop,
    fmt: () => new Fmt('mm'),
  } as unknown as TweakHost;
  const tool = new ExplodeTweakTool(host);
  const bar = new ExplodeControls(noop, noop, tool);
  const root = h('div', {}, toasts, ...bar.els);
  document.body.append(root);
  const input = root.querySelector<HTMLInputElement>('.explode-num')!;
  return {
    root,
    input,
    /** 끌기 없이 고른 것 옮기기 칸을 열고 들어간다(3D 보기에서 Enter — 앱 창 keydown이 손질 도구에 넘기는 길) */
    open: () => expect(tool.key('Enter', canvas)).toBe(true),
    /** 마지막 알림 글 */
    told: () => toasts.lastElementChild?.textContent ?? null,
    plan,
  };
}
const key = (el: HTMLElement, k: string): void => void el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
/** 쳐 넣고 Enter */
const type = (el: HTMLInputElement, s: string): void => {
  el.value = s;
  key(el, 'Enter');
};
/** 칸의 오류 표시: aria-invalid·설명 글(aria-describedby가 가리키는 칸 — 없으면 null, 가리킨 칸이 없으면 '?')·값·초점 */
const state = (el: HTMLInputElement) => {
  const id = el.getAttribute('aria-describedby');
  return { invalid: el.getAttribute('aria-invalid'), said: id ? (document.getElementById(id)?.textContent ?? '?') : null, value: el.value, focused: document.activeElement === el };
};

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** 그 언어가 되고 번역층이 가라앉을 때까지(ci-guard 13번 — 시간과 조건, labelname241 꼴) */
async function settle(code: string): Promise<void> {
  const end = Date.now() + 5000;
  while (document.documentElement.lang !== code && Date.now() < end) await tick();
  let changed = false;
  const watch = new MutationObserver(() => (changed = true));
  watch.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  for (let quiet = 0; quiet < 5 && Date.now() < end; ) {
    changed = false;
    await tick();
    quiet = changed ? 0 : quiet + 1;
  }
  watch.disconnect();
  expect(document.documentElement.lang).toBe(code);
}

beforeAll(async () => {
  // 번역층이 언어를 바꿀 때 받는 사전 조각을 미리(ci-guard 5번 — JSON이라 곁효과 없음)
  await Promise.all([import('../../site/locales/en.json'), import('../../site/locales/ja.json'), import('../../site/locales/zh-CN.json'), import('../../site/locales/de.json')]);
});

afterEach(() => {
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
});

describe('242차: 분해 거리 칸 — 받지 못한 글이 칸에 남으면 그 칸에 오류를 잇는다(다섯 언어)', () => {
  it.each(LANGS)('%s: Enter로 받지 못한 글 → (가) 경고 알림 글 (나) 칸에 aria-invalid와 같은 글 설명 (다) 그 글이 받는 꼴을 말함, 칸 이름은 그대로', async (code) => {
    const r = rig('x');
    history.replaceState(null, '', `/?lang=${code}`);
    const dispose = await installLocalization(r.root);
    try {
      await settle(code);
      r.open();
      // 칸 이름(끌기 없이 연 빈 칸 — 축 하나)은 그 언어 사전 값 그대로(오류 표시가 이름을 바꾸지 않음)
      const name = code === 'ko' ? '옮길 거리(숫자)' : translate('옮길 거리(숫자)', code);
      type(r.input, 'abc');
      await settle(code);
      const want = code === 'ko' ? LINE : translate(LINE, code);
      // (가) 글로(알림 칸 — status, aria-live)
      expect(r.told()).toBe(want);
      expect(r.root.querySelector('.toasts')!.getAttribute('aria-live')).toBe('polite');
      // (나) 칸에 이음: 받지 못한 글이 칸에 남고(고름 — 다시 쳐 넣게) aria-invalid, 설명 = 그 알림 글(언어마다 같은 사전 값)
      expect(state(r.input)).toEqual({ invalid: 'true', said: want, value: 'abc', focused: true });
      expect([r.input.selectionStart, r.input.selectionEnd]).toEqual([0, 3]);
      expect(r.input.getAttribute('aria-label')).toBe(name);
      // 설명 칸은 숨은 글(보이는 글은 알림 칸) — 화면 읽기 이음만
      expect(document.getElementById(r.input.getAttribute('aria-describedby')!)!.hidden).toBe(true);
      // (다) 고칠 길: 받는 꼴(수 하나·음수·단위)
      expect(LINE).toContain('수 하나를 쳐 넣으십시오');
      if (code !== 'ko') expect(want).not.toMatch(/[가-힣]/);
    } finally {
      dispose();
    }
  });

  it('칸에 남는 동안만 — 고쳐 쓰면(input)·떠나면(보일 값으로 되돌림)·Esc·맞는 값이면 뗀다. 알림 글은 방향마다 받는 꼴(너무 멂·방향 없음·성분 수), 막대마다 따로', () => {
    const r = rig('x');
    r.open();
    expect(state(r.input)).toEqual({ invalid: null, said: null, value: '', focused: true });
    // 너무 멂: 범위(조립 대각선의 20배)를 알린다
    type(r.input, String(Math.ceil(r.plan.size * 20 + 1)));
    expect(state(r.input)).toMatchObject({ invalid: 'true', said: FAR, focused: true });
    expect(r.told()).toBe(FAR);
    // 고쳐 쓰면 뗀다(앞 글의 오류 — 다시 Enter로 건다)
    r.input.value = '9';
    r.input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(state(r.input)).toEqual({ invalid: null, said: null, value: '9', focused: true });
    // 떠나면 보일 값으로 되돌리고 뗀다(되돌린 값이 칸에 보임 — 알림은 이미 나감)
    type(r.input, 'abc');
    expect(state(r.input)).toMatchObject({ invalid: 'true', said: LINE });
    r.input.blur();
    expect(state(r.input)).toEqual({ invalid: null, said: null, value: '', focused: false });
    // Esc: 쳐 넣던 것을 버리고 칸을 떠난다 — 뗀다
    r.open();
    type(r.input, '1;2;3;4');
    expect(state(r.input)).toMatchObject({ invalid: 'true', said: LINE });
    key(r.input, 'Escape');
    expect(state(r.input)).toEqual({ invalid: null, said: null, value: '', focused: false });
    // 맞는 값: 걸고 칸을 떠난다 — 오류 표시 없음
    r.open();
    type(r.input, 'abc');
    type(r.input, '12');
    expect(state(r.input)).toEqual({ invalid: null, said: null, value: '12', focused: false });
    // 사방(끌기 없이 연 빈 칸 — 다른 막대): 수 하나는 방향이 없다고, 개수가 틀리면 세 수를 — 설명은 제 막대의 글 칸(id가 막대마다 하나)
    const f = rig('free');
    f.open();
    type(f.input, '5');
    expect(state(f.input)).toMatchObject({ invalid: 'true', said: DIR, focused: true });
    type(f.input, '1;2');
    expect(state(f.input)).toMatchObject({ invalid: 'true', said: FREE, focused: true });
    expect(f.input.getAttribute('aria-describedby')).not.toBe(r.input.getAttribute('aria-describedby') ?? '');
    expect(state(r.input).invalid).toBeNull();
    // 이 막대도 떠나면 되돌리고 뗀다
    f.input.blur();
    expect(state(f.input)).toEqual({ invalid: null, said: null, value: '', focused: false });
  });
});
