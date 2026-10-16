/**
 * 파일 이름·주소 인자 다루기(순수 함수).
 */

/** 여는 확장자(소문자) */
export const STEP_EXTENSIONS = ['.stp', '.step', '.p21'] as const;

/** 열기 상자 accept(대소문자 모두 — 일부 휴대폰 브라우저는 대소문자를 가린다) */
export const STEP_ACCEPT = [...STEP_EXTENSIONS, ...STEP_EXTENSIONS.map((e) => e.toUpperCase())].join(',');

/** 확장자가 STEP인지(대소문자 무시) */
export function isStepName(name: string): boolean {
  const n = name.toLowerCase();
  return STEP_EXTENSIONS.some((e) => n.endsWith(e));
}

/** 경로·주소의 마지막 이름(쿼리·해시 뺌, % 풀기) */
export function baseName(path: string): string {
  const clean = path.split(/[?#]/)[0] ?? '';
  const last = clean.split(/[\\/]/).filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/** 확장자 뺀 이름(그림 저장 이름 등) */
export function stemName(name: string): string {
  const b = baseName(name) || name;
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(0, i) : b;
}

export interface StartQuery {
  /** ?open=<주소>(같은 출처만) — 풀어 둔 절대 주소 */
  open: string | null;
  /** ?open 값이 있었지만 받아들이지 않은 이유 */
  openError: string | null;
  /** ?sample — 예제 바로 열기 */
  sample: boolean;
}

/**
 * 시작 주소 인자 읽기. `?open=`은 이 페이지와 같은 출처(http·https)의 주소만 받는다
 * (다른 사이트 파일을 몰래 받아 오지 않게). `?sample`은 값과 관계없이 예제를 연다.
 */
export function parseStartQuery(search: string, pageHref: string): StartQuery {
  const q = new URLSearchParams(search);
  const out: StartQuery = { open: null, openError: null, sample: q.has('sample') };
  const raw = q.get('open');
  if (raw !== null && raw.trim()) {
    const url = sameOriginUrl(raw.trim(), pageHref);
    if (url) out.open = url;
    else out.openError = '?open 주소는 이 페이지와 같은 사이트의 파일만 열 수 있습니다.';
  }
  return out;
}

/** 상대·절대 주소를 풀어 같은 출처(http·https)면 절대 주소, 아니면 null */
export function sameOriginUrl(raw: string, pageHref: string): string | null {
  let page: URL;
  let url: URL;
  try {
    page = new URL(pageHref);
    url = new URL(raw, page);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== page.origin) return null;
  return url.href;
}
