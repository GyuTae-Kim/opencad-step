/**
 * 보이기 상태(순수, DOM 없음): 나무의 눈 단추(사용자가 숨긴 항목)·레이어 켜고 끄기·PMI 켜고 끄기를 함께 따져
 * 항목(그물·선 묶음) 하나가 보이는지 정한다. 격리(이것만 보기)는 그 밖의 항목을 모두 숨긴다. 뷰어에는 결과만 setItemVisible로 넘긴다
 * ("부품별 보이기"는 뷰어의 묶음(group) 보이기를 그대로 쓰므로 여기서 다루지 않는다).
 */

/** 레이어에 들지 않은 항목의 가짜 레이어 번호("레이어 없음") */
export const NO_LAYER = -1;

export class Visibility {
  /** 나무 눈 단추로 숨긴 항목 */
  readonly userHidden = new Set<string>();
  /** 끈 레이어 번호(NO_LAYER = 레이어 없음) */
  readonly layerHidden = new Set<number>();
  /** 하나씩 끈 PMI 선 묶음 */
  readonly pmiHidden = new Set<string>();
  /** PMI 모두 끄기 */
  pmiOff = false;
  /** 격리(이것만 보기): 있으면 이 항목들만 보인다(다른 켜고 끄기와 함께 따진다) */
  isolated: Set<string> | null = null;

  constructor(
    /** 항목 → 레이어 번호 */
    readonly layerOf: ReadonlyMap<string, number>,
    /** PMI 선 묶음 id */
    readonly pmiIds: ReadonlySet<string>,
    /** 레이어가 있는 문서인지(없으면 레이어 끄기를 따지지 않는다) */
    readonly hasLayers: boolean,
  ) {}

  /** 항목의 레이어 번호(없으면 NO_LAYER) */
  layer(id: string): number {
    return this.layerOf.get(id) ?? NO_LAYER;
  }

  /** 항목이 보이는지(눈 단추·레이어·PMI 모두) */
  visible(id: string): boolean {
    if (this.isolated && !this.isolated.has(id)) return false;
    if (this.userHidden.has(id)) return false;
    if (this.hasLayers && this.layerHidden.size && this.layerHidden.has(this.layer(id))) return false;
    if (this.pmiIds.has(id) && (this.pmiOff || this.pmiHidden.has(id))) return false;
    return true;
  }

  /** 보이지 않는 까닭(보이면 null): 'user' | 'layer' | 'pmi' */
  hiddenBy(id: string): 'user' | 'layer' | 'pmi' | 'isolate' | null {
    if (this.isolated && !this.isolated.has(id)) return 'isolate';
    if (this.userHidden.has(id)) return 'user';
    if (this.hasLayers && this.layerHidden.has(this.layer(id))) return 'layer';
    if (this.pmiIds.has(id) && (this.pmiOff || this.pmiHidden.has(id))) return 'pmi';
    return null;
  }

  /** 레이어 켜고 끄기 */
  setLayer(layer: number, on: boolean): void {
    if (on) this.layerHidden.delete(layer);
    else this.layerHidden.add(layer);
  }

  layerOn(layer: number): boolean {
    return !this.layerHidden.has(layer);
  }

  /** 사용자 숨김(눈 단추) */
  setUser(ids: readonly string[], on: boolean): void {
    for (const id of ids) {
      if (on) this.userHidden.delete(id);
      else this.userHidden.add(id);
    }
  }

  /** PMI 하나 켜고 끄기 */
  setPmi(id: string, on: boolean): void {
    if (on) this.pmiHidden.delete(id);
    else this.pmiHidden.add(id);
  }
}
