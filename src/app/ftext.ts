/**
 * 파일 글(제품·부품·자리 이름, 속성 이름·값, PMI 이름·글, 레이어 이름·설명, 저장된 보기 이름, 파일 머리, 압축 항목·파일 이름)을 화면에 넣는 도우미(59차).
 * 파일 글은 파일이 정한 아무 문자열이라 늘 글(textContent·속성 값)로만 넣고(HTML로 읽지 않는다 — dom.ts h), 여기서 셋을 더 지킨다:
 * - 길이: 빈칸 없는 긴 글은 줄바꿈 배치가 길이의 제곱으로 늘어(헤드리스 Chrome — 16,000자 0.3초, 4만 자 글 일곱 줄이면 속성 탭 41초 멈춤)
 *   FILE_TEXT_MAX자에서 자르고 '…'를 붙인다(말풍선·스크린 리더 이름도 같은 한도)
 * - 방향: 닫지 않은 방향 바꾸기(RLO 등)가 뒤에 붙는 화면 글을 뒤집지 않게 요소는 방향을 가두고(styles.css .ftext — unicode-bidi: isolate),
 *   화면 글과 한 글 마디·속성에 섞이면 FSI…PDI로 감싼다(유니코드 양방향 알고리즘 UAX #9 — PDI가 그 안에서 연 것을 닫는다)
 * - 번역: 화면 번역층(i18n.ts)은 translate="no" 밖의 글 마디·말풍선을 사전으로 바꾼다 — 파일 글이 사전 열쇠와 같으면(예: 부품 이름 "블록") 바뀌어 보였다.
 *   요소는 translate="no"로 두고, 화면 글과 섞인 말풍선·스크린 리더 이름은 번역층이 틀({0})로 잡아 파일 글을 그대로 끼운다
 * 제어 문자(C0·DEL — 탭·줄바꿈 빼고)는 보이는 기호(␀ ␛ …, U+2400 묶음)로 바꾼다 — 글에 그대로 두면 보이지 않거나 스크린 리더 이름을 끊는다.
 */
import { h } from './dom';

/** 화면에 넣는 파일 글 한 조각의 최대 길이(UTF-16 단위) */
export const FILE_TEXT_MAX = 1000;

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** 파일 글 → 화면 글: 제어 문자를 기호로, FILE_TEXT_MAX자를 넘으면 앞부분 + '…'(서로게이트 짝을 가르지 않는다) */
export function clipText(s: string, max = FILE_TEXT_MAX): string {
  let t = s;
  if (t.length > max) {
    const c = t.charCodeAt(max - 1);
    t = `${t.slice(0, c >= 0xd800 && c < 0xdc00 ? max - 1 : max)}…`;
  }
  return t.replace(CONTROL, (x) => String.fromCharCode(x === '\u007f' ? 0x2421 : 0x2400 + x.charCodeAt(0)));
}

/** 화면 글과 한 글 마디·속성에 섞이는 파일 글: clipText를 FSI…PDI로 감싼다(빈 글은 그대로) */
export function isolateText(s: string): string {
  return s ? `\u{2068}${clipText(s)}\u{2069}` : s;
}

/** 파일 글 요소(span.ftext, 번역하지 않음, 방향 가둠). title을 주면 말풍선(같은 한도) */
export function fileSpan(s: string, cls = '', title?: string): HTMLSpanElement {
  return h('span', { class: `ftext${cls ? ` ${cls}` : ''}`, translate: 'no', title: title === undefined ? null : clipText(title) }, clipText(s));
}
