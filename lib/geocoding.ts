export interface IndianLocationResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  countryCode: "IN";
  admin1?: string;
  admin2?: string;
  timezone: string;
  featureCode?: string;
}

interface OpenMeteoGeocodingLocation {
  id?: unknown;
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  country?: unknown;
  country_code?: unknown;
  admin1?: unknown;
  admin2?: unknown;
  timezone?: unknown;
  feature_code?: unknown;
}

const GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidLocation(
  value: unknown,
): value is OpenMeteoGeocodingLocation & {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  country_code: string;
  timezone: string;
} {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "number" &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    typeof value.country === "string" &&
    value.country.trim().length > 0 &&
    typeof value.country_code === "string" &&
    value.country_code.trim().toUpperCase() === "IN" &&
    typeof value.timezone === "string" &&
    value.timezone.trim().length > 0
  );
}

function toLocationResult(
  location: OpenMeteoGeocodingLocation & {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    country: string;
    country_code: string;
    timezone: string;
  },
): IndianLocationResult {
  return {
    id: location.id,
    name: location.name.trim(),
    latitude: location.latitude,
    longitude: location.longitude,
    country: location.country.trim(),
    countryCode: "IN",
    ...(typeof location.admin1 === "string" && location.admin1.trim()
      ? { admin1: location.admin1.trim() }
      : {}),
    ...(typeof location.admin2 === "string" && location.admin2.trim()
      ? { admin2: location.admin2.trim() }
      : {}),
    timezone: location.timezone.trim(),
    ...(typeof location.feature_code === "string" && location.feature_code.trim()
      ? { featureCode: location.feature_code.trim() }
      : {}),
  };
}

export async function searchIndianLocations(
  query: string,
): Promise<IndianLocationResult[]> {
  if (typeof query !== "string") {
    throw new TypeError("Location search query must be a string.");
  }

  const searchTerm = query.trim();
  if (searchTerm.length < 2) {
    throw new RangeError("Location search query must contain at least 2 characters.");
  }
  if (searchTerm.length > 100) {
    throw new RangeError("Location search query must not exceed 100 characters.");
  }

  const url = new URL(GEOCODING_API_URL);
  url.search = new URLSearchParams({
    name: searchTerm,
    count: String(MAX_RESULTS),
    language: "en",
    countryCode: "IN",
  }).toString();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch {
      if (controller.signal.aborted) {
        throw new Error(
          `Open-Meteo geocoding request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        );
      }
      throw new Error("Open-Meteo geocoding request failed.");
    }

    if (!response.ok) {
      throw new Error(
        `Open-Meteo geocoding request failed with HTTP ${response.status}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (controller.signal.aborted) {
        throw new Error(
          `Open-Meteo geocoding request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        );
      }
      throw new Error("Open-Meteo returned an invalid geocoding JSON response.");
    }

    if (!isRecord(payload) || !Array.isArray(payload.results)) {
      throw new Error("Open-Meteo returned an invalid geocoding response.");
    }

    return (payload.results as unknown[])
      .filter(isValidLocation)
      .slice(0, MAX_RESULTS)
      .map(toLocationResult);
  } finally {
    clearTimeout(timeoutId);
  }
}
