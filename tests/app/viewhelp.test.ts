import { describe, expect, it } from 'vitest';
import { defaultCamera } from 'opencad-viewer3d/camera';
import { cameraBack, cameraLooking, faceBox, faceSectionPlane, faceViewDir } from '../../src/app/viewhelp';
import { routeKey } from '../../src/app/keys';

describe('면 기준 보기·자르기', () => {
  it('평면: 바깥 법선에서 보고, 그 자리에서 바깥 쪽을 잘라 낸다', () => {
    const f = { normal: [0, 0, 1] as [number, number, number], center: [1, 2, 3] as [number, number, number], boundary: Float32Array.from([0, 0, 3, 2, 4, 3]) };
    expect(faceViewDir(f, [0, -1, 0])).toEqual([0, 0, 1]);
    expect(faceSectionPlane(f, [0, -1, 0])).toEqual({ normal: [0, 0, 1], offset: 3 });
    expect(faceBox(f)).toEqual({ min: [0, 0, 3], max: [2, 4, 3] });
  });

  it('원기둥: 지금 보는 쪽 축 방향에서 보고, 축을 지나며 눈 쪽 절반을 자른다', () => {
    const f = { axis: [0, 0, 1] as [number, number, number], origin: [10, 5, 0] as [number, number, number], center: [10, 5, 1] as [number, number, number] };
    expect(faceViewDir(f, [0.1, 0, -0.9])).toEqual([-0, -0, -1]);
    const pl = faceSectionPlane(f, [0, -1, 0.5])!;
    expect(pl.normal[2]).toBeCloseTo(0, 12);
    expect(pl.normal[1]).toBeCloseTo(-1, 12);
    expect(pl.offset).toBeCloseTo(-5, 12);
    // 눈이 축을 따라 보면 축에 수직인 아무 방향
    const along = faceSectionPlane(f, [0, 0, 1])!;
    expect(Math.abs(along.normal[2])).toBeLessThan(1e-12);
    expect(faceViewDir({}, [0, 0, 1])).toBeNull();
    expect(faceSectionPlane({ center: [0, 0, 0] }, [0, 0, 1])).toBeNull();
  });

  it('카메라: 눈 방향과 범위로 맞추고, Home 키는 홈 뷰', () => {
    const c = cameraLooking(defaultCamera(), [0, 0, 1], { min: [0, 0, 0], max: [10, 10, 0] }, 1);
    const back = cameraBack(c);
    expect(back[2]).toBeCloseTo(1, 6);
    expect(c.target).toEqual([5, 5, 0]);
    expect(routeKey({ key: 'Home', hasDoc: true })).toBe('home');
  });
});
