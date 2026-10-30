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
});
