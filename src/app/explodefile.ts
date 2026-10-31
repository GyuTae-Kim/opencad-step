/**
 * 분해 손질 파일(38차 — 순수, DOM 없음 — 분해 조각 안, 첫 화면 JS 밖): 지금 문서의 분해 손질(방향마다)을 작은 JSON 파일로 내보내고,
 * 그 파일을 받아 이 문서에 걸 손질로 맞춘다. 내려받기·파일 고르기와 알림은 손질 도구(explodetool.ts)가 한다.
 *
 * 꼴(판 1 — TWEAK_FILE_VERSION):
 * {
 *   "format": "opencad-step-explode", "v": 1,
 *   "doc": { "name": 파일 이름, "size": 바이트 수, "units": 장면 단위 },  — 최근 문서와 같은 열쇠(이름:크기 — recent.ts recentId)로 같은 문서인지 본다
 *   "axis": 내보낸 때의 분해 방향, "view": { "yaw", "pitch" }(화면 방향을 정한 카메라 각 — 있을 때만),
 *   "axes": { 방향: [[낱말, 부품 이름, 성분…], …] }  — 낱말·성분은 explodetweak.ts 꼴(성분은 장면 단위, 화면 방향은 view 기준), 나무 차례
 * }
 * 부품 이름은 그 낱말 마디의 제품 이름(바로 놓인 형상 덩어리 `.0`은 그 마디의 것)이다.
 *
 * 받기:
 * - JSON이 아니거나 format·doc·axes가 틀리면 'broken', v가 1이 아닌 수면 'version'(아무것도 바꾸지 않는다).
 * - 같은 문서(이름·크기가 같음)면 이 나무에 있는 낱말을 모두 받는다.
 * - 다른 문서면 낱말 자리의 부품 이름이 파일과 같은 것만 받는다(고쳐 저장한 같은 조립 — 자리만 같은 다른 부품은 건너뛴다).
 *   장면 단위가 다르면(둘 다 mm·inch·m일 때) 성분을 이 문서 단위로 바꾼다.
 * - 꼴이 틀린 항목(낱말·성분 수)·0인 손질·이 나무에 없는 낱말은 건너뛴다(센다).
 */
import { productAt, type ProductNode } from './doc';
import { sceneMm } from './display';
import { isScreenAxis, type ExplodeAxis, type ExplodePlan, type ExplodeView } from './explode';
import { canonicalTweaks, isTweakToken, okComps, tokenOrder, TWEAK_AXES, tweakDims, type Comps, type ExplodeTweaks } from './explodetweak';
import { recentId } from './recent';

export const TWEAK_FILE_FORMAT = 'opencad-step-explode';
export const TWEAK_FILE_VERSION = 1;

/** 파일의 손질 한 줄: 낱말, 부품 이름, 성분… */
export type TweakFileEntry = [string, string, ...number[]];

export interface TweakFile {
  format: typeof TWEAK_FILE_FORMAT;
  v: typeof TWEAK_FILE_VERSION;
  doc: { name: string; size: number; units?: string };
  axis: ExplodeAxis;
  view?: ExplodeView;
  axes: Partial<Record<ExplodeAxis, TweakFileEntry[]>>;
}

/** 손질 파일을 만들고 받는 쪽이 보는 문서 */
export interface TweakFileDoc {
  readonly name: string;
  readonly size: number;
  readonly products: readonly ProductNode[];
  readonly scene: { readonly units: 'mm' | 'inch' | 'm' | 'unknown' };
}

/** 파일 읽기 결과 */
export type TweakFileRead = { kind: 'ok'; file: TweakFile } | { kind: 'broken' } | { kind: 'version'; v: number };

/** 받을 손질: 방향마다 이 계획의 단위 낱말로 맞춘 것, 받은·건너뛴 항목 수 */
export interface TweakFileMatch {
  same: boolean;
  axes: [ExplodeAxis, [string, Comps][]][];
  taken: number;
  skipped: number;
}

/** 낱말 마디의 제품 이름(바로 놓인 형상 덩어리 .0은 그 마디, 없으면 '') */
export function tweakTokenName(products: readonly ProductNode[], token: string): string {
  return productAt(products, token.replace(/\.0$/, ''))?.name ?? '';
}

/** 내려받을 파일 이름(문서 이름 줄기 + 꼴) */
export const tweakFileName = (stem: string): string => `${stem}-explode.json`;

/** 문서의 손질 → 파일 꼴(손질이 없으면 null). view는 화면 방향 카메라 각(있으면 담는다) */
export function makeTweakFile(d: TweakFileDoc, t: ExplodeTweaks, axis: ExplodeAxis, view?: ExplodeView | null): TweakFile | null {
  const axes: TweakFile['axes'] = {};
  for (const a of t.axes())
    axes[a] = [...t.moves(a)].sort((x, y) => tokenOrder(x[0], y[0])).map(([k, c]): TweakFileEntry => [k, tweakTokenName(d.products, k), ...c]);
  if (!Object.keys(axes).length) return null;
  const w = view && Number.isFinite(view.yaw) && Number.isFinite(view.pitch) ? { yaw: view.yaw, pitch: view.pitch } : null;
  return { format: TWEAK_FILE_FORMAT, v: TWEAK_FILE_VERSION, doc: { name: d.name, size: d.size, units: d.scene.units }, axis, ...(w ? { view: w } : {}), axes };
}

/** 파일 글: 머리는 줄마다, 손질은 한 줄에 하나(작고 읽을 만하게 — JSON.parse로 그대로 읽힌다) */
export function tweakFileText(f: TweakFile): string {
  const { axes, ...head } = f;
  const top = JSON.stringify(head, null, 2).replace(/\n\}$/, '');
  const lists = Object.entries(axes).map(([a, list]) => `    ${JSON.stringify(a)}: [\n${list!.map((e) => `      ${JSON.stringify(e)}`).join(',\n')}\n    ]`);
  return `${top},\n  "axes": {\n${lists.join(',\n')}\n  }\n}\n`;
}

/** 파일 글 → 꼴(손질 줄은 아직 거르지 않는다 — 맞출 때 센다) */
export function readTweakFile(text: string): TweakFileRead {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return { kind: 'broken' };
  }
  const f = o as Partial<TweakFile> | null;
  if (!f || typeof f !== 'object' || f.format !== TWEAK_FILE_FORMAT) return { kind: 'broken' };
  if (f.v !== TWEAK_FILE_VERSION) return typeof f.v === 'number' && Number.isFinite(f.v) ? { kind: 'version', v: f.v } : { kind: 'broken' };
  const doc = f.doc;
  if (!doc || typeof doc.name !== 'string' || typeof doc.size !== 'number' || !Number.isFinite(doc.size) || !f.axes || typeof f.axes !== 'object' || Array.isArray(f.axes)) return { kind: 'broken' };
  const axis = TWEAK_AXES.includes(f.axis as ExplodeAxis) ? f.axis! : 'free';
  const v = f.view;
  const view = v && typeof v === 'object' && Number.isFinite(v.yaw) && Number.isFinite(v.pitch) ? { yaw: v.yaw, pitch: v.pitch } : null;
  return { kind: 'ok', file: { format: TWEAK_FILE_FORMAT, v: TWEAK_FILE_VERSION, doc: { name: doc.name, size: doc.size, ...(typeof doc.units === 'string' ? { units: doc.units } : {}) }, axis, ...(view ? { view } : {}), axes: f.axes } };
}

/** 파일 단위 → 이 문서 단위 배율(둘 다 알 때만, 아니면 1) */
function unitScale(from: string | undefined, to: TweakFileDoc['scene']['units']): number {
  const a = sceneMm(from as TweakFileDoc['scene']['units']);
  const b = sceneMm(to);
  return Number.isFinite(a) && Number.isFinite(b) ? a / b : 1;
}

/** 파일의 손질을 이 문서(계획 plan — 단위 낱말)에 맞춘다: 같은 문서면 나무에 있는 낱말을 모두, 다른 문서면 부품 이름이 같은 자리만 */
export function matchTweakFile(f: TweakFile, d: TweakFileDoc, plan: ExplodePlan): TweakFileMatch {
  const same = recentId(f.doc.name, f.doc.size) === recentId(d.name, d.size);
  const k = unitScale(f.doc.units, d.scene.units);
  const axes: TweakFileMatch['axes'] = [];
  let taken = 0;
  let skipped = 0;
  for (const a of TWEAK_AXES) {
    const list: unknown = f.axes[a];
    if (!Array.isArray(list)) continue;
    const got: [string, Comps][] = [];
    for (const e of list as unknown[]) {
      const ok =
        Array.isArray(e) &&
        isTweakToken(e[0]) &&
        typeof e[1] === 'string' &&
        okComps(e.slice(2), tweakDims(a)) &&
        e.slice(2).some((v) => v !== 0) &&
        !!plan.units.get(e[0])?.level &&
        (same || tweakTokenName(d.products, e[0]) === e[1]);
      if (ok) got.push([e[0] as string, (e.slice(2) as number[]).map((v) => v * k)]);
      else skipped++;
    }
    const canon = canonicalTweaks(plan, got);
    skipped += got.length - canon.length;
    taken += canon.length;
    if (canon.length) axes.push([a, canon]);
  }
  return { same, axes, taken, skipped };
}

/** 받은 뒤 보일 방향: 내보낸 때의 방향을 받았으면 그것, 아니면 지금 방향을 받았으면 그대로, 아니면 받은 첫 방향 */
export function importedAxis(f: TweakFile, m: TweakFileMatch, now: ExplodeAxis): ExplodeAxis {
  const got = new Set(m.axes.map(([a]) => a));
  return got.has(f.axis) ? f.axis : got.has(now) ? now : (m.axes[0]?.[0] ?? now);
}

/** 화면 방향 손질을 받았으면 파일의 카메라 각(그 성분의 기준), 아니면 null */
export function importedView(f: TweakFile, m: TweakFileMatch): ExplodeView | null {
  return f.view && m.axes.some(([a]) => isScreenAxis(a)) ? { ...f.view } : null;
}
