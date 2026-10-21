/**
 * 창 전체 키 처리 규칙(순수 함수). 캔버스에 초점이 있으면 뷰어가 F·1~7·Esc(측정 지우기)를 직접 받고
 * 전파를 멈추므로, 여기에는 뷰어가 받지 않은 키만 온다(app 쪽에서 창의 bubble 단계로 듣는다).
 * F·1~7 같은 뷰어 키의 뜻은 앱이 따로 들지 않고 `Viewer3d.handleKey`에 넘겨 코어 규칙을 그대로 쓴다.
 */
import { VIEW_KEYS, type ViewName } from 'opencad-viewer3d';

/** 표준 뷰 메뉴 순서 */
export const VIEW_MENU: ViewName[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'seIso', 'swIso', 'neIso', 'nwIso'];

/** 표준 뷰 → 단축키 글(코어 VIEW_KEYS에서 찾는다, 없으면 undefined) */
export function viewKeyOf(v: ViewName): string | undefined {
  return Object.keys(VIEW_KEYS).find((k) => VIEW_KEYS[k] === v);
}

/**
 * 할 일:
 * - open: 열기 상자(Ctrl/⌘+O)
 * - escape: 앱 쪽 Esc 순서(메뉴 닫기 → 해석 취소 → 측정 지우기·끄기 → 고르기 풀기)
 * - grid: 격자(F7, 코어는 받지 않는 키)
 * - hide: 고른 것 숨기기(H), isolate: 고른 것만 보기·격리 풀기(I), home: 홈 뷰(Home)
 * - viewer: 뷰어 키일 수 있으니 `viewer.handleKey`에 넘긴다(F·1~7 등, 처리 여부는 코어가 정한다)
 */
export type KeyAction = 'open' | 'grid' | 'escape' | 'hide' | 'isolate' | 'home' | 'viewer';

export interface KeyInput {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  /** 글 입력 칸(input·textarea·select·contentEditable)에서 눌렀는지 */
  inText?: boolean;
  /** 열린 문서가 있는지 */
  hasDoc?: boolean;
}

/** 눌린 키 → 할 일(없으면 null) */
export function routeKey(k: KeyInput): KeyAction | null {
  if (k.inText) return null;
  const mod = !!(k.ctrl || k.meta);
  if (mod && !k.alt && (k.key === 'o' || k.key === 'O')) return 'open';
  if (mod || k.alt) return null;
  if (k.key === 'Escape') return 'escape';
  if (!k.hasDoc) return null;
  if (k.key === 'F7') return 'grid';
  if (k.key === 'h' || k.key === 'H') return 'hide';
  if (k.key === 'i' || k.key === 'I') return 'isolate';
  if (k.key === 'Home') return 'home';
  return 'viewer';
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
