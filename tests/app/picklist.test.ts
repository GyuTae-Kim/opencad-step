// @vitest-environment jsdom
/**
 * 겹친 것 고르기 목록(64차 — picklist.ts·ctxmenu.ts contextAt, 코어 0.47.0 pickCandidates):
 * - 코어 후보(앞 면 뒤의 것이 차례로)를 앱 고르기로 묶는다: 첫째는 누르기와 같은 고르기(고르기 단위), 둘째부터는 가상 커서 Tab으로 돌려 고른 것과 같은 고르기(B-rep 면·모서리),
 *   여러 개 고르기는 모두 고르기 단위(켜고 끄기), 같은 고른 것은 하나, 잘린 면은 뺀다. 줄 이름은 종류(화면 글)와 나무 이름(파일 글 — 번역하지 않는다)
 * - 줄을 고르면 앱 누르기 알림에 같은 사건 — 둘째부터 cycle: 실제 코어 가상 커서로 Tab·Enter한 고르기·사건과 같다
 * - 작업 메뉴(오른쪽 누르기·길게 누르기·가상 커서 Shift+F10): 줄이 둘 이상이면 맨 위 "겹친 것 고르기…" → 같은 자리 목록(role=menu). 목록에서 고른 뒤 같은 자리에서 다시 열면
 *   그 고른 것을 그대로 둔다(앞의 것으로 되돌리지 않는다). 측정 중·여는 중이면 열지 않는다
 * - 가상 커서를 켠 동안 3D 보기의 Shift+F10·메뉴 키는 커서 자리(keysnap.ts menuAt)
 * - 65차 묶음 열쇠(pickGroup — 코어 0.53.0 group): 목록·가상 커서 Tab 후보가 B-rep 면·모서리 단위(여러 개 고르기는 고르기 단위)이고 한도 16이 묶음 수 —
 *   구 10개(구마다 앞뒤 두 번)·가는 핀(윗면 원 모서리 선분 16개)에서 기본 도형 단위는 뒤의 것을 놓치고, 묶음 차례는 기본 도형 차례에서 같은 열쇠의 처음 것만 남긴 것이다.
 *   줄마다 다른 면인 장면은 줄 차례·열쇠·표시가 64차와 같다
 * - 65차 줄 미리 강조: 줄에 초점이 가거나 마우스가 오르면 그 줄을 고를 때의 강조(rowHi)를 3D에, 닫으면 앱이 기억한 강조(hi)로 — 고른 것은 그대로, 줄을 고르면 되돌린 뒤 고르기
 * - 네 언어 사전
 */
import { afterEach, describe, expect, it } from 'vitest';
import { samePickTarget, type Pick3d, type PickEvent, type Viewer3d } from 'opencad-viewer3d';
import { catalogs, translate } from '../../site/i18n.mjs';
import { stepToScene } from '../../src/index';
import { touchPointerEvent } from '../../src/app/aim';
import { contextAt, contextItems, type CtxPointHost } from '../../src/app/ctxmenu';
import { createDoc, productKeyOf, resetSelection, selectionItemIds, toggledItems, unitItemIds, type PickUnit, type StepDoc } from '../../src/app/doc';
import { faceAt, faceDetails } from '../../src/app/faces';
import type { Hi } from '../../src/app/hipaint';
import { installKeySnap } from '../../src/app/keysnap';
import { closeMenu } from '../../src/app/menu';
import { PICK_LIST_MAX, pickGroup, pickItems, pickRows, rowEvent, rowHi, selectionKey, type PickRow } from '../../src/app/picklist';
import { cube, cylinder, sphere, StepText } from '../stepText';
import { jsdomViewer, VIEW_H, VIEW_W } from './jsdomview';

const CODES = ['en', 'ja', 'zh-CN', 'de'] as const;
const hangul = /[가-힣]/;

/** 위아래로 겹친 두 부품(위 front z 20~30, 아래 back z 0~10)의 조립 */
function stacked(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const front = w.product('front', [w.ax2([0, 0, 0]), cube(w, 10, [0, 0, 20], 'front-body').solid], ctx);
  const back = w.product('back', [w.ax2([0, 0, 0]), cube(w, 10, [0, 0, 0], 'back-body').solid], ctx);
  const root = w.product('asm', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, front, w.ax2([0, 0, 0]), 'front-1');
  w.place(root, back, w.ax2([0, 0, 0]), 'back-1');
  return w.bytes();
}

/** 위에서 보면 같은 자리에 겹친 구 n개(부품마다 — 구 하나가 B-rep 면 하나, 위에서 누르면 구마다 앞뒤 두 번 맞는다) */
function balls(n: number): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const root = w.product('asm', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
  for (let i = 0; i < n; i++) w.place(root, w.product(`ball${i}`, [w.ax2([0, 0, 0]), sphere(w, 4, `ball${i}-body`)], ctx), w.ax2([0, 0, 10 * i]), `ball${i}-1`);
  return w.bytes();
}

/** 큰 판(40) 위의 아주 가는 핀(반지름 0.3 — 위에서 보면 몇 화소라 손가락 허용 거리 안에 윗면 원 모서리 선분이 모두 든다) */
function pinOnPlate(): Uint8Array {
  const w = new StepText();
  const ctx = w.context();
  const plate = w.product('plate', [w.ax2([0, 0, 0]), cube(w, 40, [-20, -20, -40], 'plate-body').solid], ctx);
  const pin = w.product('pin', [w.ax2([0, 0, 0]), cylinder(w, 0.3, 1, 'pin-body')], ctx);
  const root = w.product('asm', [w.ax2([0, 0, 0])], ctx, 'SHAPE_REPRESENTATION');
  w.place(root, plate, w.ax2([0, 0, 0]), 'plate-1');
  w.place(root, pin, w.ax2([0, 0, 0]), 'pin-1');
  return w.bytes();
}

const scene = stepToScene(stacked(), { name: 's.stp' });
/** 누를 자리(캔버스 가운데에서 비켜 — 정사각형 면의 대각선 위가 아니게. 가상 커서로는 → 세 번·↓ 한 번) */
const X = VIEW_W / 2 + 15;
const Y = VIEW_H / 2 + 5;

let restore: (() => void) | null = null;
afterEach(() => {
  closeMenu();
  restore?.();
  restore = null;
  document.body.innerHTML = '';
});

function setup(keyboard = false, bytes?: Uint8Array) {
  const j = jsdomViewer({ keyboard });
  restore = j.restore;
  const sc = bytes ? stepToScene(bytes, { name: 's.stp' }) : scene;
  j.viewer.setScene(sc);
  j.viewer.setView('top');
  j.viewer.fit(false);
  const d = createDoc('s.stp', 1, { scene: sc, ms: 1 });
  return { v: j.viewer, d, sc };
}

/** 앱이 고른 뒤 그리는 강조(app.ts onPick·toggleInSelection의 paint와 같은 규칙) */
function appHi(d: StepDoc, wantFace: boolean): Hi {
  if (d.face) return { face: d.face };
  if (d.items) return { ids: d.items.ids };
  return { ids: d.pick ? (d.selKey && !wantFace ? selectionItemIds(d) : [d.pick.id]) : null };
}

/** 앱 onPick을 줄인 것(app.ts — 면 고르기·cycle이면 B-rep 면, 몸체 단위면 그물, 아니면 나무 마디) */
function appPick(d: StepDoc, p: Pick3d | null, wantFace: boolean, unit: PickUnit): void {
  resetSelection(d);
  d.pick = p;
  if (!p) return;
  const body = unit === 'body' && !wantFace;
  d.selKey = body || d.vis.pmiIds.has(p.id) ? null : productKeyOf(d.products, p.id);
  if (wantFace && p.kind === 'mesh' && !p.section) {
    const t = d.faces!.tables[d.faces!.tableOf.get(p.id)!]!;
    const f = faceAt(t, p.raw ?? p.index);
    d.face = f < 0 ? null : faceDetails(d.scene.meshes.find((m) => m.id === p.id)!, t, f, d.faces!.kinds);
  }
}

/** contextAt에 줄 앱 흉내: 누르기 알림(pickCb)은 앱 갈래(여러 개 고르기·cycle)대로, 부른 것을 calls에 */
function host(v: ReturnType<typeof setup>['v'], d: StepDoc, o: { faceMode?: boolean; multiPick?: boolean; unit?: PickUnit; touch?: boolean } = {}) {
  const calls: string[] = [];
  const events: [Pick3d | null, PickEvent][] = [];
  const unit: PickUnit = o.faceMode ? 'face' : (o.unit ?? 'part');
  const H = {
    viewer: v,
    doc: d,
    loading: null,
    measuring: false,
    touch: !!o.touch,
    faceMode: !!o.faceMode,
    multiPick: !!o.multiPick,
    pickUnit: unit,
    pickThrough: false,
    explodeOpen: false,
    explodeAxis: 'free',
    tweakTool: null,
    ctxFace: null,
    hi: {} as Hi,
    groups: () => [],
    onPick: (p: Pick3d | null, wantFace = !!o.faceMode) => {
      calls.push(`onPick ${p?.id}`);
      appPick(d, p, wantFace, unit);
      H.hi = appHi(d, wantFace);
    },
    toggleInSelection: (ids: readonly string[]) => {
      calls.push(`toggle ${ids.join()}`);
      const list = toggledItems(selectionItemIds(d), ids);
      resetSelection(d);
      d.items = list.length ? { ids: list, label: 'x' } : null;
      H.hi = appHi(d, false);
    },
    findFace: (dd: StepDoc, p: Pick3d) => {
      const t = dd.faces!.tables[dd.faces!.tableOf.get(p.id)!]!;
      const f = faceAt(t, p.raw ?? p.index);
      return f < 0 ? null : faceDetails(dd.scene.meshes.find((m) => m.id === p.id)!, t, f, dd.faces!.kinds);
    },
    pickCb: (p: Pick3d | null, e: PickEvent) => {
      events.push([p, e]);
      if (o.multiPick && !o.faceMode) {
        if (p) H.toggleInSelection(unitItemIds(d.products, p.id, unit));
      } else H.onPick(p, !!o.faceMode || !!e.cycle);
    },
  } as Record<string, unknown> & { hi: Hi; toggleInSelection(ids: readonly string[]): void; onPick(p: Pick3d | null, w?: boolean): void };
  const proxied = new Proxy(H, { get: (t, k) => (k in t ? t[k as string] : (...a: unknown[]) => calls.push(`${String(k)}${a.length ? ` ${a.length}` : ''}`)) }) as unknown as CtxPointHost;
  return { H: proxied, calls, events };
}

const menuEl = () => [...document.querySelectorAll<HTMLElement>('.menu')].at(-1)!;
const items = () => [...menuEl().querySelectorAll<HTMLButtonElement>('.menu-item')];
const texts = () => items().map((b) => [...b.querySelectorAll('.menu-label, .menu-file')].map((s) => s.textContent).join(' | '));
const candidates = (v: ReturnType<typeof setup>['v'], pointerType = 'touch') => v.pickCandidates(X, Y, { pointerType, throughTranslucent: false, max: PICK_LIST_MAX });
/** 65차 묶음 열쇠를 준 후보(contextAt·가상 커서와 같은 선택) */
const grouped = (v: Viewer3d, H: Parameters<typeof pickGroup>[0], x = X, y = Y, pointerType = 'touch') =>
  v.pickCandidates(x, y, { pointerType, throughTranslucent: false, max: PICK_LIST_MAX, group: (p) => pickGroup(H, p) });
/** 후보 열쇠(묶지 않는 후보는 기본 도형마다 다른 열쇠) */
const keyOf = (H: Parameters<typeof pickGroup>[0], p: Pick3d): string => pickGroup(H, p) ?? `${p.kind}:${p.id}:${p.raw ?? p.index}:${p.section ? 's' : ''}`;
/** 기본 도형 후보에서 같은 열쇠의 처음 것만 남긴 열쇠 차례 */
const firstKeys = (H: Parameters<typeof pickGroup>[0], ps: readonly Pick3d[]): string[] => [...new Set(ps.map((p) => keyOf(H, p)))];
const PART: PickRowHostLike = { faceMode: false, multiPick: false, pickUnit: 'part' };
type PickRowHostLike = Parameters<typeof pickRows>[2];

describe('pickRows: 코어 후보 → 앱 고르기로 묶은 줄', () => {
  it('부품 단위: 첫째는 부품 전체(누르기와 같다), 둘째부터는 B-rep 면(앞 부품 아랫면·뒤 부품 윗면·아랫면) — 이름은 "#STEP 번호 · 나무 이름"', () => {
    const { v, d } = setup();
    const picks = candidates(v);
    expect(picks.map((p) => [p.kind, scene.meshes.findIndex((m) => m.id === p.id)])).toEqual([
      ['mesh', 0],
      ['mesh', 0],
      ['mesh', 1],
      ['mesh', 1],
    ]);
    const rows = pickRows(d, picks, PART);
    expect(rows.map((r) => [r.index, r.label])).toEqual([
      [0, '부품 전체'],
      [1, '평면'],
      [2, '평면'],
      [3, '평면'],
    ]);
    expect(rows[0]!.file).toBe('front · front-1');
    expect(rows[0]!.key).toBe(`n:${productKeyOf(d.products, picks[0]!.id)}`);
    expect(rows.slice(1).map((r) => r.file.replace(/^#\d+ · /, ''))).toEqual(['front · front-1', 'back · back-1', 'back · back-1']);
    for (const r of rows.slice(1)) expect(r.key).toMatch(/^f:/);
    // 아무것도 고르지 않았다
    expect(rows.some((r) => r.checked)).toBe(false);
    // 앞 부품을 고르면 첫 줄
    appPick(d, picks[0]!, false, 'part');
    expect(selectionKey(d)).toBe(rows[0]!.key);
    expect(pickRows(d, picks, PART).map((r) => r.checked)).toEqual([true, false, false, false]);
  });

  it('면 고르기: 모두 B-rep 면, 고른 면이 표시, 몸체 단위의 첫 줄은 몸체(그물 이름)', () => {
    const { v, d } = setup();
    const picks = candidates(v);
    const face = pickRows(d, picks, { faceMode: true, multiPick: false, pickUnit: 'face' });
    expect(face.map((r) => r.label)).toEqual(['평면', '평면', '평면', '평면']);
    expect(new Set(face.map((r) => r.key)).size).toBe(4);
    appPick(d, picks[2]!, true, 'face');
    expect(pickRows(d, picks, { faceMode: true, multiPick: false, pickUnit: 'face' }).map((r) => r.checked)).toEqual([false, false, true, false]);
    const body = pickRows(d, picks, { faceMode: false, multiPick: false, pickUnit: 'body' });
    expect(body.map((r) => [r.label, r.key.slice(0, 2)])).toEqual([
      ['몸체', 'b:'],
      ['평면', 'f:'],
      ['평면', 'f:'],
      ['평면', 'f:'],
    ]);
    expect(body[0]!.file).toBe(scene.meshes[0]!.name);
  });

  it('여러 개 고르기: 고르기 단위(부품)로 묶어 둘(앞·뒤 부품), 고른 것에 든 부품이 ✓, 메뉴 항목은 켜고 끄기', () => {
    const { v, d } = setup();
    const picks = candidates(v);
    const multi = { faceMode: false, multiPick: true, pickUnit: 'part' as const };
    let rows = pickRows(d, picks, multi);
    expect(rows.map((r) => [r.index, r.label, r.file])).toEqual([
      [0, '부품 전체', 'front · front-1'],
      [2, '부품 전체', 'back · back-1'],
    ]);
    d.items = { ids: unitItemIds(d.products, picks[2]!.id, 'part'), label: 'x' };
    rows = pickRows(d, picks, multi);
    expect(rows.map((r) => r.checked)).toEqual([false, true]);
    const its = pickItems(rows, true, () => {});
    expect(its.map((it) => [it.label, it.file, it.checked, it.toggle])).toEqual([
      ['부품 전체', 'front · front-1', false, true],
      ['부품 전체', 'back · back-1', true, true],
    ]);
  });

  it('잘린 면은 빼고(그 뒤의 면이 같은 부품), 빈 곳은 줄 없음', () => {
    const { v, d } = setup();
    v.setSectionAxis('z', 0.9);
    const picks = candidates(v);
    expect(picks[0]!.section).toBe(true);
    const rows = pickRows(d, picks, PART);
    expect(rows.every((r) => !r.pick.section)).toBe(true);
    expect(rows[0]!.index).toBe(1);
    v.setSection(null);
    expect(pickRows(d, v.pickCandidates(2, 2, { pointerType: 'touch' }), PART)).toEqual([]);
  });

  it('rowEvent: 첫째는 cycle 없음, 둘째부터 cycle { index, count } — 한 번 누르기', () => {
    const r = (index: number) => ({ index }) as PickRow;
    expect(rowEvent(r(0), 4, 'mouse')).toEqual({ altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, clicks: 1, button: 0, pointerType: 'mouse' });
    expect(rowEvent(r(2), 4, 'keyboard')).toMatchObject({ clicks: 1, pointerType: 'keyboard', cycle: { index: 2, count: 4 } });
  });
});

describe('가상 커서 Tab·Enter와 같은 고르기(실제 코어)', () => {
  it('k번째 줄을 고른 사건·고르기 = 가상 커서를 그 자리에 두고 Tab k번·Enter한 onPick(65차 — 둘 다 같은 묶음 열쇠)', () => {
    const { v, d } = setup(true);
    const H = { doc: d, ...PART };
    installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false, group: (p) => pickGroup(H, p) });
    const key = (k: string, o: KeyboardEventInit = {}) => v.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
    const got: [Pick3d | null, PickEvent][] = [];
    v.onPick((p, e) => got.push([p, e]));
    const rows = pickRows(d, grouped(v, H, X, Y, 'keyboard'), PART);
    expect(rows.length).toBe(4);
    for (const k of [0, 1, 2, 3]) {
      got.length = 0;
      // 커서 켜기(가운데) → 오른쪽 세 번·아래 한 번 = (X, Y)
      key('ArrowRight');
      for (let i = 0; i < 3; i++) key('ArrowRight');
      key('ArrowDown');
      expect(v.keyboardCursor).toMatchObject({ x: X, y: Y });
      for (let i = 0; i < k; i++) key('Tab');
      key('Enter');
      key('Escape');
      expect(got).toHaveLength(1);
      const [p, e] = got[0]!;
      const row = rows.find((r) => r.index === k)!;
      expect(samePickTarget(p!, row.pick), `row ${k}`).toBe(true);
      const ev = rowEvent(row, rows.length, 'keyboard');
      expect(e.cycle).toEqual(ev.cycle);
      expect(e.pointerType).toBe(ev.pointerType);
    }
  });

  it('구 10개: 가상 커서 Tab 후보 수가 묶음 수(10 — 열쇠가 없으면 16), Tab k번·Enter = 목록 k번째 줄의 고르기', () => {
    const { v, d } = setup(true, balls(10));
    const H = { doc: d, ...PART };
    // 묶음 열쇠를 켜고 끄는 앱(끄면 열쇠가 undefined — 묶지 않는다)
    let on = false;
    const ks = installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false, group: (p) => (on ? pickGroup(H, p) : undefined) });
    const key = (k: string) => v.canvas.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    const at = () => {
      key('ArrowRight');
      for (let i = 0; i < 3; i++) key('ArrowRight');
      key('ArrowDown');
      return v.keyboardCursor!;
    };
    // 열쇠 없음(64차 — 코어 기본 도형 단위): 구마다 앞뒤 두 후보로 한도 16
    expect(at().count).toBe(16);
    key('Escape');
    on = true;
    ks.sync();
    const c = at();
    expect(c.count).toBe(10);
    const rows = pickRows(d, grouped(v, H, c.x, c.y, 'keyboard'), PART);
    expect(rows).toHaveLength(10);
    key('Escape');
    const got: [Pick3d | null, PickEvent][] = [];
    v.onPick((p, e) => got.push([p, e]));
    for (const k of [0, 4, 9]) {
      got.length = 0;
      at();
      for (let i = 0; i < k; i++) key('Tab');
      key('Enter');
      key('Escape');
      expect(samePickTarget(got[0]![0]!, rows[k]!.pick), `row ${k}`).toBe(true);
      expect(got[0]![1].cycle).toEqual(rowEvent(rows[k]!, rows.length, 'keyboard').cycle);
    }
  });
});

describe('묶음 열쇠(65차 — pickGroup, 코어 0.53.0 group)', () => {
  it('구 10개(구마다 B-rep 면 하나): 기본 도형 단위는 구마다 앞뒤 두 후보라 16개가 구 8개뿐, 묶음은 구마다 한 후보로 10개 모두 — 줄도 부품·면·여러 개 고르기 모두 10', () => {
    const { v, d, sc } = setup(false, balls(10));
    const top = v.project([0, 0, 90])!;
    const [x, y] = [top.x + 15, top.y + 5];
    const H = { doc: d, ...PART };
    const raw = v.pickCandidates(x, y, { pointerType: 'touch', max: PICK_LIST_MAX });
    const grp = grouped(v, H, x, y);
    expect(raw).toHaveLength(16);
    expect(new Set(raw.map((p) => p.id)).size).toBe(8);
    expect(grp).toHaveLength(10);
    expect(new Set(grp.map((p) => p.id)).size).toBe(10);
    // 같은 앞뒤 차례: 묶음 차례는 기본 도형 차례에서 같은 열쇠의 처음 것만 남긴 것(그 뒤까지 더 본다), 첫 후보는 같다(누르기와 같은 고르기)
    expect(grp.map((p) => keyOf(H, p)).slice(0, 8)).toEqual(firstKeys(H, raw));
    expect(samePickTarget(grp[0]!, raw[0]!)).toBe(true);
    expect(grp.map((p) => sc.meshes.findIndex((m) => m.id === p.id))).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    // 부품 단위 줄: 64차는 첫 구의 뒤쪽 맞음이 그 구 면 줄이 되어 9줄(뒤 두 구는 빠짐), 65차는 첫 구 부품 + 뒤 구 9개 면
    expect(pickRows(d, raw, PART)).toHaveLength(9);
    const rows = pickRows(d, grp, PART);
    expect(rows.map((r) => r.key[0])).toEqual(['n', 'f', 'f', 'f', 'f', 'f', 'f', 'f', 'f', 'f']);
    // 면 고르기·여러 개 고르기(고르기 단위 열쇠 — 한 부품이 한 후보)도 10줄
    const F = { doc: d, faceMode: true, multiPick: false, pickUnit: 'face' as const };
    expect(pickRows(d, grouped(v, F, x, y), F).map((r) => r.label)).toEqual(Array(10).fill('구 면'));
    const M = { doc: d, faceMode: false, multiPick: true, pickUnit: 'part' as const };
    const gm = grouped(v, M, x, y);
    expect(gm.map((p) => pickGroup(M, p))).toEqual(rows.map((r) => `n:${productKeyOf(d.products, r.pick.id)}`));
    expect(pickRows(d, gm, M)).toHaveLength(10);
    expect(pickRows(d, raw, M)).toHaveLength(8);
  });

  it('가는 핀(면 고르기 — 윤곽선도 고른다): 기본 도형 단위는 윗면 원 모서리 선분 16개가 후보를 채워 줄이 하나, 묶음은 모서리·면마다 하나로 핀 윗면·아랫면 원·판 면까지 6줄', () => {
    const { v, d } = setup(false, pinOnPlate());
    v.setPickEdges(true);
    const top = v.project([0, 0, 1])!;
    const [x, y] = [top.x + 0.6, top.y + 0.4];
    const F = { doc: d, faceMode: true, multiPick: false, pickUnit: 'face' as const };
    const raw = v.pickCandidates(x, y, { pointerType: 'touch', max: PICK_LIST_MAX });
    expect(raw).toHaveLength(16);
    expect(raw.every((p) => p.kind === 'edge')).toBe(true);
    expect(new Set(raw.map((p) => pickGroup(F, p))).size).toBe(1);
    expect(pickRows(d, raw, F)).toHaveLength(1);
    const grp = grouped(v, F, x, y);
    expect(grp.map((p) => keyOf(F, p))[0]).toEqual(firstKeys(F, raw)[0]);
    const rows = pickRows(d, grp, F);
    expect(rows.map((r) => r.key[0])).toEqual(['e', 'f', 'e', 'f', 'f', 'f']);
    expect(rows.map((r) => r.label)).toEqual(['원호 모서리', '평면', '원호 모서리', '평면', '평면', '평면']);
    expect(new Set(rows.map((r) => r.key)).size).toBe(6);
  });

  it('줄마다 다른 면인 장면(겹친 상자 둘): 묶음 열쇠가 있어도 줄 차례·열쇠·표시가 64차와 같다(부품·몸체·면 고르기·여러 개 고르기)', () => {
    const { v, d } = setup();
    const modes = [PART, { faceMode: false, multiPick: false, pickUnit: 'body' as const }, { faceMode: true, multiPick: false, pickUnit: 'face' as const }, { faceMode: false, multiPick: true, pickUnit: 'part' as const }];
    for (const m of modes) {
      const H = { doc: d, ...m };
      const raw = pickRows(d, candidates(v), m);
      const grp = pickRows(d, grouped(v, H), m);
      expect(grp.map((r) => [r.key, r.label, r.file, r.checked]), JSON.stringify(m)).toEqual(raw.map((r) => [r.key, r.label, r.file, r.checked]));
      // 한 줄을 고른 뒤에도 표시가 같다
      appPick(d, grp.at(-1)!.pick, m.faceMode || grp.length > 1, m.pickUnit);
      expect(pickRows(d, grouped(v, H), m).map((r) => r.checked)).toEqual(pickRows(d, candidates(v), m).map((r) => r.checked));
      resetSelection(d);
    }
    // 잘린 면은 묶지 않는다(열쇠 없음 — 그 뒤 같은 그물 면 후보를 걷어 내지 않게), 문서가 없으면 묶지 않는다
    v.setSectionAxis('z', 0.9);
    const cut = candidates(v)[0]!;
    expect(cut.section).toBe(true);
    expect(pickGroup({ doc: d, ...PART }, cut)).toBeUndefined();
    expect(pickGroup({ doc: null, ...PART }, cut)).toBeUndefined();
  });
});

describe('목록 줄 미리 강조(65차 — rowHi·openPickList)', () => {
  /** 뷰어 강조 세 길 부름 기록 */
  function spy(v: Viewer3d): string[] {
    const log: string[] = [];
    const hl = v.highlight.bind(v);
    const hr = v.highlightRanges.bind(v);
    const hs = v.setHighlightSegments.bind(v);
    v.highlight = (ids) => (log.push(`hi ${ids ? [...ids].join(',') : '-'}`), hl(ids));
    v.highlightRanges = (r) => (log.push(`ranges ${r ? JSON.stringify(r instanceof Map ? Object.fromEntries(r) : r) : '-'}`), hr(r));
    v.setHighlightSegments = (p, o) => (log.push(`segs ${p ? p.length : '-'}`), hs(p, o));
    return log;
  }
  /** 강조 기록 한 벌(세 길) → 짧은 글 */
  const last3 = (log: string[]): string => log.slice(-3).join(' / ');

  it('rowHi: 부품 줄은 그 부품 몸체 모두, 면 줄은 그 면(구간·경계 선), 몸체 단위 첫 줄은 몸체, 여러 개 고르기는 더하고 뺀 뒤의 고른 것 모두', () => {
    const { v, d } = setup();
    const picks = candidates(v);
    const rows = pickRows(d, picks, PART);
    const front = unitItemIds(d.products, picks[0]!.id, 'part');
    expect(rowHi(d, rows[0]!, PART)).toEqual({ ids: front });
    const f = rowHi(d, rows[2]!, PART).face!;
    expect(`f:${f.meshId}:${f.face}`).toBe(rows[2]!.key);
    expect(f.boundary.length).toBeGreaterThan(0);
    const body = { faceMode: false, multiPick: false, pickUnit: 'body' as const };
    expect(rowHi(d, pickRows(d, picks, body)[0]!, body)).toEqual({ ids: [picks[0]!.id] });
    const multi = { faceMode: false, multiPick: true, pickUnit: 'part' as const };
    const back = unitItemIds(d.products, picks[2]!.id, 'part');
    d.items = { ids: front, label: 'x' };
    const mr = pickRows(d, picks, multi);
    expect(rowHi(d, mr[1]!, multi)).toEqual({ ids: [...front, ...back] });
    expect(rowHi(d, mr[0]!, multi)).toEqual({ ids: [] });
  });

  it('작업 메뉴 → 목록: 연 줄·↓·마우스가 오른 줄을 3D에 미리 강조하고 고른 것·사건은 그대로, Esc로 닫으면 앱이 기억한 강조로, 줄을 고르면 되돌린 뒤 고르기', () => {
    const { v, d } = setup();
    const { H, events } = host(v, d);
    const log = spy(v);
    contextAt(H, X, Y);
    const picks = grouped(v, { doc: d, ...PART });
    const front = unitItemIds(d.products, picks[0]!.id, 'part').join(',');
    expect(H.hi).toEqual({ ids: unitItemIds(d.products, picks[0]!.id, 'part') });
    const sel = selectionKey(d);
    log.length = 0;
    items()[0]!.click();
    // 처음 초점 줄(지금 고른 첫 줄)
    expect(menuEl().getAttribute('aria-label')).toBe('겹친 것 고르기');
    expect(document.activeElement).toBe(items()[0]);
    expect(last3(log)).toBe(`hi ${front} / ranges - / segs -`);
    // ↓ → 둘째 줄(앞 부품 아랫면): 면 구간·경계 선, 항목 강조 없음
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items()[1]);
    expect(log.at(-3)).toBe('hi -');
    expect(log.at(-2)).toMatch(new RegExp(`^ranges \\{"${picks[0]!.id}":\\[\\{"start":\\d+,"count":2\\}\\]\\}$`));
    expect(log.at(-1)).toMatch(/^segs \d+$/);
    // 마우스가 오른 줄(넷째 — 뒤 부품 아랫면)은 초점도 옮긴다, 손가락은 옮기지 않는다
    items()[3]!.dispatchEvent(touchPointerEvent('pointermove', 7, 10, 10, 'mouse'));
    expect(document.activeElement).toBe(items()[3]);
    expect(log.at(-2)).toMatch(new RegExp(`^ranges \\{"${picks[2]!.id}":`));
    items()[2]!.dispatchEvent(touchPointerEvent('pointermove', 8, 10, 10, 'touch'));
    expect(document.activeElement).toBe(items()[3]);
    // 고른 것·사건은 그대로
    expect(selectionKey(d)).toBe(sel);
    expect(events).toHaveLength(0);
    // Esc: 닫고 앱이 기억한 강조(앞 부품)로
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.menu')).toBeNull();
    expect(last3(log)).toBe(`hi ${front} / ranges - / segs -`);
    // 다시 열어 셋째 줄 Enter(click): 닫으며 되돌린 뒤 앱 누르기 알림(cycle 2)
    contextAt(H, X, Y);
    items()[0]!.click();
    const ev = events.length;
    let atPick = '';
    const cb = H.pickCb!;
    (H as unknown as { pickCb: typeof cb }).pickCb = (p, e) => {
      atPick = last3(log);
      cb(p, e);
    };
    items()[2]!.focus();
    items()[2]!.click();
    expect(atPick).toBe(`hi ${front} / ranges - / segs -`);
    expect(events.length).toBe(ev + 1);
    expect(events.at(-1)![1].cycle).toEqual({ index: 2, count: 4 });
    expect(d.face?.meshId).toBe(picks[2]!.id);
    expect(H.hi.face?.meshId).toBe(picks[2]!.id);
  });

  it('여러 개 고르기: 줄 미리 강조는 그 줄을 더하거나 뺀 뒤의 고른 것(✓ 줄은 빠진 것), 닫으면 한 번만 되돌린다', () => {
    const { v, d } = setup();
    const { H } = host(v, d, { multiPick: true });
    const log = spy(v);
    contextAt(H, X, Y);
    const picks = grouped(v, { doc: d, faceMode: false, multiPick: true, pickUnit: 'part' });
    const front = unitItemIds(d.products, picks[0]!.id, 'part');
    const back = unitItemIds(d.products, picks[1]!.id, 'part');
    log.length = 0;
    items()[0]!.click();
    // 처음 초점 줄(✓ 앞 부품): 고르면 빼진다 — 강조 없음
    expect(last3(log)).toBe('hi - / ranges - / segs -');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(last3(log)).toBe(`hi ${[...front, ...back].join(',')} / ranges - / segs -`);
    closeMenu();
    expect(last3(log)).toBe(`hi ${front.join(',')} / ranges - / segs -`);
    const n = log.length;
    closeMenu();
    expect(log).toHaveLength(n);
  });
});

describe('작업 메뉴 contextAt', () => {
  it('맨 위 "겹친 것 고르기…" → 같은 자리 목록(이름은 파일 글 — 번역하지 않음), 줄을 고르면 앱 누르기 알림(cycle), 같은 자리에서 다시 열면 그 고른 것 그대로', () => {
    const { v, d } = setup();
    const { H, calls, events } = host(v, d);
    expect(contextAt(H, X, Y)).toBe(true);
    // 앞 부품을 고르고 연다
    expect(calls).toEqual([`onPick ${scene.meshes[0]!.id}`]);
    expect(menuEl().getAttribute('aria-label')).toBe('작업 메뉴');
    expect(items()[0]!.textContent).toBe('겹친 것 고르기…');
    expect(menuEl().children[1]!.className).toBe('menu-sep');
    items()[0]!.click();
    expect(menuEl().getAttribute('aria-label')).toBe('겹친 것 고르기');
    expect(menuEl().getAttribute('role')).toBe('menu');
    expect(texts().map((t) => t.replace(/#\d+/, '#n'))).toEqual(['부품 전체 | front · front-1', '평면 | #n · front · front-1', '평면 | #n · back · back-1', '평면 | #n · back · back-1']);
    expect(items().map((b) => [b.getAttribute('role'), b.getAttribute('aria-checked')])).toEqual([
      ['menuitemradio', 'true'],
      ['menuitemradio', 'false'],
      ['menuitemradio', 'false'],
      ['menuitemradio', 'false'],
    ]);
    const file = items()[2]!.querySelector('.menu-file')!;
    expect([file.getAttribute('translate'), file.classList.contains('ftext')]).toEqual(['no', true]);
    // 셋째 줄(뒤 부품 윗면) — 앱 누르기 알림에 cycle 2
    items()[2]!.click();
    expect(document.querySelector('.menu')).toBeNull();
    expect(events).toHaveLength(1);
    expect(events[0]![1]).toMatchObject({ clicks: 1, pointerType: 'touch', cycle: { index: 2, count: 4 } });
    expect(d.face?.meshId).toBe(scene.meshes[1]!.id);
    const chosen = selectionKey(d);
    // 같은 자리에서 다시: 고른 뒤 부품 면을 그대로 두고(앞 부품으로 되돌리지 않는다) 그 면에 대해 연다
    calls.length = 0;
    expect(contextAt(H, X, Y)).toBe(true);
    expect(calls).toEqual([]);
    expect(selectionKey(d)).toBe(chosen);
    expect(H.ctxFace?.face).toBe(d.face!.face);
    expect(H.ctxFace?.meshId).toBe(d.face!.meshId);
    items()[0]!.click();
    expect(items().map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
  });

  it('후보가 하나뿐이면(빈 곳·한 부품의 한 면 앞) 그 항목이 없다, 측정 중·여는 중이면 열지 않는다', () => {
    const { v, d } = setup();
    const { H } = host(v, d);
    expect(contextAt(H, 2, 2)).toBe(true);
    expect(texts()).not.toContain('겹친 것 고르기…');
    closeMenu();
    for (const k of ['measuring', 'loading'] as const) {
      const { H: h2 } = host(v, d);
      (h2 as unknown as Record<string, unknown>)[k] = k === 'loading' ? {} : true;
      expect(contextAt(h2, X, Y), k).toBe(false);
      expect(document.querySelector('.menu')).toBeNull();
    }
  });

  it('여러 개 고르기: 앞 부품을 더해 열고(전처럼), 목록은 부품 둘 — 고르면 그 부품을 더하고 빼기', () => {
    const { v, d } = setup();
    const { H, calls } = host(v, d, { multiPick: true });
    contextAt(H, X, Y);
    expect(calls[0]).toBe(`toggle ${unitItemIds(d.products, scene.meshes[0]!.id, 'part').join()}`);
    items()[0]!.click();
    expect(items().map((b) => [b.getAttribute('role'), b.getAttribute('aria-checked')])).toEqual([
      ['menuitemcheckbox', 'true'],
      ['menuitemcheckbox', 'false'],
    ]);
    items()[1]!.click();
    expect(selectionItemIds(d)).toEqual([scene.meshes[0]!.id, scene.meshes[1]!.id]);
  });

  it('손가락 기기: 접은 메뉴에서도 맨 위, 분해 손질의 옮기기 항목이 있으면 그 다음', () => {
    const { v, d } = setup();
    const { H } = host(v, d, { touch: true });
    contextAt(H, X, Y);
    expect(texts()[0]).toBe('겹친 것 고르기…');
    expect(texts().at(-1)).toBe('그 밖의 작업…');
    closeMenu();
    const rows = pickRows(d, candidates(v), PART);
    const tw = { moveItem: () => ({ label: '거리로 옮기기…', run: () => {} }), menuItems: () => [] };
    const H2 = new Proxy(H, { get: (t, k) => (k === 'explodeOpen' ? true : k === 'tweakTool' ? tw : (t as unknown as Record<string, unknown>)[k as string]) }) as CtxPointHost;
    const its = contextItems(H2, null, { x: X, y: Y }, { rows, multi: false, choose: () => {} });
    expect(its.slice(0, 3).map((it) => `${it.sep ? '| ' : ''}${it.label}`)).toEqual(['거리로 옮기기…', '| 겹친 것 고르기…', '| 숨기기']);
  });
});

describe('가상 커서 Shift+F10·메뉴 키(keysnap.ts menuAt)', () => {
  it('커서를 켠 동안만 커서 자리(client 좌표)로 부르고 키 기본 동작을 막는다 — 꺼져 있거나 Ctrl·⌘·Alt와 함께면 부르지 않는다', () => {
    const { v } = setup(true);
    const at: [number, number][] = [];
    installKeySnap(v, { tr: (ko) => ko, pickThrough: () => false, menuAt: (x, y) => (at.push([x, y]), true) });
    const key = (k: string, o: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o });
      v.canvas.dispatchEvent(e);
      return e;
    };
    expect(key('F10', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(at).toEqual([]);
    key('ArrowRight');
    key('ArrowRight');
    expect(key('F10', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(key('ContextMenu').defaultPrevented).toBe(true);
    expect(key('F10').defaultPrevented).toBe(false);
    expect(key('F10', { shiftKey: true, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(at).toEqual([
      [VIEW_W / 2 + 5, VIEW_H / 2],
      [VIEW_W / 2 + 5, VIEW_H / 2],
    ]);
  });
});

describe('네 언어 사전', () => {
  it('목록·줄 종류 글이 네 사전에 있고 한글이 남지 않는다', () => {
    for (const ko of ['겹친 것 고르기…', '겹친 것 고르기', '부품 전체', '몸체', '선 형상', '점 형상', '평면', '원기둥 면', '직선 모서리'])
      for (const code of CODES) {
        expect(catalogs[code][ko], `${code} ${ko}`).toBeTruthy();
        expect(translate(ko, code)).not.toMatch(hangul);
      }
  });
});
