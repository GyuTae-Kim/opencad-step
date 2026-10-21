/**
 * 표시 설정(순수, DOM 없음): 길이 단위(파일 단위·mm·인치)와 소수 자리, 곡면 품질(삼각화 세밀함), 화면 언어에 맞춘 수 꼴.
 * 모든 화면 글(측정 띠·패널·상태 막대·단면 값·속성)은 Fmt 하나로 숫자를 만든다.
 * 장면 좌표는 장면 단위(Scene3d.units) 그대로 두고, 보일 때만 배율(factor)을 곱한다.
 * 설정은 이 브라우저(localStorage)에 기억한다.
 */
import type { Scene3d } from 'opencad-viewer3d/types';

/** 길이 단위 고르기: 파일 단위 그대로, 밀리미터, 인치 */
export type UnitChoice = 'file' | 'mm' | 'in';

/** 곡면 품질(삼각화 세밀함): 보통(기본)·세밀·아주 세밀 */
export type Quality = 'normal' | 'fine' | 'finest';

export interface DisplaySettings {
  unit: UnitChoice;
  /** 소수 자리(0~6) */
  decimals: number;
  quality: Quality;
}

export const DEFAULT_DISPLAY: DisplaySettings = { unit: 'file', decimals: 3, quality: 'normal' };

/** 곡면 품질 → 삼각화 선택(크기 대비 현 높이, 최대 각 — 기본은 해석기 기본값) */
export const QUALITY_OPTIONS: Record<Quality, { tolerance?: number; angleTolerance?: number }> = {
  normal: {},
  fine: { tolerance: 0.0003, angleTolerance: 10 },
  finest: { tolerance: 0.0001, angleTolerance: 5 },
};
export const DISPLAY_KEY = 'opencad-step-display';
export const MAX_DECIMALS = 6;

type Store = Pick<Storage, 'getItem' | 'setItem'> | null;

/** 기억한 표시 설정(없거나 꼴이 틀리면 기본) */
export function readDisplaySettings(store: Store): DisplaySettings {
  try {
    const raw = store?.getItem(DISPLAY_KEY);
    if (!raw) return { ...DEFAULT_DISPLAY };
    const o = JSON.parse(raw) as Partial<DisplaySettings>;
    const unit: UnitChoice = o.unit === 'mm' || o.unit === 'in' ? o.unit : 'file';
    const d = Number(o.decimals);
    const quality: Quality = o.quality === 'fine' || o.quality === 'finest' ? o.quality : 'normal';
    return { unit, decimals: Number.isInteger(d) ? Math.max(0, Math.min(MAX_DECIMALS, d)) : DEFAULT_DISPLAY.decimals, quality };
  } catch {
    return { ...DEFAULT_DISPLAY };
  }
}

export function writeDisplaySettings(store: Store, s: DisplaySettings): void {
  try {
    store?.setItem(DISPLAY_KEY, JSON.stringify({ unit: s.unit, decimals: s.decimals, quality: s.quality }));
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
}

/** 장면 단위 1이 몇 mm인지(모르면 NaN) */
export function sceneMm(u: Scene3d['units']): number {
  return u === 'mm' ? 1 : u === 'inch' ? 25.4 : u === 'm' ? 1000 : NaN;
}

/** 화면 언어(lang 속성, 예: ko·en·de·zh-CN) → Intl 로캘 */
export function numberLocale(lang: string | undefined): string {
  const l = (lang || 'ko').trim();
  return l === 'ko' ? 'ko-KR' : l;
}

/**
 * 수 꼴 만들기: 장면 단위 값을 표시 단위로 바꾸고, 소수 자리·언어에 맞춰 쓴다.
 * 장면 단위를 모르면(unknown) 단위 없이 값 그대로(바꾸지 않는다).
 */
export class Fmt {
  /** 장면 단위 1 → 표시 단위 몇 */
  readonly factor: number;
  /** 표시 단위 글(mm·in·m, 모르면 '') */
  readonly unit: string;
  readonly decimals: number;
  readonly locale: string;
  /** 좌표 구분 글: 소수점이 쉼표인 언어(독일어 등)는 "; " */
  readonly sep: string;
  private readonly nf: Intl.NumberFormat;

  constructor(sceneUnits: Scene3d['units'] = 'mm', settings: DisplaySettings = DEFAULT_DISPLAY, locale = 'ko-KR') {
    const mm = sceneMm(sceneUnits);
    const choice = Number.isFinite(mm) ? settings.unit : 'file';
    this.decimals = Math.max(0, Math.min(MAX_DECIMALS, Math.round(settings.decimals)));
    if (choice === 'mm') {
      this.factor = mm;
      this.unit = 'mm';
    } else if (choice === 'in') {
      this.factor = mm / 25.4;
      this.unit = 'in';
    } else {
      this.factor = 1;
      this.unit = sceneUnits === 'mm' ? 'mm' : sceneUnits === 'inch' ? 'in' : sceneUnits === 'm' ? 'm' : '';
    }
    let nf: Intl.NumberFormat;
    try {
      nf = new Intl.NumberFormat(locale, { maximumFractionDigits: this.decimals });
    } catch {
      nf = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: this.decimals });
    }
    this.nf = nf;
    this.locale = nf.resolvedOptions().locale;
    this.sep = nf.format(1.5).includes(',') ? '; ' : ', ';
  }

  /** 단위 없는 수(소수 자리 digits, 기본은 설정) — 반올림해 0이면 "0"(−0 없음) */
  num(v: number | undefined | null, digits = this.decimals): string {
    if (v === undefined || v === null || !Number.isFinite(v)) return '—';
    const r = Number(v.toFixed(Math.max(0, Math.min(MAX_DECIMALS, digits))));
    if (r === 0 || Object.is(r, -0)) return '0';
    return digits === this.decimals ? this.nf.format(r) : r.toLocaleString(this.locale, { maximumFractionDigits: digits });
  }

  /** 길이(장면 단위) → 표시 단위 수(단위 글 없이) */
  lenNum(v: number | undefined | null): string {
    return this.num(v === undefined || v === null ? v : v * this.factor);
  }

  /** 길이 → "12.345 mm" */
  len(v: number | undefined | null): string {
    return `${this.lenNum(v)}${this.unit ? ` ${this.unit}` : ''}`;
  }

  /** 넓이(장면 단위²) → "12.3 mm²" */
  area(v: number | undefined | null): string {
    const s = this.num(v === undefined || v === null ? v : v * this.factor * this.factor);
    return `${s}${this.unit ? ` ${this.unit}²` : ''}`;
  }

  /** 부피(장면 단위³) → "12.3 mm³" */
  vol(v: number | undefined | null): string {
    const s = this.num(v === undefined || v === null ? v : v * this.factor ** 3);
    return `${s}${this.unit ? ` ${this.unit}³` : ''}`;
  }

  /** 좌표(장면 단위) → "x, y, z"(단위 글 없이, 쉼표 소수 언어는 "; ") */
  pt(p: readonly number[] | undefined | null): string {
    if (!p || p.length < 3) return '—';
    return [0, 1, 2].map((k) => this.lenNum(p[k])).join(this.sep);
  }

  /** 방향(단위 없는 벡터) → "x, y, z" */
  dir(p: readonly number[] | undefined | null): string {
    if (!p || p.length < 3) return '—';
    return [0, 1, 2].map((k) => this.num(p[k])).join(this.sep);
  }

  /** 각도(도) → "30°" */
  deg(v: number | undefined | null): string {
    return `${this.num(v)}°`;
  }

  /** 표시 단위 값 → 장면 단위(숫자 입력 칸에서 받은 값을 되돌릴 때) */
  toScene(v: number): number {
    return v / this.factor;
  }
}
