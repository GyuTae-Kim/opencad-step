/**
 * 분해 손질 도구(분해 조각 안 — 첫 화면 JS 밖): 부품 끌기(끌기 손짓 explodedrag.ts → 끌 단위·끄는 길·덧이동 explodetweak.ts),
 * 옮기기 켜고 끄기, 한 단계·모두 되돌리기, 보기 링크의 손질(exm) 만들기·받기, 최근 문서 항목에 손질 남기기·받기.
 * 앱은 TweakHost로 뷰어·문서·분해 상태와 고르기·다시 걸기·알림을 건네고, 키(Esc·Ctrl+Z)·길게 누르기·링크·파일 열기에서 이것을 부른다.
 *
 * 끌기: 누른 자리를 고르고(누르기와 같은 반투명 너머 선택), 그 묶음의 끌 단위(dragUnits)를 정해 손질 단계를 연다. 고른 것 밖을 눌렀으면
 * 누르기처럼 그 부품을 고른다. 움직일 때마다 누른 점에서 끄는 길(dragConstraint — 분해 방향) 위로 옮긴 세계 이동을 그 방향 성분으로 바꿔
 * 단위마다 그 진행으로 나눠 담고 다시 건다(끈 점이 커서 아래에 온다). 떼면 되돌리기 한 단계, Esc·둘째 손가락·방향을 바꾸면 앞 자리로.
 */
import type { Pick3d, Viewer3d } from 'opencad-viewer3d';
import { selectionItemIds, type StepDoc } from './doc';
import type { ExplodeAxis, ExplodeMode, ExplodePlan, ExplodeView } from './explode';
import type { TweakHandlers, TweakState } from './explodebar';
import { ExplodeDrag } from './explodedrag';
import { canonicalTweaks, decodeTweakLink, dragConstraint, dragDelta, dragUnits, encodeTweakLink, ExplodeTweaks, tweakDims, TWEAK_LINK_MAX, tweakQuantum, worldComps, type DragConstraint } from './explodetweak';
import { cleanEntries, type RecentBackend } from './recent';

/** 앱이 건네는 것 */
export interface TweakHost {
  /** 손질할 수 있을 때 그 문서·뷰어(분해 막대가 열렸고 벌렸으며, 측정·면 고르기·여는 중이 아님) */
  live(): { doc: StepDoc; viewer: Viewer3d } | null;
  /** 분해 막대가 열린 문서(되돌리기·모두 되돌리기 — 0%여도) */
  opened(): StepDoc | null;
  /** 지금 분해 방식·방향·화면 방향 카메라 각 */
  setup(): { mode: ExplodeMode; axis: ExplodeAxis; view: ExplodeView | null };
  /** 화면 점(화면 좌표)의 고르기(누르기 알림과 같은 반투명 너머 선택) */
  pick(x: number, y: number, pointerType: string): Pick3d | null;
  /** 고른 것 밖을 눌러 끌 때 그 부품 고르기(누르기처럼 — 여러 개 고르기면 더한다) */
  select(p: Pick3d): void;
  /** 지금 방식·방향의 분해 계획 */
  plan(d: StepDoc): ExplodePlan;
  /** 겉모습 다시 걸기와 분해 막대 맞추기 */
  redraw(): void;
  /** 겉모습만 다시 걸기(끄는 동안 — 막대는 끝날 때) */
  looks(): void;
  toast(msg: string): void;
  /** 작업 메뉴(길게 눌러 잡은 부품을 움직이지 않고 뗐을 때) */
  menu(x: number, y: number): void;
  /** 최근 문서 저장소(항목에 손질을 둔다) */
  readonly recent: { readonly backend: RecentBackend | null };
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
  /** 끄는 중: 문서·방향·계획 카메라 각, 누른 점(세계), 끄는 단위(낱말·진행·처음 성분), 끄는 길, 이동 한도 */
  private g: { doc: StepDoc; axis: ExplodeAxis; view: ExplodeView | null; p0: number[]; units: { token: string; f: number; start: number[] }[]; path: DragConstraint; limit: number } | null = null;
  /** 손가락 길게 눌러 잡기 안내를 보였는지(이 창에서 한 번) */
  private hinted = false;

  constructor(private readonly host: TweakHost) {}

  /** 끌기 손짓을 뷰어 캔버스에 단다(정밀 조준 모듈 다음 — 한 번) */
  attach(canvas: HTMLElement): void {
    this.drag ??= new ExplodeDrag(canvas, {
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

  /** 손가락 길게 누르기에서 그 자리 부품 잡기(잡았으면 true) */
  grab(x: number, y: number): boolean {
    return !!this.drag?.grab(x, y);
  }

  /** 끄는 중이면 취소(앞 자리로) */
  cancel(): void {
    this.drag?.cancel();
  }

  /** 문서의 손질(없으면 만든다) */
  of(d: StepDoc): ExplodeTweaks {
    return (d.tweaks ??= new ExplodeTweaks());
  }

  /** 분해 막대 손질 칸 상태 */
  state(d: StepDoc | null, axis: ExplodeAxis): TweakState {
    const t = d?.tweaks;
    return { on: this.on, count: t?.count(axis) ?? 0, undo: !!t?.canUndo(axis) };
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

  /** 지금 방향의 손질 모두 지우기(한 단계 — 되돌리면 돌아온다). 지웠으면 true */
  reset(): boolean {
    const d = this.host.opened();
    if (!d?.tweaks || this.g || !d.tweaks.clear(this.host.setup().axis)) return false;
    this.changed(d);
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

  /** 끌기 시작(끌기 손짓에서 — 화면 좌표). 끌 것이 없으면 false(코어가 돌려 본다) */
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
    };
    if (pointerType === 'touch' && !this.hinted) {
      this.hinted = true;
      this.host.toast('끌어 옮기십시오 — 움직이지 않고 떼면 작업 메뉴입니다.');
    }
    return true;
  }

  /** 끄는 동안: 누른 점에서 끄는 길 위로 옮긴 만큼을 단위마다 그 진행으로 나눠 담고 다시 건다 */
  private moveTo(x: number, y: number): void {
    const g = this.g;
    const l = this.host.live();
    // 그사이 분해를 접었거나 문서·방향이 바뀌었으면 그만둔다
    if (!g || !l || l.doc !== g.doc || this.host.setup().axis !== g.axis || !g.doc.tweaks) {
      if (g) this.cancel();
      return;
    }
    const r = l.viewer.canvas.getBoundingClientRect();
    const dd = dragDelta(l.viewer.getCamera(), r.width, r.height, g.path, g.p0, x - r.left, y - r.top, g.limit);
    if (!dd) return;
    const c = worldComps(g.axis, g.view, dd);
    for (const u of g.units) g.doc.tweaks.put(u.token, u.start.map((s, i) => s + c[i]! / u.f));
    this.host.looks();
  }

  /** 끌기 끝: commit이면 되돌리기 한 단계로 남기고(최근 문서 항목에도), 아니면 앞 자리로 */
  private end(commit: boolean): void {
    const g = this.g;
    this.g = null;
    const t = g?.doc.tweaks;
    if (!g || !t) return;
    if (!commit) t.cancel();
    else if (t.commit()) this.save(g.doc);
    this.host.redraw();
  }
}
