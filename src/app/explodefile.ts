/**
 * 분해 손질 파일(38차 — 순수, DOM 없음 — 분해 조각 안, 첫 화면 JS 밖): 지금 문서의 분해 손질(방향마다)을 작은 JSON 파일로 내보내고,
 * 그 파일을 받아 이 문서에 걸 손질로 맞춘다. 내려받기·파일 고르기와 알림은 손질 도구(explodetool.ts)가 한다.
 *
 * 꼴(판 2 — TWEAK_FILE_VERSION, 39차. 판 1(38차)도 읽는다):
 * {
 *   "format": "opencad-step-explode", "v": 2,
 *   "doc": { "name": 파일 이름, "size": 바이트 수, "units": 장면 단위 },  — 최근 문서와 같은 열쇠(이름:크기 — recent.ts recentId)로 같은 문서인지 본다
 *   "axis": 내보낸 때의 분해 방향, "view": { "yaw", "pitch" }(화면 방향을 정한 카메라 각 — 있을 때만),
 *   "axes": { 방향: [[낱말, 부품 이름, 지문, 성분…], …] }  — 낱말·성분은 explodetweak.ts 꼴(성분은 장면 단위, 화면 방향은 view 기준), 나무 차례
 * }
 * 판 1의 줄은 지문이 없는 [낱말, 부품 이름, 성분…]이다. 부품 이름은 그 낱말 마디의 제품 이름(바로 놓인 형상 덩어리 `.0`은 그 마디의 것)을
 * 앞 TWEAK_NAME_MAX자까지(제어 글자는 빈칸으로) 적는다. 지문은 그 분해 단위의 [묶음 수(입체·선 형상), 제자리 범위 상자 X·Y·Z 크기(유효 숫자 4자리)]이다.
 *
 * 받기:
 * - 읽기 전에 크기(TWEAK_FILE_MAX_BYTES — 내보내는 쪽이 만들 수 있는 가장 큰 파일보다 넉넉히)를 넘으면 'large', JSON이 아니거나
 *   format·doc·axes가 틀리면 'broken', v가 1·2가 아닌 수면 'version', 방향 하나에 TWEAK_FILE_MAX_PER_AXIS줄·모두 TWEAK_FILE_MAX_ENTRIES줄을
 *   넘으면 'toomany'(아무것도 바꾸지 않는다). 모르는 필드·방향은 무시한다.
 * - 같은 문서(이름·크기가 같음)면 이 나무에 있는 낱말을 모두 받는다(지문은 보지 않는다).
 * - 다른 문서면 낱말 자리의 부품 이름이 파일과 같고, 판 2는 지문도 맞는 것만 받는다(묶음 수가 같고 상자 크기 차가 단위 대각선의
 *   TWEAK_FP_TOLERANCE 안 — 고쳐 저장한 같은 조립에서 자리·이름이 같은 다른 부품은 건너뛴다). 장면 단위가 다르면(둘 다 mm·inch·m일 때)
 *   성분과 지문을 이 문서 단위로 바꾼다.
 * - 줄마다: 꼴이 틀린 줄(낱말·이름·지문·성분 수)·0인 손질·이 나무에 없는 낱말·맞지 않는 부품은 건너뛰고(skipped),
 *   성분이 유한하지 않거나 조립 대각선의 TWEAK_FILE_REACH배를 넘으면 이상값으로 건너뛴다(outliers).
 */
import { productAt, type ProductNode } from './doc';
import { sceneMm } from './display';
import { isScreenAxis, type ExplodeAxis, type ExplodePlan, type ExplodeView, type PlanUnit } from './explode';
import { canonicalTweaks, isTweakToken, tokenOrder, TWEAK_AXES, tweakDims, type Comps, type ExplodeTweaks } from './explodetweak';
import { recentId } from './recent';

export const TWEAK_FILE_FORMAT = 'opencad-step-explode';
/** 내보내는 판(39차 — 줄마다 부품 지문). 읽기는 1·2 */
export const TWEAK_FILE_VERSION = 2;

/** 방향 하나의 손질 줄 한도(로컬 표본의 가장 큰 조립 그물 161개·합성 3,000부품을 모두 손질해도 든다) */
export const TWEAK_FILE_MAX_PER_AXIS = 4096;
/** 파일 하나의 손질 줄 한도(방향 7개 × 4,096) */
export const TWEAK_FILE_MAX_ENTRIES = TWEAK_AXES.length * TWEAK_FILE_MAX_PER_AXIS;
/** 낱말 글자 한도(나무 100단이 넘어도 든다) */
export const TWEAK_TOKEN_MAX = 256;
/** 부품 이름: 내보낼 때 앞 120자만 적고 견줄 때도 앞 120자만 본다. 읽을 때 이보다 아주 긴(4,096자 넘는) 이름은 꼴이 틀린 줄 */
export const TWEAK_NAME_MAX = 120;
export const TWEAK_NAME_READ_MAX = 4096;
/** 문서 이름 글자 한도 */
export const TWEAK_DOC_NAME_MAX = 1024;
/** 성분 한도: 조립 대각선의 이 배(끌기 한 번은 대각선 20배 ÷ 진행 5% = 400배까지 담는다) */
export const TWEAK_FILE_REACH = 10000;
/** 지문 상자 크기 허용 차: 단위 대각선의 이 몫(곡면 품질을 바꿔 다시 삼각화한 같은 부품이 들게 — 39차에 잰 값은 README) */
export const TWEAK_FP_TOLERANCE = 0.02;
/**
 * 내보내는 손질 줄 하나의 최대 바이트(UTF-8 — 들여쓰기 6, 괄호·쉼표·줄바꿈 포함): 낱말 256자 + 따옴표, 이름 120자(한 글자 최대 3바이트,
 * 잘린 반쪽 대리 글자 하나는 \uXXXX 6바이트) + 따옴표, 지문(수 넷 — 수 하나 최대 24자), 성분 셋(수 하나 최대 24자)
 */
export const TWEAK_FILE_LINE_MAX = 6 + 1 + (TWEAK_TOKEN_MAX + 2) + 1 + (TWEAK_NAME_MAX * 3 + 3 + 2) + 1 + (4 * 24 + 5) + 1 + (3 * 24 + 2) + 1 + 2;
/** 파일 머리 최대 바이트(문서 이름 1,024자·형식·판·방향·카메라 각·단위·방향 열쇠 줄) */
export const TWEAK_FILE_HEAD_MAX = 8192;
/** 읽기 전 파일 크기 한도: 줄 한도 × 줄 최대 바이트 + 머리를 MiB로 올린 것(23 MiB) */
export const TWEAK_FILE_MAX_BYTES = Math.ceil((TWEAK_FILE_MAX_ENTRIES * TWEAK_FILE_LINE_MAX + TWEAK_FILE_HEAD_MAX) / 2 ** 20) * 2 ** 20;

/** 부품 지문: [묶음 수, 범위 상자 X·Y·Z 크기] */
export type TweakFingerprint = [number, number, number, number];
/** 파일의 손질 한 줄: 판 2는 [낱말, 부품 이름, 지문(없으면 null), 성분…], 판 1은 [낱말, 부품 이름, 성분…] */
export type TweakFileEntry = [string, string, TweakFingerprint | null, ...number[]] | [string, string, ...number[]];

export interface TweakFile {
  format: typeof TWEAK_FILE_FORMAT;
  v: 1 | 2;
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
export type TweakFileRead = { kind: 'ok'; file: TweakFile } | { kind: 'broken' } | { kind: 'version'; v: number } | { kind: 'large' } | { kind: 'toomany' };

/** 받을 손질: 방향마다 이 계획의 단위 낱말로 맞춘 것, 받은·건너뛴·이상값 줄 수, 지문으로 견줬는지(다른 문서의 판 2) */
export interface TweakFileMatch {
  same: boolean;
  fp: boolean;
  axes: [ExplodeAxis, [string, Comps][]][];
  taken: number;
  skipped: number;
  outliers: number;
}

/** 글을 n자까지(제어 글자는 빈칸으로 — 파일 줄 길이를 늘리지 않게) */
const clip = (s: string, n: number): string => s.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n);

/** 낱말 마디의 제품 이름(바로 놓인 형상 덩어리 .0은 그 마디, 없으면 '') */
export function tweakTokenName(products: readonly ProductNode[], token: string): string {
  return productAt(products, token.replace(/\.0$/, ''))?.name ?? '';
}

/** 내려받을 파일 이름(문서 이름 줄기 + 꼴) */
export const tweakFileName = (stem: string): string => `${stem}-explode.json`;

const sig4 = (v: number): number => Number(v.toPrecision(4)) + 0;

/** 분해 단위의 지문(제자리 범위 상자가 없으면 null): [묶음 수, X·Y·Z 크기(유효 숫자 4자리)] */
export function unitFingerprint(u: PlanUnit | undefined): TweakFingerprint | null {
  const b = u?.box;
  if (!u || !b || !(b.max[0] >= b.min[0] && b.max[1] >= b.min[1] && b.max[2] >= b.min[2])) return null;
  return [u.ids.length, sig4(b.max[0] - b.min[0]), sig4(b.max[1] - b.min[1]), sig4(b.max[2] - b.min[2])];
}

const okFingerprint = (v: unknown): v is TweakFingerprint =>
  Array.isArray(v) && v.length === 4 && Number.isInteger(v[0]) && v[0] >= 1 && v[0] <= 1e7 && v.slice(1).every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x < 1e15);

/** 파일 지문(단위 배율 k로 이 문서 단위로 바꿔)과 이 문서 지문이 같은 부품인지: 묶음 수가 같고 세 크기 차가 둘 가운데 큰 대각선의 TWEAK_FP_TOLERANCE 안 */
export function sameFingerprint(file: TweakFingerprint, doc: TweakFingerprint | null, k = 1): boolean {
  if (!doc || file[0] !== doc[0]) return false;
  const a = [file[1] * k, file[2] * k, file[3] * k];
  const b = [doc[1], doc[2], doc[3]];
  const tol = TWEAK_FP_TOLERANCE * Math.max(Math.hypot(...a), Math.hypot(...b));
  return a.every((v, i) => Math.abs(v - b[i]!) <= tol);
}

/** 내보낼 수 있는 손질인지(방향마다·모두 줄 한도 안 — 넘으면 받는 쪽이 읽지 않으므로 내보내지 않는다) */
export function tweakFileFits(t: ExplodeTweaks): boolean {
  let n = 0;
  for (const a of TWEAK_AXES) {
    const c = t.count(a);
    if (c > TWEAK_FILE_MAX_PER_AXIS) return false;
    n += c;
  }
  return n <= TWEAK_FILE_MAX_ENTRIES;
}

/** 문서의 손질 → 파일 꼴(손질이 없으면 null). plan은 지문을 셀 계획(단위 낱말·범위 상자), view는 화면 방향 카메라 각(있으면 담는다) */
export function makeTweakFile(d: TweakFileDoc, t: ExplodeTweaks, axis: ExplodeAxis, view: ExplodeView | null | undefined, plan: ExplodePlan): TweakFile | null {
  const axes: TweakFile['axes'] = {};
  for (const a of t.axes())
    axes[a] = [...t.moves(a)]
      .filter(([k]) => k.length <= TWEAK_TOKEN_MAX)
      .sort((x, y) => tokenOrder(x[0], y[0]))
      .map(([k, c]): TweakFileEntry => [k, clip(tweakTokenName(d.products, k), TWEAK_NAME_MAX), unitFingerprint(plan.units.get(k)), ...c]);
  if (!Object.keys(axes).length) return null;
  const w = view && Number.isFinite(view.yaw) && Number.isFinite(view.pitch) ? { yaw: view.yaw, pitch: view.pitch } : null;
  return { format: TWEAK_FILE_FORMAT, v: TWEAK_FILE_VERSION, doc: { name: clip(d.name, TWEAK_DOC_NAME_MAX), size: d.size, units: d.scene.units }, axis, ...(w ? { view: w } : {}), axes };
}

/** 파일 글: 머리는 줄마다, 손질은 한 줄에 하나(작고 읽을 만하게 — JSON.parse로 그대로 읽힌다) */
export function tweakFileText(f: TweakFile): string {
  const { axes, ...head } = f;
  const top = JSON.stringify(head, null, 2).replace(/\n\}$/, '');
  const lists = Object.entries(axes).map(([a, list]) => `    ${JSON.stringify(a)}: [\n${list!.map((e) => `      ${JSON.stringify(e)}`).join(',\n')}\n    ]`);
  return `${top},\n  "axes": {\n${lists.join(',\n')}\n  }\n}\n`;
}

/** 파일 글 → 꼴(크기·줄 수 한도를 먼저 보고, 손질 줄은 아직 거르지 않는다 — 맞출 때 센다) */
export function readTweakFile(text: string): TweakFileRead {
  if (text.length > TWEAK_FILE_MAX_BYTES) return { kind: 'large' };
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    return { kind: 'broken' };
  }
  const f = o as Partial<Omit<TweakFile, 'v'>> & { v?: unknown };
  if (!f || typeof f !== 'object' || Array.isArray(f) || f.format !== TWEAK_FILE_FORMAT) return { kind: 'broken' };
  if (f.v !== 1 && f.v !== 2) return typeof f.v === 'number' && Number.isFinite(f.v) ? { kind: 'version', v: f.v } : { kind: 'broken' };
  const doc = f.doc;
  if (!doc || typeof doc !== 'object' || typeof doc.name !== 'string' || doc.name.length > TWEAK_DOC_NAME_MAX || typeof doc.size !== 'number' || !Number.isFinite(doc.size)) return { kind: 'broken' };
  if (!f.axes || typeof f.axes !== 'object' || Array.isArray(f.axes)) return { kind: 'broken' };
  let n = 0;
  for (const a of TWEAK_AXES) {
    const list: unknown = f.axes[a];
    if (!Array.isArray(list)) continue;
    if (list.length > TWEAK_FILE_MAX_PER_AXIS) return { kind: 'toomany' };
    n += list.length;
  }
  if (n > TWEAK_FILE_MAX_ENTRIES) return { kind: 'toomany' };
  const axis = TWEAK_AXES.includes(f.axis as ExplodeAxis) ? f.axis! : 'free';
  const v = f.view;
  const view = v && typeof v === 'object' && Number.isFinite(v.yaw) && Number.isFinite(v.pitch) ? { yaw: v.yaw, pitch: v.pitch } : null;
  const units = typeof doc.units === 'string' && doc.units.length <= 16 ? { units: doc.units } : {};
  return { kind: 'ok', file: { format: TWEAK_FILE_FORMAT, v: f.v, doc: { name: doc.name, size: doc.size, ...units }, axis, ...(view ? { view } : {}), axes: f.axes } };
}

/** 파일 단위 → 이 문서 단위 배율(둘 다 알 때만, 아니면 1) */
function unitScale(from: string | undefined, to: TweakFileDoc['scene']['units']): number {
  const a = sceneMm(from as TweakFileDoc['scene']['units']);
  const b = sceneMm(to);
  return Number.isFinite(a) && Number.isFinite(b) ? a / b : 1;
}

/**
 * 파일의 손질을 이 문서(계획 plan — 단위 낱말·범위 상자)에 맞춘다: 같은 문서면 나무에 있는 낱말을 모두,
 * 다른 문서면 부품 이름(앞 120자)이 같고 판 2면 지문도 맞는 자리만. 성분이 이상값이면 따로 센다
 */
export function matchTweakFile(f: TweakFile, d: TweakFileDoc, plan: ExplodePlan): TweakFileMatch {
  const same = recentId(f.doc.name, f.doc.size) === recentId(d.name, d.size);
  const v2 = f.v === 2;
  const k = unitScale(f.doc.units, d.scene.units);
  const reach = TWEAK_FILE_REACH * plan.size;
  const axes: TweakFileMatch['axes'] = [];
  let taken = 0;
  let skipped = 0;
  let outliers = 0;
  for (const a of TWEAK_AXES) {
    const list: unknown = f.axes[a];
    if (!Array.isArray(list)) continue;
    const dims = tweakDims(a);
    const got: [string, Comps][] = [];
    for (const e of list as unknown[]) {
      const row = Array.isArray(e) ? (e as unknown[]) : null;
      const fp = v2 ? row?.[2] : undefined;
      const c = row?.slice(v2 ? 3 : 2) ?? [];
      // 꼴: 낱말·이름(글자 한도)·지문(판 2 — null이면 이름만)·성분 수
      if (
        !row ||
        !isTweakToken(row[0]) ||
        row[0].length > TWEAK_TOKEN_MAX ||
        typeof row[1] !== 'string' ||
        row[1].length > TWEAK_NAME_READ_MAX ||
        (v2 && fp !== null && !okFingerprint(fp)) ||
        c.length !== dims ||
        !c.every((x) => typeof x === 'number')
      ) {
        skipped++;
        continue;
      }
      const comps = (c as number[]).map((x) => x * k);
      // 이상값: 유한하지 않거나 조립 대각선의 TWEAK_FILE_REACH배 넘음
      if (!comps.every((x) => Number.isFinite(x) && Math.abs(x) <= reach)) {
        outliers++;
        continue;
      }
      const token = row[0];
      const u = plan.units.get(token);
      const ok =
        comps.some((x) => x !== 0) &&
        !!u?.level &&
        (same || (clip(tweakTokenName(d.products, token), TWEAK_NAME_MAX) === clip(row[1], TWEAK_NAME_MAX) && (!v2 || fp === null || sameFingerprint(fp as TweakFingerprint, unitFingerprint(u), k))));
      if (ok) got.push([token, comps]);
      else skipped++;
    }
    const canon = canonicalTweaks(plan, got);
    skipped += got.length - canon.length;
    taken += canon.length;
    if (canon.length) axes.push([a, canon]);
  }
  return { same, fp: v2 && !same, axes, taken, skipped, outliers };
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
