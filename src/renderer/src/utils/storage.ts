/** 화면 편의용 값(마지막 공유 형식 등)만 저장한다. 실패해도 동작에 영향이 없어야 한다. */
export function readPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`todolist:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(`todolist:${key}`, value);
  } catch {
    // 저장소를 쓸 수 없어도 무시한다.
  }
}
