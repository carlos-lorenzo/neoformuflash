/**
 * Classify provider exceptions into stable error codes the UI can act on.
 *
 * Every SDK throws a different shape:
 *   - OpenAI / DeepSeek: `APIError` with `.status` (HTTP code) and `.code`
 *   - Anthropic: `APIError` with `.status` and `.error.type`
 *   - Google: plain Error whose `.message` contains "429 Too Many Requests",
 *     "quota", "API key not valid", etc.
 *
 * Rather than pattern-match every SDK's error class here, we read the two
 * fields that are almost always present (`status`, `message`) and fall back
 * to substring matches on the message for Google.
 *
 * Returned codes match the `ai.errors.*` catalogue in messages/*.json.
 */

export type AiProviderErrorCode =
  | 'ai.rateLimit'
  | 'ai.quotaExceeded'
  | 'ai.invalidKey'
  | 'ai.providerUnavailable'
  | 'ai.providerTimeout'
  | 'ai.providerError';

interface WithMaybeStatus {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
}

function readStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as WithMaybeStatus;
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  // Google error messages start with "[GoogleGenerativeAI Error]: ... [429 Too Many Requests] ..."
  const msg = typeof e.message === 'string' ? e.message : '';
  const m = msg.match(/\b(4\d\d|5\d\d)\b/);
  return m && m[1] ? Number(m[1]) : null;
}

function readMessage(err: unknown): string {
  if (typeof err !== 'object' || err === null) return '';
  const m = (err as WithMaybeStatus).message;
  return typeof m === 'string' ? m : '';
}

export function classifyProviderError(err: unknown): AiProviderErrorCode {
  const status = readStatus(err);
  const msg = readMessage(err).toLowerCase();

  // 429 is the universal rate-limit signal. Free-tier quota exhaustion often
  // arrives as 429 with "quota" in the body — distinguish those so the UI can
  // tell the user "wait" vs "you hit your plan cap."
  if (status === 429 || /rate.?limit|too many requests/.test(msg)) {
    if (/quota|billing|exceeded your current quota/.test(msg)) return 'ai.quotaExceeded';
    return 'ai.rateLimit';
  }

  // 401/403 + API-key mentions = bad or revoked key.
  if (status === 401 || status === 403 || /api.?key.*(invalid|not valid|expired|revoked)|incorrect api key/.test(msg)) {
    return 'ai.invalidKey';
  }

  // 5xx / connection reset / DNS: provider is down or unreachable.
  if ((status !== null && status >= 500) || /econnreset|enotfound|network|fetch failed|socket hang up/.test(msg)) {
    return 'ai.providerUnavailable';
  }

  // Explicit timeout paths from the SDKs (`APIConnectionTimeoutError`, our own message).
  if (/timeout|timed out/.test(msg)) return 'ai.providerTimeout';

  return 'ai.providerError';
}
