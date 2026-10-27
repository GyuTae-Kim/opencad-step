/**
 * 해석 일(워커 안에서 돈다 — DOM 없음): 파일 바이트 → (압축이면 풀고) → STEP인지 가리고 → Scene3d.
 * 워커(src/worker/parse.worker.ts)는 메시지만 주고받고 실제 일은 여기서 한다(Node 시험에서도 부를 수 있게).
 */
import { isStepXml, sniffContainer, STEP_XML_MESSAGE, unpackStep } from '../archive';
import { stepToScene } from '../scene';
import { browserGlyphs } from './glyphs';
import { headSchemas, IFC_MESSAGE, sniffStep, type ParseOptions, type ParseResult, type ParseSource } from './protocol';

/** 압축 풀기가 차지하는 진행률 몫(압축 파일일 때) */
const UNPACK_SHARE = 0.15;

/**
 * 파일 하나 해석. progress(0~1, 단계 이름)를 부른다. 압축 STEP(gzip·ZIP)은 '압축 풀기' 단계로 먼저 푼다.
 * STEP이 아니면(STEP-XML 포함) 알기 쉬운 오류를 던진다.
 */
export async function parseStepFile(name: string, data: ArrayBuffer | Uint8Array, progress: (fraction: number, stage: string) => void = () => {}, options: ParseOptions = {}): Promise<ParseResult> {
  const t0 = performance.now();
  let bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const head = bytes.subarray(0, 64 * 1024);
  const kind = sniffContainer(head);
  let source: ParseSource | undefined;
  let notes: string[] = [];
  let base = 0;
  let sceneName = name.replace(/^.*[\\/]/, '');
  if (kind === 'xml' && isStepXml(head)) throw new Error(STEP_XML_MESSAGE);
  if (kind === 'gzip' || kind === 'zip') {
    progress(0, '압축 풀기');
    const u = await unpackStep(bytes, (f) => progress(f * UNPACK_SHARE, '압축 풀기'));
    source = { containers: u.containers, packedSize: u.packedSize, size: u.bytes.length };
    if (u.entry) {
      source.entry = u.entry;
      sceneName = u.entry.replace(/^.*[\\/]/, '');
    } else sceneName = sceneName.replace(/\.gz$/i, '').replace(/\.stpz$/i, '.stp');
    notes = u.notes;
    bytes = u.bytes;
    base = UNPACK_SHARE;
  }
  const sniff = sniffStep(bytes.subarray(0, 64 * 1024));
  if (!sniff.ok) {
    if (source) throw new Error(`압축을 풀었지만 STEP 글이 아닙니다. ${sniff.reason}`);
    throw new Error(sniff.reason);
  }
  // IFC(건축 BIM)도 같은 Part 21 글이라 머리만으로는 통과한다 — 다 읽고 "형상 없음"이라 하기 전에 알기 쉽게 거절한다
  const schemas = headSchemas(bytes.subarray(0, 64 * 1024));
  if (schemas.length && schemas.every((x) => x.startsWith('IFC'))) throw new Error(IFC_MESSAGE);
  const scene = stepToScene(bytes, {
    name: sceneName,
    onProgress: (f, stage) => progress(base + f * (1 - base), stage),
    ...(options.tolerance ? { tolerance: options.tolerance } : {}),
    ...(options.angleTolerance ? { angleTolerance: options.angleTolerance } : {}),
    // 내장 획 글꼴에 없는 PMI 글자(한글 등)는 브라우저 글꼴 윤곽선으로(워커의 OffscreenCanvas — Node에서는 없어 예전처럼 빈 상자)
    glyphs: browserGlyphs(),
  });
  if (notes.length) scene.warnings = [...notes, ...(scene.warnings ?? [])];
  const res: ParseResult = { scene, ms: performance.now() - t0 };
  if (source) res.source = source;
  return res;
}
