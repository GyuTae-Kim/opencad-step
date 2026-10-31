/**
 * 보기 링크(순수, DOM 없음): 카메라·단면·고른 것·분해만 주소 해시(#)에 담는다 — 파일은 담지 않는다(파일은 이 브라우저 밖으로 나가지 않는다).
 * 받는 사람이 같은 파일을 열면(또는 ?sample, 같은 사이트 ?open=) 그 보기를 적용한다.
 *
 * #view=cam:tx,ty,tz,distance,yaw,pitch,p|o;sec:nx,ny,nz,offset;sel:0/2/1,0/3.2;iso:1;exp:60,step
 * (수는 유효 숫자 7자리, 각은 라디안, p = 원근·o = 평행)
 * sel은 나무 자리 낱말을 쉼표로 이은 것(마디·몸체·이웃 범위 — 만들고 푸는 것은 selink.ts). 예전 링크의 마디 하나(sel:0/2/1)도 같은 꼴이다.
 * exp는 분해 정도(1~100%)와 방식(step = 조립 단계별, all = 한꺼번에 — 방식이 없으면 step), 방향을 고르면 셋째 값으로 그 방향
 * (x·y·z, 화면 가로 sx·화면 세로 sy·화면 평면 sp — 예: exp:60,step,z, 없으면 사방). 화면 방향은 넷째·다섯째 값으로 그 방향을 정한
 * 카메라 각(yaw·pitch, 라디안 — 예: exp:60,step,sx,0.7853982,0.5235988)을 담아, 받는 쪽이 링크의 카메라와 상관없이 같은 방향으로 벌린다.
 * 예전 앱은 모르는 열쇠라 건너뛰고, 방향을 모르는 앱(31차까지는 화면 방향을 모른다)은 셋째 값 뒤를 건너뛰어 사방으로 벌린다.
 */
import type { CameraState } from 'opencad-viewer3d';
import type { ExplodeAxis, ExplodeMode, ExplodeView } from './explode';

export interface ViewLink {
  cam?: Pick<CameraState, 'target' | 'distance' | 'yaw' | 'pitch' | 'projection'>;
  /** 단면 평면(normal·p > offset 쪽을 잘라 낸다) */
  sec?: { normal: [number, number, number]; offset: number };
  /** 고른 것: 나무 자리 낱말(마디 "0/2", 몸체 "0/2.3", 범위 "0/2/1-4"·"0/2.1-3") */
  sel?: string[];
  /** 고른 것만 보기(격리) */
  iso?: boolean;
  /** 분해 보기: 정도(0~1, 링크에는 1~100%)와 방식, 방향을 고르면 그 방향(없으면 사방), 화면 방향이면 그 방향을 정한 카메라 각 */
  exp?: { t: number; mode: ExplodeMode; axis?: Exclude<ExplodeAxis, 'free'>; view?: ExplodeView };
}

const n7 = (v: number) => String(Number(v.toPrecision(7)));
/** 분해 방향 낱말(사방은 링크에 적지 않는다) */
const AXES: ReadonlySet<string> = new Set(['x', 'y', 'z', 'sx', 'sy', 'sp']);
/** 화면 방향(카메라 각을 함께 적는다) */
const SCREEN: ReadonlySet<string> = new Set(['sx', 'sy', 'sp']);
/** 나무 자리 낱말 꼴(마디·몸체, 범위) */
const TOKEN = /^\d+(?:\/\d+)*(?:\.\d+)?(?:-\d+)?$/;
const okSel = (s: readonly string[] | undefined): s is string[] => !!s?.length && s.length <= 5000 && s.every((t) => TOKEN.test(t));

/** 보기 → 해시 글(앞의 # 없이) */
export function encodeViewLink(v: ViewLink): string {
  const parts: string[] = [];
  if (v.cam) {
    const c = v.cam;
    parts.push(`cam:${[...c.target, c.distance, c.yaw, c.pitch].map(n7).join(',')},${c.projection === 'orthographic' ? 'o' : 'p'}`);
  }
  if (v.sec) parts.push(`sec:${[...v.sec.normal, v.sec.offset].map(n7).join(',')}`);
  const sel = okSel(v.sel);
  if (sel) parts.push(`sel:${v.sel!.join(',')}`);
  if (v.iso && sel) parts.push('iso:1');
  if (v.exp && v.exp.t > 0) {
    const a = v.exp.axis;
    const w = v.exp.view;
    const ax = a && AXES.has(a) ? `,${a}${SCREEN.has(a) && w && Number.isFinite(w.yaw) && Number.isFinite(w.pitch) ? `,${n7(w.yaw)},${n7(w.pitch)}` : ''}` : '';
    parts.push(`exp:${Math.max(1, Math.min(100, Math.round(v.exp.t * 100)))},${v.exp.mode === 'all' ? 'all' : 'step'}${ax}`);
  }
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
    } else if (key === 'sel') {
      const t = val.split(',');
      if (okSel(t)) out.sel = t;
    }
    else if (key === 'iso') out.iso = val === '1';
    else if (key === 'exp') {
      const [pct, mode, axis, yaw, pitch] = val.split(',');
      const n = Number(pct);
      if (pct && Number.isFinite(n) && n > 0) {
        out.exp = { t: Math.min(100, n) / 100, mode: mode === 'all' ? 'all' : 'step' };
        if (axis && AXES.has(axis)) out.exp.axis = axis as Exclude<ExplodeAxis, 'free'>;
        // 화면 방향의 카메라 각(없거나 수가 아니면 받는 쪽이 링크의 카메라로 정한다)
        const w = [yaw, pitch].map((x) => (x ? Number(x) : NaN));
        if (axis && SCREEN.has(axis) && w.every(Number.isFinite)) out.exp.view = { yaw: w[0]!, pitch: w[1]! };
      }
    }
  }
  if (out.iso && !out.sel) delete out.iso;
  return out.cam || out.sec || out.sel || out.exp ? out : null;
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
