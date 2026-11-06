/**
 * 분해 손질 도구(분해 조각 안 — 첫 화면 JS 밖): 부품 끌기(끌기 손짓 explodedrag.ts → 끌 단위·끄는 길·덧이동 explodetweak.ts),
 * 옮기기 켜고 끄기, 한 단계·모두 되돌리기와 다시 하기(38차), 보기 링크의 손질(exm) 만들기·받기, 최근 문서 항목에 손질 남기기·받기,
 * 손질 파일 내보내기·불러오기(38차 — 꼴과 받는 규칙은 explodefile.ts, 39차에 읽기 전 크기 한도·줄 한도·부품 지문), 끄는 동안 옮긴 거리 글(38차).
 * 앱은 TweakHost로 뷰어·문서·분해 상태와 고르기·다시 걸기·알림·파일 건네기를 건네고, 키(Esc·Ctrl+Z·Ctrl+Shift+Z)·길게 누르기·링크·파일 열기에서 이것을 부른다.
 *
 * 끌기: 누른 자리를 고르고(누르기와 같은 반투명 너머 선택), 그 묶음의 끌 단위(dragUnits)를 정해 손질 단계를 연다. 고른 것 밖을 눌렀으면
 * 누르기처럼 그 부품을 고른다. 움직일 때마다 누른 점에서 끄는 길(dragConstraint — 분해 방향) 위로 옮긴 세계 이동을 그 방향 성분으로 바꿔
 * 단위마다 그 진행으로 나눠 담고 다시 건다(끈 점이 커서 아래에 온다). 떼면 되돌리기 한 단계, Esc·둘째 손가락·방향을 바꾸면 앞 자리로.
 * 끄는 동안 이번 끌기로 누른 점이 옮긴 거리를 측정 글상자와 같은 수 꼴로 커서 곁(손가락은 손가락 위)에 보인다(dragDistanceLines·dragLabelSpot).
 *
 * 거리 쳐 넣기(43차 — SketchUp 값 상자처럼 "옮기는 동안이나 막 옮긴 뒤"): 막 끈 뒤와 끄는 동안 쳐 넣기 시작하면 분해 막대에 거리 칸(DistField)을 두고
 * (끄는 동안 쳐 넣기 전에는 막대 줄이 바뀌지 않게 숨기고 커서 곁 거리 글만),
 * 쳐 넣은 거리(parseTypedLengths·typedDelta — 끈 방향으로 그 거리, 화면 평면은 가로; 세로, 사방은 ΔX; ΔY; ΔZ도)로 그 끌기를 맞춘다.
 * 끄는 동안 Enter는 그 자리로 끌기를 마치고(한 단계), 막 끈 뒤에는 같은 되돌리기 단계를 고친다(ExplodeTweaks.amend — 새 단계 없이).
 * 막 끈 끌기는 같은 문서·방향·방식·밀대 자리·고른 것이고 그 끌기가 아직 그 방향의 마지막 되돌리기 단계일 때만 고친다
 * (새로 끌기·되돌리기·밀대를 옮기거나 다른 것을 고르면 끝난다 — 고른 것은 45차부터).
 * 키보드: 끄는 동안 숫자 글쇠는 거리 칸으로 들어가고(코어의 1~7 표준 뷰 키보다 먼저 — 앱이 창 keydown 캡처 단계에서 key를 부른다),
 * 막 끈 뒤에는 Enter로 거리 칸에 들어간다(숫자 글쇠는 그때도 표준 뷰 키 그대로). 손가락 기기는 막대의 거리 칸을 눌러 쳐 넣는다.
 *
 * 끌지 않고 고른 것 옮기기(45차 — SOLIDWORKS 분해 단계·Fusion 부품 옮기기처럼 고른 부품에 거리를 쳐 넣는다): 막 끈 끌기가 없을 때 Enter나
 * 작업 메뉴(오른쪽 누르기·손가락 길게 누르기)의 "거리로 옮기기…"를 고르면 거리 칸을 빈 채로 열고 들어간다. 쳐 넣으면 고른 것의 끌 단위(dragUnits — 누른 것 대신
 * 고른 것)를 지금 분해 방향으로 그 거리만큼 옮기는 새 되돌리기 단계를 남긴다(typedDelta의 끈 이동 0 — 축 하나·화면 가로·세로는 수 하나로 +쪽·음수는 반대쪽,
 * 화면 평면은 가로; 세로, 사방은 ΔX; ΔY; ΔZ). 남긴 단계는 막 끈 끌기처럼 다시 쳐 넣어 고친다. 연 칸은 고른 것·밀대·방향·방식이 바뀌거나 끌기를 시작하면 닫힌다
 * (끄는 동안에는 칸이 없다 — 막대 줄이 끄는 동안 바뀌지 않는 43차 규칙 그대로).
 */
import type { Pick3d, Viewer3d } from 'opencad-viewer3d';
import { sceneMm } from './display';
import { selectionItemIds, type StepDoc } from './doc';
import { h } from './dom';
import type { ExplodeAxis, ExplodeMode, ExplodePlan, ExplodeView } from './explode';
import type { DistField, DistState, TweakHandlers, TweakState } from './explodebar';
import { ExplodeDrag } from './explodedrag';
import {
  importedAxis,
  importedView,
  makeTweakFile,
  matchTweakFile,
  readTweakFile,
  TWEAK_FILE_MAX_BYTES,
  TWEAK_FILE_MAX_ENTRIES,
  tweakFileFits,
  tweakFileName,
  tweakFileText,
} from './explodefile';
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
  parseTypedLengths,
  plainLength,
  tweakDims,
  TWEAK_LINK_MAX,
  tweakQuantum,
  typedDelta,
  worldComps,
  type DragConstraint,
  type LenFormat,
} from './explodetweak';
import { stemName } from './files';
import { fmtCount } from './format';
import { isTextTarget } from './keys';
import type { MenuItem } from './menu';
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

/** 쳐 넣은 거리를 시작하는 글쇠(끄는 동안 — 숫자·부호·소수점·상대 좌표 <) */
const TYPE_START = /^[0-9.,+\-−<]$/;

/** 이벤트 대상이 Enter를 스스로 쓰는 칸(단추·링크·고르기·메뉴 항목 등 — 누르면 그것을 한다)인지 */
export function usesEnter(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== 'string') return false;
  const el = t as HTMLElement;
  if (/^(BUTTON|A|SELECT|SUMMARY|INPUT|TEXTAREA)$/.test(el.tagName)) return true;
  return /^(button|link|menuitem|menuitemradio|menuitemcheckbox|option|tab|radio|checkbox|switch|treeitem)$/.test(el.getAttribute?.('role') ?? '');
}

/** 쳐 넣은 거리를 읽지 못했을 때 알림(방향마다 받는 꼴) */
const TYPED_HELP = {
  line: '거리를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오(음수는 반대쪽, 25mm처럼 단위를 붙여도 됩니다).',
  sp: '거리를 읽지 못했습니다 — 수 하나(끈 방향으로 옮길 거리)나 가로; 세로 두 수를 쳐 넣으십시오.',
  free: '거리를 읽지 못했습니다 — 수 하나(끈 방향으로 옮길 거리)나 ΔX; ΔY; ΔZ 세 수를 쳐 넣으십시오.',
} as const;

/**
 * 끄는 중·막 끈 끌기: 문서·방향·계획 카메라 각, 끄는 단위(낱말·진행·처음 성분), 끄는 길, 이동 한도, 누른 점이 옮긴 세계 이동, 밀대 자리·방식,
 * 고른 것의 표지(selSig)
 */
interface DragRec {
  doc: StepDoc;
  axis: ExplodeAxis;
  view: ExplodeView | null;
  units: { token: string; f: number; start: number[] }[];
  path: DragConstraint;
  limit: number;
  d: number[];
  t: number;
  mode: ExplodeMode;
  sel: string;
}

/** 고른 것의 표지(45차 — 막 끈 끌기와 고른 것 옮기기 칸은 그 고른 것에 묶인다): 나무 마디·누른 것·몸체·여러 개 고르기 */
const selSig = (d: StepDoc): string => `${d.selKey ?? ''}|${d.pick?.id ?? ''}|${d.body ?? ''}|${d.items?.ids.join('\n') ?? ''}`;

export class ExplodeTweakTool implements TweakHandlers {
  /** 옮기기(부품 바로 끌기 — 손가락은 꺼도 길게 눌러 끈다), 이 창에서 마지막에 고른 것 */
  on = false;
  private drag: ExplodeDrag | null = null;
  /** 끄는 중(누른 점 — 세계, 손가락인지 — 거리 글 자리) */
  private g: (DragRec & { p0: number[]; touch: boolean }) | null = null;
  /** 막 끈 끌기(43차 — 쳐 넣은 거리로 고칠 수 있는 것): 그 끌기의 되돌리기 단계 표지(ExplodeTweaks.lastStep) */
  private last: (DragRec & { mark: object }) | null = null;
  /** 끌지 않고 고른 것을 옮기려고 연 거리 칸(45차): 연 때의 문서·방향·방식·밀대 자리·화면 방향·고른 것 */
  private fresh: Pick<DragRec, 'doc' | 'axis' | 'mode' | 't' | 'view' | 'sel'> | null = null;
  /** 분해 막대의 거리 칸(막대가 단다) */
  private field: DistField | null = null;
  /** 끄는 동안 거리를 쳐 넣기 시작했는지(그때부터 거리 칸을 보인다 — 끄는 동안 막대 줄이 바뀌지 않게, 그 전에는 커서 곁 거리 글만) */
  private typing = false;
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

  /** 분해 막대 손질 칸 상태(any = 어느 방향에든 손질이 있다 — 파일로 내보낼 것, dist = 거리 칸 — 막 끈 뒤와 끄는 동안 쳐 넣기 시작한 뒤에만) */
  state(d: StepDoc | null, axis: ExplodeAxis): TweakState {
    const t = d?.tweaks;
    const dist = this.distState();
    return { on: this.on, count: t?.count(axis) ?? 0, undo: !!t?.canUndo(axis), redo: !!t?.canRedo(axis), any: !!t?.axes().length, ...(dist ? { dist } : {}) };
  }

  /** 막대의 거리 칸을 단다(막대를 만들 때 한 번) */
  bind(f: DistField): void {
    this.field = f;
  }

  /**
   * 창 keydown(캡처 단계 — 앱이 수식 글쇠 없는 키마다 코어 키 듣기보다 먼저 부른다, target = 사건 대상): 끄는 동안 거리를 시작하는 글쇠(숫자·부호·소수점·<)면
   * 그 글자로 거리 칸에 들어가고, 끌지 않을 때 Enter면 거리 칸에 들어간다(막 끈 끌기 고치기, 없으면 고른 것 옮기기 — enterDistance).
   * 글 입력 칸에서 누른 것은 그 칸 것이고, Enter를 스스로 쓰는 칸(단추·링크·메뉴 항목 등)의 Enter도 그 칸 것이다. 받았으면 true(앱이 기본 동작과 전파를 막는다)
   */
  key(key: string, target: EventTarget | null): boolean {
    const f = this.field;
    if (!f || isTextTarget(target)) return false;
    if (this.g) {
      if (!TYPE_START.test(key)) return false;
      // 쳐 넣기 시작하면 거리 칸을 보이고 그 글자로 들어간다
      this.typing = true;
      this.emit();
      return f.seed(key);
    }
    return key === 'Enter' && !usesEnter(target) && this.enterDistance();
  }

  /**
   * 거리 칸에 들어가기(끌지 않을 때 — Enter·작업 메뉴 "거리로 옮기기…"): 막 끈 끌기가 있으면 그것을 고칠 칸, 없으면 고른 것을 옮길 새 칸(45차 — 빈 칸)을 열고 들어간다.
   * 고른 것이 없거나 옮길 단위가 없으면(덜 벌어짐·나무에 없음) false
   */
  enterDistance(): boolean {
    const f = this.field;
    if (!f || this.g) return false;
    if (!this.amendable()) {
      const r = this.selRec();
      if (!r) return false;
      this.fresh = { doc: r.doc, axis: r.axis, mode: r.mode, t: r.t, view: r.view, sel: r.sel };
      this.emit();
    }
    return f.focus();
  }

  /**
   * 작업 메뉴에 덧붙일 분해 손질 항목(앱이 분해 막대가 열렸을 때 부른다 — 손가락 기기는 길게 눌러 연다): 고른 것을 옮길 수 있으면 "거리로 옮기기…"(45차),
   * 지금 방향에 되돌리거나 다시 할 손질이 있으면 되돌리기·다시 하기
   */
  menuItems(d: StepDoc, axis: ExplodeAxis): MenuItem[] {
    const out: MenuItem[] = [];
    if (!this.g && (this.amendable() || this.selRec()) && this.host.live()?.doc === d) out.push({ label: '거리로 옮기기…', hint: 'Enter', sep: true, run: () => void this.enterDistance() });
    const st = this.state(d, axis);
    if (st.undo || st.redo) {
      out.push({ label: '손질 되돌리기', hint: 'Ctrl+Z', sep: !out.length, disabled: !st.undo, run: () => this.undo() });
      out.push({ label: '손질 다시 하기', hint: 'Ctrl+Shift+Z', disabled: !st.redo, run: () => this.redo() });
    }
    return out;
  }

  /** 고른 것을 옮길 기록(45차 — 끌지 않고 쳐 넣기): 고른 것 가운데 계획에 든 첫 묶음으로 끌 단위(dragUnits — 고른 마디·여러 개 고르기 그대로), 끈 이동 0. 없으면 null */
  private selRec(): DragRec | null {
    const l = this.host.live();
    if (!l || this.g) return null;
    const d = l.doc;
    const plan = this.host.plan(d);
    const id = selectionItemIds(d).find((x) => plan.owner.has(x) && !d.vis.pmiIds.has(x));
    const units = id ? dragUnits(plan, d.explode, id, { node: d.selKey, ids: d.items?.ids ?? (d.body ? [d.body] : null) }) : [];
    if (!units.length) return null;
    const { axis, mode } = this.host.setup();
    const view = plan.view ?? null;
    const zero = new Array<number>(tweakDims(axis)).fill(0);
    const moves = d.tweaks?.moves(axis);
    return {
      doc: d,
      axis,
      view,
      units: units.map((u) => ({ token: u.token, f: u.f, start: [...(moves?.get(u.token) ?? zero)] })),
      path: dragConstraint(axis, view, l.viewer.getCamera()),
      limit: plan.size * 20,
      d: [0, 0, 0],
      t: d.explode,
      mode,
      sel: selSig(d),
    };
  }

  /** 고른 것 옮기기 칸이 아직 열려 있는지(연 때와 같은 문서·방향·방식·밀대 자리·화면 방향·고른 것 — 아니면 닫는다) */
  private freshOpen(): boolean {
    const a = this.fresh;
    if (!a || this.g || !this.same(a)) this.fresh = null;
    return !!this.fresh;
  }

  /** 기록이 지금 상태와 같은 문서·방향·방식·밀대 자리·화면 방향·고른 것인지 */
  private same(a: Pick<DragRec, 'doc' | 'axis' | 'mode' | 't' | 'view' | 'sel'>): boolean {
    const l = this.host.live();
    const s = this.host.setup();
    const v = l ? (this.host.plan(a.doc).view ?? null) : null;
    return (
      !!l &&
      l.doc === a.doc &&
      s.axis === a.axis &&
      s.mode === a.mode &&
      a.doc.explode === a.t &&
      (v?.yaw ?? 0) === (a.view?.yaw ?? 0) &&
      (v?.pitch ?? 0) === (a.view?.pitch ?? 0) &&
      selSig(a.doc) === a.sel
    );
  }

  /**
   * 쳐 넣은 거리(표시 단위 — 글은 parseTypedLengths 꼴)로 이번 끌기를 맞춘다: 끄는 중이면 그 자리로 마치고(한 단계), 막 끈 뒤면 같은 되돌리기 단계를 고친다.
   * 거리는 끄는 동안 거리 글과 같은 뜻(지금 밀대에서 누른 점이 보이게 옮기는 거리 — 손질에는 그 진행으로 나눠 담는다). 맞췄으면 true(못 읽으면 알린다).
   * 45차: 고른 것 옮기기 칸을 열었으면 고른 것을 그 거리만큼 옮기는 새 되돌리기 단계(그 뒤로는 막 끈 끌기처럼 고친다)
   */
  typed(text: string): boolean {
    const g = this.g;
    const a = g ? null : this.amendable();
    const n = g || a || !this.freshOpen() ? null : this.selRec();
    const r: DragRec | null = g ?? a ?? n;
    if (!r) return false;
    const f = this.host.fmt();
    const vals = parseTypedLengths(text, { comma: (f.sep ?? ', ').startsWith(';'), factor: f.factor ?? 1, sceneMm: sceneMm(r.doc.scene.units) });
    const d = vals === 'unit' || !vals ? vals : typedDelta(r.axis, r.view, r.path, r.d, vals, r.limit);
    if (!d || typeof d === 'string') {
      this.host.toast(
        d === 'unit'
          ? '이 파일에는 길이 단위가 없어 단위를 붙인 거리는 받지 않습니다.'
          : d === 'dir'
            ? '아직 끈 방향이 없어 거리 하나로는 옮기지 못합니다 — 성분으로 쳐 넣으십시오.'
            : d === 'far'
              ? '너무 멀어 옮기지 않았습니다 — 조립 대각선의 20배까지 옮깁니다.'
              : TYPED_HELP[r.axis === 'sp' || r.axis === 'free' ? r.axis : 'line'],
        'warn',
        5000,
      );
      return false;
    }
    const c = worldComps(r.axis, r.view, d);
    const entries = r.units.map((u) => [u.token, u.start.map((s, i) => s + c[i]! / u.f)] as const);
    const t = this.of(r.doc);
    if (g) {
      for (const [k, v] of entries) t.put(k, v);
      g.d = [...d];
      this.host.looks();
      // 끌기를 그 자리로 마친다(떼기처럼 남긴다 — 그 포인터는 뗄 때까지 더 움직이지 않는다)
      this.drag?.finish();
      return true;
    }
    if (n) {
      // 고른 것 옮기기: 새 되돌리기 단계(옮긴 것이 없으면 단계도 없고 칸은 그대로) — 그 뒤로는 막 끈 끌기처럼 고친다
      t.begin(n.axis);
      for (const [k, v] of entries) t.put(k, v);
      const mark = t.commit() ? t.lastStep(n.axis) : null;
      if (mark) {
        this.fresh = null;
        this.last = { ...n, d: [...d], mark };
      }
      this.changed(n.doc);
      this.emit();
      return true;
    }
    const m = this.last!;
    if (!t.amend(m.axis, m.mark, entries)) {
      this.last = null;
      this.emit();
      return false;
    }
    m.d = [...d];
    // 제자리로 돌아와 단계가 비었으면 더 고칠 끌기가 없다
    if (t.lastStep(m.axis) !== m.mark) this.last = null;
    this.changed(m.doc);
    this.emit();
    return true;
  }

  /** 막 끈 끌기가 아직 고칠 수 있는 것이면 그것(같은 문서·방향·방식·밀대 자리·화면 방향·고른 것, 그 방향의 마지막 되돌리기 단계 — 아니면 잊는다) */
  private amendable(): (DragRec & { mark: object }) | null {
    const a = this.last;
    if (!a) return null;
    const ok = this.same(a) && a.doc.tweaks?.lastStep(a.axis) === a.mark;
    if (!ok) this.last = null;
    return ok ? a : null;
  }

  /** 거리 칸 상태(끄는 중이면 쳐 넣기 시작한 뒤의 그 끌기, 아니면 막 끈 끌기, 아니면 고른 것 옮기기 칸 — 빈 값. 없으면 null) */
  private distState(): DistState | null {
    const a = this.g ? (this.typing ? this.g : null) : this.amendable();
    const f = this.host.fmt();
    if (!a) return !this.g && this.freshOpen() ? { value: '', unit: f.unit ?? '', axis: this.fresh!.axis, live: false, fresh: true } : null;
    return { value: plainLength(Math.hypot(a.d[0]!, a.d[1]!, a.d[2]!), f), unit: f.unit ?? '', axis: a.axis, live: !!this.g };
  }

  /** 거리 칸에 지금 상태를 보인다 */
  private emit(): void {
    this.field?.show(this.distState());
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
    // 받는 쪽 줄 한도를 넘는 손질은 내보내지 않는다(읽지 못할 파일을 만들지 않게)
    if (t && !tweakFileFits(t)) {
      this.host.toast(`손질이 너무 많아 파일로 내보내지 못했습니다(한도 ${fmtCount(TWEAK_FILE_MAX_ENTRIES)}개).`, 'warn', 6000);
      return false;
    }
    const f = t ? makeTweakFile(d, t, axis, view, this.host.plan(d)) : null;
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

  /** 손질 파일 받기(파일 고르기·끌어다 놓기): 크기 한도(TWEAK_FILE_MAX_BYTES)를 넘으면 읽지 않고 알린다. 받았으면 true */
  async importFile(file: Blob, d: StepDoc | null = this.host.opened()): Promise<boolean> {
    if (!d) return false;
    if (!(file.size <= TWEAK_FILE_MAX_BYTES)) {
      this.tooLarge();
      return false;
    }
    let text = '';
    try {
      text = await file.text();
    } catch {
      /* 못 읽은 파일은 꼴이 틀린 것으로 알린다 */
    }
    return this.importText(d, text);
  }

  private tooLarge(): void {
    this.host.toast(`손질 파일이 너무 커서 읽지 않았습니다(한도 약 ${Math.floor(TWEAK_FILE_MAX_BYTES / 1e6)} MB).`, 'warn', 6000);
  }

  /**
   * 손질 파일 글 받기: 너무 크거나 줄이 너무 많거나 꼴이 틀리거나 판이 다르면 알리고 그대로, 같은 문서면 이 나무에 있는 손질을 모두,
   * 다른 문서면 자리와 부품 이름(판 2는 지문도)이 맞는 것만(explodefile.ts). 파일에 든 방향마다 그 방향의 손질을 파일대로 바꾸고
   * (방향마다 되돌리기 한 단계), 내보낸 때의 방향(받았으면)으로 바꿔 보인다. 받았으면 true
   */
  importText(d: StepDoc, text: string): boolean {
    const r = readTweakFile(text);
    if (r.kind === 'large') {
      this.tooLarge();
      return false;
    }
    if (r.kind !== 'ok') {
      this.host.toast(
        r.kind === 'version'
          ? `판 ${r.v}의 손질 파일이라 불러오지 않았습니다 — 이 앱은 판 2까지 읽습니다.`
          : r.kind === 'toomany'
            ? `손질 줄이 너무 많은 파일이라 불러오지 않았습니다(한도 ${fmtCount(TWEAK_FILE_MAX_ENTRIES)}개).`
            : '손질 파일을 읽지 못했습니다 — 이 앱에서 내보낸 분해 손질 JSON이 아닙니다.',
        'warn',
        6000,
      );
      return false;
    }
    const f = r.file;
    const m = matchTweakFile(f, d, this.host.plan(d));
    const odd = m.outliers ? [`값이 범위를 벗어난 손질 ${m.outliers}개는 건너뛰었습니다.`] : [];
    if (!m.taken) {
      this.host.toast([m.same ? '이 파일에는 이 문서에 걸 손질이 없습니다 — 불러오지 않았습니다.' : '다른 문서에서 내보낸 손질이라 이 문서에 맞는 부품이 없습니다 — 불러오지 않았습니다.', ...odd], 'warn', 6000);
      return false;
    }
    this.cancel();
    const t = this.of(d);
    for (const [a, list] of m.axes) t.replace(a, list);
    this.host.aim(importedAxis(f, m, this.host.setup().axis), importedView(f, m));
    this.changed(d);
    const msg = [`분해 손질을 불러왔습니다(방향 ${m.axes.length}개 · 손질 ${m.taken}개).`];
    if (!m.same)
      msg.unshift(
        m.fp
          ? '다른 문서(이름·크기가 다름)에서 내보낸 손질이라 자리와 부품(이름·묶음 수·크기)이 맞는 것만 받았습니다.'
          : '다른 문서(이름·크기가 다름)에서 내보낸 손질이라 자리와 부품 이름이 맞는 것만 받았습니다.',
      );
    if (m.skipped) msg.push(m.same ? `이 문서 나무에 없는 손질 ${m.skipped}개는 건너뛰었습니다.` : `맞지 않는 손질 ${m.skipped}개는 건너뛰었습니다.`);
    msg.push(...odd);
    const plain = m.same && !m.skipped && !m.outliers;
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
    const { axis, mode } = this.host.setup();
    const view = plan.view ?? null;
    const t = this.of(d);
    const zero = new Array<number>(tweakDims(axis)).fill(0);
    t.begin(axis);
    // 새 끌기를 시작하면 막 끈 끌기는 더 고치지 않고 고른 것 옮기기 칸도 닫는다(거리 칸은 쳐 넣기 시작하거나 뗄 때까지 숨긴다)
    this.last = this.fresh = null;
    this.typing = false;
    this.g = {
      doc: d,
      axis,
      view,
      p0: [...p.point],
      units: units.map((u) => ({ token: u.token, f: u.f, start: [...(t.moves(axis).get(u.token) ?? zero)] })),
      path: dragConstraint(axis, view, v.getCamera()),
      // 조립 대각선의 20배 넘게는 끌지 않는다(비스듬히 본 축·면에서 튀지 않게)
      limit: plan.size * 20,
      d: [0, 0, 0],
      t: d.explode,
      mode,
      // 누른 것을 고른 뒤의 고른 것(막 끈 끌기는 이것이 바뀌면 끝난다)
      sel: selSig(d),
      touch: pointerType === 'touch',
    };
    if (pointerType === 'touch' && !this.hinted) {
      this.hinted = true;
      this.host.toast('끌어 옮기십시오 — 움직이지 않고 떼면 작업 메뉴입니다.');
    }
    this.emit();
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
    g.d = [...dd];
    this.host.looks();
    this.distance(l.viewer.canvas, x, y, dd);
    this.emit();
  }

  /** 끌기 끝: commit이면 되돌리기 한 단계로 남기고(최근 문서 항목에도 — 그 단계는 쳐 넣은 거리로 고칠 수 있다), 아니면 앞 자리로 */
  private end(commit: boolean): void {
    const g = this.g;
    this.g = null;
    this.typing = false;
    this.label?.el.remove();
    this.label = null;
    const t = g?.doc.tweaks;
    if (!g || !t) return;
    if (!commit) t.cancel();
    else if (t.commit()) {
      this.save(g.doc);
      const mark = t.lastStep(g.axis);
      if (mark) this.last = { doc: g.doc, axis: g.axis, view: g.view, units: g.units, path: g.path, limit: g.limit, d: g.d, t: g.t, mode: g.mode, sel: g.sel, mark };
    }
    this.host.redraw();
    this.emit();
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
