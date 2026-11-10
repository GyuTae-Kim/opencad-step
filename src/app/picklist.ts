/**
 * 겹친 것 고르기 목록(64차 — 코어 0.47.0 pickCandidates, SolidWorks "다른 것 고르기"·Creo "목록에서 고르기" 꼴). 뷰어 조각(ctxmenu.ts가 쓴다).
 *
 * - 코어 후보(앞 면 뒤의 것이 차례로)를 앱 고르기로 묶는다:
 *   첫째는 누르기와 같은 고르기(고르기 단위 — 부품·몸체, 면 고르기면 면·모서리), 둘째부터는 가상 커서 Tab으로 돌려 고른 것과 같은 고르기
 *   (62차 — 사건의 cycle이 있으면 B-rep 면·모서리, 면 표가 없으면 부품). 여러 개 고르기면 모두 고르기 단위(누를 때마다 더하고 빼는 것과 같다).
 *   같은 고른 것은 처음 것 하나, 잘린 면(단면 채움)은 뺀다(그 뒤의 면이 같은 부품을 고른다).
 * - 65차: 코어 0.53.0 묶음 열쇠(pickGroup — 목록과 가상 커서 Tab이 같은 열쇠)로 코어 후보부터 B-rep 면·모서리 단위(여러 개 고르기면 고르기 단위)다 —
 *   64차까지는 기본 도형 단위(그물 삼각형·윤곽선 선분)라 한 면의 앞뒤 두 번·곡선 모서리의 선분 여럿이 후보 16개를 채워 뒤의 부품이 들지 못했다.
 *   면·모서리 표가 없는 그물·선·점은 기본 도형 단위 그대로라 앱 묶음(같은 줄 열쇠는 하나)은 남긴다.
 * - 줄: 종류(화면 글 — 부품 전체·몸체·면 종류·모서리 종류, 번역층이 옮긴다)와 이름(파일 글 — 면·모서리는 "#STEP 번호 · 부품 나무 이름", 번역하지 않는다).
 *   지금 고른 것이 그 줄이면 표시(여러 개 고르기는 그 단위가 모두 들어 있으면 ✓).
 * - 고른 줄은 앱 누르기 알림(onPick 처리기)에 같은 사건으로 넘긴다 — 둘째부터는 cycle(가상 커서 Tab·Enter와 같은 선택). 시험은 rowEvent를 본다
 * - 65차 미리 강조: 줄에 초점이 가거나 마우스가 오르면 그 줄을 고를 때 그릴 강조(rowHi)를 3D에 그린다(고른 것·패널·상태 줄은 그대로 — ctxmenu.ts)
 */
import type { Pick3d, PickEvent } from 'opencad-viewer3d';
import { itemById, productAt, productKeyOf, selectionItemIds, toggledItems, unitItemIds, type PickUnit, type StepDoc } from './doc';
import { edgeAt, edgeDetails, edgeKindLabel } from './edges';
import { faceAt, faceDetails, faceKindLabel } from './faces';
import type { Hi } from './hipaint';
import type { MenuItem } from './menu';
import { nodeLabel } from './tree';

/** 목록 후보 수 한도(코어 PICK_CANDIDATES_MAX·가상 커서 후보 수와 같다 — 65차부터 묶음 수) */
export const PICK_LIST_MAX = 16;

/** 목록 한 줄 */
export interface PickRow {
  /** 코어 후보 */
  pick: Pick3d;
  /** 코어 후보 차례(0 = 누르기와 같은 고르기 — 사건에 cycle 없음) */
  index: number;
  /** 고르면 앱이 고를 것의 열쇠(selectionKey와 견준다) */
  key: string;
  /** 종류(한국어 화면 글) */
  label: string;
  /** 이름(파일 글) */
  file: string;
  /** 지금 고른 것이 이 줄인지(여러 개 고르기면 그 단위가 모두 고른 것에 들었는지) */
  checked: boolean;
}

/** 줄을 만들 때 보는 앱 고르기 상태 */
export interface PickRowHost {
  faceMode: boolean;
  multiPick: boolean;
  pickUnit: PickUnit;
}

/**
 * 지금 고른 것의 열쇠: 면 'f:그물:면 번호', 모서리 'e:그물:모서리 번호', 나무 마디(부품) 'n:마디 열쇠', 그 밖(몸체·PMI·나무에 없는 항목) 'b:항목 id'.
 * 레이어·PMI 목록이나 여러 개 고르기로 모은 묶음은 null
 */
export function selectionKey(d: StepDoc): string | null {
  if (d.face) return `f:${d.face.meshId}:${d.face.face}`;
  if (d.edge) return `e:${d.edge.meshId}:${d.edge.edge}`;
  if (d.selKey) return `n:${d.selKey}`;
  const id = d.items ? null : (d.pick?.id ?? d.body);
  return id ? `b:${id}` : null;
}

/** 그물·선 묶음이 놓인 나무 마디 이름("제품 · 자리 이름"), 나무에 없으면 묶음 이름 */
function ownerName(d: StepDoc, id: string): string {
  const k = productKeyOf(d.products, id);
  const n = k ? productAt(d.products, k) : null;
  if (!n) return itemById(d.scene, id)?.[0].name ?? id;
  const { name, instance } = nodeLabel(n);
  return instance ? `${name} · ${instance}` : name;
}

/** 고른 것의 B-rep 면(그물 삼각형 — 잘린 면은 아님)·모서리(윤곽선 선분): 면·모서리 표 번호와 그 안 번호. 표가 없거나 못 찾으면 null */
function brepAt(d: StepDoc, p: Pick3d): { edge: boolean; ti: number; i: number } | null {
  const raw = p.raw ?? p.index;
  if (p.kind === 'edge') {
    const ti = d.edges?.tableOf.get(p.id);
    const t = ti === undefined ? undefined : d.edges!.tables[ti];
    const i = t ? edgeAt(t, raw) : -1;
    return i < 0 ? null : { edge: true, ti: ti!, i };
  }
  if (p.kind !== 'mesh' || p.section) return null;
  const ti = d.faces?.tableOf.get(p.id);
  const t = ti === undefined ? undefined : d.faces!.tables[ti];
  const i = t ? faceAt(t, raw) : -1;
  return i < 0 ? null : { edge: false, ti: ti!, i };
}

/** 고르기 단위 열쇠: 부품 'n:마디 열쇠', 몸체 단위·PMI·나무에 없는 것 'b:항목 id' */
function unitKey(d: StepDoc, id: string, body: boolean): string {
  const k = body || d.vis.pmiIds.has(id) ? null : productKeyOf(d.products, id);
  return k ? `n:${k}` : `b:${id}`;
}

/** 후보 하나 → 앱이 고를 것(app.ts onPick과 같은 갈래: wantFace면 B-rep 면·모서리, body면 몸체, 아니면 나무 마디 — PMI·나무에 없는 것은 그 항목) */
function rowOf(d: StepDoc, p: Pick3d, wantFace: boolean, body: boolean): Omit<PickRow, 'index' | 'checked' | 'pick'> {
  const b = wantFace ? brepAt(d, p) : null;
  if (b && !b.edge) {
    const fx = d.faces!;
    const t = fx.tables[b.ti]!;
    return { key: `f:${p.id}:${b.i}`, label: faceKindLabel(fx.kinds[t.kinds[b.i]!] ?? ''), file: `#${t.stepIds[b.i]} · ${ownerName(d, p.id)}` };
  }
  if (b) {
    const ex = d.edges!;
    const t = ex.tables[b.ti]!;
    return { key: `e:${p.id}:${b.i}`, label: edgeKindLabel(ex.kinds[t.kinds[b.i]!] ?? ''), file: `#${t.stepIds[b.i]} · ${ownerName(d, p.id)}` };
  }
  const key = unitKey(d, p.id, body);
  if (key[0] === 'n') return { key, label: '부품 전체', file: ownerName(d, p.id) };
  return { key, label: d.vis.pmiIds.has(p.id) ? 'PMI' : p.kind === 'line' ? '선 형상' : p.kind === 'point' ? '점 형상' : '몸체', file: itemById(d.scene, p.id)?.[0].name ?? p.id };
}

/**
 * 65차: 코어 후보 묶음 열쇠(코어 0.53.0 pickCandidates·키보드 pickCycle의 group — 같은 열쇠의 후보는 가장 앞의 것 하나로 세고 후보 한도 16은 묶음 수다).
 * 여러 개 고르기면 고르기 단위(줄 열쇠 — 한 부품이 한 후보), 아니면 B-rep 면·모서리('f:'·'e:' — 한 면을 앞뒤 두 번 맞아도·삼각형이 여럿이어도,
 * 곡선 모서리의 선분이 여럿이어도 한 후보). 면·모서리 표가 없는 것·잘린 면·선·점·문서가 없으면 undefined(묶지 않는다 — 기본 도형마다, 0.47.0 그대로)
 */
export function pickGroup(H: PickRowHost & { doc: StepDoc | null }, p: Pick3d): string | undefined {
  const d = H.doc;
  if (!d) return undefined;
  if (H.multiPick && !H.faceMode) return p.section ? undefined : unitKey(d, p.id, H.pickUnit === 'body');
  const b = brepAt(d, p);
  return b ? `${b.edge ? 'e' : 'f'}:${p.id}:${b.i}` : undefined;
}

/**
 * 66차: 그물 면 후보의 B-rep 면 삼각형 구간(코어 0.54.0 pickCycle.faceRanges — 가상 커서의 지금 후보 표식을 맞은 B-rep 면 통째로: 곡면이면 삼각형 여럿,
 * 코어 기본은 맞은 삼각형과 같은 평면으로 이어진 삼각형이라 원기둥 옆면은 띠 하나였다). 고르기 모드와 상관없이 맞은 면이다(여러 개 고르기 — 부품 단위 후보도 맞은 면 자리).
 * 면 표가 없거나 못 찾은 그물·잘린 면·선·점·모서리·문서가 없으면 null(코어가 같은 평면 면으로 — 선분·점은 코어 표식)
 */
export function pickFaceRanges(d: StepDoc | null, p: Pick3d): { start: number; count: number }[] | null {
  const b = d && p.kind === 'mesh' ? brepAt(d, p) : null;
  if (!b) return null;
  const s = d!.faces!.tables[b.ti]!.triStart;
  return [{ start: s[b.i]!, count: s[b.i + 1]! - s[b.i]! }];
}

/** 코어 후보(차례대로) → 목록 줄(앱 고르기로 묶고, 같은 고른 것은 처음 것 하나) */
export function pickRows(d: StepDoc, picks: readonly Pick3d[], H: PickRowHost): PickRow[] {
  const multi = H.multiPick && !H.faceMode;
  const cur = multi ? new Set(selectionItemIds(d)) : selectionKey(d);
  const seen = new Set<string>();
  const out: PickRow[] = [];
  picks.forEach((p, index) => {
    if (p.section) return;
    // 앱 누르기 알림과 같은 갈래(app.ts pickCb): 여러 개 고르기는 고르기 단위로 더하고 빼고, 아니면 면 고르기·둘째 이후 후보는 면·모서리
    const wantFace = !multi && (H.faceMode || index > 0);
    const r = rowOf(d, p, wantFace, H.pickUnit === 'body' && !wantFace);
    if (seen.has(r.key)) return;
    seen.add(r.key);
    const checked = cur instanceof Set ? unitItemIds(d.products, p.id, H.pickUnit).every((id) => cur.has(id)) : r.key === cur;
    out.push({ ...r, pick: p, index, checked });
  });
  return out;
}

/**
 * 65차: 줄을 고르면 그릴 3D 강조(미리 강조 — 앱 누르기 알림과 같은 갈래: app.ts onPick·toggleInSelection). 여러 개 고르기면 그 단위를 더하거나 뺀 뒤의
 * 고른 것 모두, B-rep 면·모서리 줄은 그 면·모서리, 첫 줄의 부품은 그 아래 몸체 모두, 그 밖(몸체·PMI, 면을 찾지 못한 면 고르기·둘째 이후 줄)은 누른 몸체
 */
export function rowHi(d: StepDoc, r: PickRow, H: PickRowHost): Hi {
  const p = r.pick;
  if (H.multiPick && !H.faceMode) return { ids: toggledItems(selectionItemIds(d), unitItemIds(d.products, p.id, H.pickUnit)) };
  const b = r.key[0] === 'f' || r.key[0] === 'e' ? brepAt(d, p) : null;
  const mesh = b && d.scene.meshes.find((m) => m.id === p.id);
  const hi: Hi | null = !b || !mesh ? null : b.edge ? { edge: edgeDetails(mesh, d.edges!.tables[b.ti]!, b.i, d.edges!.kinds) } : { face: faceDetails(mesh, d.faces!.tables[b.ti]!, b.i, d.faces!.kinds) };
  if (hi?.face || hi?.edge) return hi;
  return { ids: r.key[0] === 'n' && !H.faceMode && !r.index ? unitItemIds(d.products, p.id, 'part') : [p.id] };
}

/** 줄을 고를 때 앱 누르기 알림에 넘길 사건(둘째 이후 후보는 cycle — 가상 커서로 돌려 Enter한 것과 같다). count = 코어 후보 수 */
export function rowEvent(r: PickRow, count: number, pointerType: string): PickEvent {
  return { altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, clicks: 1, button: 0, pointerType, ...(r.index ? { cycle: { index: r.index, count } } : {}) };
}

/** 목록 메뉴 항목(여러 개 고르기면 켜고 끄기 ✓, 아니면 하나 고르기 ●) */
export function pickItems(rows: readonly PickRow[], multi: boolean, choose: (r: PickRow) => void): MenuItem[] {
  return rows.map((r) => ({ label: r.label, file: r.file, checked: r.checked, toggle: multi, run: () => choose(r) }));
}
