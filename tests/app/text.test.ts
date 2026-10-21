import { describe, expect, it } from 'vitest';
import { baseName, isStepName, parseStartQuery, sameOriginUrl, STEP_ACCEPT, stemName, withoutOnceParams } from '../../src/app/files';
import { fmtCount, fmtNum, fmtPercent, fmtPt, formatBytes, formatMs, stageLabel } from '../../src/app/format';
import { VIEW_KEYS } from 'opencad-viewer3d';
import { isTextTarget, routeKey, VIEW_MENU, viewKeyOf } from '../../src/app/keys';
import { readStoredTheme, resolveTheme, THEME_KEY, writeStoredTheme } from '../../src/app/theme';

describe('크기·시간·수 글', () => {
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(23_263)).toBe('22.7 KB');
    expect(formatBytes(150 * 1024)).toBe('150 KB');
    expect(formatBytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
    expect(formatBytes(3 * 1024 ** 3)).toBe('3 GB');
    expect(formatBytes(-1)).toBe('—');
    expect(formatBytes(NaN)).toBe('—');
  });

  it('formatMs', () => {
    expect(formatMs(0)).toBe('0 ms');
    expect(formatMs(850.4)).toBe('850 ms');
    expect(formatMs(1250)).toBe('1.25초');
    expect(formatMs(12_340)).toBe('12.3초');
    expect(formatMs(125_000)).toBe('2분 5초');
    expect(formatMs(120_000)).toBe('2분');
    expect(formatMs(Infinity)).toBe('—');
  });

  it('fmtNum·fmtCount·fmtPt·fmtPercent', () => {
    expect(fmtNum(1234.56789)).toBe('1,234.568');
    expect(fmtNum(-0.0001)).toBe('0');
    expect(fmtNum(2, 1)).toBe('2');
    expect(fmtNum(undefined)).toBe('—');
    expect(fmtCount(1234567.4)).toBe('1,234,567');
    expect(fmtCount(null)).toBe('—');
    expect(fmtPt([1, 2.5, -3])).toBe('1, 2.5, -3');
    expect(fmtPt([1, 2])).toBe('—');
    expect(fmtPercent(0.426)).toBe('43%');
    expect(fmtPercent(2)).toBe('100%');
    expect(fmtPercent(NaN)).toBe('0%');
  });

  it('stageLabel', () => {
    expect(stageLabel('삼각화')).toBe('곡면 삼각화 중');
    expect(stageLabel('읽기')).toBe('파일 읽는 중');
    expect(stageLabel('새 단계')).toBe('새 단계 중');
    expect(stageLabel('')).toBe('읽는 중');
  });
});

describe('파일 이름·주소 인자', () => {
  it('isStepName·STEP_ACCEPT(대소문자)', () => {
    expect(isStepName('a.stp')).toBe(true);
    expect(isStepName('A.STEP')).toBe(true);
    expect(isStepName('x.P21')).toBe(true);
    expect(isStepName('x.stpz')).toBe(false);
    expect(isStepName('x.dxf')).toBe(false);
    expect(STEP_ACCEPT).toBe('.stp,.step,.p21,.STP,.STEP,.P21');
  });

  it('baseName·stemName', () => {
    expect(baseName('/models/%ED%95%80.stp?x=1#h')).toBe('핀.stp');
    expect(baseName('C:\\work\\part.step')).toBe('part.step');
    expect(baseName('/bad/%E0%A4%A.stp')).toBe('%E0%A4%A.stp');
    expect(stemName('part.v2.step')).toBe('part.v2');
    expect(stemName('.hidden')).toBe('.hidden');
  });

  it('parseStartQuery: ?sample, 같은 출처 ?open만', () => {
    const page = 'https://gyutae-kim.github.io/opencad-step/?open=x';
    expect(parseStartQuery('?sample', page)).toEqual({ open: null, openError: null, sample: true, recent: null, shareError: null });
    expect(parseStartQuery('?open=models/a.stp', page).open).toBe('https://gyutae-kim.github.io/opencad-step/models/a.stp');
    expect(parseStartQuery('?open=/x/b.step', page).open).toBe('https://gyutae-kim.github.io/x/b.step');
    const bad = parseStartQuery('?open=https://evil.example/a.stp', page);
    expect(bad.open).toBeNull();
    expect(bad.openError).toMatch(/같은 사이트/);
    expect(parseStartQuery('?open=javascript:alert(1)', page).open).toBeNull();
    expect(parseStartQuery('?open=', page)).toEqual({ open: null, openError: null, sample: false, recent: null, shareError: null });
    // 공유 받기(서비스 워커가 보낸 한 번짜리 인자)
    expect(parseStartQuery('?recent=a.stp%3A12', page).recent).toBe('a.stp:12');
    expect(parseStartQuery('?share-error=too-big', page).shareError).toBe('too-big');
    expect(withoutOnceParams('https://x.test/app/?recent=a&sample&share-error=x#view=sel:0')).toBe('/app/?sample=#view=sel:0');
    expect(sameOriginUrl('//gyutae-kim.github.io/a.stp', page)).toBe('https://gyutae-kim.github.io/a.stp');
    expect(sameOriginUrl('a.stp', 'not a url')).toBeNull();
  });
});

describe('키 규칙', () => {
  it('표준 뷰 메뉴의 키 글은 코어 VIEW_KEYS에서', () => {
    expect(VIEW_MENU).toHaveLength(10);
    for (const [k, v] of Object.entries(VIEW_KEYS)) expect(viewKeyOf(v)).toBe(k);
    expect(viewKeyOf('top')).toBe('5');
    expect(viewKeyOf('nwIso')).toBeUndefined();
    expect(VIEW_MENU.filter((v) => viewKeyOf(v))).toHaveLength(Object.keys(VIEW_KEYS).length);
  });

  it('routeKey: 뷰어 키는 코어(handleKey)로, F7·Esc·Ctrl+O는 앱이', () => {
    expect(routeKey({ key: 'f', hasDoc: true })).toBe('viewer');
    expect(routeKey({ key: '5', hasDoc: true })).toBe('viewer');
    expect(routeKey({ key: '8', hasDoc: true })).toBe('viewer'); // 처리 여부는 코어가 정한다
    expect(routeKey({ key: 'F7', hasDoc: true })).toBe('grid');
    expect(routeKey({ key: 'Escape', hasDoc: true })).toBe('escape');
    expect(routeKey({ key: 'Escape', hasDoc: false })).toBe('escape');
    expect(routeKey({ key: 'f', hasDoc: false })).toBeNull();
    expect(routeKey({ key: 'F7', hasDoc: false })).toBeNull();
    expect(routeKey({ key: 'f', hasDoc: true, inText: true })).toBeNull();
    expect(routeKey({ key: 'Escape', hasDoc: true, inText: true })).toBeNull();
    expect(routeKey({ key: 'f', hasDoc: true, ctrl: true })).toBeNull();
    expect(routeKey({ key: '1', hasDoc: true, alt: true })).toBeNull();
    expect(routeKey({ key: 'o', ctrl: true })).toBe('open');
    expect(routeKey({ key: 'O', meta: true })).toBe('open');
    expect(routeKey({ key: 'o', ctrl: true, alt: true })).toBeNull();
    expect(routeKey({ key: 'o', ctrl: true, inText: true })).toBeNull();
  });

  it('isTextTarget', () => {
    const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as EventTarget;
    expect(isTextTarget(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isTextTarget(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTextTarget(el('TEXTAREA'))).toBe(true);
    expect(isTextTarget(el('SELECT'))).toBe(true);
    expect(isTextTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTextTarget(el('CANVAS'))).toBe(false);
    expect(isTextTarget(null)).toBe(false);
  });
});

describe('테마', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
  };
  it('기본은 시스템 설정, 고르면 기억', () => {
    const s = mem();
    expect(readStoredTheme(s)).toBeNull();
    expect(resolveTheme(readStoredTheme(s), true)).toBe('dark');
    expect(resolveTheme(readStoredTheme(s), false)).toBe('light');
    expect(writeStoredTheme(s, 'light')).toBe(true);
    expect(s.m.get(THEME_KEY)).toBe('light');
    expect(resolveTheme(readStoredTheme(s), true)).toBe('light');
    writeStoredTheme(s, null);
    expect(readStoredTheme(s)).toBeNull();
    s.m.set(THEME_KEY, 'purple');
    expect(readStoredTheme(s)).toBeNull();
  });
  it('저장소가 없거나 예외를 던져도 앱이 돈다', () => {
    const boom = {
      getItem: () => {
        throw new Error('막힘');
      },
      setItem: () => {
        throw new Error('막힘');
      },
      removeItem: () => {
        throw new Error('막힘');
      },
    };
    expect(readStoredTheme(boom)).toBeNull();
    expect(writeStoredTheme(boom, 'dark')).toBe(false);
    expect(readStoredTheme(null)).toBeNull();
    expect(writeStoredTheme(undefined, 'dark')).toBe(false);
  });
});
