// @vitest-environment jsdom
/**
 * 간섭 검사 묶음의 겹친 부피(검사 워커 — src/app/overlap.ts): 쌍을 찾으면 목록부터 보이고 "겹친 부피 계산 중…", 다 구하면 쌍 이름 줄 아래에
 * "겹친 부피 ≈ 부피 ±오차%"(어림 오차가 0이면 ± 없음, 전체 값은 title), 시간 한도로 못 구한 쌍 수·멈춤 안내, 네 언어 사전.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stepToScene } from '../../src/scene';
import { createDoc, resetSelection, type StepDoc } from '../../src/app/doc';
import { interferenceLabel, Panel, type PanelHost } from '../../src/app/panel';
import * as TV from '../../src/app/treeview';
import { Fmt } from '../../src/app/display';
import { findInterference, type InterferencePair } from '../../src/app/interference';
import { overlapVolumes } from '../../src/app/overlap';
import { cube, sphere, StepText } from '../stepText';
import { translate } from '../../site/i18n.mjs';

function host(extra: Record<string, unknown> = {}): PanelHost {
  return new Proxy({ measuring: false, measureKind: 'points', touch: false, fmt: new Fmt('mm'), isVisible: () => true, groups: () => [], ...extra } as Record<string, unknown>, {
    get: (t, k) => (k in t ? t[k as string] : () => {}),
  }) as unknown as PanelHost;
}

/** 겹친 두 정육면체(125 mm³ — 어림 오차 0)와 큰 상자 안의 구(곡면 — 어림 오차가 있다) */
function doc(): StepDoc {
  const w = new StepText();
  const mm = w.context('mm');
  const g = [w.ax2([0, 0, 0]), w.ax2([5, 5, 5]), w.ax2([100, 0, 0]), w.ax2([120, 20, 20])];
  const root = w.product('asm', g, mm, 'SHAPE_REPRESENTATION');
  w.place(root, w.product('a', [cube(w, 10).solid], mm), g[0]!, 'a');
  w.place(root, w.product('b', [cube(w, 10).solid], mm), g[1]!, 'b');
  w.place(root, w.product('box', [cube(w, 40).solid], mm), g[2]!, 'box');
  w.place(root, w.product('ball', [sphere(w, 4)], mm), g[3]!, 'ball');
  return createDoc('a.stp', 1, { scene: stepToScene(w.bytes(), { name: 'a.stp' }), ms: 1 });
}

/** 쌍 이름 줄 아래 겹친 부피 줄: 값 글과 title(앞 줄이 그 쌍 — has-vol) */
const chips = (el: HTMLElement) =>
  [...el.querySelectorAll('.vol-line')].map((c) => ({ text: c.querySelector('.vol-val')?.textContent, title: c.getAttribute('title'), label: c.firstElementChild?.textContent, after: c.previousElementSibling?.classList.contains('has-vol') }));
const hints = (el: HTMLElement) => [...el.querySelectorAll('.prop-group .hint')].map((p) => p.textContent);

describe('간섭 검사: 겹친 부피', () => {
  it('쌍을 찾으면 목록부터 "겹친 부피 계산 중…", 다 구하면 쌍마다 "≈ 부피 ±오차%"(오차 0이면 ± 없음)와 안내', () => {
    const d = doc();
    const meshes = d.scene.meshes;
    const result = findInterference(meshes);
    expect(result.pairs).toHaveLength(2);
    const panel = new Panel(host());
    document.body.append(panel.el);
    panel.show(d);
    // 워커가 쌍을 보낸 뒤(pairs) 겹친 부피를 구하는 동안
    d.interference = { running: true, done: 1, total: 2, result: structuredClone(result), phase: 'volume' };
    panel.onInterference();
    expect(panel.el.querySelectorAll('.prop-group .link-btn')).toHaveLength(2);
    expect(hints(panel.el)).toContain('겹친 부피 계산 중… 1 / 2');
    expect(chips(panel.el)).toEqual([]);
    expect([...panel.el.querySelectorAll('.prop-group .btn.small')].map((b) => b.textContent)).toContain('멈추기');
    // 다 구함(done)
    result.volumes = overlapVolumes(meshes, result.pairs);
    d.interference = { running: false, done: 0, total: 0, result };
    panel.onInterference();
    const c = chips(panel.el);
    expect(c).toHaveLength(2);
    // 안에 든 쌍(구)이 앞, 그다음 겹친 정육면체: 125 mm³ 그대로(어림 오차 0 — ± 없음)
    expect(c[1]).toEqual({ text: '≈ 125 mm³', title: '겹친 부피 ≈ 125 mm³ ± 0 mm³', label: '겹친 부피', after: true });
    expect(c[0]!.after).toBe(true);
    expect(c[0]!.text).toMatch(/^≈ 26\d\.\d+ mm³ ±0\.0*[1-9]\d?%$/);
    expect(c[0]!.title).toMatch(/^겹친 부피 ≈ 26\d\.\d+ mm³ ± 0\.\d+ mm³$/);
    const hs = hints(panel.el);
    expect(hs.some((t) => t?.startsWith('겹친 부피(≈)는'))).toBe(true);
    expect(hs.some((t) => t?.includes('계산 중'))).toBe(false);
    // 시간 한도로 못 구한 쌍, 멈춤
    d.interference = { running: false, done: 0, total: 0, result: { ...result, volumes: { done: 1, left: 1, ms: 4000 } }, stopped: true };
    panel.onInterference();
    expect(hints(panel.el)).toEqual(expect.arrayContaining(['시간 한도로 1쌍은 겹친 부피를 구하지 못했습니다.', '겹친 부피 계산을 멈췄습니다.']));
    // 네 언어 사전(틀 글의 {0}·{1} 자리 그대로)
    for (const code of ['en', 'ja', 'zh-CN', 'de'])
      for (const t of ['겹친 부피', '겹친 부피 계산 중…', '겹친 부피 ≈ 125 mm³ ± 0 mm³', hs.find((x) => x?.startsWith('겹친 부피(≈)는'))!, '시간 한도로 1쌍은 겹친 부피를 구하지 못했습니다.', '겹친 부피 계산을 멈췄습니다.'])
        expect(translate(t, code), `${code}: ${t}`).not.toMatch(/[가-힣]/);
    expect(translate('겹친 부피 ≈ 125 mm³ ± 0 mm³', 'en')).toBe('Overlap volume ≈ 125 mm³ ± 0 mm³');
    // 215차: 위 줄처럼 남은 쌍이 1이면 「für 1 Paare」로 읽혀 수를 끝에 둔 꼴로(같은 묶음 「그 밖 {0}쌍」 Nicht in die Liste aufgenommene Paare: {0}. 꼴 — tests/i18n-plural215.test.ts)
    expect(translate('시간 한도로 3쌍은 겹친 부피를 구하지 못했습니다.', 'de')).toBe('Paare, für die wegen des Zeitlimits kein Überlappungsvolumen berechnet wurde: 3.');
    expect(translate('시간 한도로 1쌍은 겹친 부피를 구하지 못했습니다.', 'de')).toBe('Paare, für die wegen des Zeitlimits kein Überlappungsvolumen berechnet wurde: 1.');
  });

  it('진행·쌍·겹친 부피·멈춤으로 묶음을 갈아 끼워도 그 안 초점은 새 묶음의 같은 칸으로(멈추기·쌍 단추 — 139차)', () => {
    const d = doc();
    const result = findInterference(d.scene.meshes);
    const panel = new Panel(host());
    document.body.append(panel.el);
    panel.show(d);
    const sec = () => [...panel.el.querySelectorAll<HTMLElement>('.prop-group')].find((s) => s.querySelector('h3')?.textContent === '간섭 검사')!;
    // 멈추기·결과 지우기는 묶음의 맨 끝 단추, 쌍 이름 단추는 그 앞
    const stop = () => [...sec().querySelectorAll<HTMLElement>('button')].at(-1)!;
    const pairs = () => [...sec().querySelectorAll<HTMLElement>('.link-btn')];
    // 검사 중(쌍 전): 멈추기에 초점 → 진행(100 ms마다)이 묶음을 갈아 끼워도 새 멈추기에
    d.interference = { running: true, done: 0, total: 0 };
    panel.onInterference();
    const first = stop();
    first.focus();
    d.interference = { running: true, done: 3, total: 10 };
    panel.onInterference();
    expect(stop()).not.toBe(first);
    expect(document.activeElement).toBe(stop());
    expect(stop().textContent).toBe('멈추기');
    // 쌍이 옴(앞에 쌍 단추 둘이 붙음): 멈추기 그대로
    const found = structuredClone(result);
    d.interference = { running: true, done: 0, total: 0, result: found, phase: 'volume' };
    panel.onInterference();
    expect(pairs()).toHaveLength(2);
    expect(document.activeElement).toBe(stop());
    // 둘째 쌍 단추에 초점 → 겹친 부피 진행에도 그 쌍 단추에
    const second = pairs()[1]!;
    second.focus();
    d.interference = { running: true, done: 1, total: 2, result: found, phase: 'volume' };
    panel.onInterference();
    expect(pairs()[1]).not.toBe(second);
    expect(document.activeElement).toBe(pairs()[1]);
    expect(pairs()[1]!.textContent).toBe(second.textContent);
    // 겹친 부피 계산 중 멈추기 → 쌍 목록은 남고 같은 단추(이제 결과 지우기)에
    stop().focus();
    d.interference = { running: false, done: 0, total: 0, result: structuredClone(result), stopped: true };
    panel.onInterference();
    expect(document.activeElement).toBe(stop());
    expect(stop().textContent).toBe('결과 지우기');
    // 초점이 묶음 밖(고른 탭)이면 그대로 둔다
    const tab = panel.el.querySelector<HTMLElement>('[role=tab][aria-selected=true]')!;
    tab.focus();
    d.interference = { running: false, done: 0, total: 0, result };
    panel.onInterference();
    expect(document.activeElement).toBe(tab);
    panel.el.remove();
  });

  it('「결과 지우기」·쌍 전 「멈추기」로 묶음째 빠지면 그 안 초점은 같은 일을 다시 하는 나무 도구 「간섭 검사」 버튼으로, 묶음 밖 초점은 그대로(142차)', () => {
    const d = doc();
    const result = findInterference(d.scene.meshes);
    // 앱 clearInterference 꼴: 쌍 전·결과 뒤에는 묶음을 지운다(겹친 부피 계산 중 멈추기는 쌍 목록을 남김 — 위 139차 시험)
    const panel: Panel = new Panel(
      host({
        clearInterference: () => {
          d.interference = undefined;
          panel.onInterference();
        },
      }),
    );
    document.body.append(panel.el);
    panel.show(d);
    const sec = () => [...panel.el.querySelectorAll<HTMLElement>('.prop-group')].find((s) => s.querySelector('h3')?.textContent === '간섭 검사');
    const last = () => [...sec()!.querySelectorAll<HTMLElement>('button')].at(-1)!;
    const check = () => [...panel.el.querySelectorAll<HTMLElement>('.tree-tools .btn')].find((b) => b.textContent === '간섭 검사')!;
    // 결과 뒤 「결과 지우기」: 묶음이 빠지고 초점은 그 위 나무 도구 줄의 「간섭 검사」로(전에는 53차 차례가 빠진 묶음 뒤 칸으로 — 여기서는 칸이 없어 body)
    d.interference = { running: false, done: 0, total: 0, result };
    panel.onInterference();
    last().focus();
    expect(last().textContent).toBe('결과 지우기');
    last().click();
    expect(sec()).toBeUndefined();
    expect(document.activeElement).toBe(check());
    // 검사 중 쌍이 오기 전 「멈추기」도 같다
    d.interference = { running: true, done: 3, total: 10 };
    panel.onInterference();
    expect(last().textContent).toBe('멈추기');
    last().focus();
    last().click();
    expect(sec()).toBeUndefined();
    expect(document.activeElement).toBe(check());
    // 초점이 묶음 밖이면(고른 탭 — 마우스로 눌러 그 버튼에 초점을 두지 않는 브라우저 등) 그대로
    d.interference = { running: false, done: 0, total: 0, result };
    panel.onInterference();
    const tab = panel.el.querySelector<HTMLElement>('[role=tab][aria-selected=true]')!;
    tab.focus();
    last().click();
    expect(sec()).toBeUndefined();
    expect(document.activeElement).toBe(tab);
    panel.el.remove();
  });

  it('검사하지 못한 오류 줄은 워커 알림으로 묶음을 갈아 끼울 때만 role=alert(화면 읽기 프로그램이 읽음), 탭을 다시 그리면 같은 오류를 다시 읽히지 않음(143차)', () => {
    const d = doc();
    const panel = new Panel(host());
    document.body.append(panel.el);
    panel.show(d);
    // 앱처럼 패널을 연 채 검사(156차부터 닫힌 패널·다른 탭이면 알림 상자가 알린다 — 아래 156차 시험)
    panel.setOpen(true);
    const err = () => [...panel.el.querySelectorAll<HTMLElement>('.prop-group .hint')].find((p) => p.textContent?.startsWith('검사하지 못했습니다'));
    const alerts = () => panel.el.querySelectorAll('.prop-group [role=alert]').length;
    // 앱 runInterference 꼴: 검사 중(처음은 탭째 그림) → 워커 오류(갈아 끼움 — 전에는 role·aria-live 없는 새 줄이라 읽히지 않았다)
    d.interference = { running: true, done: 0, total: 0 };
    panel.onInterference();
    expect(err()).toBeUndefined();
    expect(alerts()).toBe(0);
    d.interference = { running: false, done: 0, total: 0, error: '검사 워커가 멈췄습니다' };
    panel.onInterference();
    expect(err()!.textContent).toBe('검사하지 못했습니다: 검사 워커가 멈췄습니다');
    expect(err()!.getAttribute('role')).toBe('alert');
    expect(alerts()).toBe(1);
    // 탭을 다시 그리면(표시 단위·나무 펼치기·보이기 등) 같은 글, 다시 읽히지 않게 role 없음
    panel.redraw();
    expect(err()!.textContent).toBe('검사하지 못했습니다: 검사 워커가 멈췄습니다');
    expect(err()!.getAttribute('role')).toBeNull();
    // 다시 검사: 진행 줄은 알림이 아님(쌍 수는 앱 알림 상자가 알림)
    d.interference = { running: true, done: 3, total: 10 };
    panel.onInterference();
    expect(err()).toBeUndefined();
    expect(alerts()).toBe(0);
    panel.el.remove();
  });

  it('쌍이 200을 넘으면 목록은 200쌍까지, 머리 줄 「간섭」은 온 수, 목록 밑에 「그 밖 N쌍은 목록에 넣지 않았습니다.」(140차)', () => {
    const d = doc();
    const found = findInterference(d.scene.meshes);
    const cubes = found.pairs.find((p) => !p.inside)!;
    // 겹친 정육면체 쌍을 n개로 불린 결과(겹친 부피 없음 — 쌍마다 이름 줄 하나)
    const many = (n: number) => ({ ...found, tested: n, pairs: Array.from({ length: n }, (_, i) => ({ ...cubes, count: i + 1 })) });
    const panel = new Panel(host());
    document.body.append(panel.el);
    panel.show(d);
    const sec = () => [...panel.el.querySelectorAll<HTMLElement>('.prop-group')].find((s) => s.querySelector('h3')?.textContent === '간섭 검사')!;
    // 200쌍: 모두 보이고 안내 없음
    d.interference = { running: false, done: 0, total: 0, result: many(200) };
    panel.onInterference();
    expect(sec().querySelectorAll('.prop-row')).toHaveLength(200);
    expect(hints(panel.el).some((t) => t?.startsWith('그 밖'))).toBe(false);
    // 1,234쌍(겹친 부피 계산 중): 줄은 200, 머리 줄은 온 수, 200째 쌍 줄(쌍 목록의 끝 항목 — 151차) 바로 밑에 남은 수
    d.interference = { running: true, done: 3, total: 1234, result: many(1234), phase: 'volume' };
    panel.onInterference();
    const rows = sec().querySelectorAll('.prop-row');
    expect(rows).toHaveLength(200);
    expect(sec().querySelector('.hint')!.textContent).toContain('간섭 1,234');
    const list = rows[199]!.closest('[role=list]')!;
    expect(list.children).toHaveLength(200);
    expect(list.lastElementChild).toBe(rows[199]);
    const note = list.nextElementSibling!;
    expect(note.classList.contains('hint')).toBe(true);
    expect(note.textContent).toBe('그 밖 1,034쌍은 목록에 넣지 않았습니다.');
    // 네 언어 사전(수 자리 그대로, 영어·독일어는 1쌍도 단수·복수 없는 꼴)
    expect(['en', 'ja', 'zh-CN', 'de'].map((code) => translate(note.textContent!, code))).toEqual([
      'Pairs not listed: 1,034.',
      'ほかの 1,034 組は一覧に追加していません。',
      '其余 1,034 对未列入列表。',
      'Nicht in die Liste aufgenommene Paare: 1,034.',
    ]);
    expect([translate('그 밖 1쌍은 목록에 넣지 않았습니다.', 'en'), translate('그 밖 1쌍은 목록에 넣지 않았습니다.', 'de')]).toEqual(['Pairs not listed: 1.', 'Nicht in die Liste aufgenommene Paare: 1.']);
    panel.el.remove();
  });

  it('쌍 줄은 목록(role=list)으로 — 쌍마다 항목 하나(겹친 부피 줄이 없으면 이름 줄 자신, 있으면 두 줄을 담은 칸), 머리·안내·단추 줄은 목록 밖, 스타일시트는 목록 꼴과 무관(151차)', () => {
    const d = doc();
    const meshes = d.scene.meshes;
    const result = findInterference(meshes);
    const labels = result.pairs.map((p) => interferenceLabel(d, p));
    expect(labels).toHaveLength(2);
    const panel = new Panel(host());
    document.body.append(panel.el);
    panel.show(d);
    const sec = () => [...panel.el.querySelectorAll<HTMLElement>('.prop-group')].find((s) => s.querySelector('h3')?.textContent === '간섭 검사')!;
    const lists = () => [...sec().querySelectorAll<HTMLElement>('[role=list]')];
    const names = (el: Element) => [...el.querySelectorAll('.link-btn')].map((b) => b.textContent);
    // 겹친 부피 계산 중: 이름 줄 자신이 항목(감싸지 않음)
    d.interference = { running: true, done: 1, total: 2, result: structuredClone(result), phase: 'volume' };
    panel.onInterference();
    expect(lists()).toHaveLength(1);
    let list = lists()[0]!;
    expect([...list.children].map((c) => [c.getAttribute('role'), c.className])).toEqual([
      ['listitem', 'prop-row'],
      ['listitem', 'prop-row'],
    ]);
    expect(names(list)).toEqual(labels);
    expect(names(sec())).toEqual(labels);
    expect(list.querySelector('.hint, .btn, [role=list]')).toBeNull();
    expect(list.previousElementSibling!.textContent).toBe('겹친 부피 계산 중… 1 / 2');
    expect(list.nextElementSibling!.textContent).toMatch(/^안에 든 부품은/);
    // 겹친 부피를 다 구함: 쌍마다 이름 줄과 그 부피 줄을 담은 항목 칸(class 없음 — 부피 줄은 이름 줄 바로 뒤 형제 그대로)
    result.volumes = overlapVolumes(meshes, result.pairs);
    d.interference = { running: false, done: 0, total: 0, result };
    panel.onInterference();
    expect(lists()).toHaveLength(1);
    list = lists()[0]!;
    expect([...list.children].map((c) => [c.getAttribute('role'), c.getAttribute('class'), [...c.children].map((x) => x.className)])).toEqual([
      ['listitem', null, ['prop-row has-vol', 'vol-line']],
      ['listitem', null, ['prop-row has-vol', 'vol-line']],
    ]);
    expect(list.querySelectorAll('[role=listitem]')).toHaveLength(2);
    expect(names(list)).toEqual(labels);
    expect(chips(panel.el).map((c) => c.after)).toEqual([true, true]);
    expect(list.nextElementSibling!.textContent).toMatch(/^안에 든 부품은/);
    // 쌍이 없으면 목록도 없다
    d.interference = { running: false, done: 0, total: 0, result: { ...result, pairs: [] } };
    panel.onInterference();
    expect(lists()).toHaveLength(0);
    expect(hints(panel.el).some((t) => t?.startsWith('간섭을 찾지 못했습니다'))).toBe(true);
    panel.el.remove();
    // 스타일시트: 쌍 줄을 고르는 선택자는 클래스·자손뿐(자식·형제 결합자·차례 가상 클래스 없음), role로 꾸미는 규칙 없음, 묶음은 블록 — 감싼 칸이 모양을 바꾸지 않는다
    const css = readFileSync(join(__dirname, '../../src/app/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const sels = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => /prop-row|vol-line/.test(s));
    expect(sels.length).toBeGreaterThanOrEqual(7);
    for (const s of sels) expect(s).not.toMatch(/[>+~]|:(first|last|nth|only)-/);
    expect(css).not.toMatch(/\[role/);
    expect(/(?:^|\})\s*\.prop-group \{([^}]*)\}/.exec(css)![1]).not.toMatch(/display/);
  });

  it('검사하지 못한 오류는 패널이 열린 제품 탭이면 그 줄(role=alert)만, 패널이 닫혔거나 다른 탭이면 같은 글을 알림 상자 오류로(숨은 줄은 role 없음 — 156차, NC 144차 꼴)', () => {
    const d = doc();
    const toasts: unknown[][] = [];
    const panel = new Panel(host({ toast: (...a: unknown[]) => toasts.push(a) }));
    document.body.append(panel.el);
    panel.show(d);
    const err = () => [...panel.el.querySelectorAll<HTMLElement>('.prop-group .hint')].find((p) => p.textContent?.startsWith('검사하지 못했습니다'));
    const alerts = () => panel.el.querySelectorAll('.prop-group [role=alert]').length;
    // 앱 runInterference 꼴: 검사 중 → 워커 오류(오류 알림·워커 멈춤)
    const run = () => {
      d.interference = { running: true, done: 0, total: 0 };
      panel.onInterference();
    };
    const fail = (error: string) => {
      d.interference = { running: false, done: 0, total: 0, error };
      panel.onInterference();
    };
    // 패널이 열린 제품 탭: 줄만 알린다(143차), 알림 상자는 없음
    panel.setOpen(true);
    run();
    fail('검사 워커가 멈췄습니다');
    expect(err()!.getAttribute('role')).toBe('alert');
    expect(toasts).toEqual([]);
    // 검사 중 패널을 닫음(휴대폰은 아래 시트): 알림 상자 오류 한 번(글 조각 둘 — 번역층이 조각마다 옮김), 숨은 줄은 글 그대로·role 없음 — 다시 열어도 한 번 더 읽히지 않음
    run();
    panel.setOpen(false);
    fail('검사 워커가 멈췄습니다');
    expect(toasts).toEqual([[['검사하지 못했습니다:', '검사 워커가 멈췄습니다'], 'error', 9000]]);
    expect(err()!.textContent).toBe('검사하지 못했습니다: 검사 워커가 멈췄습니다');
    expect(err()!.getAttribute('role')).toBeNull();
    panel.setOpen(true);
    expect(alerts()).toBe(0);
    // 검사 중 다른 탭(속성): 알림 상자 오류 한 번, 제품 탭으로 돌아오면 줄은 role 없이 보임
    run();
    panel.setTab('props');
    fail('x');
    expect(toasts).toHaveLength(2);
    expect(toasts[1]).toEqual([['검사하지 못했습니다:', 'x'], 'error', 9000]);
    panel.setTab('tree');
    expect(err()!.textContent).toBe('검사하지 못했습니다: x');
    expect(alerts()).toBe(0);
    // 오류가 아닌 진행·결과는 패널이 닫혀 있어도 알림 상자로 보내지 않음(쌍 수는 앱이 따로 알림)
    panel.setOpen(false);
    run();
    d.interference = { running: false, done: 0, total: 0, result: findInterference(d.scene.meshes) };
    panel.onInterference();
    expect(toasts).toHaveLength(2);
    // 알림 상자의 두 조각은 사전에 있는 글(새 글 없음)
    expect(['검사하지 못했습니다:', '검사 워커가 멈췄습니다'].map((m) => translate(m, 'en'))).toEqual(['Could not check:', 'The check worker stopped']);
    panel.el.remove();
  });

  it('나무 탭에서 고르기가 바뀌면(쌍·다른 쌍·나무 줄·3D 보기·Esc·고르기 풀기) 쌍 버튼 강조(.sel·aria-current)가 지금 고름을 따르고, 쌍 묶음은 다시 그리지 않는다(184차)', () => {
    const d = doc();
    const result = findInterference(d.scene.meshes);
    const labels = result.pairs.map((p) => interferenceLabel(d, p));
    // 앱 꼴: 고름을 모두 풀고 새로 고른 뒤 패널에 알린다(showInterference·selectKey·onPick·clearSelection — 펼침이 그대로라 나무는 줄 표시만 고치는 길)
    const pick = (set: () => void) => {
      resetSelection(d);
      set();
      panel.onSelection();
    };
    const panel: Panel = new Panel(
      host({
        multiPick: false,
        showInterference: (p: InterferencePair) => pick(() => (d.items = { ids: [p.a, p.b], label: interferenceLabel(d, p) })),
        selectKey: (k: string | null) => pick(() => (d.selKey = k)),
      }),
    );
    panel.kit = TV;
    document.body.append(panel.el);
    d.interference = { running: false, done: 0, total: 0, result };
    panel.show(d);
    const sec = () => [...panel.el.querySelectorAll<HTMLElement>('.prop-group')].find((s) => s.querySelector('h3')?.textContent === '간섭 검사')!;
    const pairs = () => [...sec().querySelectorAll<HTMLElement>('.link-btn')];
    const marks = () => pairs().map((b) => [b.classList.contains('sel'), b.getAttribute('aria-current')]);
    const none = [
      [false, null],
      [false, null],
    ];
    const drawn = sec();
    const btns = pairs();
    expect(labels).toHaveLength(2);
    expect(btns.map((b) => b.textContent)).toEqual(labels);
    expect(marks()).toEqual(none);
    // 쌍 누르기: 그 쌍만 강조(전에는 묶음을 다시 그리지 않아 누른 쌍이 강조되지 않았다)
    btns[0]!.focus();
    btns[0]!.click();
    expect(d.items?.label).toBe(labels[0]);
    expect(marks()).toEqual([
      [true, 'true'],
      [false, null],
    ]);
    // 다른 쌍: 앞 강조가 풀리고 누른 쌍(전에는 앞 강조가 남았다)
    btns[1]!.focus();
    btns[1]!.click();
    expect(marks()).toEqual([
      [false, null],
      [true, 'true'],
    ]);
    // 같은 묶음·같은 버튼(다시 그리지 않음 — 초점 그대로)
    expect(sec()).toBe(drawn);
    expect(pairs().map((b, i) => b === btns[i])).toEqual([true, true]);
    expect(document.activeElement).toBe(btns[1]);
    // 나무 줄 누르기(마디 고르기 — 그린 줄이라 줄 표시만 고치는 길): 쌍 강조 풂
    panel.el.querySelector<HTMLElement>('.tree-row[data-key="0/0"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(d.selKey).toBe('0/0');
    expect(marks()).toEqual(none);
    // 3D 보기에서 누름(조상이 이미 펼쳐져 펼침 그대로): 쌍을 누른 뒤 부품을 누르면 쌍 강조 풂
    btns[0]!.click();
    expect(marks()[0]).toEqual([true, 'true']);
    pick(() => {
      d.pick = { kind: 'mesh', id: d.scene.meshes[0]!.id, index: 0, point: [0, 0, 0] } as unknown as StepDoc['pick'];
      d.selKey = '0/0';
    });
    expect(marks()).toEqual(none);
    // Esc·「고르기 풀기」·3D 빈 곳(clearSelection·onPick(null) — 고름 없음)
    btns[1]!.click();
    expect(marks()[1]).toEqual([true, 'true']);
    pick(() => {});
    expect(marks()).toEqual(none);
    expect(sec()).toBe(drawn);
    expect(pairs().map((b, i) => b === btns[i])).toEqual([true, true]);
    // 다시 그려도(표시 단위·펼치기 등 renderBody) .sel과 aria-current는 같은 자리에서, 보이는 글은 이름표 그대로
    btns[1]!.click();
    panel.redraw();
    expect(sec()).not.toBe(drawn);
    expect(marks()).toEqual([
      [false, null],
      [true, 'true'],
    ]);
    expect(pairs().map((b) => b.textContent)).toEqual(labels);
    panel.el.remove();
  });
});
