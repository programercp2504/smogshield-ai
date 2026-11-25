const MAX_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 250;
const MAX_BACKOFF_MS = 2_000;
const MAX_AUTOMATIC_RETRY_AFTER_MS = 10_000;

export interface GeminiRetryAfterHeaders {
  retryAfter: string | null;
  retryAfterMs: string | null;
}

interface RetryOptions {
  getRetryAfter?: () => GeminiRetryAfterHeaders | null;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getGeminiApiErrorStatus(error: unknown): number | null {
  if (!isRecord(error) || error.name !== "ApiError") {
    return null;
  }

  const status =
    typeof error.status === "number"
      ? error.status
      : typeof error.code === "number"
        ? error.code
        : null;

  return status !== null && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}

export function isTransientGeminiStatus(status: number | null): boolean {
  return (
    status === 408 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export function getRetryAfterDelayMs(
  headers: GeminiRetryAfterHeaders | null,
  now = Date.now(),
): number | null {
  const retryAfterMs = headers?.retryAfterMs?.trim();
  if (retryAfterMs) {
    const parsedMilliseconds = Number(retryAfterMs);
    if (
      Number.isFinite(parsedMilliseconds) &&
      parsedMilliseconds >= 0 &&
      parsedMilliseconds <= Number.MAX_SAFE_INTEGER
    ) {
      return Math.ceil(parsedMilliseconds);
    }
  }

  const retryAfter = headers?.retryAfter?.trim();
  if (!retryAfter) {
    return null;
  }

  const parsedSeconds = Number(retryAfter);
  if (
    Number.isSafeInteger(parsedSeconds) &&
    parsedSeconds >= 0 &&
    parsedSeconds <= Number.MAX_SAFE_INTEGER / 1_000
  ) {
    return parsedSeconds * 1_000;
  }

  const parsedDate = Date.parse(retryAfter);
  return Number.isFinite(parsedDate) ? Math.max(0, parsedDate - now) : null;
}

export function getRetryAfterResponseHeaders(
  headers: GeminiRetryAfterHeaders | null,
): Record<string, string> {
  const delayMs = getRetryAfterDelayMs(headers);
  return delayMs === null
    ? {}
    : { "Retry-After": String(Math.ceil(delayMs / 1_000)) };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function retryGeminiRequest<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const wait = options.sleep ?? sleep;
  const random = options.random ?? Math.random;

  async function attempt(attemptNumber: number): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const status = getGeminiApiErrorStatus(error);
      if (attemptNumber >= MAX_ATTEMPTS || !isTransientGeminiStatus(status)) {
        throw error;
      }

      const retryAfterHeaders = options.getRetryAfter?.() ?? null;
      const retryAfterMs = getRetryAfterDelayMs(retryAfterHeaders);
      if (
        retryAfterMs !== null &&
        retryAfterMs > MAX_AUTOMATIC_RETRY_AFTER_MS
      ) {
        throw error;
      }

      const backoffCeiling = Math.min(
        MAX_BACKOFF_MS,
        INITIAL_BACKOFF_MS * 2 ** (attemptNumber - 1),
      );
      const randomValue = random();
      const jitter = Number.isFinite(randomValue)
        ? Math.max(0, Math.min(1, randomValue))
        : 0.5;
      const delayMs = Math.max(
        retryAfterMs ?? 0,
        Math.floor(backoffCeiling * jitter),
      );

      if (delayMs > 0) {
        await wait(delayMs);
      }
      return attempt(attemptNumber + 1);
    }
  }

  return attempt(1);
}
