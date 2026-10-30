/**
 * 해석 워커가 장면을 화면으로 넘기기 전에 그물 법선을 작은 배열로 줄인다(순수, DOM 없음 — 워커에서 부른다).
 *
 * 해석기(`stepToScene`)는 법선을 Float32 정점 3값(12바이트)으로 만든다. 코어 0.26.0부터 정규화 Int8 정점 4값(4바이트 — 넷째 값은 읽지 않음)을
 * 그대로 GPU에 올리므로(`packNormals` — 정점마다 단위 길이로 맞춰 반올림) 옮기는 버퍼·화면 쪽 ArrayBuffer·GPU 버퍼가 법선 몫의 2/3씩 준다.
 * 방향 오차는 0.4° 안이고 셰이더가 조각마다 길이를 맞춘다.
 * 같은 부품의 여러 자리는 같은 법선 배열을 함께 쓰므로(scene.ts) 같은 배열은 한 번만 줄여 함께 쓴다(코어도 같은 배열은 한 번만 올린다).
 * 정점 수와 길이가 맞지 않는 법선(정점 3값이 아닌 것)은 그대로 둔다 — 줄이면 코어가 길이로 꼴을 잘못 가릴 수 있다.
 *
 * 앱에서 법선을 읽는 것은 그리기뿐이다(개체 측정·곡면 되짚기·물리 속성·간섭·STL·OBJ 내보내기는 위치·색인과 워커의 면 표만 쓴다).
 * 해석기 자체(`stepToScene`)와 훑기 도구는 Float32 법선 그대로다.
 */
import { packNormals } from 'opencad-viewer3d/attribs';
import type { Scene3d } from 'opencad-viewer3d/types';

/** 줄인 결과(같은 배열은 한 번 — 바이트는 법선 배열 몫만) */
export interface PackedNormals {
  /** 줄인 법선 배열 수 */
  arrays: number;
  /** 줄인 정점 수 */
  vertices: number;
  /** 줄이기 전·후 바이트 */
  before: number;
  after: number;
}

/** 장면 그물의 Float32 법선을 Int8 정점 4값으로 바꾼다(장면 객체를 고친다) */
export function packSceneNormals(scene: Pick<Scene3d, 'meshes'>): PackedNormals {
  const done = new Map<Float32Array, Int8Array>();
  const out: PackedNormals = { arrays: 0, vertices: 0, before: 0, after: 0 };
  for (const m of scene.meshes) {
    const n = m.normals;
    if (!(n instanceof Float32Array) || n.length !== m.positions.length || n.length % 3) continue;
    let p = done.get(n);
    if (!p) {
      p = packNormals(n, 'int8', 4) as Int8Array;
      done.set(n, p);
      out.arrays++;
      out.vertices += n.length / 3;
      out.before += n.byteLength;
      out.after += p.byteLength;
    }
    m.normals = p;
  }
  return out;
}
