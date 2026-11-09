/**
 * 겹친 것 고르기 목록(64차 — 코어 0.47.0 pickCandidates, SolidWorks "다른 것 고르기"·Creo "목록에서 고르기" 꼴). 뷰어 조각(ctxmenu.ts가 쓴다).
 *
 * - 코어 후보는 기본 도형 단위(그물 삼각형·윤곽선 선분·선분·점 — 앞 면 뒤의 것이 차례로)라 앱 고르기로 묶는다:
 *   첫째는 누르기와 같은 고르기(고르기 단위 — 부품·몸체, 면 고르기면 면·모서리), 둘째부터는 가상 커서 Tab으로 돌려 고른 것과 같은 고르기
 *   (62차 — 사건의 cycle이 있으면 B-rep 면·모서리, 면 표가 없으면 부품). 여러 개 고르기면 모두 고르기 단위(누를 때마다 더하고 빼는 것과 같다).
 *   같은 고른 것은 처음 것 하나, 잘린 면(단면 채움)은 뺀다(그 뒤의 면이 같은 부품을 고른다).
 * - 줄: 종류(화면 글 — 부품 전체·몸체·면 종류·모서리 종류, 번역층이 옮긴다)와 이름(파일 글 — 면·모서리는 "#STEP 번호 · 부품 나무 이름", 번역하지 않는다).
 *   지금 고른 것이 그 줄이면 표시(여러 개 고르기는 그 단위가 모두 들어 있으면 ✓).
 * - 고른 줄은 앱 누르기 알림(onPick 처리기)에 같은 사건으로 넘긴다 — 둘째부터는 cycle(가상 커서 Tab·Enter와 같은 선택). 시험은 rowEvent를 본다
 */
import type { Pick3d, PickEvent } from 'opencad-viewer3d';
import { itemById, productAt, productKeyOf, selectionItemIds, unitItemIds, type PickUnit, type StepDoc } from './doc';
import { edgeAt, edgeKindLabel } from './edges';
import { faceAt, faceKindLabel } from './faces';
import type { MenuItem } from './menu';
import { nodeLabel } from './tree';

/** 목록 후보 수 한도(코어 PICK_CANDIDATES_MAX·가상 커서 후보 수와 같다) */
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

/** 후보 하나 → 앱이 고를 것(app.ts onPick과 같은 갈래: wantFace면 B-rep 면·모서리, body면 몸체, 아니면 나무 마디 — PMI·나무에 없는 것은 그 항목) */
function rowOf(d: StepDoc, p: Pick3d, wantFace: boolean, body: boolean): Omit<PickRow, 'index' | 'checked' | 'pick'> {
  const raw = p.raw ?? p.index;
  if (wantFace && p.kind === 'mesh') {
    const fx = d.faces;
    const ti = fx?.tableOf.get(p.id);
    const t = ti === undefined ? undefined : fx!.tables[ti];
    const f = t ? faceAt(t, raw) : -1;
    if (f >= 0) return { key: `f:${p.id}:${f}`, label: faceKindLabel(fx!.kinds[t!.kinds[f]!] ?? ''), file: `#${t!.stepIds[f]} · ${ownerName(d, p.id)}` };
  }
  if (wantFace && p.kind === 'edge') {
    const ex = d.edges;
    const ti = ex?.tableOf.get(p.id);
    const t = ti === undefined ? undefined : ex!.tables[ti];
    const e = t ? edgeAt(t, raw) : -1;
    if (e >= 0) return { key: `e:${p.id}:${e}`, label: edgeKindLabel(ex!.kinds[t!.kinds[e]!] ?? ''), file: `#${t!.stepIds[e]} · ${ownerName(d, p.id)}` };
  }
  const pmi = d.vis.pmiIds.has(p.id);
  const k = pmi || body ? null : productKeyOf(d.products, p.id);
  if (k) return { key: `n:${k}`, label: '부품 전체', file: ownerName(d, p.id) };
  return { key: `b:${p.id}`, label: pmi ? 'PMI' : p.kind === 'line' ? '선 형상' : p.kind === 'point' ? '점 형상' : '몸체', file: itemById(d.scene, p.id)?.[0].name ?? p.id };
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

/** 줄을 고를 때 앱 누르기 알림에 넘길 사건(둘째 이후 후보는 cycle — 가상 커서로 돌려 Enter한 것과 같다). count = 코어 후보 수 */
export function rowEvent(r: PickRow, count: number, pointerType: string): PickEvent {
  return { altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, clicks: 1, button: 0, pointerType, ...(r.index ? { cycle: { index: r.index, count } } : {}) };
}

/** 목록 메뉴 항목(여러 개 고르기면 켜고 끄기 ✓, 아니면 하나 고르기 ●) */
export function pickItems(rows: readonly PickRow[], multi: boolean, choose: (r: PickRow) => void): MenuItem[] {
  return rows.map((r) => ({ label: r.label, file: r.file, checked: r.checked, toggle: multi, run: () => choose(r) }));
}
