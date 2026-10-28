/**
 * STEP(ISO 10303-21, AP203·AP214·AP242) 읽기와 삼각화. DOM·WebGL 없이 워커에서 돌 수 있다.
 */
export {
  applyProps,
  type DeferredScene,
  EDGE_KINDS,
  EDGE_PARAMS,
  EDGE_TANGENTS,
  FACE_KINDS,
  FACE_PARAMS,
  MassPropsJob,
  type PropsResult,
  stepToScene,
  stepToSceneDeferred,
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
export { watertightness, meshArea, meshVolume, orientFaces, type WatertightReport } from './analysis';
export { readProductProps, type StepProductProps } from './props';
export { STEP_XML_MESSAGE, sniffContainer, unpackStep, type ContainerKind, type Unpacked } from './archive';
export { TRUNCATED_WARNING } from './messages';
export { type GlyphShape, type GlyphSource } from './strokefont';
export { traceGlyph, type Contour } from './glyphtrace';
