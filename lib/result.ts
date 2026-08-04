/*
 * CLAUDE.md: "Errors: never swallow. Surface via typed `Result` returns, not
 * thrown strings."
 *
 * `code` is a message-catalog key, not prose. The UI translates it. A data
 * layer that returns English sentences cannot be rendered to a Spanish student,
 * and lint:i18n cannot catch that because lib/ is outside its scope.
 */

export type Ok<T> = { ok: true; value: T };
export type Err = { ok: false; code: string; cause?: unknown };
export type Result<T> = Ok<T> | Err;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err(code: string, cause?: unknown): Err {
  return { ok: false, code, cause };
}
