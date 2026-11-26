// @vitest-environment jsdom
/**
 * 간섭 검사 묶음의 겹친 부피(검사 워커 — src/app/overlap.ts): 쌍을 찾으면 목록부터 보이고 "겹친 부피 계산 중…", 다 구하면 쌍 이름 줄 아래에
 * "겹친 부피 ≈ 부피 ±오차%"(어림 오차가 0이면 ± 없음, 전체 값은 title), 시간 한도로 못 구한 쌍 수·멈춤 안내, 네 언어 사전.
 */
import { describe, expect, it } from 'vitest';
import { stepToScene } from '../../src/scene';
import { createDoc, type StepDoc } from '../../src/app/doc';
import { Panel, type PanelHost } from '../../src/app/panel';
import { Fmt } from '../../src/app/display';
import { findInterference } from '../../src/app/interference';
import { overlapVolumes } from '../../src/app/overlap';
import { cube, sphere, StepText } from '../stepText';
import { translate } from '../../site/i18n.mjs';

function host(): PanelHost {
  return new Proxy({ measuring: false, measureKind: 'points', touch: false, fmt: new Fmt('mm'), isVisible: () => true, groups: () => [] } as Record<string, unknown>, {
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
    expect(translate('시간 한도로 3쌍은 겹친 부피를 구하지 못했습니다.', 'de')).toBe('Wegen des Zeitlimits wurde für 3 Paare kein Überlappungsvolumen berechnet.');
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
    // 1,234쌍(겹친 부피 계산 중): 줄은 200, 머리 줄은 온 수, 200째 쌍 줄 바로 밑에 남은 수
    d.interference = { running: true, done: 3, total: 1234, result: many(1234), phase: 'volume' };
    panel.onInterference();
    const rows = sec().querySelectorAll('.prop-row');
    expect(rows).toHaveLength(200);
    expect(sec().querySelector('.hint')!.textContent).toContain('간섭 1,234');
    const note = rows[199]!.nextElementSibling!;
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
});
