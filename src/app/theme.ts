/**
 * 밝은·어두운 테마: 기본은 시스템 설정을 따르고, 사용자가 고르면 localStorage에 기억한다.
 * 저장소를 못 쓰는 환경(사생활 보호 창, 막힌 사이트 자료)에서도 앱이 돌도록 읽고 쓰기를 모두 try/catch로 감싼다.
 */
export type Theme = 'light' | 'dark';

export const THEME_KEY = 'opencad-step.theme';

/** 저장한 선택(없거나 못 읽으면 null) */
export function readStoredTheme(storage: Pick<Storage, 'getItem'> | null | undefined): Theme | null {
  try {
    const v = storage?.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** 선택 저장(null이면 지워서 시스템 설정을 따르게) — 성공하면 true */
export function writeStoredTheme(storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined, theme: Theme | null): boolean {
  try {
    if (!storage) return false;
    if (theme) storage.setItem(THEME_KEY, theme);
    else storage.removeItem(THEME_KEY);
    return true;
  } catch {
    return false;
  }
}

/** 실제로 쓸 테마: 저장한 선택이 있으면 그것, 없으면 시스템 설정 */
export function resolveTheme(stored: Theme | null, systemDark: boolean): Theme {
  return stored ?? (systemDark ? 'dark' : 'light');
}

/** 안전하게 localStorage 얻기(접근만 해도 예외가 나는 환경이 있다) */
export function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
