import {
  fetchAQIForecastForLocation,
  type AQILocation,
} from "@/lib/aqi-api";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store",
};

const locationParameterNames = [
  "latitude",
  "longitude",
  "locationName",
  "timezone",
  "region",
  "country",
] as const;

const requiredLocationParameterNames = [
  "latitude",
  "longitude",
  "locationName",
  "timezone",
] as const;

const INDIA_BOUNDS = {
  minLatitude: 6,
  maxLatitude: 38,
  minLongitude: 68,
  maxLongitude: 98,
};

const DECIMAL_NUMBER_PATTERN =
  /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const DEFAULT_KOLKATA_LOCATION: AQILocation = {
  latitude: 22.5726,
  longitude: 88.3639,
  locationName: "Kolkata",
  region: "West Bengal",
  country: "India",
  timezone: "Asia/Kolkata",
};

function jsonError(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: noStoreHeaders },
  );
}

function parseLocation(
  searchParams: URLSearchParams,
):
  | { valid: true; location: AQILocation }
  | { valid: false; message: string } {
  const values = new Map<string, string>();

  for (const name of locationParameterNames) {
    const matches = searchParams.getAll(name);
    if (matches.length > 1) {
      return { valid: false, message: `Provide only one ${name} value.` };
    }
    if (matches.length === 1) {
      values.set(name, matches[0].trim());
    }
  }

  const missingNames = requiredLocationParameterNames.filter(
    (name) => !values.has(name),
  );
  if (missingNames.length > 0) {
    return {
      valid: false,
      message: `Provide latitude, longitude, locationName, and timezone together. Missing: ${missingNames.join(", ")}.`,
    };
  }

  const latitudeText = values.get("latitude");
  const longitudeText = values.get("longitude");
  const locationName = values.get("locationName");
  const timezone = values.get("timezone");

  if (!latitudeText || !longitudeText || !locationName || !timezone) {
    return {
      valid: false,
      message:
        "Latitude, longitude, locationName, and timezone must not be empty.",
    };
  }

  if (
    !DECIMAL_NUMBER_PATTERN.test(latitudeText) ||
    !DECIMAL_NUMBER_PATTERN.test(longitudeText)
  ) {
    return {
      valid: false,
      message: "latitude and longitude must be valid decimal numbers.",
    };
  }

  if (locationName.length > 120) {
    return {
      valid: false,
      message: "locationName must not exceed 120 characters.",
    };
  }
  if (timezone.length > 100) {
    return {
      valid: false,
      message: "timezone must not exceed 100 characters.",
    };
  }

  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return {
      valid: false,
      message: "latitude must be a finite number between -90 and 90.",
    };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return {
      valid: false,
      message: "longitude must be a finite number between -180 and 180.",
    };
  }

  if (
    latitude < INDIA_BOUNDS.minLatitude ||
    latitude > INDIA_BOUNDS.maxLatitude ||
    longitude < INDIA_BOUNDS.minLongitude ||
    longitude > INDIA_BOUNDS.maxLongitude
  ) {
    return {
      valid: false,
      message:
        "Coordinates must be within India's approximate geographic bounds (latitude 6 to 38, longitude 68 to 98).",
    };
  }

  const region = values.get("region");
  const country = values.get("country");
  if (region !== undefined && region.length > 100) {
    return {
      valid: false,
      message: "region must not exceed 100 characters.",
    };
  }
  if (country !== undefined && country.length > 100) {
    return {
      valid: false,
      message: "country must not exceed 100 characters.",
    };
  }

  return {
    valid: true,
    location: {
      latitude,
      longitude,
      locationName,
      timezone,
      ...(region === undefined ? {} : { region }),
      ...(country === undefined ? {} : { country }),
    },
  };
}

export async function GET(request: Request): Promise<Response> {
  try {
    const searchParams = new URL(request.url).searchParams;
    const hasLocationParameters = locationParameterNames.some((name) =>
      searchParams.has(name),
    );

    let location = DEFAULT_KOLKATA_LOCATION;
    if (hasLocationParameters) {
      const parsed = parseLocation(searchParams);
      if (!parsed.valid) {
        return jsonError(400, "INVALID_LOCATION", parsed.message);
      }
      location = parsed.location;
    }

    try {
      const forecast = await fetchAQIForecastForLocation(location);
      return Response.json(forecast, { status: 200, headers: noStoreHeaders });
    } catch {
      console.error("AQI forecast request failed.");
      return jsonError(
        502,
        "AQI_FORECAST_UPSTREAM_FAILURE",
        "Unable to retrieve AQI forecast data for this location. Please try again later.",
      );
    }
  } catch {
    console.error("Unexpected error in the AQI forecast route.");
    return jsonError(
      500,
      "INTERNAL_ERROR",
      "An unexpected error occurred. Please try again later.",
    );
  }
}
