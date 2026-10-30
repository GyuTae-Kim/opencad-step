/**
 * STEP 해석 워커: 파일 바이트를 화면 밖에서 해석해 Scene3d로 돌려준다(일은 src/app/job.ts — 압축 STEP 풀기 포함).
 * 진행률(onProgress)은 60ms에 한 번 이하로 알리고, 결과의 형식 배열은 이전 가능한 버퍼로 넘긴다(protocol.ts collectTransfers).
 * 그물 법선은 넘기기 전에 Int8 정점 4값으로 줄인다(normals.ts — 해석기 stepToScene은 Float32 그대로).
 *
 * 닫힌 입체의 질량 속성(곡면 적분)은 해석 결과에 넣지 않고 적분 거리만 남긴다. 화면이 문서를 보인 뒤 'props'를 보내면
 * 면 단위로 나눠(PROPS_SLICE_MS마다 쉬며) 적분해 끝낸 입체의 값을 'props'로 보낸다. 새 해석 요청이 오면 앞 문서의 적분은 그만둔다.
 * 면 표에 식이 없는 곡면(B-스플라인 등)은 다음 해석까지 들고 있다가 화면이 측정을 켜며 'surfaces'를 보내면 복사해 보낸다(facesurf.ts).
 * 들고 있는 동안은 되짚기 캐시(B-스플라인 첫 짐작 격자)를 버린 꼴로 둔다 — 질량 속성 적분이 끝난 뒤(적분 거리가 없으면 해석 뒤 바로).
 */
/// <reference lib="webworker" />
import { parseStepFile } from '../app/job';
import { packSceneNormals } from '../app/normals';
import { collectTransfers, errorText, type ParseRequest, type ParseResponse, type ParseResult, type PropsRequest, type SurfacesRequest } from '../app/protocol';
import { dropFaceSurfaceCaches, type FaceSurfacePayload, packFaceSurfaces } from '../facesurf';
import type { FaceSurfaceSet, MassPropsJob } from '../scene';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

/** 질량 속성 적분을 한 번에 이만큼(ms)만 하고 메시지를 받을 틈을 준다 */
const PROPS_SLICE_MS = 40;

/** 마지막으로 해석한 문서의 질량 속성 적분 거리(새 해석 요청이 오면 버린다) */
let props: { id: number; job: MassPropsJob; running: boolean } | null = null;

/** 마지막으로 해석한 문서의 면 표에 식이 없는 곡면(측정 refineFace — 화면이 'surfaces'로 받는다, 새 해석 요청이 오면 버린다) */
let surfaces: { id: number; set: FaceSurfaceSet } | null = null;

function post(msg: ParseResponse, transfer: Transferable[] = []): void {
  ctx.postMessage(msg, transfer);
}

function parse(req: ParseRequest): Promise<ParseResult> {
  const id = req.id;
  let last = 0;
  let lastStage = '';
  const progress = (fraction: number, stage: string): void => {
    const now = performance.now();
    // 단계가 바뀌면 바로, 아니면 60ms에 한 번
    if (fraction < 1 && stage === lastStage && now - last < 60) return;
    last = now;
    lastStage = stage;
    post({ id, type: 'progress', fraction: Math.max(0, Math.min(1, fraction)), stage });
  };
  return parseStepFile(
    req.name,
    req.bytes,
    progress,
    req.options,
    (job) => {
      props = { id, job, running: false };
    },
    (set) => {
      surfaces = { id, set };
    },
  );
}

const pause = () => new Promise<void>((r) => setTimeout(r, 0));

/** 질량 속성 적분: 조각마다 끝낸 입체의 값을 보내고, 새 해석이 오면(props가 바뀌면) 그만둔다 */
async function integrate(entry: NonNullable<typeof props>): Promise<void> {
  if (entry.running) return;
  entry.running = true;
  const { id, job } = entry;
  while (props === entry) {
    let finished: boolean;
    try {
      finished = job.run(PROPS_SLICE_MS);
    } catch {
      // 적분이 깨지면(드문 경우) 남은 입체는 값 없이 끝낸다 — 화면은 삼각형 값을 쓴다
      finished = true;
    }
    const results = job.take();
    const msg: ParseResponse = { id, type: 'props', results, done: job.done, total: job.total, finished, timedOut: job.timedOut, ms: Math.round(job.ms) };
    post(msg, collectTransfers(results));
    if (finished) {
      if (props === entry) props = null;
      // 적분이 끝났으니 들고 있는 곡면 정의의 되짚기 캐시를 버린다(화면에 보낼 때·다시 쓸 때 같은 값으로 다시 만든다)
      if (surfaces?.id === id) dropFaceSurfaceCaches(surfaces.set);
      return;
    }
    await pause();
  }
}

ctx.onmessage = async (ev: MessageEvent<ParseRequest | PropsRequest | SurfacesRequest>) => {
  const req = ev.data;
  if (!req) return;
  if (req.type === 'props') {
    if (props && props.id === req.id) void integrate(props);
    return;
  }
  if (req.type === 'surfaces') {
    // 곡면 정의는 옮기지 않고 복사로 보낸다(같은 곡면으로 질량 속성을 적분하는 중일 수 있다 — facesurf.ts)
    let data: FaceSurfacePayload | null = null;
    try {
      data = surfaces && surfaces.id === req.id ? packFaceSurfaces(surfaces.set) : null;
      post({ id: req.id, type: 'surfaces', data });
    } catch {
      post({ id: req.id, type: 'surfaces', data: null });
    }
    return;
  }
  if (req.type !== 'parse') return;
  // 앞 문서의 질량 속성 적분은 그만둔다(새 문서를 여는 동안 CPU·메모리를 쓰지 않게)
  props = null;
  surfaces = null;
  let result: ParseResult;
  try {
    result = await parse(req);
  } catch (e) {
    post({ id: req.id, type: 'error', message: errorText(e) });
    return;
  }
  // 적분할 입체가 없으면 곡면 정의의 되짚기 캐시를 바로 버린다(있으면 적분이 끝난 뒤). 둘 다 해석 중 되부름이 채운다(위에서 비운 것으로 좁히지 않게)
  const held = surfaces as { id: number; set: FaceSurfaceSet } | null;
  const job = props as { id: number } | null;
  if (held?.id === req.id && job?.id !== req.id) dropFaceSurfaceCaches(held.set);
  // 법선은 Int8 정점 4값으로 줄여 넘긴다(옮기는 버퍼·화면 쪽 메모리·GPU 버퍼 — normals.ts)
  packSceneNormals(result.scene);
  try {
    post({ id: req.id, type: 'done', result }, collectTransfers(result));
  } catch {
    // 이전이 막히면(드문 경우) 복사로 보낸다
    post({ id: req.id, type: 'done', result });
  }
};
