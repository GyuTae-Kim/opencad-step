/**
 * 레이어: PRESENTATION_LAYER_ASSIGNMENT(name, description, assigned_items)와 레이어를 가리키는 INVISIBILITY.
 * 이름이 같은 배정은 한 레이어로 합친다. 배정된 것이 양식 항목(STYLED_ITEM)이면 그 대상도 레이어에 넣는다.
 */
import { refId, refList, text, type StepFile } from './part21';

export interface LayerDef {
  name: string;
  description: string;
  /** INVISIBILITY가 레이어를 가리키면 false */
  visible: boolean;
}

export interface LayerIndex {
  layers: LayerDef[];
  /** 개체(형상 항목·표현·사상 항목·양식 대상) → 레이어 번호(처음 배정된 것) */
  layerOf: Map<number, number>;
}

const STYLED = new Set(['STYLED_ITEM', 'OVER_RIDING_STYLED_ITEM', 'CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM']);

export function readLayers(f: StepFile): LayerIndex {
  const layers: LayerDef[] = [];
  const layerOf = new Map<number, number>();
  const ids = f.idsOfType('PRESENTATION_LAYER_ASSIGNMENT');
  if (!ids.length) return { layers, layerOf };
  const byName = new Map<string, number>();
  const assignmentLayer = new Map<number, number>();
  for (const id of ids) {
    const e = f.get(id);
    if (!e || e.parts) continue;
    const name = text(e.args[0]) || `레이어 #${id}`;
    let li = byName.get(name);
    if (li === undefined) {
      li = layers.length;
      byName.set(name, li);
      layers.push({ name, description: text(e.args[1]), visible: true });
    } else if (!layers[li]!.description) layers[li]!.description = text(e.args[1]);
    assignmentLayer.set(id, li);
    for (const it of refList(e.args[2])) {
      if (!layerOf.has(it)) layerOf.set(it, li);
      const t = f.typeOf(it);
      if (STYLED.has(t)) {
        const target = refId(f.get(it)?.args[2]);
        if (target && !layerOf.has(target)) layerOf.set(target, li);
      }
    }
  }
  for (const id of f.idsOfType('INVISIBILITY')) {
    const e = f.get(id);
    if (!e) continue;
    for (const r of refList(e.args[0])) {
      const li = assignmentLayer.get(r);
      if (li !== undefined) layers[li]!.visible = false;
    }
  }
  return { layers, layerOf };
}
