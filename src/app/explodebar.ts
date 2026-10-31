/**
 * 분해 막대의 방식·방향 고르기와 단계 표시, 장면마다 분해 계획(첫 화면 JS 밖 — 분해 계산 explode.ts와 함께 문서를 열 때 받는다).
 * 앱은 막대 껍데기(밀대·정도·닫기)만 처음부터 갖고, 이 조각을 받으면 방식 단추·방향 단추와 단계 글을 막대에 끼운다.
 * 방향 단추는 한 라디오 묶음 안에 장면 축(사방·X·Y·Z)과 화면 방향(가로·세로·가로세로 — 보는 방향에 수직인 축) 두 칸으로 나눠
 * 휴대폰 폭에서는 화면 칸이 다음 줄로 내려간다.
 */
import type { Scene3d } from 'opencad-viewer3d/types';
import type { StepDoc } from './doc';
import { h } from './dom';
import { explodeMoves, explodePlan, explodeStage, isScreenAxis, type ExplodeAxis, type ExplodeMode, type ExplodePlan, type ExplodeView } from './explode';

/** 화면 방향을 정한 카메라 각의 열쇠(같은 각이면 같은 계획) */
const viewKey = (v: ExplodeView | null | undefined) => (v ? `${v.yaw},${v.pitch}` : '0,0');

export class ExplodeControls {
  /** 방식 단추 묶음·방향 단추 묶음과 단계 글(막대의 .explode-opts에 넣는다) */
  readonly els: HTMLElement[];
  private readonly btns = new Map<ExplodeMode, HTMLButtonElement>();
  private readonly axisBtns = new Map<ExplodeAxis, HTMLButtonElement>();
  private readonly stage: HTMLElement;
  /** 장면·방식·방향마다 계획(묶음 범위를 한 번만 잰다 — 밀대를 움직일 때는 곱하기만). 화면 방향은 마지막 카메라 각 것만 둔다 */
  private readonly plans = new WeakMap<Scene3d, Map<string, ExplodePlan>>();

  constructor(onMode: (mode: ExplodeMode) => void, onAxis: (axis: ExplodeAxis) => void = () => {}) {
    const seg = h('div', { class: 'seg explode-modes', role: 'radiogroup', 'aria-label': '분해 방식' });
    for (const [k, label, title] of [
      ['step', '단계별', '조립 단계별: 바깥 조립부터 벌립니다 — 하위 조립을 통째로 먼저 떼고, 더 밀면 그 안의 부품을 벌립니다'],
      ['all', '한꺼번에', '한꺼번에: 모든 부품을 조립 가운데에서 함께 벌립니다'],
    ] as const) {
      const b = h('button', { type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': 'false', title }, label);
      b.addEventListener('click', () => onMode(k));
      this.btns.set(k, b);
      seg.append(b);
    }
    const axes = h('div', { class: 'explode-axes', role: 'radiogroup', 'aria-label': '분해 방향' });
    const world = h('div', { class: 'seg' });
    const screen = h('div', { class: 'seg' });
    const AIM = '분해를 켜거나 이 단추를 누를 때의 카메라로 정하고, 다시 누르면 지금 카메라로 다시 맞춥니다';
    for (const [k, label, title, name, into] of [
      ['free', '사방', '사방: 부품이 조립 가운데에서 멀어지는 쪽으로 벌립니다', '', world],
      ['x', 'X', 'X축으로만: 부품을 X축 방향으로만 벌립니다', '', world],
      ['y', 'Y', 'Y축으로만: 부품을 Y축 방향으로만 벌립니다', '', world],
      ['z', 'Z', 'Z축으로만: 부품을 Z축 방향으로만 벌립니다', '', world],
      ['sx', '가로', `화면 가로로만: 부품을 지금 화면의 가로 방향으로만 벌립니다 — ${AIM}`, '화면 가로', screen],
      ['sy', '세로', `화면 세로로만: 부품을 지금 화면의 세로 방향으로만 벌립니다 — ${AIM}`, '화면 세로', screen],
      ['sp', '가로세로', `화면 평면: 부품을 보는 방향에 수직인 화면 가로·세로로만 벌립니다 — ${AIM}`, '화면 평면', screen],
    ] as const) {
      const b = h('button', { type: 'button', class: 'seg-btn', role: 'radio', 'aria-checked': 'false', title, ...(name ? { 'aria-label': name } : {}) }, label);
      b.addEventListener('click', () => onAxis(k));
      this.axisBtns.set(k, b);
      into.append(b);
    }
    axes.append(world, h('span', { class: 'explode-screen' }, h('span', { class: 'explode-screen-label', 'aria-hidden': 'true' }, '화면'), screen));
    this.stage = h('span', { class: 'explode-stage', hidden: true });
    this.els = [seg, axes, this.stage];
  }

  /** 문서·방식·방향의 분해 계획(표현 PMI는 제자리). 화면 방향은 view(카메라 각)로 */
  plan(d: StepDoc, mode: ExplodeMode, axis: ExplodeAxis = 'free', view?: ExplodeView | null): ExplodePlan {
    let plans = this.plans.get(d.scene);
    if (!plans) this.plans.set(d.scene, (plans = new Map()));
    const head = `${mode}:${axis}`;
    const key = isScreenAxis(axis) ? `${head}:${viewKey(view)}` : head;
    let p = plans.get(key);
    if (!p) {
      const fixed = d.vis.pmiIds;
      p = explodePlan(
        [...d.scene.meshes, ...d.scene.lines, ...(d.scene.points ?? [])].filter((x) => !fixed.has(x.id)),
        d.products,
        mode,
        axis,
        view ? { view } : {},
      );
      // 화면 방향은 카메라 각마다 계획이 달라 앞 각의 것은 버린다(다시 맞출 때마다 쌓이지 않게)
      if (key !== head) for (const k of [...plans.keys()]) if (k.startsWith(`${head}:`)) plans.delete(k);
      plans.set(key, p);
    }
    return p;
  }

  /** 분해 정도 t(0~1)에서 묶음마다 옮길 양 */
  moves(d: StepDoc, mode: ExplodeMode, t: number, axis: ExplodeAxis = 'free', view?: ExplodeView | null): Map<string, [number, number, number]> {
    return explodeMoves(this.plan(d, mode, axis, view), t);
  }

  /**
   * 방식·방향 단추와 단계 글 맞추기: 조립 단계별이고 단계가 둘 이상이면 "단계 2/3"(지금 벌리는 단계 — 방향을 고르면 그 방향으로 움직이는 단계만 센다).
   * 막대가 닫혀 있으면 계획을 세우지 않는다(큰 모형에서 문서를 열 때 범위를 재지 않게)
   */
  sync(d: StepDoc | null, mode: ExplodeMode, open: boolean, axis: ExplodeAxis = 'free', view?: ExplodeView | null): void {
    for (const [k, b] of this.btns) {
      b.classList.toggle('on', k === mode);
      b.setAttribute('aria-checked', String(k === mode));
    }
    for (const [k, b] of this.axisBtns) {
      b.classList.toggle('on', k === axis);
      b.setAttribute('aria-checked', String(k === axis));
    }
    const plan = d && open && mode === 'step' ? this.plan(d, mode, axis, view) : null;
    const levels = plan?.levels ?? 0;
    this.stage.hidden = levels < 2;
    if (plan && levels >= 2) this.stage.textContent = `단계 ${explodeStage(plan, d!.explode)}/${levels}`;
  }
}
