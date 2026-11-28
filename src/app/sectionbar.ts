/**
 * 단면 막대(3D 보기 왼쪽 위)와 3D 보기 위 단면 손잡이.
 *
 * - 막대: 축(X·Y·Z — 면으로 자른 단면이면 어느 축도 켜지지 않고 "면"), 위치 슬라이더(장면 범위 0~1), 위치 숫자 칸(표시 단위,
 *   축 단면은 그 축 좌표, 면 단면은 법선 방향 위치), 뒤집기, 끄기. 표시는 코어 onSectionChange 알림(sync)으로만 맞춘다.
 * - 손잡이: 코어 sectionHandle()이 주는 화면 점(평면 위 장면 가운데)에 법선 방향 화살표를 그리고, 끌면 moveSectionByPixels로
 *   평면을 법선 방향으로 옮긴다(카메라가 바뀌면 place로 자리를 다시 잡는다).
 */
import type { SectionAxis, SectionState, Viewer3d } from 'opencad-viewer3d';
import type { Fmt } from './display';
import { h, icon } from './dom';

export interface SectionBarHost {
  readonly viewerRef: Viewer3d | null;
  readonly fmt: Fmt;
  readonly hasDoc: boolean;
  setSectionAxis(axis: SectionAxis | null): void;
  /** 알림 칸(155차 — 숫자 칸이 받지 않는 값) */
  toast?(msg: string, kind: 'warn', ms: number): void;
}

export class SectionBar {
  readonly el: HTMLElement;
  readonly handle: HTMLElement;
  private readonly axisBtns = new Map<SectionAxis, HTMLButtonElement>();
  private readonly faceTag: HTMLElement;
  private readonly slider: HTMLInputElement;
  private readonly label: HTMLElement;
  private readonly num: HTMLInputElement;
  private readonly unit: HTMLElement;
  private readonly flipBtn: HTMLButtonElement;
  /** 숫자 칸에 보인 지금 위치 글(받지 않는 값이면 되돌린다 — 155차) */
  private shown = '';
  private drag: { id: number; x: number; y: number } | null = null;

  constructor(private readonly host: SectionBarHost) {
    const axes = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '단면 축' });
    for (const a of ['x', 'y', 'z'] as const) {
      const b = h('button', { type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': 'false', title: `${a.toUpperCase()}축에 수직인 평면` }, a.toUpperCase());
      b.addEventListener('click', () => host.setSectionAxis(a));
      this.axisBtns.set(a, b);
      axes.append(b);
    }
    this.faceTag = h('span', { class: 'section-face', title: '고른 면(또는 축)으로 자른 단면', hidden: true }, '면');
    this.slider = h('input', { type: 'range', class: 'section-slider', min: '0', max: '1000', step: '1', 'aria-label': '단면 위치' });
    this.slider.addEventListener('input', () => host.viewerRef?.setSectionPosition(Number(this.slider.value) / 1000));
    this.label = h('span', { class: 'section-lbl' });
    // 위치 숫자 칸(표시 단위): 바꾸면 그 위치로(Enter·초점 잃기). 123차: 원점을 걸친 장면은 음수 위치를 쳐 넣어야 해 inputmode="decimal"을 두지 않는다
    // (소수 자판은 음수 기호를 약속하지 않음 — 휴대폰·태블릿 자판은 type="number"에 맞춰 브라우저가 고른다)
    // 174차: 옆에 보이는 단위 글(mm·in·m)을 설명으로 잇는다(WCAG 3.3.2 — 이름 뒤에 단위가 들림, 단면 막대는 하나뿐이라 고정 id)
    this.num = h('input', { type: 'number', class: 'section-num', step: 'any', 'aria-label': '단면 위치(숫자)', 'aria-describedby': 'section-unit' });
    this.num.addEventListener('change', () => this.applyNumber());
    this.num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.applyNumber();
      }
      // 숫자 칸의 Esc는 칸만(창 Esc 순서로 넘기지 않는다)
      if (e.key === 'Escape') e.stopPropagation();
    });
    this.unit = h('span', { class: 'section-unit', id: 'section-unit' });
    this.flipBtn = h('button', { type: 'button', class: 'icon-btn', title: '잘라 내는 쪽 뒤집기', 'aria-label': '잘라 내는 쪽 뒤집기', 'aria-pressed': 'false' });
    this.flipBtn.append(icon('flip', 16));
    this.flipBtn.addEventListener('click', () => host.viewerRef?.flipSection());
    const close = h('button', { type: 'button', class: 'icon-btn', title: '단면 끄기', 'aria-label': '단면 끄기' });
    close.append(icon('close', 16));
    close.addEventListener('click', () => host.setSectionAxis(null));
    const value = h('span', { class: 'section-val' }, this.label, this.num, this.unit);
    this.el = h('div', { class: 'section-bar', role: 'group', 'aria-label': '단면 보기', hidden: true }, icon('section', 16), axes, this.faceTag, this.slider, value, this.flipBtn, close);

    // 3D 보기 위 손잡이: 끌어 평면을 법선 방향으로 옮긴다. 187차(WCAG 4.1.2): 키도 Tab 멈춤도 없이 끌기만 받아 값 없는 조작 못 하는 slider로 읽혔다 —
    // 같은 값은 위 밀대(키·이름·값 글 — 146차)·숫자 칸이 나르니 끌기 덧그림(조준 십자선·분해 거리 글상자 꼴)처럼 꾸밈으로 숨기고 초점도 받지 않는다
    this.handle = h('div', { class: 'section-handle', title: '끌어서 단면 옮기기', hidden: true, 'aria-hidden': 'true' });
    this.handle.innerHTML =
      '<svg width="44" height="44" viewBox="-22 -22 44 44" aria-hidden="true"><circle r="7" class="sh-dot"/><path class="sh-arrow" d="M0 -6V-19M-5 -14 0 -19 5 -14"/><path class="sh-arrow back" d="M0 6V19M-5 14 0 19 5 14"/></svg>';
    this.handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      try {
        this.handle.setPointerCapture(e.pointerId);
      } catch {
        /* 시험 환경 */
      }
      this.handle.classList.add('dragging');
    });
    this.handle.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      e.preventDefault();
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      if (dx || dy) host.viewerRef?.moveSectionByPixels(dx, dy);
    });
    const end = (e: PointerEvent) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      this.drag = null;
      this.handle.classList.remove('dragging');
    };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', end);
  }

  /**
   * 숫자 칸 값(표시 단위) → 단면 위치(장면 단위, 기준 방향 위치). 155차: 빈 칸·읽지 못한 글(브라우저가 빈 글로 돌림)은 전처럼 `Number('')` = 0으로
   * 단면을 0 위치로 말없이 옮기지 않고 칸을 보이던 위치로 되돌려 알림 칸에 까닭(분해 거리 칸 꼴). 범위 밖 수는 코어가 받는 값이라 그대로
   */
  private applyNumber(): void {
    const s = this.num.value.replace(',', '.');
    const v = Number(s);
    const viewer = this.host.viewerRef;
    if (!viewer) return;
    if (!s || !Number.isFinite(v)) {
      this.num.value = this.shown;
      this.host.toast?.('단면 위치를 읽지 못했습니다 — 수 하나를 쳐 넣으십시오.', 'warn', 5000);
      return;
    }
    viewer.setSectionPosition(this.host.fmt.toScene(v), { world: true });
  }

  /** 코어 단면 상태에 맞춘다(null = 꺼짐) */
  sync(st: SectionState | null): void {
    this.el.hidden = !st || !this.host.hasDoc;
    if (st) {
      for (const [a, b] of this.axisBtns) {
        const on = st.axis === a;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', String(on));
      }
      this.faceTag.hidden = st.axis !== null;
      // 끄는 중인 슬라이더 값은 건드리지 않는다(되돌아가며 떨리지 않게)
      if (document.activeElement !== this.slider) this.slider.value = String(Math.round(Math.max(0, Math.min(1, st.t)) * 1000));
      const f = this.host.fmt;
      this.label.textContent = st.axis ? `${st.axis.toUpperCase()} =` : '위치';
      // 숫자 칸은 언어와 상관없이 점 소수(input type=number)
      const n = (this.shown = String(Number((st.position * f.factor).toFixed(f.decimals))));
      if (document.activeElement !== this.num) this.num.value = n;
      this.num.step = String(10 ** -Math.min(3, f.decimals));
      this.unit.textContent = f.unit;
      // 146차: 0~1000 막대가 속 수 대신 옆 값 글(「X = 10 mm」)을 읽게(NC 140차 꼴). 번역층이 옮기지 않는 속성이라 낱말(면 단면 「위치」)은 빼고, 끄는 동안에도 지금 상태로
      // 233차: 읽는 글이라 수는 화면 언어 꼴(Fmt — 독일어 「X = 12,5 mm」, 같은 반올림), 숫자 칸 값 n은 점 소수 그대로
      this.slider.setAttribute('aria-valuetext', `${st.axis ? `${st.axis.toUpperCase()} = ` : ''}${f.lenNum(st.position)}${f.unit ? ` ${f.unit}` : ''}`);
      this.flipBtn.setAttribute('aria-pressed', String(st.flip));
      this.flipBtn.classList.toggle('on', st.flip);
      const ax = (st.axis ?? '').toUpperCase();
      this.flipBtn.title = st.axis ? (st.flip ? `−${ax} 쪽을 잘라 냅니다 — 눌러서 뒤집기` : `+${ax} 쪽을 잘라 냅니다 — 눌러서 뒤집기`) : '잘라 내는 쪽 뒤집기';
    }
    this.place();
  }

  /** 손잡이 자리(카메라·단면이 바뀔 때) */
  place(): void {
    const v = this.host.viewerRef;
    const hd = v && this.host.hasDoc && v.section ? v.sectionHandle() : null;
    const w = v?.canvas.clientWidth ?? 0;
    const hgt = v?.canvas.clientHeight ?? 0;
    if (!hd || hd.x < 0 || hd.y < 0 || hd.x > w || hd.y > hgt) {
      this.handle.hidden = true;
      return;
    }
    this.handle.hidden = false;
    // 화살표가 법선(잘라 내는 쪽)을 향하게, 눈을 바로 향하면 위아래(세로 끌기)
    const ang = hd.dx || hd.dy ? (Math.atan2(hd.dy, hd.dx) * 180) / Math.PI + 90 : 0;
    this.handle.style.transform = `translate(${hd.x - 22}px, ${hd.y - 22}px) rotate(${ang}deg)`;
  }
}
