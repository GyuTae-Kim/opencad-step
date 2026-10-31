/**
 * 분해 손질(순수, DOM 없음 — 분해 조각 안, 첫 화면 JS 밖): 부품을 끌어 옮긴 덧이동을 계획(explode.ts) 위에 더한다.
 *
 * - 손질은 분해 단위(나무 자리 낱말 — explode.ts PlanUnit.token)마다 100%에서의 덧이동이다. 그 단위가 벌어지는 단계의 진행과 함께 늘어
 *   0%에서 0, 그 단계가 끝나면 다 간다(조립 단계별은 그 단위의 단계, 한꺼번에는 밀대 그대로 — explodeMoves).
 *   그래서 밀대를 x%에 두고 끌면 끈 자리를 그 진행으로 나눠 담는다(50%의 한꺼번에서 끌면 100%에서는 끈 거리의 두 배 — 분해 이동과 같은 비율).
 * - 덧이동은 방향마다 따로 둔다(사방·X·Y·Z·화면 가로·세로·평면): 방향을 바꾸면 그 방향의 손질로, 되돌아오면 앞의 것이 그대로다.
 *   방식(단계별·한꺼번에)을 바꿔도 같은 손질이다(100% 자리가 같다 — 시기만 그 방식대로). 분해를 끄거나 측정으로 접어도 문서에 남는다.
 * - 성분은 그 방향의 자유도만: 장면 축·화면 가로·세로는 그 축 위 거리 하나, 화면 평면은 계획 카메라의 오른쪽·위 두 성분, 사방은 세계 x·y·z.
 *   화면 방향은 계획 카메라 각(분해 방향을 정한 카메라) 기준이라 같은 단추를 다시 눌러 방향을 다시 맞추면 손질도 새 화면 방향으로 돈다.
 * - 되돌리기: 끌기 한 번(여러 단위를 함께 끌어도)·모두 지우기·링크로 바꾸기·파일 불러오기가 한 단계다. 방향마다 TWEAK_UNDO_MAX 단계까지.
 *   다시 하기(38차): 되돌린 단계를 방향마다 쌓아 두었다가 차례로 다시 걸고(다시 건 것은 되돌리기 단계로 돌아간다), 그 방향에서 새로 손질하면 비운다.
 * - 보기 링크(exm): `양자+낱말:정수[,정수…]+…`. 양자는 조립 대각선의 2⁻¹²(유효 숫자 3자리), 정수는 성분 ÷ 양자. 낱말은 나무 차례로 늘어놓고
 *   앞 낱말의 끝 k마디를 바꾼 것은 `/`를 k번 앞세워 줄인다(`0/3/12/4/7` 다음 `0/3/12/4/8`은 `/8`). TWEAK_LINK_MAX자를 넘으면 담지 않는다(null).
 * - 파일별 저장(최근 문서 항목에 같이 — recent.ts): { v: 1, axes: { 방향: [[낱말, 성분…], …] } }. 되돌리기 단계는 남기지 않는다.
 */
import { basisFromAngles, cameraBasis, computeFrame, screenRay, type CameraState } from 'opencad-viewer3d/camera';
import { unitFraction, type ExplodeAxis, type ExplodePlan, type ExplodeView, type PlanTweak, type PlanUnit } from './explode';

type V3 = [number, number, number];
/** 손질 성분(방향의 자유도만) */
export type Comps = readonly number[];

/** 방향마다 되돌리기 단계 한도 */
export const TWEAK_UNDO_MAX = 100;
/** 보기 링크에 담는 손질 글 길이 한도(고른 것 sel과 같다 — 메신저·메일 주소 길이) */
export const TWEAK_LINK_MAX = 1500;
/** 이보다 덜 벌어진 단위는 끌지 않는다(그 위 단위를 끈다 — 끈 거리를 진행으로 나누므로 거의 0이면 100%에서 너무 멀리 간다) */
export const DRAG_MIN_FRACTION = 0.05;
/** 손질 낱말 꼴: 마디 경로, 바로 놓인 형상 덩어리는 끝에 .0 */
const TOKEN = /^\d+(?:\/\d+)*(?:\.0)?$/;
/** 손질을 두는 방향(저장·파일 꼴의 차례) */
export const TWEAK_AXES: readonly ExplodeAxis[] = ['free', 'x', 'y', 'z', 'sx', 'sy', 'sp'];
const EMPTY: ReadonlyMap<string, Comps> = new Map();
/** 손질 낱말 꼴인지 */
export const isTweakToken = (k: unknown): k is string => typeof k === 'string' && TOKEN.test(k);

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** 방향의 손질 성분 수 */
export const tweakDims = (axis: ExplodeAxis): number => (axis === 'free' ? 3 : axis === 'sp' ? 2 : 1);

/** 손질 성분 → 세계 이동(화면 방향은 계획 카메라 각 view의 오른쪽·위) */
export function tweakWorld(axis: ExplodeAxis, view: ExplodeView | null | undefined, c: Comps): V3 {
  const a = c[0] ?? 0;
  if (axis === 'free') return [a, c[1] ?? 0, c[2] ?? 0];
  if (axis === 'x') return [a, 0, 0];
  if (axis === 'y') return [0, a, 0];
  if (axis === 'z') return [0, 0, a];
  const b = basisFromAngles(view?.yaw ?? 0, view?.pitch ?? 0);
  const r = axis === 'sy' ? 0 : a;
  const u = axis === 'sx' ? 0 : axis === 'sy' ? a : (c[1] ?? 0);
  return [r * b.right[0] + u * b.up[0], r * b.right[1] + u * b.up[1], r * b.right[2] + u * b.up[2]];
}

/** 세계 이동 → 손질 성분(그 방향의 자유도에 비춘 것) */
export function worldComps(axis: ExplodeAxis, view: ExplodeView | null | undefined, d: readonly number[]): number[] {
  if (axis === 'free') return [d[0]!, d[1]!, d[2]!];
  if (axis === 'x') return [d[0]!];
  if (axis === 'y') return [d[1]!];
  if (axis === 'z') return [d[2]!];
  const b = basisFromAngles(view?.yaw ?? 0, view?.pitch ?? 0);
  if (axis === 'sx') return [dot(d, b.right)];
  if (axis === 'sy') return [dot(d, b.up)];
  return [dot(d, b.right), dot(d, b.up)];
}

/** 길이 수 꼴(앱 Fmt — 표시 단위·소수 자리·화면 언어): len은 단위 글까지, lenNum은 수만 */
export interface LenFormat {
  len(v: number): string;
  lenNum(v: number): string;
}

/**
 * 끄는 동안 옮긴 거리 글(38차 — 측정 글상자 measureLabelLines와 같은 꼴): 줄마다 [이름, 값] 조각. 이름은 번역층이 옮기는 낱말(거리·가로·세로)이나 ΔX 꼴.
 * 장면 축은 그 축 성분 하나(ΔX −12.5 mm), 화면 가로·세로는 그 성분, 화면 평면은 거리와 가로·세로 두 성분, 사방은 거리와 ΔX·ΔY·ΔZ.
 * d는 이번 끌기로 누른 점이 옮긴 세계 이동(끄는 길 위 — 지금 밀대에서 보이는 거리), 화면 방향 성분은 계획 카메라 각 view 기준
 */
export function dragDistanceLines(axis: ExplodeAxis, view: ExplodeView | null | undefined, d: readonly number[], f: LenFormat): [string, string][][] {
  if (axis === 'x' || axis === 'y' || axis === 'z') return [[[`Δ${axis.toUpperCase()}`, f.len(d['xyz'.indexOf(axis)]!)]]];
  const c = worldComps(axis, view, d);
  if (axis === 'sx') return [[['가로', f.len(c[0]!)]]];
  if (axis === 'sy') return [[['세로', f.len(c[0]!)]]];
  const far: [string, string][] = [['거리', f.len(Math.hypot(...c))]];
  if (axis === 'sp')
    return [
      far,
      [
        ['가로', f.lenNum(c[0]!)],
        ['세로', f.lenNum(c[1]!)],
      ],
    ];
  return [
    far,
    [
      ['ΔX', f.lenNum(c[0]!)],
      ['ΔY', f.lenNum(c[1]!)],
      ['ΔZ', f.lenNum(c[2]!)],
    ],
  ];
}

/** 손가락 위로 띄우는 거리(화소 — 손가락 끝과 그 둘레를 비운다) */
export const DRAG_LABEL_LIFT = 56;

/**
 * 거리 글의 자리(캔버스 기준 CSS 화소 left·top): 커서·손가락 점 (x, y), 글 크기 w×h, 캔버스 W×H.
 * 마우스·펜은 커서 오른쪽 아래(넘치면 반대쪽), 손가락은 손가락 위 DRAG_LABEL_LIFT화소 너머 가운데(위에 자리가 없으면 손가락 왼쪽, 거기도 없으면 오른쪽 옆).
 * 늘 캔버스 안 4화소 여백 안에 둔다
 */
export function dragLabelSpot(x: number, y: number, w: number, h: number, W: number, H: number, touch: boolean): { left: number; top: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const m = 4;
  let left: number;
  let top: number;
  if (!touch) {
    left = x + 16 + w > W - m ? x - 16 - w : x + 16;
    top = y + 18 + h > H - m ? y - 18 - h : y + 18;
  } else if (y - DRAG_LABEL_LIFT - h >= m) {
    left = x - w / 2;
    top = y - DRAG_LABEL_LIFT - h;
  } else {
    const side = DRAG_LABEL_LIFT * 0.8;
    left = x - side - w >= m ? x - side - w : x + side;
    top = y - h / 2;
  }
  return { left: clamp(left, m, Math.max(m, W - w - m)), top: clamp(top, m, Math.max(m, H - h - m)) };
}

/** 끄는 길: 선(단위 방향)이나 면(단위 법선) */
export type DragConstraint = { line: V3 } | { plane: V3 };

/**
 * 분해 방향의 끄는 길: 장면 축 하나·화면 가로·세로는 그 축 위로만(화면 방향은 계획 카메라의 오른쪽·위), 화면 평면은 계획 카메라 화면과 나란한 면,
 * 사방은 지금 카메라 화면과 나란한 면(보는 방향 성분 없이)
 */
export function dragConstraint(axis: ExplodeAxis, view: ExplodeView | null | undefined, cam: CameraState): DragConstraint {
  if (axis === 'x') return { line: [1, 0, 0] };
  if (axis === 'y') return { line: [0, 1, 0] };
  if (axis === 'z') return { line: [0, 0, 1] };
  if (axis === 'free') return { plane: cameraBasis(cam).back };
  const b = basisFromAngles(view?.yaw ?? 0, view?.pitch ?? 0);
  return axis === 'sx' ? { line: b.right } : axis === 'sy' ? { line: b.up } : { plane: b.back };
}

/**
 * 누른 점 p0(세계)에서 화면 점(x, y — 캔버스 CSS 화소)까지 끄는 길 위 세계 이동. 화면 점의 광선과 가장 가까운 선 위 점, 또는 광선이 면과 만나는 점.
 * 선이 시선과 거의 나란하거나(6° 안) 면을 거의 옆에서 보면(6° 안) 정할 수 없어 null. limit보다 길면 그 길이로 줄인다
 */
export function dragDelta(cam: CameraState, width: number, height: number, c: DragConstraint, p0: readonly number[], x: number, y: number, limit = Infinity): V3 | null {
  const f = computeFrame(cam, width, height, { center: cam.target, radius: Math.max(cam.distance, 1e-9) });
  const r = screenRay(f, x, y);
  const w: V3 = [p0[0]! - r.origin[0], p0[1]! - r.origin[1], p0[2]! - r.origin[2]];
  let d: V3;
  if ('line' in c) {
    const a = c.line;
    const b = dot(a, r.dir);
    const den = 1 - b * b;
    if (den < 0.011) return null;
    const s = (b * dot(r.dir, w) - dot(a, w)) / den;
    d = [a[0] * s, a[1] * s, a[2] * s];
  } else {
    const n = c.plane;
    const k = dot(r.dir, n);
    if (Math.abs(k) < 0.105) return null;
    const u = dot(w, n) / k;
    d = [r.origin[0] + r.dir[0] * u - p0[0]!, r.origin[1] + r.dir[1] * u - p0[1]!, r.origin[2] + r.dir[2] * u - p0[2]!];
  }
  const len = Math.hypot(d[0], d[1], d[2]);
  if (!Number.isFinite(len)) return null;
  if (len > limit) {
    const k = limit / len;
    d = [d[0] * k, d[1] * k, d[2] * k];
  }
  return d;
}

/** 끌 단위 하나와 지금 그 단위의 진행(끈 거리를 이것으로 나눠 담는다) */
export interface DragUnit {
  unit: PlanUnit;
  token: string;
  f: number;
}

/**
 * 누른 묶음(pressed)에서 끌 단위: 밀대 t에서 DRAG_MIN_FRACTION 넘게 벌어진 단위 가운데 가장 안쪽(아직 벌어지지 않은 하위 조립 안 부품을 누르면 그 하위 조립).
 * 고른 나무 마디(sel.node)가 누른 것을 품으면 그 마디(덜 벌어졌으면 그 위), 여러 개를 골랐고(sel.ids) 누른 것이 그 안이면 고른 것마다 끌 단위를 모아 함께
 * (다른 고른 단위 안에 든 것은 뺀다). 맨 위 전체와 나무에 없는 묶음은 끌지 않는다(빈 목록)
 */
export function dragUnits(plan: ExplodePlan, t: number, pressed: string, sel: { node?: string | null; ids?: readonly string[] | null } = {}, min = DRAG_MIN_FRACTION): DragUnit[] {
  const frac = (u: PlanUnit): number => (u.token && u.level ? unitFraction(plan, u.level, t) : 0);
  const moving = (u: PlanUnit | undefined): PlanUnit | null => {
    for (let x = u; x; x = x.parent) if (frac(x) >= min) return x;
    return null;
  };
  const pack = (list: readonly PlanUnit[]): DragUnit[] => list.map((u) => ({ unit: u, token: u.token!, f: frac(u) }));
  const leaf = plan.owner.get(pressed);
  if (!leaf) return [];
  if (sel.node) {
    const s = plan.units.get(sel.node);
    let inside = false;
    for (let x: PlanUnit | undefined = leaf; x && !inside; x = x.parent) inside = x === s;
    const m = inside ? moving(s) : null;
    if (m) return pack([m]);
  }
  if (sel.ids && sel.ids.length > 1 && sel.ids.includes(pressed)) {
    const set = new Set<PlanUnit>();
    for (const id of sel.ids) {
      const m = moving(plan.owner.get(id));
      if (m) set.add(m);
    }
    const list = [...set].filter((u) => {
      for (let x = u.parent; x; x = x.parent) if (set.has(x)) return false;
      return true;
    });
    if (list.length) return pack(list);
  }
  const m = moving(leaf);
  return m ? pack([m]) : [];
}

/** 되돌리기·다시 하기 한 단계: 바뀐 낱말에 걸 값(null = 없앤다) */
type Step = Map<string, number[] | null>;

interface TweakSet {
  moves: Map<string, number[]>;
  /** 되돌리기 단계: 바뀐 낱말의 앞 값(null = 없던 것) */
  undo: Step[];
  /** 다시 하기 단계(끝이 마지막에 되돌린 것): 되돌리기 전 값 */
  redo: Step[];
}

/** 한 단계를 걸고, 걸기 전 값을 담은 반대 단계를 돌려준다 */
function applyStep(s: TweakSet, step: Step): Step {
  const back: Step = new Map();
  for (const [k, v] of step) {
    const now = s.moves.get(k);
    back.set(k, now ? [...now] : null);
    if (v) s.moves.set(k, [...v]);
    else s.moves.delete(k);
  }
  return back;
}

/** 파일별 저장 꼴 */
export interface StoredTweaks {
  v: 1;
  axes: Partial<Record<ExplodeAxis, [string, ...number[]][]>>;
}

const same = (a: Comps | null | undefined, b: Comps | null | undefined): boolean => (!a || !b ? !a && !b : a.length === b.length && a.every((v, i) => v === b[i]));
const isZero = (c: Comps): boolean => c.every((v) => v === 0);
/** 그 방향 성분 꼴인지(수 dims개, 유한하고 너무 크지 않음) — 저장·파일에서 받을 때 */
export const okComps = (c: readonly unknown[], dims: number): c is number[] => c.length === dims && c.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e15);

/** 문서 하나의 손질(방향마다 덧이동과 되돌리기 단계) */
export class ExplodeTweaks {
  private readonly sets = new Map<ExplodeAxis, TweakSet>();
  /** 열린 단계(끄는 동안): 바뀐 낱말의 앞 값 */
  private open: { set: TweakSet; prev: Map<string, number[] | null> } | null = null;

  private setOf(axis: ExplodeAxis): TweakSet {
    let s = this.sets.get(axis);
    if (!s) this.sets.set(axis, (s = { moves: new Map(), undo: [], redo: [] }));
    return s;
  }

  /** 그 방향의 덧이동(낱말 → 성분) */
  moves(axis: ExplodeAxis): ReadonlyMap<string, Comps> {
    return this.sets.get(axis)?.moves ?? EMPTY;
  }

  /** 그 방향에서 손질한 단위 수 */
  count(axis: ExplodeAxis): number {
    return this.sets.get(axis)?.moves.size ?? 0;
  }

  /** 되돌릴 단계가 있는지 */
  canUndo(axis: ExplodeAxis): boolean {
    return !!this.sets.get(axis)?.undo.length;
  }

  /** 다시 할 단계가 있는지 */
  canRedo(axis: ExplodeAxis): boolean {
    return !!this.sets.get(axis)?.redo.length;
  }

  /** 손질이 있는 방향들(방향 차례) */
  axes(): ExplodeAxis[] {
    return TWEAK_AXES.filter((a) => this.count(a) > 0);
  }

  /** 한 단계 시작(앞서 열린 단계는 닫는다) */
  begin(axis: ExplodeAxis): void {
    this.commit();
    this.open = { set: this.setOf(axis), prev: new Map() };
  }

  /** 열린 단계에서 한 단위의 덧이동을 바꾼다(null·모두 0이면 지운다) */
  put(token: string, comps: Comps | null): void {
    const st = this.open;
    if (!st) return;
    if (!st.prev.has(token)) st.prev.set(token, st.set.moves.get(token) ?? null);
    if (!comps || isZero(comps)) st.set.moves.delete(token);
    else st.set.moves.set(token, [...comps]);
  }

  /** 열린 단계 닫기: 바뀐 것이 있으면 되돌리기 단계로 남기고(그 방향의 다시 할 단계는 비운다) true */
  commit(): boolean {
    const st = this.open;
    this.open = null;
    if (!st) return false;
    for (const [k, v] of [...st.prev]) if (same(v, st.set.moves.get(k))) st.prev.delete(k);
    if (!st.prev.size) return false;
    st.set.undo.push(st.prev);
    if (st.set.undo.length > TWEAK_UNDO_MAX) st.set.undo.shift();
    st.set.redo.length = 0;
    return true;
  }

  /** 열린 단계를 버리고 앞 값으로(끌기 취소) */
  cancel(): void {
    const st = this.open;
    this.open = null;
    if (!st) return;
    for (const [k, v] of st.prev)
      if (v) st.set.moves.set(k, v);
      else st.set.moves.delete(k);
  }

  /** 끄는 중인지(열린 단계가 있는지) */
  get editing(): boolean {
    return !!this.open;
  }

  /** 한 단계 되돌리기(되돌린 것은 다시 할 단계로) */
  undo(axis: ExplodeAxis): boolean {
    this.commit();
    const s = this.sets.get(axis);
    const step = s?.undo.pop();
    if (!s || !step) return false;
    s.redo.push(applyStep(s, step));
    return true;
  }

  /** 되돌린 단계 하나 다시 하기(다시 건 것은 되돌리기 단계로 — 다시 할 단계는 그대로 둔다) */
  redo(axis: ExplodeAxis): boolean {
    this.commit();
    const s = this.sets.get(axis);
    const step = s?.redo.pop();
    if (!s || !step) return false;
    s.undo.push(applyStep(s, step));
    if (s.undo.length > TWEAK_UNDO_MAX) s.undo.shift();
    return true;
  }

  /** 그 방향의 손질을 모두 지운다(한 단계 — 되돌리면 돌아온다) */
  clear(axis: ExplodeAxis): boolean {
    this.begin(axis);
    for (const k of [...this.moves(axis).keys()]) this.put(k, null);
    return this.commit();
  }

  /** 그 방향의 손질을 통째로 바꾼다(보기 링크·파일 불러오기 — 한 단계) */
  replace(axis: ExplodeAxis, entries: readonly (readonly [string, Comps])[]): boolean {
    this.begin(axis);
    const keep = new Set(entries.map(([k]) => k));
    for (const k of [...this.moves(axis).keys()]) if (!keep.has(k)) this.put(k, null);
    for (const [k, c] of entries) this.put(k, c);
    return this.commit();
  }

  /** 계획에 더할 덧이동(이 계획에 없는 낱말·손질하지 않는 단위는 건너뛴다) */
  resolve(plan: ExplodePlan, axis: ExplodeAxis, view: ExplodeView | null | undefined): PlanTweak[] {
    const out: PlanTweak[] = [];
    for (const [k, c] of this.moves(axis)) {
      const u = plan.units.get(k);
      if (u?.level) out.push({ ids: u.ids, level: u.level, d: tweakWorld(axis, view, c) });
    }
    return out;
  }

  /** 저장 꼴(손질이 없으면 null) */
  toJSON(): StoredTweaks | null {
    const axes: StoredTweaks['axes'] = {};
    let any = false;
    for (const [a, s] of this.sets)
      if (s.moves.size) {
        axes[a] = [...s.moves].map(([k, c]) => [k, ...c]);
        any = true;
      }
    return any ? { v: 1, axes } : null;
  }

  /** 저장해 둔 손질 받기: 손질도 되돌리기·다시 하기 단계도 없는 방향만 채운다(링크로 이미 받았거나 끈 것은 그대로). 채웠으면 true */
  absorb(data: unknown): boolean {
    const axes = (data as { v?: unknown; axes?: unknown } | null)?.v === 1 ? (data as StoredTweaks).axes : null;
    if (!axes || typeof axes !== 'object') return false;
    let got = false;
    for (const a of TWEAK_AXES) {
      const list = (axes as Record<string, unknown>)[a];
      if (!Array.isArray(list) || this.count(a) || this.canUndo(a) || this.canRedo(a)) continue;
      const s = this.setOf(a);
      for (const e of list) {
        if (!Array.isArray(e) || !isTweakToken(e[0])) continue;
        const c = e.slice(1);
        if (okComps(c, tweakDims(a)) && !isZero(c)) s.moves.set(e[0], c);
      }
      got ||= s.moves.size > 0;
    }
    return got;
  }
}

/** 링크·저장으로 받은 낱말을 이 계획의 단위 낱말로(줄인 마디의 다른 낱말도 같은 단위로 — 같은 단위에 둘이면 뒤의 것), 모르는 낱말은 뺀다 */
export function canonicalTweaks(plan: ExplodePlan, entries: readonly (readonly [string, Comps])[]): [string, Comps][] {
  const out = new Map<string, Comps>();
  for (const [k, c] of entries) {
    const u = plan.units.get(k);
    if (u?.token && u.level) out.set(u.token, c);
  }
  return [...out];
}

/** 링크 양자: 조립 대각선의 2⁻¹²(유효 숫자 3자리) */
export const tweakQuantum = (size: number): number => Number((size / 4096).toPrecision(3));

/** 낱말 나무 차례(마디 번호를 수로, 같은 마디면 바로 놓인 형상 덩어리 .0이 뒤) */
export function tokenOrder(a: string, b: string): number {
  const x = a.split('/');
  const y = b.split('/');
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = parseFloat(x[i]!) - parseFloat(y[i]!) || x[i]!.length - y[i]!.length;
    if (d) return d;
  }
  return x.length - y.length;
}

/** 손질 → 보기 링크 글(exm 값). 손질이 없으면 '', 한도를 넘으면 null */
export function encodeTweakLink(moves: ReadonlyMap<string, Comps>, quantum: number, max = TWEAK_LINK_MAX): string | null {
  if (!(quantum > 0) || !Number.isFinite(quantum)) return null;
  const list = [...moves]
    .map(([k, c]) => [k, c.map((v) => Math.round(v / quantum) + 0)] as const)
    .filter(([k, q]) => TOKEN.test(k) && !isZero(q))
    .sort((a, b) => tokenOrder(a[0], b[0]));
  if (!list.length) return '';
  const out = [String(quantum)];
  let prev: string[] = [];
  for (const [k, q] of list) {
    const seg = k.split('/');
    let c = 0;
    while (c < Math.min(prev.length, seg.length - 1) && prev[c] === seg[c]) c++;
    const drop = prev.length - c;
    const rel = c > 0 && drop > 0 ? `${'/'.repeat(drop)}${seg.slice(c).join('/')}` : k;
    out.push(`${rel.length < k.length ? rel : k}:${q.join(',')}`);
    prev = seg;
  }
  const s = out.join('+');
  return s.length <= max ? s : null;
}

/** 보기 링크 글(exm 값) → [낱말, 성분](성분 수가 dims가 아니거나 꼴이 틀린 항목은 건너뛴다). 양자가 틀리면 null */
export function decodeTweakLink(s: string, dims: number): [string, number[]][] | null {
  const parts = s.split('+');
  const q = Number(parts[0]);
  if (!parts[0] || !(q > 0) || !Number.isFinite(q)) return null;
  const out: [string, number[]][] = [];
  let prev: string[] = [];
  for (const p of parts.slice(1)) {
    const i = p.lastIndexOf(':');
    if (i <= 0) continue;
    const tok = p.slice(0, i);
    const rel = /^(\/+)(.+)$/.exec(tok);
    let seg: string[];
    if (rel) {
      const drop = rel[1]!.length;
      if (drop > prev.length) continue;
      seg = [...prev.slice(0, prev.length - drop), ...rel[2]!.split('/')];
    } else seg = tok.split('/');
    const k = seg.join('/');
    if (!TOKEN.test(k)) continue;
    prev = seg;
    const nums = p.slice(i + 1).split(',').map((x) => (x === '' ? NaN : Number(x)));
    if (nums.length !== dims || !nums.every((v) => Number.isInteger(v) && Math.abs(v) <= 1e9) || isZero(nums)) continue;
    out.push([k, nums.map((v) => v * q)]);
  }
  return out;
}
