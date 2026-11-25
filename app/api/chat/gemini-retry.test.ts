import { describe, expect, it, vi } from "vitest";
import {
  getGeminiApiErrorStatus,
  getRetryAfterDelayMs,
  getRetryAfterResponseHeaders,
  retryGeminiRequest,
} from "@/lib/gemini-retry";

function apiError(status: number) {
  return Object.assign(new Error("provider response details"), {
    name: "ApiError",
    status,
  });
}

describe("retryGeminiRequest", () => {
  it("returns a successful first attempt without waiting", async () => {
    const operation = vi.fn().mockResolvedValue("reply");
    const sleep = vi.fn();

    await expect(retryGeminiRequest(operation, { sleep })).resolves.toBe(
      "reply",
    );
    expect(operation).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a transient 503 and returns the successful response", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue("reply");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryGeminiRequest(operation, { sleep, random: () => 0.5 }),
    ).resolves.toBe("reply");

    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(125);
  });

  it("increases the jittered delay exponentially across retries", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue("reply");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryGeminiRequest(operation, { sleep, random: () => 0.5 }),
    ).resolves.toBe("reply");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 125);
    expect(sleep).toHaveBeenNthCalledWith(2, 250);
  });

  it("stops after three total attempts", async () => {
    const error = apiError(503);
    const operation = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      retryGeminiRequest(operation, { sleep, random: () => 0.5 }),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403])(
    "does not retry Gemini status %i",
    async (status) => {
      const error = apiError(status);
      const operation = vi.fn().mockRejectedValue(error);
      const sleep = vi.fn();

      await expect(retryGeminiRequest(operation, { sleep })).rejects.toBe(
        error,
      );
      expect(operation).toHaveBeenCalledOnce();
      expect(sleep).not.toHaveBeenCalled();
    },
  );

  it("does not retry Gemini 429 responses", async () => {
    const error = apiError(429);
    const operation = vi.fn().mockRejectedValue(error);
    const sleep = vi.fn();

    await expect(retryGeminiRequest(operation, { sleep })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("waits at least the valid Retry-After delay", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValue("reply");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await retryGeminiRequest(operation, {
      getRetryAfter: () => ({ retryAfter: "2", retryAfterMs: null }),
      sleep,
      random: () => 0,
    });

    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("avoids retrying before a long Retry-After and forwards a safe delay", async () => {
    const headers = { retryAfter: "30", retryAfterMs: null };
    const operation = vi.fn().mockRejectedValue(apiError(503));
    const sleep = vi.fn();

    await expect(
      retryGeminiRequest(operation, {
        getRetryAfter: () => headers,
        sleep,
      }),
    ).rejects.toBeInstanceOf(Error);

    expect(operation).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
    expect(getRetryAfterResponseHeaders(headers)).toEqual({
      "Retry-After": "30",
    });
  });
});

describe("Gemini error metadata", () => {
  it("recognizes SDK ApiError status and ignores unrelated errors", () => {
    expect(getGeminiApiErrorStatus(apiError(503))).toBe(503);
    expect(
      getGeminiApiErrorStatus(
        Object.assign(new Error("unavailable"), {
          name: "ApiError",
          status: "UNAVAILABLE",
          code: 503,
        }),
      ),
    ).toBe(503);
    expect(getGeminiApiErrorStatus(new Error("temporary"))).toBeNull();
  });

  it("parses Retry-After seconds, milliseconds, and dates", () => {
    expect(
      getRetryAfterDelayMs({
        retryAfter: "3",
        retryAfterMs: null,
      }),
    ).toBe(3_000);
    expect(
      getRetryAfterDelayMs({
        retryAfter: null,
        retryAfterMs: "1250",
      }),
    ).toBe(1_250);

    const now = Date.parse("2026-11-25T12:00:00.000Z");
    expect(
      getRetryAfterDelayMs(
        {
          retryAfter: "Wed, 25 Nov 2026 12:00:02 GMT",
          retryAfterMs: null,
        },
        now,
      ),
    ).toBe(2_000);
  });
});
