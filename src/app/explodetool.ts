/**
 * 분해 손질 도구(분해 조각 안 — 첫 화면 JS 밖): 부품 끌기(끌기 손짓 explodedrag.ts → 끌 단위·끄는 길·덧이동 explodetweak.ts),
 * 옮기기 켜고 끄기, 한 단계·모두 되돌리기와 다시 하기(38차), 보기 링크의 손질(exm) 만들기·받기, 최근 문서 항목에 손질 남기기·받기,
 * 손질 파일 내보내기·불러오기(38차 — 꼴과 받는 규칙은 explodefile.ts), 끄는 동안 옮긴 거리 글(38차).
 * 앱은 TweakHost로 뷰어·문서·분해 상태와 고르기·다시 걸기·알림·파일 건네기를 건네고, 키(Esc·Ctrl+Z·Ctrl+Shift+Z)·길게 누르기·링크·파일 열기에서 이것을 부른다.
 *
 * 끌기: 누른 자리를 고르고(누르기와 같은 반투명 너머 선택), 그 묶음의 끌 단위(dragUnits)를 정해 손질 단계를 연다. 고른 것 밖을 눌렀으면
 * 누르기처럼 그 부품을 고른다. 움직일 때마다 누른 점에서 끄는 길(dragConstraint — 분해 방향) 위로 옮긴 세계 이동을 그 방향 성분으로 바꿔
 * 단위마다 그 진행으로 나눠 담고 다시 건다(끈 점이 커서 아래에 온다). 떼면 되돌리기 한 단계, Esc·둘째 손가락·방향을 바꾸면 앞 자리로.
 * 끄는 동안 이번 끌기로 누른 점이 옮긴 거리를 측정 글상자와 같은 수 꼴로 커서 곁(손가락은 손가락 위)에 보인다(dragDistanceLines·dragLabelSpot).
 */
import type { Pick3d, Viewer3d } from 'opencad-viewer3d';
import { selectionItemIds, type StepDoc } from './doc';
import { h } from './dom';
import type { ExplodeAxis, ExplodeMode, ExplodePlan, ExplodeView } from './explode';
import type { TweakHandlers, TweakState } from './explodebar';
import { ExplodeDrag } from './explodedrag';
import { importedAxis, importedView, makeTweakFile, matchTweakFile, readTweakFile, tweakFileName, tweakFileText } from './explodefile';
import {
  canonicalTweaks,
  decodeTweakLink,
  dragConstraint,
  dragDelta,
  dragDistanceLines,
  dragLabelSpot,
  dragUnits,
  encodeTweakLink,
  ExplodeTweaks,
  tweakDims,
  TWEAK_LINK_MAX,
  tweakQuantum,
  worldComps,
  type DragConstraint,
  type LenFormat,
} from './explodetweak';
import { stemName } from './files';
import { cleanEntries, type RecentBackend } from './recent';

/** 앱이 건네는 것 */
export interface TweakHost {
  /** 손질할 수 있을 때 그 문서·뷰어(분해 막대가 열렸고 벌렸으며, 측정·면 고르기·여는 중이 아님) */
  live(): { doc: StepDoc; viewer: Viewer3d } | null;
  /** 분해 막대가 열린 문서(되돌리기·모두 되돌리기 — 0%여도) */
  opened(): StepDoc | null;
  /** 지금 분해 방식·방향·화면 방향 카메라 각 */
  setup(): { mode: ExplodeMode; axis: ExplodeAxis; view: ExplodeView | null };
  /** 캔버스 점(캔버스 기준 CSS 화소 — 코어 pick과 같다)의 고르기(누르기 알림과 같은 반투명 너머 선택) */
  pick(x: number, y: number, pointerType: string): Pick3d | null;
  /** 고른 것 밖을 눌러 끌 때 그 부품 고르기(누르기처럼 — 여러 개 고르기면 더한다) */
  select(p: Pick3d): void;
  /** 지금 방식·방향의 분해 계획 */
  plan(d: StepDoc): ExplodePlan;
  /** 겉모습 다시 걸기와 분해 막대 맞추기 */
  redraw(): void;
  /** 겉모습만 다시 걸기(끄는 동안 — 막대는 끝날 때) */
  looks(): void;
  /** 알림(조각마다 따로 번역되게 여러 문장은 목록으로) */
  toast(msg: string | string[], kind?: 'info' | 'warn' | 'error', ms?: number): void;
  /** 작업 메뉴(길게 눌러 잡은 부품을 움직이지 않고 뗐을 때) */
  menu(x: number, y: number): void;
  /** 최근 문서 저장소(항목에 손질을 둔다) */
  readonly recent: { readonly backend: RecentBackend | null };
  /** 파일 건네기(손가락 기기에서 파일 공유가 되면 공유 시트, 아니면 내려받기) */
  deliver(blob: Blob, name: string): Promise<'shared' | 'saved' | 'cancelled'>;
  /** 분해 방향(과 화면 방향이면 그 카메라 각)을 바꾼다 — 파일을 불러온 뒤(다시 걸기는 도구가 부른다) */
  aim(axis: ExplodeAxis, view: ExplodeView | null): void;
  /** 길이 수 꼴(측정 글상자와 같은 표시 단위·소수 자리) */
  fmt(): LenFormat;
}

/** 최근 문서 항목에 남긴 분해 손질(없거나 못 읽으면 null) */
export async function storedTweaks(b: RecentBackend | null, id: string): Promise<unknown> {
  try {
    return (b ? cleanEntries(await b.entries()) : []).find((e) => e.id === id)?.explode ?? null;
  } catch {
    return null;
  }
}

/** 최근 문서 항목에 분해 손질을 둔다(null이면 뺀다 — 항목이 없으면 하지 않는다). 두었으면 true */
export async function storeTweaks(b: RecentBackend | null, id: string, data: unknown): Promise<boolean> {
  try {
    const e = b ? cleanEntries(await b.entries()).find((x) => x.id === id) : undefined;
    if (!b || !e) return false;
    const base = { id: e.id, name: e.name, size: e.size, time: e.time };
    await b.touch(data && typeof data === 'object' ? { ...base, explode: data } : base);
    return true;
  } catch {
    return false;
  }
}

export class ExplodeTweakTool implements TweakHandlers {
  /** 옮기기(부품 바로 끌기 — 손가락은 꺼도 길게 눌러 끈다), 이 창에서 마지막에 고른 것 */
  on = false;
  private drag: ExplodeDrag | null = null;
  /** 끄는 중: 문서·방향·계획 카메라 각, 누른 점(세계), 끄는 단위(낱말·진행·처음 성분), 끄는 길, 이동 한도, 손가락인지(거리 글 자리) */
  private g: {
    doc: StepDoc;
    axis: ExplodeAxis;
    view: ExplodeView | null;
    p0: number[];
    units: { token: string; f: number; start: number[] }[];
    path: DragConstraint;
    limit: number;
    touch: boolean;
  } | null = null;
  /** 손가락 길게 눌러 잡기 안내를 보였는지(이 창에서 한 번) */
  private hinted = false;
  /** 끄는 동안 옮긴 거리 글(값 글 마디는 줄 차례대로), 그 이름 짜임 */
  private label: { el: HTMLElement; vals: Text[]; key: string } | null = null;
  /** 손질 파일 고르기 칸(처음 불러올 때 만든다) */
  private input: HTMLInputElement | null = null;

  constructor(private readonly host: TweakHost) {}

  /** 끌기 손짓을 뷰어에 단다(코어 포인터 맡기 훅 — 정밀 조준 모듈을 단 뒤, 한 번) */
  attach(viewer: Pick<Viewer3d, 'canvas' | 'setPointerClaim'>): void {
    this.drag ??= new ExplodeDrag(viewer, {
      direct: () => this.on && !!this.host.live(),
      start: (x, y, type) => this.start(x, y, type),
      move: (x, y) => this.moveTo(x, y),
      end: (commit) => this.end(commit),
      tap: (x, y) => this.host.menu(x, y),
    });
  }

  /** 부품을 끄는 중인지 */
  get dragging(): boolean {
    return !!this.drag?.dragging;
  }

  /** 손가락 길게 누르기에서 그 자리(화면 좌표) 부품 잡기(잡았으면 true) */
  grab(x: number, y: number, pointerId: number): boolean {
    return !!this.drag?.grab(x, y, pointerId);
  }

  /** 끄는 중이면 취소(앞 자리로) */
  cancel(): void {
    this.drag?.cancel();
  }

  /** 문서의 손질(없으면 만든다) */
  of(d: StepDoc): ExplodeTweaks {
    return (d.tweaks ??= new ExplodeTweaks());
  }

  /** 분해 막대 손질 칸 상태(any = 어느 방향에든 손질이 있다 — 파일로 내보낼 것) */
  state(d: StepDoc | null, axis: ExplodeAxis): TweakState {
    const t = d?.tweaks;
    return { on: this.on, count: t?.count(axis) ?? 0, undo: !!t?.canUndo(axis), redo: !!t?.canRedo(axis), any: !!t?.axes().length };
  }

  /** 옮기기 켜고 끄기(분해 막대 — 켜면 부품을 바로 끌고, 빈 곳을 끌면 예전처럼 돌려 본다) */
  move(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (!on) this.cancel();
    this.host.redraw();
    if (on) this.host.toast('부품을 끌어 분해 자리를 옮깁니다 — 빈 곳을 끌면 돌려 봅니다.');
  }

  /** 지금 방향의 손질 한 단계 되돌리기(분해 막대가 열려 있을 때). 되돌렸으면 true */
  undo(): boolean {
    const d = this.host.opened();
    if (!d?.tweaks || this.g || !d.tweaks.undo(this.host.setup().axis)) return false;
    this.changed(d);
    return true;
  }

  /** 지금 방향에서 되돌린 손질 한 단계 다시 하기(분해 막대가 열려 있을 때). 다시 했으면 true */
  redo(): boolean {
    const d = this.host.opened();
    if (!d?.tweaks || this.g || !d.tweaks.redo(this.host.setup().axis)) return false;
    this.changed(d);
    return true;
  }

  /** 지금 방향의 손질 모두 지우기(한 단계 — 되돌리면 돌아온다). 지웠으면 true */
  reset(): boolean {
    const d = this.host.opened();
    if (!d?.tweaks || this.g || !d.tweaks.clear(this.host.setup().axis)) return false;
    this.changed(d);
    return true;
  }

  /**
   * 문서의 분해 손질(모든 방향)을 JSON 파일로 건넨다(내려받기 — 손가락 기기는 공유 시트). 파일 이름은 문서 이름 줄기 + "-explode.json".
   * 건넸으면 true(손질이 없거나 끄는 중·공유를 그만두면 false)
   */
  async exportFile(d: StepDoc | null = this.host.opened()): Promise<boolean> {
    const t = d?.tweaks;
    if (!d || this.g) return false;
    const { axis, view } = this.host.setup();
    const f = t ? makeTweakFile(d, t, axis, view) : null;
    if (!f) {
      this.host.toast('내보낼 분해 손질이 없습니다.', 'warn');
      return false;
    }
    const dirs = Object.keys(f.axes).length;
    const n = Object.values(f.axes).reduce((s, l) => s + l!.length, 0);
    const how = await this.host.deliver(new Blob([tweakFileText(f)], { type: 'application/json' }), tweakFileName(stemName(d.name)));
    if (how === 'cancelled') return false;
    this.host.toast(how === 'shared' ? `분해 손질 파일을 공유했습니다(방향 ${dirs}개 · 손질 ${n}개).` : `분해 손질을 파일로 내보냈습니다(방향 ${dirs}개 · 손질 ${n}개).`);
    return true;
  }

  /** 손질 파일 고르기(불러오기 — 고르면 분해 막대가 열린 문서에 받는다) */
  pickFile(): void {
    let i = this.input;
    if (!i) {
      i = this.input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-hidden': 'true', tabindex: '-1', class: 'explode-file' });
      const input = i;
      input.addEventListener('change', () => {
        const f = input.files?.[0];
        input.value = '';
        if (f) void this.importFile(f);
      });
      document.body.append(input);
    }
    i.click();
  }

  /** 손질 파일 받기(파일 고르기·끌어다 놓기). 받았으면 true */
  async importFile(file: Blob, d: StepDoc | null = this.host.opened()): Promise<boolean> {
    let text = '';
    try {
      text = await file.text();
    } catch {
      /* 못 읽은 파일은 꼴이 틀린 것으로 알린다 */
    }
    return !!d && this.importText(d, text);
  }

  /**
   * 손질 파일 글 받기: 꼴이 틀리거나 판이 다르면 알리고 그대로, 같은 문서면 이 나무에 있는 손질을 모두, 다른 문서면 자리와 부품 이름이 맞는 것만
   * (explodefile.ts). 파일에 든 방향마다 그 방향의 손질을 파일대로 바꾸고(방향마다 되돌리기 한 단계), 내보낸 때의 방향(받았으면)으로 바꿔 보인다.
   * 받았으면 true
   */
  importText(d: StepDoc, text: string): boolean {
    const r = readTweakFile(text);
    if (r.kind !== 'ok') {
      this.host.toast(
        r.kind === 'version' ? `판 ${r.v}의 손질 파일이라 불러오지 않았습니다 — 이 앱은 판 1을 읽습니다.` : '손질 파일을 읽지 못했습니다 — 이 앱에서 내보낸 분해 손질 JSON이 아닙니다.',
        'warn',
        6000,
      );
      return false;
    }
    const f = r.file;
    const m = matchTweakFile(f, d, this.host.plan(d));
    if (!m.taken) {
      this.host.toast(m.same ? '이 파일에는 이 문서에 걸 손질이 없습니다 — 불러오지 않았습니다.' : '다른 문서에서 내보낸 손질이라 이 문서에 맞는 부품이 없습니다 — 불러오지 않았습니다.', 'warn', 6000);
      return false;
    }
    this.cancel();
    const t = this.of(d);
    for (const [a, list] of m.axes) t.replace(a, list);
    this.host.aim(importedAxis(f, m, this.host.setup().axis), importedView(f, m));
    this.changed(d);
    const msg = [`분해 손질을 불러왔습니다(방향 ${m.axes.length}개 · 손질 ${m.taken}개).`];
    if (!m.same) msg.unshift('다른 문서(이름·크기가 다름)에서 내보낸 손질이라 자리와 부품 이름이 맞는 것만 받았습니다.');
    if (m.skipped) msg.push(m.same ? `이 문서 나무에 없는 손질 ${m.skipped}개는 건너뛰었습니다.` : `맞지 않는 손질 ${m.skipped}개는 건너뛰었습니다.`);
    const plain = m.same && !m.skipped;
    this.host.toast(msg, plain ? 'info' : 'warn', plain ? 3500 : 7000);
    return true;
  }

  /** 보기 링크의 손질 글(지금 방향 것): 손질이 없으면 '', 글 한도(TWEAK_LINK_MAX와 max 가운데 작은 것)를 넘으면 null */
  link(d: StepDoc, max = TWEAK_LINK_MAX): string | null {
    const axis = this.host.setup().axis;
    const t = d.tweaks;
    return t?.count(axis) ? encodeTweakLink(t.moves(axis), tweakQuantum(this.host.plan(d).size), Math.min(max, TWEAK_LINK_MAX)) : '';
  }

  /** 보기 링크의 손질 받기: 이 문서 나무의 낱말로 맞춰 지금 방향의 손질을 바꾼다(되돌리기 한 단계 — 저장은 손질할 때) */
  applyLink(d: StepDoc, s: string): void {
    const axis = this.host.setup().axis;
    const entries = decodeTweakLink(s, tweakDims(axis));
    if (!entries) return;
    this.cancel();
    this.of(d).replace(axis, canonicalTweaks(this.host.plan(d), entries));
  }

  /** 최근 문서 항목에 남긴 손질 받기(손질·되돌리기가 없는 방향만 — 링크로 이미 받은 것은 그대로). 받았으면 true */
  async restore(d: StepDoc): Promise<boolean> {
    const data = d.recentKey ? await storedTweaks(this.host.recent.backend, d.recentKey) : null;
    return !!data && this.of(d).absorb(data);
  }

  /** 손질을 최근 문서 항목에 남긴다(파일 고르기·끌어다 놓기·최근 문서로 연 것 — 항목이 없으면 하지 않는다) */
  save(d: StepDoc): void {
    if (d.recentKey) void storeTweaks(this.host.recent.backend, d.recentKey, d.tweaks?.toJSON() ?? null);
  }

  private changed(d: StepDoc): void {
    this.host.redraw();
    this.save(d);
  }

  /** 끌기 시작(끌기 손짓에서 — 캔버스 좌표). 끌 것이 없으면 false(코어가 돌려 본다) */
  private start(x: number, y: number, pointerType: string): boolean {
    const l = this.host.live();
    if (!l || this.g) return false;
    const { doc: d, viewer: v } = l;
    const p = this.host.pick(x, y, pointerType);
    if (!p || p.kind === 'edge' || p.section || d.vis.pmiIds.has(p.id)) return false;
    const plan = this.host.plan(d);
    const inSel = selectionItemIds(d).includes(p.id);
    const units = dragUnits(plan, d.explode, p.id, inSel ? { node: d.selKey, ids: d.items?.ids ?? (d.body ? [d.body] : null) } : {});
    if (!units.length) return false;
    if (!inSel) this.host.select(p);
    const { axis } = this.host.setup();
    const view = plan.view ?? null;
    const t = this.of(d);
    const zero = new Array<number>(tweakDims(axis)).fill(0);
    t.begin(axis);
    this.g = {
      doc: d,
      axis,
      view,
      p0: [...p.point],
      units: units.map((u) => ({ token: u.token, f: u.f, start: [...(t.moves(axis).get(u.token) ?? zero)] })),
      path: dragConstraint(axis, view, v.getCamera()),
      // 조립 대각선의 20배 넘게는 끌지 않는다(비스듬히 본 축·면에서 튀지 않게)
      limit: plan.size * 20,
      touch: pointerType === 'touch',
    };
    if (pointerType === 'touch' && !this.hinted) {
      this.hinted = true;
      this.host.toast('끌어 옮기십시오 — 움직이지 않고 떼면 작업 메뉴입니다.');
    }
    return true;
  }

  /** 끄는 동안(캔버스 좌표): 누른 점에서 끄는 길 위로 옮긴 만큼을 단위마다 그 진행으로 나눠 담고 다시 건다 */
  private moveTo(x: number, y: number): void {
    const g = this.g;
    const l = this.host.live();
    // 그사이 분해를 접었거나 문서·방향이 바뀌었으면 그만둔다
    if (!g || !l || l.doc !== g.doc || this.host.setup().axis !== g.axis || !g.doc.tweaks) {
      if (g) this.cancel();
      return;
    }
    const r = l.viewer.canvas.getBoundingClientRect();
    const dd = dragDelta(l.viewer.getCamera(), r.width, r.height, g.path, g.p0, x, y, g.limit);
    if (!dd) return;
    const c = worldComps(g.axis, g.view, dd);
    for (const u of g.units) g.doc.tweaks.put(u.token, u.start.map((s, i) => s + c[i]! / u.f));
    this.host.looks();
    this.distance(l.viewer.canvas, x, y, dd);
  }

  /** 끌기 끝: commit이면 되돌리기 한 단계로 남기고(최근 문서 항목에도), 아니면 앞 자리로 */
  private end(commit: boolean): void {
    const g = this.g;
    this.g = null;
    this.label?.el.remove();
    this.label = null;
    const t = g?.doc.tweaks;
    if (!g || !t) return;
    if (!commit) t.cancel();
    else if (t.commit()) this.save(g.doc);
    this.host.redraw();
  }

  /** 옮긴 거리 글 보이기(캔버스 부모에 — 커서 오른쪽 아래, 손가락은 손가락 위). 이름 짜임이 같으면 값 글만 바꾼다 */
  private distance(canvas: HTMLElement, x: number, y: number, d: readonly number[]): void {
    const g = this.g;
    const parent = canvas.parentElement;
    if (!g || !parent) return;
    const lines = dragDistanceLines(g.axis, g.view, d, this.host.fmt());
    const key = lines.map((l) => l.map(([w]) => w).join(' ')).join('|');
    let lb = this.label;
    if (!lb || lb.key !== key || !lb.el.isConnected) {
      lb?.el.remove();
      const vals: Text[] = [];
      const row = (l: [string, string][]) =>
        h(
          'div',
          {},
          ...l.map(([w, v]) => {
            const t = document.createTextNode(v);
            vals.push(t);
            return h('span', { class: 'explode-dist-part' }, h('span', { class: 'explode-dist-key' }, w), ' ', t);
          }),
        );
      const el = h('div', { class: 'explode-dist', 'aria-hidden': 'true' }, ...lines.map(row));
      parent.append(el);
      lb = this.label = { el, vals, key };
    } else lines.flat().forEach(([, v], i) => (lb!.vals[i]!.nodeValue = v));
    const p = dragLabelSpot(x, y, lb.el.offsetWidth, lb.el.offsetHeight, canvas.clientWidth, canvas.clientHeight, g.touch);
    lb.el.style.transform = `translate(${Math.round(canvas.offsetLeft + p.left)}px, ${Math.round(canvas.offsetTop + p.top)}px)`;
  }
}
