import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAQIForLocation: vi.fn(),
  fetchKolkataAQI: vi.fn(),
  generateContent: vi.fn(),
  googleGenAIOptions: vi.fn(),
  limiterConfig: vi.fn(),
  rateLimit: vi.fn(),
  redisFromEnv: vi.fn(),
  slidingWindow: vi.fn(),
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = mocks.slidingWindow;

    limit = mocks.rateLimit;

    constructor(config: unknown) {
      mocks.limiterConfig(config);
    }
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: { fromEnv: mocks.redisFromEnv },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mocks.generateContent };

    constructor(options: unknown) {
      mocks.googleGenAIOptions(options);
    }
  },
}));

vi.mock("@/lib/aqi-api", () => ({
  fetchAQIForLocation: mocks.fetchAQIForLocation,
  fetchKolkataAQI: mocks.fetchKolkataAQI,
}));

import { POST } from "./route";

const validChatBody = { message: "What is the current air quality?" };
const testIp = "203.0.113.10";

function rateLimitResponse(
  values: Partial<{
    success: boolean;
    limit: number;
    remaining: number;
    reset: number;
  }> = {},
) {
  return {
    success: true,
    limit: 10,
    remaining: 9,
    reset: Date.now() + 60_000,
    pending: Promise.resolve(),
    ...values,
  };
}

function chatRequest(
  body: unknown = validChatBody,
  ip: string | null = testIp,
  additionalHeaders: Record<string, string> = {},
): Request {
  const headers = new Headers({
    "content-type": "application/json",
    ...additionalHeaders,
  });
  if (ip !== null) {
    headers.set("x-forwarded-for", ip);
  }

  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function rawBodyRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": testIp,
      ...headers,
    },
    body,
  });
}

function geminiApiError(status: number) {
  return Object.assign(new Error("sensitive provider details"), {
    name: "ApiError",
    status,
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://test.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-upstash-token");

    mocks.fetchAQIForLocation.mockReset();
    mocks.fetchKolkataAQI.mockReset();
    mocks.generateContent.mockReset();
    mocks.googleGenAIOptions.mockReset();
    mocks.limiterConfig.mockReset();
    mocks.rateLimit.mockReset();
    mocks.redisFromEnv.mockReset();
    mocks.slidingWindow.mockReset();

    mocks.fetchAQIForLocation.mockResolvedValue({ isDemo: true });
    mocks.fetchKolkataAQI.mockResolvedValue({ isDemo: true });
    mocks.generateContent.mockResolvedValue({ text: "Air quality information." });
    mocks.redisFromEnv.mockReturnValue({});
    mocks.slidingWindow.mockReturnValue({});
    mocks.rateLimit.mockImplementation(async () => rateLimitResponse());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("allows ten requests and returns 429 with safe headers on the eleventh", async () => {
    const counts: Record<string, number> = Object.create(null);
    mocks.rateLimit.mockImplementation(async (identifier: string) => {
      const count = (counts[identifier] ?? 0) + 1;
      counts[identifier] = count;
      return rateLimitResponse({
        success: count <= 10,
        remaining: Math.max(0, 10 - count),
      });
    });

    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      expect((await POST(chatRequest())).status).toBe(200);
    }

    const response = await POST(chatRequest());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      },
    });
    expect(response.headers.get("ratelimit-limit")).toBe("10");
    expect(response.headers.get("ratelimit-remaining")).toBe("0");
    expect(Number(response.headers.get("ratelimit-reset"))).toBeGreaterThan(0);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(mocks.generateContent).toHaveBeenCalledTimes(10);
    expect(mocks.rateLimit).toHaveBeenCalledTimes(11);
    expect(mocks.slidingWindow).toHaveBeenCalledWith(10, "1 m");
    expect(mocks.limiterConfig).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: "smogshield:chat", analytics: false }),
    );
  });

  it("keeps limits independent for different client IPs", async () => {
    const counts: Record<string, number> = Object.create(null);
    mocks.rateLimit.mockImplementation(async (identifier: string) => {
      const count = (counts[identifier] ?? 0) + 1;
      counts[identifier] = count;
      return rateLimitResponse({
        success: count <= 10,
        remaining: Math.max(0, 10 - count),
      });
    });

    for (let requestNumber = 0; requestNumber < 10; requestNumber += 1) {
      expect((await POST(chatRequest(validChatBody, testIp))).status).toBe(200);
    }

    const otherIpResponse = await POST(
      chatRequest(validChatBody, "198.51.100.24"),
    );
    expect(otherIpResponse.status).toBe(200);
    expect(mocks.rateLimit).toHaveBeenLastCalledWith("198.51.100.24");
  });

  it.each([
    { scenario: "missing IP", ip: null, vercel: "1" },
    { scenario: "invalid IP", ip: "not-an-ip", vercel: "1" },
    {
      scenario: "non-Vercel forwarded header",
      ip: testIp,
      vercel: "",
    },
  ])("fails closed for $scenario", async ({ ip, vercel }) => {
    vi.stubEnv("VERCEL", vercel);

    const response = await POST(chatRequest(validChatBody, ip));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Chat is temporarily unavailable. Please try again later.",
      },
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("fails closed when Redis rate-limit evaluation fails", async () => {
    mocks.rateLimit.mockRejectedValue(new Error("internal Redis details"));

    const response = await POST(chatRequest());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "RATE_LIMIT_UNAVAILABLE",
        message: "Chat is temporarily unavailable. Please try again later.",
      },
    });
    expect(mocks.generateContent).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "Chat rate-limit evaluation failed.",
    );
  });

  it("rejects oversized Content-Length before rate limiting", async () => {
    const body = " ".repeat(65_537);
    const response = await POST(
      rawBodyRequest(body, { "content-length": String(body.length) }),
    );

    expect(response.status).toBe(413);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("rejects oversized streamed bodies without Content-Length", async () => {
    const body = " ".repeat(65_537);
    const request = rawBodyRequest(body);
    expect(request.headers.has("content-length")).toBe(false);

    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("allows a 64 KiB body through to JSON parsing", async () => {
    const response = await POST(rawBodyRequest(" ".repeat(65_536)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_JSON",
        message: "Request body must be valid JSON.",
      },
    });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("preserves malformed JSON and request validation errors", async () => {
    const malformedResponse = await POST(rawBodyRequest("{"));
    expect(malformedResponse.status).toBe(400);
    expect(await malformedResponse.json()).toMatchObject({
      error: { code: "INVALID_JSON" },
    });

    const validationResponse = await POST(chatRequest({ message: " " }));
    expect(validationResponse.status).toBe(400);
    expect(await validationResponse.json()).toMatchObject({
      error: { code: "INVALID_MESSAGE" },
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it("preserves the successful Gemini response shape", async () => {
    const response = await POST(chatRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reply: "Air quality information." });
    expect(mocks.generateContent).toHaveBeenCalledOnce();
    expect(mocks.googleGenAIOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOptions: expect.objectContaining({
          fetch: expect.any(Function),
          retryOptions: { attempts: 1, httpStatusCodes: [] },
        }),
      }),
    );
    expect(response.headers.get("ratelimit-limit")).toBe("10");
  });

  it("retries Gemini 503 and returns a successful response", async () => {
    mocks.generateContent
      .mockRejectedValueOnce(geminiApiError(503))
      .mockResolvedValueOnce({ text: "Air quality information." });

    const response = await POST(chatRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: "Air quality information.",
    });
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });

  it("returns a safe temporary-unavailability response after three attempts", async () => {
    mocks.generateContent.mockRejectedValue(geminiApiError(503));

    const response = await POST(chatRequest());
    const responseBody = await response.text();

    expect(response.status).toBe(503);
    expect(mocks.generateContent).toHaveBeenCalledTimes(3);
    expect(responseBody).toContain('"code":"AI_UNAVAILABLE"');
    expect(responseBody).toContain(
      "The AI assistant is temporarily unavailable.",
    );
    expect(responseBody).not.toContain("sensitive provider details");
  });

  it.each([400, 401, 403])(
    "does not retry Gemini client or authentication status %i",
    async (status) => {
      mocks.generateContent.mockRejectedValue(geminiApiError(status));

      const response = await POST(chatRequest());

      expect(response.status).toBe(502);
      expect(mocks.generateContent).toHaveBeenCalledOnce();
      expect(await response.text()).not.toContain("sensitive provider details");
    },
  );

  it("returns Gemini 429 separately without retrying", async () => {
    mocks.generateContent.mockRejectedValue(geminiApiError(429));

    const response = await POST(chatRequest());

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: {
        code: "GEMINI_RATE_LIMITED",
        message:
          "The AI assistant is receiving too many requests right now. Please try again later.",
      },
    });
    expect(mocks.generateContent).toHaveBeenCalledOnce();
  });
});
