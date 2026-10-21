/**
 * 저장된 보기(AP242 saved view): CAMERA_USAGE(mapping_origin = CAMERA_MODEL_D3…, mapped_representation = 제도 모형)를 읽는다.
 * 카메라: 보기 기준계(AXIS2_PLACEMENT_3D — z = 보는 쪽(대상 → 눈), y = 위)와 VIEW_VOLUME(투영 종류 PARALLEL·CENTRAL,
 * 투영점, 보기 창 PLANAR_BOX — 크기와 자리). 대상은 보기 창 가운데(보기 기준점 + 창 가운데 x·y), 높이는 창 세로 크기.
 * 좌표는 카메라가 든 제도 모형의 표현 좌표 그대로(장면 쪽이 그 모형 자리·단위로 옮긴다).
 */
import type { Geometry } from './geometry';
import { enumOf, isA, num, partOf, refId, text, type StepFile } from './part21';

type V3 = [number, number, number];

export interface RawSavedView {
  /** CAMERA_MODEL 번호 */
  id: number;
  name: string;
  /** 제도 모형(표현) 번호 */
  model: number;
  target: V3;
  /** 대상 → 눈(단위 벡터) */
  dir: V3;
  up: V3;
  /** 눈과 대상 사이(중심 투영), 평행이면 0 */
  distance: number;
  projection: 'orthographic' | 'perspective';
  /** 보기 창 세로 크기(모형 단위), 모르면 0 */
  height: number;
}

const CAMERA_TYPES = ['CAMERA_MODEL_D3', 'CAMERA_MODEL_D3_MULTI_CLIPPING', 'CAMERA_MODEL_D3_WITH_HLHSR'];

export function readSavedViews(f: StepFile, g: Geometry): RawSavedView[] {
  const out: RawSavedView[] = [];
  const seen = new Set<number>();
  for (const uid of f.idsOfType('CAMERA_USAGE')) {
    const u = f.get(uid);
    if (!u) continue;
    const cam = refId(u.args[0]);
    const model = refId(u.args[1]);
    const c = f.get(cam);
    if (!c || seen.has(cam) || !CAMERA_TYPES.some((t) => isA(c, t))) continue;
    seen.add(cam);
    const args = c.parts ? (partOf(c, 'CAMERA_MODEL_D3')?.args ?? []) : c.args;
    const name = c.parts ? text(partOf(c, 'REPRESENTATION_ITEM')?.args[0]) : text(args[0]);
    const vrs = c.parts ? refId(args[0]) : refId(args[1]);
    const volId = c.parts ? refId(args[1]) : refId(args[2]);
    const fr = g.frame(vrs);
    const vol = f.get(volId);
    if (!fr || !vol) continue;
    // VIEW_VOLUME(projection_type, projection_point, view_plane_distance, front…, back…, sides_clipping, view_window)
    const parallel = enumOf(vol.args[0]) !== 'CENTRAL';
    const pp = g.point(refId(vol.args[1])) ?? [0, 0, 1];
    const win = f.get(refId(vol.args[8]));
    let cx = 0;
    let cy = 0;
    let height = 0;
    if (win) {
      // PLANAR_BOX(name, size_in_x, size_in_y, placement)
      const sx = num(win.args[1], 0);
      const sy = num(win.args[2], 0);
      const wp = g.frame(refId(win.args[3]));
      height = Math.abs(sy);
      cx = (wp?.o[0] ?? 0) + sx / 2;
      cy = (wp?.o[1] ?? 0) + sy / 2;
    }
    const at = (x: number, y: number, z: number): V3 => [fr.o[0] + fr.x[0] * x + fr.y[0] * y + fr.z[0] * z, fr.o[1] + fr.x[1] * x + fr.y[1] * y + fr.z[1] * z, fr.o[2] + fr.x[2] * x + fr.y[2] * y + fr.z[2] * z];
    const target = at(cx, cy, 0);
    const eye = at(pp[0], pp[1], pp[2]);
    let dir: V3 = [eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]];
    let dist = Math.hypot(...dir);
    if (parallel || !(dist > 0)) {
      dir = [...fr.z] as V3;
      dist = parallel ? 0 : dist;
    } else dir = [dir[0] / dist, dir[1] / dist, dir[2] / dist];
    const mn = f.get(model);
    out.push({ id: cam, name: name || (mn ? text(mn.args[0]) : '') || `#${cam}`, model, target, dir, up: [...fr.y] as V3, distance: dist, projection: parallel ? 'orthographic' : 'perspective', height });
  }
  return out;
}
