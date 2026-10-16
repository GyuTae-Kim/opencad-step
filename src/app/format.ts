/**
 * 화면 글 만들기(순수 함수): 크기·시간·수·좌표·진행 단계.
 */

/** 바이트 수 → "12.3 KB"(1024 단위) */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${trimZeros(v.toFixed(digits))} ${units[i]}`;
}

/** 밀리초 → "850 ms", "1.25초", "2분 5초" */
export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${trimZeros(s.toFixed(s < 10 ? 2 : 1))}초`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s - m * 60);
  return rest ? `${m}분 ${rest}초` : `${m}분`;
}

/** 수 → 글(소수 digits 자리까지, 끝 0 없이, 천 단위 쉼표) */
export function fmtNum(v: number | undefined | null, digits = 3): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(digits));
  return Object.is(r, -0) || r === 0 ? '0' : r.toLocaleString('ko-KR', { maximumFractionDigits: digits });
}

/** 정수 개수 → "1,234" */
export function fmtCount(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('ko-KR');
}

/** 좌표 → "x, y, z" */
export function fmtPt(p: readonly number[] | undefined | null, digits = 3): string {
  if (!p || p.length < 3) return '—';
  return `${fmtNum(p[0], digits)}, ${fmtNum(p[1], digits)}, ${fmtNum(p[2], digits)}`;
}

/** 0~1 → "42%" */
export function fmtPercent(f: number): string {
  if (!Number.isFinite(f)) return '0%';
  return `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
}

const STAGES: Record<string, string> = {
  읽기: '파일 읽는 중',
  구조: '제품 구조 읽는 중',
  삼각화: '곡면 삼각화 중',
  완료: '결과 넘기는 중',
};

/** 해석기 단계 이름(stepToScene onProgress) → 덮개에 보일 글 */
export function stageLabel(stage: string): string {
  return STAGES[stage] ?? (stage ? `${stage} 중` : '읽는 중');
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
