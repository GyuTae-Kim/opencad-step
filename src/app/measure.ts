/**
 * 측정 띠(휴대폰·터치, 3D 보기 아래 가운데)의 글(순수 함수, DOM 없음): 측정·면 고르기 안내, 거리와 dx·dy·dz, 고른 면의 주요 치수.
 * touch(손가락이 주인 기기)면 안내에서 키(Esc) 설명을 빼고 길게 누르기(정밀 조준, aim.ts)를 알린다.
 * 키 설명이 있는 원래 글(넓은 화면·마우스)은 그대로 둔다.
 */
import type { MeasureResult } from 'opencad-viewer3d';
import { boxIsEmpty, boxSize, emptyBox, itemBounds, unionBox } from 'opencad-viewer3d/bounds';
import type { Scene3d } from 'opencad-viewer3d/types';
import { faceKindLabel, type FacePick } from './faces';
import { fmtNum } from './format';

/** 측정 안내(찍은 점 수 0~2, 결과가 있는지) */
export function measureHint(points: number, hasResult: boolean, touch = false): string {
  if (hasResult || points >= 2) return touch ? '측정: 다시 누르면 새로 잽니다' : '측정: 다시 누르면 새로 잽니다 · Esc 지우기';
  if (points === 1) return touch ? '측정: 끝점을 누르십시오' : '측정: 끝점을 누르십시오 · Esc 취소';
  return touch ? '측정: 잴 시작점을 누르십시오 · 길게 누르면 정밀 조준' : '측정: 잴 시작점을 누르십시오';
}

/** 패널 아래 띠의 측정 안내(아직 결과가 없을 때) */
export function panelMeasureHint(touch = false): string {
  return touch ? '측정: 모형 위 두 점을 누르십시오(꼭짓점 가까우면 붙습니다) · 길게 누르면 정밀 조준' : '측정: 모형 위 두 점을 누르십시오(꼭짓점 가까우면 붙습니다). Esc = 지우기';
}

/** 면 고르기 안내(아직 고른 면이 없을 때) */
export function faceHint(touch = false): string {
  return touch ? '면 고르기: 면을 누르십시오 · 길게 누르면 정밀 조준' : '면 고르기: 면을 누르십시오';
}

/** 측정 결과 글: 거리(굵게)와 축별 길이(패널 아래 띠와 같은 꼴) */
export function measureLines(m: Pick<MeasureResult, 'distance' | 'dx' | 'dy' | 'dz'>, u: string): { value: string; axes: string } {
  return { value: `${fmtNum(m.distance)}${u ? ` ${u}` : ''}`, axes: `dx ${fmtNum(m.dx)} · dy ${fmtNum(m.dy)} · dz ${fmtNum(m.dz)}` };
}

/** 고른 면 요약: 종류, 주요 치수(Ø·R, 없으면 null), 이름·값 쌍(이름은 번역 글, 값은 숫자·단위) */
export interface FaceSummary {
  kind: string;
  main: string | null;
  facts: [string, string][];
}

/**
 * 고른 면의 주요 치수: 원기둥·구는 지름(Ø)과 반지름, 원환은 큰 반지름(R)과 작은 반지름, 원뿔은 반각,
 * 그 밖(평면·곡면)은 둘레. 넓이는 늘 보인다.
 */
export function faceSummary(fp: FacePick, u: string): FaceSummary {
  const unit = u ? ` ${u}` : '';
  const facts: [string, string][] = [];
  let main: string | null = null;
  const r = fp.radius;
  if ((fp.kind === 'cylinder' || fp.kind === 'sphere') && r !== undefined) {
    main = `Ø${fmtNum(r * 2)}${unit}`;
    facts.push(['반지름', `${fmtNum(r)}${unit}`]);
  } else if (fp.kind === 'torus' && r !== undefined) {
    main = `R${fmtNum(r)}${unit}`;
    if (fp.minorRadius !== undefined) facts.push(['작은 반지름', `${fmtNum(fp.minorRadius)}${unit}`]);
  } else if (fp.kind === 'cone' && fp.halfAngleDeg !== undefined) facts.push(['반각', `${fmtNum(fp.halfAngleDeg)}°`]);
  facts.push(['넓이', `${fmtNum(fp.area)}${u ? ` ${u}²` : ''}`]);
  if (!main && fp.kind !== 'cone') facts.push(['둘레', `${fmtNum(fp.perimeter)}${unit}`]);
  return { kind: faceKindLabel(fp.kind), main, facts };
}

/** 고른 항목들(그물·선)의 외형 크기 — 축에 나란한 범위의 X·Y·Z 길이(장면 단위). 고른 형상이 없으면 null */
export function selectionSize(scene: Pick<Scene3d, 'meshes' | 'lines'>, ids: readonly string[]): [number, number, number] | null {
  const want = new Set(ids);
  let b = emptyBox();
  for (const it of [...scene.meshes, ...scene.lines]) if (want.has(it.id)) b = unionBox(b, itemBounds(it));
  if (boxIsEmpty(b)) return null;
  const s = boxSize(b);
  return [s[0], s[1], s[2]];
}
