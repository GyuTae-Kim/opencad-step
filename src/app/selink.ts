/**
 * 보기 링크의 고른 것(순수, DOM 없음 — 링크를 복사하거나 적용할 때 나눠 받는다): 고른 항목 id ↔ 나무 자리 낱말.
 *
 * 낱말(쉼표로 잇는다):
 * - `0/2/1` — 나무 마디(그 아래 형상 통째). 예전 링크의 `sel:0/2/1`이 이 꼴 하나라 그대로 열린다
 * - `0/2.3` — 마디 0/2에 바로 놓인 셋째 형상 항목(1부터 — 입체 다음 선 형상 차례: 입체가 둘이면 `0/2.3`은 첫 선 형상, 나무의 몸체 줄 하나).
 *   예전 앱은 입체 차례만 알아 선 형상 낱말은 빈 고르기로 건너뛴다(다른 낱말은 그대로)
 * - `0/2/4-9`·`0/2.1-3` — 이웃한 형제 마디(넷째~열째)·몸체를 줄여 쓴 것
 * 마디 아래 형상을 모두 골랐으면 그 마디 하나로 쓰고(위로 올라가며 묶는다), 나무에 없는 항목(표현 PMI 선 등)은 담지 않는다.
 * 너무 길면(기본 1,500자 넘음) 나무 차례로 앞의 것만 담는다 — 받는 쪽 주소 길이 한도(메신저·메일)에 걸리지 않게.
 */
import { nodeItems, productAt, subtreeItemIds, type ProductNode } from './doc';

/** 보기 링크의 고른 것 글 길이 한도(낱말과 쉼표) */
export const SEL_MAX_CHARS = 1500;

/** 고른 항목 id → 나무 자리 낱말(나무 차례, 통째 고른 마디는 묶고 이웃은 줄여 쓴다) */
export function selectionTokens(roots: readonly ProductNode[], ids: readonly string[]): string[] {
  const set = new Set(ids);
  const visit = (n: ProductNode, key: string): { full: boolean; any: boolean; out: string[] } => {
    const out: string[] = [];
    let full = true;
    let any = false;
    nodeItems(n).forEach((id, i) => {
      if (set.has(id)) {
        out.push(`${key}.${i + 1}`);
        any = true;
      } else full = false;
    });
    n.children.forEach((c, i) => {
      const r = visit(c, `${key}/${i}`);
      full &&= r.full;
      any ||= r.any;
      out.push(...r.out);
    });
    return full && any ? { full, any, out: [key] } : { full, any, out };
  };
  const tokens: string[] = [];
  roots.forEach((r, i) => tokens.push(...visit(r, String(i)).out));
  return compress(tokens);
}

/** 이웃한 형제 마디·몸체 낱말을 줄여 쓴다("0/1,0/2,0/3" → "0/1-3", "0/2.1,0/2.2" → "0/2.1-2") */
function compress(tokens: readonly string[]): string[] {
  const out: string[] = [];
  let base = '';
  let a = -1;
  let b = -1;
  const flush = () => {
    if (a >= 0) out.push(a === b ? `${base}${a}` : `${base}${a}-${b}`);
    a = b = -1;
  };
  for (const t of tokens) {
    const m = /^(.*[./])?(\d+)$/.exec(t)!;
    const tb = m[1] ?? '';
    const i = Number(m[2]);
    if (a >= 0 && tb === base && i === b + 1) b = i;
    else {
      flush();
      base = tb;
      a = b = i;
    }
  }
  flush();
  return out;
}

/** 낱말 목록을 글 길이 한도에 맞춘다: 앞에서부터 들어가는 만큼, dropped는 뺀 낱말 수 */
export function fitTokens(tokens: readonly string[], max = SEL_MAX_CHARS): { tokens: string[]; dropped: number } {
  let len = -1;
  let n = 0;
  while (n < tokens.length && len + 1 + tokens[n]!.length <= max) len += 1 + tokens[n++]!.length;
  return { tokens: tokens.slice(0, n), dropped: tokens.length - n };
}

/**
 * 낱말 → 고를 것: 마디 낱말 하나면 key(나무 마디 고르기), 몸체 낱말 하나면 body(몸체 고르기), 그 밖에는 ids(여러 개 고르기).
 * open은 몸체 낱말이 가리킨 부품 마디(나무에서 펼쳐 몸체 줄을 보인다). 이 문서에 없는 자리는 건너뛴다(모두 없으면 ids가 비었다)
 */
export function resolveTokens(roots: readonly ProductNode[], tokens: readonly string[]): { ids: string[]; open: string[]; key?: string; body?: string } {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (list: readonly string[]) => {
    for (const id of list)
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
  };
  let key: string | undefined;
  let body: string | undefined;
  const open: string[] = [];
  for (const t of tokens) {
    const m = /^(?:(\d+(?:\/\d+)*)\.|((?:\d+\/)*))(\d+)(?:-(\d+))?$/.exec(t);
    if (!m) continue;
    const a = Number(m[3]);
    const last = m[4] === undefined ? a : Number(m[4]);
    if (m[1] !== undefined) {
      // 몸체: 마디에 바로 놓인 형상 항목 차례(1부터, 입체 다음 선 형상)
      const node = productAt(roots, m[1]);
      if (!node || a < 1) continue;
      const list = nodeItems(node).slice(a - 1, last);
      add(list);
      if (list.length) open.push(m[1]);
      if (tokens.length === 1 && a === last && list.length === 1) body = list[0];
    } else {
      // 마디(형제 범위): 부모의 자식 수를 넘는 차례는 버린다
      const prefix = m[2]!;
      const parent = prefix ? productAt(roots, prefix.slice(0, -1)) : null;
      if (prefix && !parent) continue;
      const count = parent ? parent.children.length : roots.length;
      for (let i = a; i <= Math.min(last, count - 1); i++) add(subtreeItemIds((parent ? parent.children : roots)[i]!));
      if (tokens.length === 1 && a === last && a < count) key = `${prefix}${a}`;
    }
  }
  return { ids, open, ...(key ? { key } : {}), ...(body ? { body } : {}) };
}
