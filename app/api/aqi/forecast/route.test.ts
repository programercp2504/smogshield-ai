import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const locationParams = new URLSearchParams({
  latitude: "19.076",
  longitude: "72.8777",
  locationName: "Mumbai",
  timezone: "Asia/Kolkata",
  region: "Maharashtra",
  country: "India",
});

function forecastPayload(
  time: unknown[],
  usAqi: unknown[],
  pm25?: unknown[],
  pm10?: unknown[],
) {
  return {
    hourly: {
      time,
      us_aqi: usAqi,
      ...(pm25 === undefined ? {} : { pm2_5: pm25 }),
      ...(pm10 === undefined ? {} : { pm10 }),
    },
  };
}

async function requestForecast(payload: unknown) {
  let upstreamUrl: URL | undefined;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    upstreamUrl = new URL(String(input));
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => payload,
    };
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await GET(
    new Request(`http://localhost/api/aqi/forecast?${locationParams}`),
  );
  const body = await response.json();

  return { response, body, upstreamUrl };
}

describe("GET /api/aqi/forecast", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves valid points and skips trailing null AQI values", async () => {
    const { response, body, upstreamUrl } = await requestForecast(
      forecastPayload(
        [
          "2026-11-24T10:00",
          "2026-11-24T11:00",
          "2026-11-24T12:00",
          "2026-11-24T13:00",
        ],
        [42, 74, null, null],
        [12, null, null, null],
        [21, 28, null, null],
      ),
    );

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      timezone: "Asia/Kolkata",
      points: [
        {
          time: "2026-11-24T10:00",
          aqi: 42,
          pm2_5: 12,
          pm10: 21,
        },
        {
          time: "2026-11-24T11:00",
          aqi: 74,
          pm10: 28,
        },
      ],
    });

    expect(upstreamUrl?.searchParams.get("timezone")).toBe("Asia/Kolkata");
    expect(upstreamUrl?.searchParams.get("forecast_days")).toBe("5");
    expect(upstreamUrl?.searchParams.get("hourly")).toBe(
      "us_aqi,pm2_5,pm10",
    );
  });

  it("retains every valid AQI point", async () => {
    const { response, body } = await requestForecast(
      forecastPayload(
        ["2026-11-24T10:00", "2026-11-24T11:00"],
        [0, 500],
      ),
    );

    expect(response.status).toBe(200);
    expect(body.points).toEqual([
      { time: "2026-11-24T10:00", aqi: 0 },
      { time: "2026-11-24T11:00", aqi: 500 },
    ]);
  });

  it("omits null and missing AQI points", async () => {
    const { response, body } = await requestForecast(
      forecastPayload(
        [
          "2026-11-24T10:00",
          "2026-11-24T11:00",
          "2026-11-24T12:00",
          "2026-11-24T13:00",
        ],
        [31, null, undefined, 63],
      ),
    );

    expect(response.status).toBe(200);
    expect(body.points).toEqual([
      { time: "2026-11-24T10:00", aqi: 31 },
      { time: "2026-11-24T13:00", aqi: 63 },
    ]);
  });

  it.each([-1, 501, "invalid"])(
    "rejects invalid non-null AQI value %s",
    async (aqi) => {
      const { response, body } = await requestForecast(
        forecastPayload(["2026-11-24T10:00"], [aqi]),
      );

      expect(response.status).toBe(502);
      expect(body).toMatchObject({
        error: { code: "AQI_FORECAST_UPSTREAM_FAILURE" },
      });
    },
  );

  it("rejects malformed timestamps even when the AQI value is null", async () => {
    const { response, body } = await requestForecast(
      forecastPayload(
        [null, "2026-11-24T11:00"],
        [null, 45],
      ),
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: { code: "AQI_FORECAST_UPSTREAM_FAILURE" },
    });
  });

  it("returns the existing safe error when all AQI forecast values are null", async () => {
    const { response, body } = await requestForecast(
      forecastPayload(
        ["2026-11-24T10:00", "2026-11-24T11:00"],
        [null, null],
      ),
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: { code: "AQI_FORECAST_UPSTREAM_FAILURE" },
    });
  });

  it("returns the existing safe error when all AQI forecast values are invalid", async () => {
    const { response, body } = await requestForecast(
      forecastPayload(
        ["2026-11-24T10:00", "2026-11-24T11:00"],
        [501, -1],
      ),
    );

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      error: { code: "AQI_FORECAST_UPSTREAM_FAILURE" },
    });
  });
});
