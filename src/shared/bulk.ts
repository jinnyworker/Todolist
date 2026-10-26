/** 아침 일괄 등록(REQ-4) 규칙. 화면 미리보기와 Main 검증이 같은 규칙을 쓴다. */
export const BULK_MAX = 50;
export const TITLE_MAX = 200;

const LIST_BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;

/** 한 줄당 한 건. 목록 기호(-, *, 1.)와 앞뒤 공백, 빈 줄은 버린다. */
export function parseBulkText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(LIST_BULLET_RE, '').trim())
    .filter((line) => line.length > 0);
}
