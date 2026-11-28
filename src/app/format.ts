/**
 * 화면 글 만들기(순수 함수): 크기·시간·수·좌표·진행 단계.
 */
import { numberLocale } from './display';

/**
 * 232차(WCAG 3.1.2): 셈 수(fmtCount)·수(fmtNum)는 부를 때마다 화면 언어(`<html lang>` — 번역층 metadata()가 languagechange 알림 전에 바꾼다)의 꼴로 쓴다.
 * 천 단위 묶음은 독일어 「12.345」, 한국어·영어·일본어·중국어 「12,345」(전에는 늘 ko-KR이라 독일어 화면에서도 「12,345」).
 * 소수점도 같은 꼴: 측정 값·패널 수의 Fmt(display.ts)가 같은 numberLocale로 언어 꼴(독일어 「1.234,5」 — measure.test 「거리 1.234,568 mm」)이라 한 꼴로 맞춘다.
 * 문서가 없는 곳(node 시험)은 한국어 꼴. 언어가 바뀌면 다시 그리는 칸(언어 알림 → refreshFmt — 패널·상태 막대)은 새 꼴, 떠 있는 알림은 만든 때 꼴(232차 표)
 */
let nfKey = '';
let nf: Intl.NumberFormat | null = null;
function numberFormat(digits: number): Intl.NumberFormat {
  const locale = numberLocale(typeof document === 'undefined' ? undefined : document.documentElement.lang);
  const key = `${locale} ${digits}`;
  if (!nf || key !== nfKey) {
    try {
      nf = new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
    } catch {
      nf = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits });
    }
    nfKey = key;
  }
  return nf;
}

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

/** 수 → 글(소수 digits 자리까지, 끝 0 없이, 천 단위 묶음 — 화면 언어 꼴) */
export function fmtNum(v: number | undefined | null, digits = 3): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(digits));
  return Object.is(r, -0) || r === 0 ? '0' : numberFormat(digits).format(r);
}

/** 정수 개수 → "1,234"(독일어 화면 "1.234") */
export function fmtCount(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return numberFormat(0).format(Math.round(n));
}

/** 좌표 → "x, y, z"(소수점이 쉼표인 언어는 "x; y; z" — Fmt.pt와 같게) */
export function fmtPt(p: readonly number[] | undefined | null, digits = 3): string {
  if (!p || p.length < 3) return '—';
  const sep = numberFormat(1).format(1.5).includes(',') ? '; ' : ', ';
  return [0, 1, 2].map((k) => fmtNum(p[k], digits)).join(sep);
}

/** 0~1 → "42%" */
export function fmtPercent(f: number): string {
  if (!Number.isFinite(f)) return '0%';
  return `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
}

const STAGES: Record<string, string> = {
  받기: '파일 받는 중',
  '압축 풀기': '압축 푸는 중',
  읽기: '파일 읽는 중',
  구조: '제품 구조 읽는 중',
  삼각화: '곡면 삼각화 중',
  완료: '결과 넘기는 중',
};

/** 해석기 단계 이름(stepToScene onProgress) → 덮개에 보일 글 */
export function stageLabel(stage: string): string {
  return STAGES[stage] ?? (stage ? `${stage} 중` : '읽는 중');
}

/** 그림 저장 크기 글: "2배 — 2560 × 1600 화소"(코어 snapshotSize가 한도 — 한 변 GPU·넓이 4096² — 에 맞춰 줄였으면 그 크기와 알림) */
export function imageSizeLabel(k: number, s: { width: number; height: number; scale: number }): string {
  const clamped = s.scale < k * 0.999;
  return `${k}배 — ${s.width} × ${s.height} 화소${clamped ? '(최대 크기로 줄임)' : ''}`;
}

/** 그림 파일 이름: 이름@2x-transparent.png */
export function imageFileName(stem: string, o: { scale: number; transparent: boolean }): string {
  return `${stem}${o.scale > 1 ? `@${o.scale}x` : ''}${o.transparent ? '-transparent' : ''}.png`;
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}
