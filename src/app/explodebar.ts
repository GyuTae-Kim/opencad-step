/**
 * 분해 막대의 방식 고르기와 단계 표시, 장면마다 분해 계획(첫 화면 JS 밖 — 분해 계산 explode.ts와 함께 문서를 열 때 받는다).
 * 앱은 막대 껍데기(밀대·정도·닫기)만 처음부터 갖고, 이 조각을 받으면 방식 단추와 단계 글을 막대에 끼운다.
 */
import type { Scene3d } from 'opencad-viewer3d/types';
import type { StepDoc } from './doc';
import { h } from './dom';
import { explodeMoves, explodePlan, explodeStage, type ExplodeMode, type ExplodePlan } from './explode';

export class ExplodeControls {
  /** 방식 단추 묶음과 단계 글(막대의 .explode-opts에 넣는다) */
  readonly els: HTMLElement[];
  private readonly btns = new Map<ExplodeMode, HTMLButtonElement>();
  private readonly stage: HTMLElement;
  /** 장면·방식마다 계획(묶음 범위를 한 번만 잰다 — 밀대를 움직일 때는 곱하기만) */
  private readonly plans = new WeakMap<Scene3d, Partial<Record<ExplodeMode, ExplodePlan>>>();

  constructor(onMode: (mode: ExplodeMode) => void) {
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
    this.stage = h('span', { class: 'explode-stage', hidden: true });
    this.els = [seg, this.stage];
  }

  /** 문서·방식의 분해 계획(표현 PMI는 제자리) */
  plan(d: StepDoc, mode: ExplodeMode): ExplodePlan {
    let plans = this.plans.get(d.scene);
    if (!plans) this.plans.set(d.scene, (plans = {}));
    const fixed = d.vis.pmiIds;
    return (plans[mode] ??= explodePlan(
      [...d.scene.meshes, ...d.scene.lines, ...(d.scene.points ?? [])].filter((x) => !fixed.has(x.id)),
      d.products,
      mode,
    ));
  }

  /** 분해 정도 t(0~1)에서 묶음마다 옮길 양 */
  moves(d: StepDoc, mode: ExplodeMode, t: number): Map<string, [number, number, number]> {
    return explodeMoves(this.plan(d, mode), t);
  }

  /**
   * 방식 단추와 단계 글 맞추기: 조립 단계별이고 단계가 둘 이상이면 "단계 2/3"(지금 벌리는 단계).
   * 막대가 닫혀 있으면 계획을 세우지 않는다(큰 모형에서 문서를 열 때 범위를 재지 않게)
   */
  sync(d: StepDoc | null, mode: ExplodeMode, open: boolean): void {
    for (const [k, b] of this.btns) {
      b.classList.toggle('on', k === mode);
      b.setAttribute('aria-checked', String(k === mode));
    }
    const plan = d && open && mode === 'step' ? this.plan(d, mode) : null;
    const levels = plan?.levels ?? 0;
    this.stage.hidden = levels < 2;
    if (plan && levels >= 2) this.stage.textContent = `단계 ${explodeStage(plan, d!.explode)}/${levels}`;
  }
}
