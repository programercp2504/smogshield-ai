import {
  getAirQualityStatus,
  getHealthRecommendation,
  type AQIReading,
  type PollutantName,
  type PollutantReading,
} from "./aqi";

interface OpenMeteoCurrentResponse {
  time?: unknown;
  us_aqi?: unknown;
  pm2_5?: unknown;
  pm10?: unknown;
  nitrogen_dioxide?: unknown;
  ozone?: unknown;
  carbon_monoxide?: unknown;
  sulphur_dioxide?: unknown;
}

export interface OpenMeteoAQIResponse {
  current: OpenMeteoCurrentResponse;
}

export interface AQILocation {
  latitude: number;
  longitude: number;
  locationName: string;
  timezone: string;
  region?: string;
  country?: string;
}

export interface AQIForecastPoint {
  /** Local date-time exactly as returned for the requested timezone. */
  time: string;
  aqi: number;
  /** Concentration in µg/m³; omitted when the API does not provide a valid value. */
  pm2_5?: number;
  /** Concentration in µg/m³; omitted when the API does not provide a valid value. */
  pm10?: number;
}

export interface AQIForecast {
  locationName: string;
  timezone: string;
  dataSource: string;
  points: AQIForecastPoint[];
  /** Source-provided generation time, when available. */
  generatedAt?: string;
}

type PollutantApiField =
  | "pm2_5"
  | "pm10"
  | "nitrogen_dioxide"
  | "ozone"
  | "carbon_monoxide"
  | "sulphur_dioxide";

interface PollutantMapping {
  apiField: PollutantApiField;
  pollutant: PollutantName;
  unit: string;
  divisor?: number;
}

interface OpenMeteoHourlyForecastResponse {
  time?: unknown;
  us_aqi?: unknown;
  pm2_5?: unknown;
  pm10?: unknown;
}

const REQUEST_TIMEOUT_MS = 10_000;

const pollutantMappings: PollutantMapping[] = [
  { apiField: "pm2_5", pollutant: "PM2.5", unit: "µg/m³" },
  { apiField: "pm10", pollutant: "PM10", unit: "µg/m³" },
  { apiField: "nitrogen_dioxide", pollutant: "NO2", unit: "µg/m³" },
  { apiField: "ozone", pollutant: "O3", unit: "µg/m³" },
  { apiField: "carbon_monoxide", pollutant: "CO", unit: "mg/m³", divisor: 1000 },
  { apiField: "sulphur_dioxide", pollutant: "SO2", unit: "µg/m³" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOpenMeteoAQIResponse(value: unknown): value is OpenMeteoAQIResponse {
  return isRecord(value) && isRecord(value.current);
}

function isOpenMeteoForecastResponse(
  value: unknown,
): value is { hourly: OpenMeteoHourlyForecastResponse } {
  return isRecord(value) && isRecord(value.hourly);
}

function isValidMeasurement(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function getOptionalForecastValues(
  value: unknown,
  expectedLength: number,
  fieldName: string,
): unknown[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length !== expectedLength) {
    throw new Error(
      `Open-Meteo returned invalid hourly ${fieldName} forecast data.`,
    );
  }

  return value;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateLocation(location: AQILocation): void {
  if (
    !Number.isFinite(location.latitude) ||
    location.latitude < -90 ||
    location.latitude > 90
  ) {
    throw new RangeError("Latitude must be a finite number between -90 and 90.");
  }

  if (
    !Number.isFinite(location.longitude) ||
    location.longitude < -180 ||
    location.longitude > 180
  ) {
    throw new RangeError("Longitude must be a finite number between -180 and 180.");
  }

  if (!location.locationName.trim()) {
    throw new Error("Location name must not be empty.");
  }

  if (!location.timezone.trim()) {
    throw new Error("Timezone must not be empty.");
  }

  if (
    (location.region !== undefined && typeof location.region !== "string") ||
    (location.country !== undefined && typeof location.country !== "string")
  ) {
    throw new Error("Location region and country must be strings when provided.");
  }
}

export async function fetchAQIForLocation(location: AQILocation): Promise<AQIReading> {
  validateLocation(location);

  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      "us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide,sulphur_dioxide",
    timezone: location.timezone.trim(),
  }).toString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Open-Meteo AQI request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        );
      }

      throw new Error(`Open-Meteo AQI request failed: ${getErrorMessage(error)}`);
    }

    if (!response.ok) {
      throw new Error(
        `Open-Meteo AQI request failed with HTTP ${response.status} ${response.statusText}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Open-Meteo AQI request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        );
      }

      throw new Error(`Open-Meteo returned an invalid JSON response: ${getErrorMessage(error)}`);
    }

    if (!isOpenMeteoAQIResponse(payload)) {
      throw new Error("Open-Meteo returned an invalid response: current data is missing.");
    }

    const { current } = payload;
    if (typeof current.time !== "string" || current.time.trim() === "") {
      throw new Error("Open-Meteo returned invalid current.time data.");
    }

    if (!isValidMeasurement(current.us_aqi) || current.us_aqi > 500) {
      throw new Error("Open-Meteo returned an invalid current.us_aqi value.");
    }

    const aqi = current.us_aqi;
    const category = getAirQualityStatus(aqi);
    const pollutants: PollutantReading[] = pollutantMappings.flatMap((mapping) => {
      const value = current[mapping.apiField];
      if (!isValidMeasurement(value)) {
        return [];
      }

      return [
        {
          pollutant: mapping.pollutant,
          value: value / (mapping.divisor ?? 1),
          unit: mapping.unit,
        },
      ];
    });

    return {
      aqi,
      city: location.locationName.trim(),
      region: location.region?.trim() ?? "",
      country: location.country?.trim() ?? "",
      pollutants,
      category,
      healthRecommendation: getHealthRecommendation(category),
      lastUpdated: current.time,
      dataSource: "Open-Meteo Air Quality API (model-based data; not CPCB station data)",
      isDemo: false,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchKolkataAQI(): Promise<AQIReading> {
  return fetchAQIForLocation({
    latitude: 22.5726,
    longitude: 88.3639,
    locationName: "Kolkata",
    region: "West Bengal",
    country: "India",
    timezone: "Asia/Kolkata",
  });
}

export async function fetchAQIForecastForLocation(
  location: AQILocation,
): Promise<AQIForecast> {
  validateLocation(location);

  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly: "us_aqi,pm2_5,pm10",
    forecast_days: "5",
    timezone: location.timezone.trim(),
  }).toString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Open-Meteo AQI forecast request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        );
      }

      throw new Error(
        `Open-Meteo AQI forecast request failed: ${getErrorMessage(error)}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `Open-Meteo AQI forecast request failed with HTTP ${response.status} ${response.statusText}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          `Open-Meteo AQI forecast request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        );
      }

      throw new Error(
        `Open-Meteo returned an invalid AQI forecast JSON response: ${getErrorMessage(error)}`,
      );
    }

    if (!isOpenMeteoForecastResponse(payload)) {
      throw new Error(
        "Open-Meteo returned an invalid AQI forecast response: hourly data is missing.",
      );
    }

    const { hourly } = payload;
    const times = hourly.time;
    const aqiValues = hourly.us_aqi;
    if (!Array.isArray(times) || !Array.isArray(aqiValues)) {
      throw new Error(
        "Open-Meteo returned an invalid AQI forecast response: hourly time and AQI arrays are required.",
      );
    }

    if (times.length === 0 || times.length !== aqiValues.length) {
      throw new Error(
        "Open-Meteo returned an empty or mismatched AQI forecast.",
      );
    }

    const pm25Values = getOptionalForecastValues(
      hourly.pm2_5,
      times.length,
      "PM2.5",
    );
    const pm10Values = getOptionalForecastValues(
      hourly.pm10,
      times.length,
      "PM10",
    );

    const points: AQIForecastPoint[] = times.map((time, index) => {
      const aqi = aqiValues[index];
      if (typeof time !== "string" || time.trim() === "") {
        throw new Error("Open-Meteo returned an invalid AQI forecast timestamp.");
      }

      if (!isValidMeasurement(aqi) || aqi > 500) {
        throw new Error("Open-Meteo returned an invalid hourly US AQI value.");
      }

      const pm25 = pm25Values?.[index];
      const pm10 = pm10Values?.[index];
      return {
        time,
        aqi,
        ...(isValidMeasurement(pm25) ? { pm2_5: pm25 } : {}),
        ...(isValidMeasurement(pm10) ? { pm10 } : {}),
      };
    });

    return {
      locationName: location.locationName.trim(),
      timezone: location.timezone.trim(),
      dataSource:
        "Open-Meteo Air Quality API / CAMS model-based forecast estimates (not verified ground-station measurements)",
      points,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
