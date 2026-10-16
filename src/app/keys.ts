/**
 * 창 전체 키 처리 규칙(순수 함수). 캔버스에 초점이 있으면 뷰어가 F·1~7·Esc(측정 지우기)를 직접 받고
 * 전파를 멈추므로, 여기에는 뷰어가 받지 않은 키만 온다(main 쪽에서 창의 bubble 단계로 듣는다).
 */
import type { ViewName } from 'opencad-viewer3d';

/** 키 1~7 → 표준 뷰(뷰어 코어와 같은 배치) */
export const VIEW_KEYS: Record<string, ViewName> = { '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'top', '6': 'bottom', '7': 'seIso' };

/** 표준 뷰 메뉴 순서 */
export const VIEW_MENU: ViewName[] = ['front', 'back', 'left', 'right', 'top', 'bottom', 'seIso', 'swIso', 'neIso', 'nwIso'];

/** 표준 뷰 → 키 */
export const VIEW_KEY_OF: Partial<Record<ViewName, string>> = Object.fromEntries(Object.entries(VIEW_KEYS).map(([k, v]) => [v, k]));

export type KeyAction = 'open' | 'fit' | 'grid' | 'escape' | `view:${ViewName}`;

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
  if (k.key === 'f' || k.key === 'F') return 'fit';
  const v = VIEW_KEYS[k.key];
  if (v) return `view:${v}`;
  return null;
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
