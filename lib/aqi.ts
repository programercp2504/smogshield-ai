export type AirQualityStatus =
  | "Good"
  | "Moderate"
  | "Unhealthy for Sensitive Groups"
  | "Unhealthy"
  | "Very Unhealthy"
  | "Hazardous";

export type PollutantName = "PM2.5" | "PM10" | "NO2" | "O3" | "CO" | "SO2";

export interface PollutantReading {
  pollutant: PollutantName;
  value: number;
  unit: string;
}

export interface AQIReading {
  aqi: number;
  city: string;
  region: string;
  country: string;
  pollutants: PollutantReading[];
  category: AirQualityStatus;
  healthRecommendation: string;
  lastUpdated: string;
  dataSource: string;
  isDemo: boolean;
}

const healthRecommendations: Record<AirQualityStatus, string> = {
  Good: "Enjoy outdoor activities as usual.",
  Moderate:
    "Most people can continue normal activities. Unusually sensitive people may consider reducing prolonged, intense outdoor exertion.",
  "Unhealthy for Sensitive Groups":
    "Children, older adults, and people with heart or lung conditions should reduce prolonged outdoor exertion.",
  Unhealthy:
    "Everyone may begin to experience effects. Sensitive groups should avoid prolonged outdoor exertion.",
  "Very Unhealthy":
    "Health alert: consider limiting outdoor activities, especially if you are in a sensitive group.",
  Hazardous:
    "Health warning: avoid outdoor exertion and follow local public health guidance.",
};

export function getAirQualityStatus(aqi: number): AirQualityStatus {
  if (!Number.isFinite(aqi) || aqi < 0 || aqi > 500) {
    throw new RangeError("AQI must be a finite number between 0 and 500.");
  }

  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for Sensitive Groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very Unhealthy";
  return "Hazardous";
}

export function getHealthRecommendation(status: AirQualityStatus): string {
  return healthRecommendations[status];
}

const sampleAQI = 42;
const sampleStatus = getAirQualityStatus(sampleAQI);

export const SAMPLE_AQI_DATA: AQIReading[] = [
  {
    aqi: sampleAQI,
    city: "Kolkata",
    region: "West Bengal",
    country: "India",
    pollutants: [
      { pollutant: "PM2.5", value: 12, unit: "µg/m³" },
      { pollutant: "PM10", value: 28, unit: "µg/m³" },
      { pollutant: "NO2", value: 18, unit: "µg/m³" },
      { pollutant: "O3", value: 32, unit: "µg/m³" },
      { pollutant: "CO", value: 0.6, unit: "mg/m³" },
      { pollutant: "SO2", value: 7, unit: "µg/m³" },
    ],
    category: sampleStatus,
    healthRecommendation: getHealthRecommendation(sampleStatus),
    // Demo metadata timestamp only; this is not a measurement or sensor update time.
    lastUpdated: "2026-11-18T00:00:00.000Z",
    dataSource: "Illustrative demo data; not live or verified",
    isDemo: true,
  },
];
