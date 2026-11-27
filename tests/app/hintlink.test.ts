// @vitest-environment jsdom
/**
 * 174차: 고르기 칸·숫자 칸 옆에 보이는 안내·단위 글을 화면 읽기 설명으로 잇기(WCAG 1.3.1·3.3.2 — 168차가 남은 일에 보고 둔 다음 후보).
 * `src/app/dialog.ts` `selectRow`는 감싼 label 안에 이름표·고르기 칸·안내(span.dlg-hint)를 두지만 고르기 칸의 aria-label이 이름을 정해
 * 안내 글이 이름에도 설명에도 들지 않았다(표시 설정 「길이 단위」·「곡면 품질」, 그림 저장 「크기」 — 초점으로 옮겨 다니면 이름·값만 들림).
 * 단면 막대 위치 숫자 칸 옆 단위 글(span.section-unit)도 같았다. 고친 뒤: 안내가 있으면 고르기 칸 aria-describedby → 그 줄의 안내 칸
 * (문서 안에서 하나뿐인 id), 단면 숫자 칸 aria-describedby → 단위 칸. 이름(aria-label)·보이는 글은 그대로이고 새 글은 없다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { SectionState, Viewer3d } from 'opencad-viewer3d';
import { selectRow } from '../../src/app/dialog';
import { Fmt } from '../../src/app/display';
import { imageDialogBody } from '../../src/app/imagedlg';
import { SectionBar } from '../../src/app/sectionbar';

/** 칸의 설명 — aria-describedby가 가리키는 칸들의 글(없으면 null, 가리키는 칸이 문서에 없으면 '?') */
const described = (el: Element): string | null => {
  const ids = el.getAttribute('aria-describedby');
  if (ids === null) return null;
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '?')
    .join(' ');
};

afterEach(() => document.body.replaceChildren());

describe('고르기 칸 밑 안내 글을 설명으로(174차)', () => {
  it('안내가 있으면 고르기 칸의 설명이 그 줄의 안내 칸이고 이름은 그대로, 안내가 없으면 설명 없음 — 여러 줄이어도 저마다 제 안내', () => {
    const a = selectRow('길이 단위', [['mm', '밀리미터 (mm)'], ['in', '인치 (in)']], 'mm', () => {}, '측정(3D 보기 위 글자 포함)·면 정보·속성·단면 값에 씁니다.');
    const b = selectRow('소수 자리', [['0', '0'], ['1', '1']], '1', () => {});
    const c = selectRow('곡면 품질', [['normal', '보통(빠름)'], ['fine', '세밀(각 10°)']], 'normal', () => {}, '곡면을 나누는 삼각형을 촘촘히 합니다.');
    document.body.append(a, b, c);
    const sel = (r: HTMLElement) => r.querySelector('select')!;
    expect([described(sel(a)), described(sel(b)), described(sel(c))]).toEqual(['측정(3D 보기 위 글자 포함)·면 정보·속성·단면 값에 씁니다.', null, '곡면을 나누는 삼각형을 촘촘히 합니다.']);
    expect([sel(a), sel(b), sel(c)].map((s) => s.getAttribute('aria-label'))).toEqual(['길이 단위', '소수 자리', '곡면 품질']);
    // 설명 칸은 그 줄에 보이는 안내 칸 자신(새 글 없음)이고 두 줄의 id가 다르다
    expect(document.getElementById(sel(a).getAttribute('aria-describedby') ?? '')).toBe(a.querySelector('.dlg-hint'));
    expect(document.getElementById(sel(c).getAttribute('aria-describedby') ?? '')).toBe(c.querySelector('.dlg-hint'));
    expect(sel(a).getAttribute('aria-describedby')).not.toBe(sel(c).getAttribute('aria-describedby'));
  });

  it('그림 저장 대화 상자: 안내가 있는 「크기」만 설명이 있고 「바탕」·「덧그림」은 없다', () => {
    const v = { snapshotSize: ({ scale = 1 }: { scale?: number } = {}) => ({ width: 800 * scale, height: 600 * scale, scale }) } as unknown as Pick<Viewer3d, 'snapshotSize'>;
    document.body.append(...imageDialogBody(v, { scale: 1, transparent: false, overlays: true }, () => {}));
    expect([...document.querySelectorAll('select')].map((s) => [s.getAttribute('aria-label'), described(s)])).toEqual([
      ['크기', '화면 화소의 몇 배로 다시 그립니다. 선 굵기·글자도 같은 비율로 커지고, 아주 크면 기기 한도(4096 × 4096 화소)에 맞춰 줄입니다.'],
      ['바탕', null],
      ['덧그림', null],
    ]);
  });
});

describe('단면 위치 숫자 칸 옆 단위 글을 설명으로(174차)', () => {
  it('설명이 옆에 보이는 단위 칸이고(표시 단위가 바뀌면 따라 바뀜) 이름은 그대로', () => {
    const viewer = { section: null, canvas: document.createElement('canvas') } as unknown as Viewer3d;
    const host = { viewerRef: viewer, fmt: new Fmt('mm'), hasDoc: true, setSectionAxis: () => {} };
    const bar = new SectionBar(host);
    document.body.append(bar.el);
    const st = { axis: 'x', flip: false, position: 10, min: -40, max: 40, t: 0.625 } as SectionState;
    bar.sync(st);
    const num = bar.el.querySelector<HTMLInputElement>('.section-num')!;
    expect([num.getAttribute('aria-label'), num.value, described(num)]).toEqual(['단면 위치(숫자)', '10', 'mm']);
    expect(document.getElementById(num.getAttribute('aria-describedby') ?? '')).toBe(bar.el.querySelector('.section-unit'));
    host.fmt = new Fmt('inch');
    bar.sync(st);
    expect(described(num)).toBe('in');
  });
});
