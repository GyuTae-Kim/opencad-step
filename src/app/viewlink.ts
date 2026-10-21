/**
 * 보기 링크(순수, DOM 없음): 카메라·단면·고른 것만 주소 해시(#)에 담는다 — 파일은 담지 않는다(파일은 이 브라우저 밖으로 나가지 않는다).
 * 받는 사람이 같은 파일을 열면(또는 ?sample, 같은 사이트 ?open=) 그 보기를 적용한다.
 *
 * #view=cam:tx,ty,tz,distance,yaw,pitch,p|o;sec:nx,ny,nz,offset;sel:0/2/1;iso:1
 * (수는 유효 숫자 7자리, 각은 라디안, p = 원근·o = 평행)
 */
import type { CameraState } from 'opencad-viewer3d';

export interface ViewLink {
  cam?: Pick<CameraState, 'target' | 'distance' | 'yaw' | 'pitch' | 'projection'>;
  /** 단면 평면(normal·p > offset 쪽을 잘라 낸다) */
  sec?: { normal: [number, number, number]; offset: number };
  /** 제품 나무 마디 열쇠 */
  sel?: string;
  /** 고른 것만 보기(격리) */
  iso?: boolean;
}

const n7 = (v: number) => String(Number(v.toPrecision(7)));

/** 보기 → 해시 글(앞의 # 없이) */
export function encodeViewLink(v: ViewLink): string {
  const parts: string[] = [];
  if (v.cam) {
    const c = v.cam;
    parts.push(`cam:${[...c.target, c.distance, c.yaw, c.pitch].map(n7).join(',')},${c.projection === 'orthographic' ? 'o' : 'p'}`);
  }
  if (v.sec) parts.push(`sec:${[...v.sec.normal, v.sec.offset].map(n7).join(',')}`);
  if (v.sel && /^\d+(\/\d+)*$/.test(v.sel)) parts.push(`sel:${v.sel}`);
  if (v.iso && v.sel) parts.push('iso:1');
  return parts.length ? `view=${parts.join(';')}` : '';
}

/** 해시 글(# 있어도 됨) → 보기, 아니면 null */
export function decodeViewLink(hash: string): ViewLink | null {
  const h = hash.replace(/^#/, '');
  const m = /(?:^|&)view=([^&]*)/.exec(h);
  if (!m) return null;
  let body: string;
  try {
    body = decodeURIComponent(m[1]!);
  } catch {
    return null;
  }
  const out: ViewLink = {};
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const key = part.slice(0, i);
    const val = part.slice(i + 1);
    if (key === 'cam') {
      const xs = val.split(',');
      const nums = xs.slice(0, 6).map(Number);
      if (nums.length === 6 && nums.every(Number.isFinite) && nums[3]! > 0) out.cam = { target: [nums[0]!, nums[1]!, nums[2]!], distance: nums[3]!, yaw: nums[4]!, pitch: nums[5]!, projection: xs[6] === 'o' ? 'orthographic' : 'perspective' };
    } else if (key === 'sec') {
      const nums = val.split(',').map(Number);
      if (nums.length === 4 && nums.every(Number.isFinite) && Math.hypot(nums[0]!, nums[1]!, nums[2]!) > 0) out.sec = { normal: [nums[0]!, nums[1]!, nums[2]!], offset: nums[3]! };
    } else if (key === 'sel' && /^\d+(\/\d+)*$/.test(val)) out.sel = val;
    else if (key === 'iso') out.iso = val === '1';
  }
  if (out.iso && !out.sel) delete out.iso;
  return out.cam || out.sec || out.sel ? out : null;
}

/** 지금 주소에 보기 해시를 붙인 공유 주소(다른 해시 인자는 남기고 view만 바꾼다) */
export function viewUrl(href: string, v: ViewLink): string {
  const u = new URL(href);
  const rest = u.hash
    .replace(/^#/, '')
    .split('&')
    .filter((p) => p && !p.startsWith('view='));
  const enc = encodeViewLink(v);
  u.hash = [...rest, ...(enc ? [enc] : [])].join('&');
  return u.href;
}
