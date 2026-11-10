/**
 * 창 전체 키 처리 규칙(순수 함수). 캔버스에 초점이 있으면 뷰어가 F·1~7·Esc(측정 지우기)를 직접 받고
 * 전파를 멈추므로, 여기에는 뷰어가 받지 않은 키만 온다(app 쪽에서 창의 bubble 단계로 듣는다).
 * F·1~7 같은 뷰어 키의 뜻은 앱이 따로 들지 않고 `Viewer3d.handleKey`에 넘겨 코어 규칙을 그대로 쓴다.
 */
import type { ViewName } from 'opencad-viewer3d/viewkeys';

/**
 * 표준 뷰 메뉴 순서. 숫자 키 표(VIEW_KEYS)·뷰 이름(VIEW_LABELS — 화면 언어 번역은 i18n.ts가 이 표를 고친다)·키 글(viewKeyOf)은
 * 66차부터 코어 0.54.0 작은 모듈 `opencad-viewer3d/viewkeys`(아무것도 가져오지 않는다)에서 바로 가져온다 —
 * 63~65차는 코어 camera 모듈이 첫 화면 JS에 통째로 오지 않게 같은 표를 여기에 복제해 두었다(tests/app/core-split.test.ts)
 */
export const VIEW_MENU: ViewName[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'seIso', 'swIso', 'neIso', 'nwIso'];

/**
 * 할 일:
 * - open: 열기 상자(Ctrl/⌘+O)
 * - escape: 앱 쪽 Esc 순서(메뉴 닫기 → 해석 취소 → 측정 지우기·끄기 → 고르기 풀기)
 * - grid: 격자(F7, 코어는 받지 않는 키)
 * - hide: 고른 것 숨기기(H), isolate: 고른 것만 보기·격리 풀기(I), home: 홈 뷰(Home)
 * - viewer: 뷰어 키일 수 있으니 `viewer.handleKey`에 넘긴다(F·1~7 등, 처리 여부는 코어가 정한다)
 * - undo: 분해 손질 한 단계 되돌리기(Ctrl/⌘+Z — 되돌릴 것이 없으면 앱이 아무것도 하지 않는다)
 * - redo: 되돌린 분해 손질 다시 하기(Ctrl/⌘+Shift+Z, Windows 꼴 Ctrl+Y — ⌘+Y는 브라우저 방문 기록이라 받지 않는다. 다시 할 것이 없으면 아무것도 하지 않는다)
 */
export type KeyAction = 'open' | 'grid' | 'escape' | 'hide' | 'isolate' | 'home' | 'viewer' | 'undo' | 'redo';

export interface KeyInput {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  shift?: boolean;
  /** 글 입력 칸(input·textarea·select·contentEditable)에서 눌렀는지 */
  inText?: boolean;
  /** 초점이 있는 조작 칸(controlOf): 밀대는 Home·End·Page·화살표, 라디오는 화살표를 스스로 쓴다 */
  control?: Control | null;
  /** 열린 문서가 있는지 */
  hasDoc?: boolean;
}

/** 눌린 키 → 할 일(없으면 null) */
export function routeKey(k: KeyInput): KeyAction | null {
  if (k.inText) return null;
  if (k.control === 'range' && RANGE_KEYS.has(k.key)) return null;
  if (k.control === 'radio' && ARROW_KEYS.has(k.key)) return null;
  const mod = !!(k.ctrl || k.meta);
  if (mod && !k.alt && (k.key === 'o' || k.key === 'O')) return 'open';
  if (mod && !k.alt && k.hasDoc && (k.key === 'z' || k.key === 'Z')) return k.shift ? 'redo' : 'undo';
  if (k.ctrl && !k.meta && !k.alt && !k.shift && k.hasDoc && (k.key === 'y' || k.key === 'Y')) return 'redo';
  if (mod || k.alt) return null;
  if (k.key === 'Escape') return 'escape';
  if (!k.hasDoc) return null;
  if (k.key === 'F7') return 'grid';
  if (k.key === 'h' || k.key === 'H') return 'hide';
  if (k.key === 'i' || k.key === 'I') return 'isolate';
  if (k.key === 'Home') return 'home';
  return 'viewer';
}

/**
 * 3D 보기(캔버스)가 받은 화살표의 임자(62차 — 코어 0.46.0 가상 커서와 두 점 측정 방향 잠금이 나눠 쓴다): 'core' = 코어(가상 커서 켜기·옮기기), 'lock' = 앱 방향 잠금.
 * 가상 커서가 켜져 있으면 코어, 꺼져 있고 마우스·펜이 3D 보기 위에 있으면 앱(마우스로 첫 점을 찍고 화살표로 잠그던 흐름 그대로), 아니면 코어
 */
export function arrowOwner(cursorOn: boolean, pointerIn: boolean): 'core' | 'lock' {
  return !cursorOn && pointerIn ? 'lock' : 'core';
}

/** 키보드로 값을 바꾸는 조작 칸 */
export type Control = 'range' | 'radio';

const ARROW_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const RANGE_KEYS = new Set([...ARROW_KEYS, 'Home', 'End', 'PageUp', 'PageDown']);

/** 이벤트 대상이 밀대(range)·라디오면 그 종류(그 칸이 쓰는 키는 뷰어·홈 뷰로 보내지 않는다) */
export function controlOf(t: EventTarget | null): Control | null {
  if (!t || (t as HTMLElement).tagName !== 'INPUT') return null;
  const type = ((t as HTMLInputElement).type || '').toLowerCase();
  return type === 'range' || type === 'radio' ? type : null;
}

/** 이벤트 대상이 글 입력 칸인지 */
export function isTextTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== 'string') return false;
  const el = t as HTMLElement;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return !!el.isContentEditable;
}
