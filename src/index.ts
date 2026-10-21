/**
 * STEP(ISO 10303-21, AP203·AP214·AP242) 읽기와 삼각화. DOM·WebGL 없이 워커에서 돌 수 있다.
 */
export {
  EDGE_KINDS,
  EDGE_PARAMS,
  FACE_KINDS,
  FACE_PARAMS,
  stepToScene,
  type StepEdgeTable,
  type StepFaceTable,
  type StepLayer,
  type StepMeta,
  type StepOptions,
  type StepPmi,
  type StepPmiPresentation,
  type StepPmiSemantic,
  type StepProductNode,
  type StepSavedView,
} from './scene';
export { DERIVED, StepBinary, StepEnum, StepFile, StepRef, StepTyped, decodeStepString, type StepEntity, type StepHeader, type StepValue } from './part21';
export { watertightness, meshArea, meshVolume, type WatertightReport } from './analysis';
export { readProductProps, type StepProductProps } from './props';
export { STEP_XML_MESSAGE, sniffContainer, unpackStep, type ContainerKind, type Unpacked } from './archive';
