"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AQIForecast } from "@/lib/aqi-api";
import {
  SAMPLE_AQI_DATA,
  type AQIReading,
  type AirQualityStatus,
  type PollutantName,
} from "@/lib/aqi";
import type { IndianLocationResult } from "@/lib/geocoding";

const SELECTED_LOCATION_STORAGE_KEY = "smogshield_selected_location";
const airQualityStatuses: AirQualityStatus[] = [
  "Good",
  "Moderate",
  "Unhealthy for Sensitive Groups",
  "Unhealthy",
  "Very Unhealthy",
  "Hazardous",
];
const pollutantNames: PollutantName[] = [
  "PM2.5",
  "PM10",
  "NO2",
  "O3",
  "CO",
  "SO2",
];
const sampleReading = SAMPLE_AQI_DATA[0];

interface PersistedSelectedLocation extends IndianLocationResult {
  locationName: string;
  region: string;
}

export interface AQIDataContextValue {
  selectedLocation: IndianLocationResult | null;
  currentAQI: AQIReading | null;
  isAQILoading: boolean;
  aqiError: string | null;
  forecast: AQIForecast | null;
  isForecastLoading: boolean;
  forecastError: string | null;
  isLocationReady: boolean;
  locationPersistenceError: string | null;
  selectLocation: (location: IndianLocationResult) => Promise<void>;
  refreshAQI: () => Promise<void>;
  refreshForecast: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAQIReading(value: unknown): value is AQIReading {
  if (!isRecord(value)) {
    return false;
  }

  const validPollutants =
    Array.isArray(value.pollutants) &&
    value.pollutants.every((pollutant) => {
      if (!isRecord(pollutant)) {
        return false;
      }

      return (
        typeof pollutant.pollutant === "string" &&
        pollutantNames.includes(pollutant.pollutant as PollutantName) &&
        typeof pollutant.value === "number" &&
        Number.isFinite(pollutant.value) &&
        pollutant.value >= 0 &&
        typeof pollutant.unit === "string"
      );
    });

  return (
    typeof value.aqi === "number" &&
    Number.isFinite(value.aqi) &&
    value.aqi >= 0 &&
    value.aqi <= 500 &&
    typeof value.category === "string" &&
    airQualityStatuses.includes(value.category as AirQualityStatus) &&
    typeof value.city === "string" &&
    typeof value.region === "string" &&
    typeof value.country === "string" &&
    validPollutants &&
    typeof value.healthRecommendation === "string" &&
    typeof value.lastUpdated === "string" &&
    value.lastUpdated.length > 0 &&
    typeof value.dataSource === "string" &&
    typeof value.isDemo === "boolean"
  );
}

export function isIndianLocationResult(
  value: unknown,
): value is IndianLocationResult {
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
    value.countryCode === "IN" &&
    typeof value.timezone === "string" &&
    value.timezone.trim().length > 0 &&
    (value.admin1 === undefined || typeof value.admin1 === "string") &&
    (value.admin2 === undefined || typeof value.admin2 === "string") &&
    (value.featureCode === undefined || typeof value.featureCode === "string")
  );
}

function isPersistedSelectedLocation(
  value: unknown,
): value is PersistedSelectedLocation {
  return (
    isIndianLocationResult(value) &&
    isRecord(value) &&
    typeof value.locationName === "string" &&
    value.locationName.trim() === value.name &&
    typeof value.region === "string" &&
    value.region === (value.admin1 ?? "")
  );
}

function readSavedSelectedLocation(): PersistedSelectedLocation | null {
  try {
    const savedValue = window.localStorage.getItem(SELECTED_LOCATION_STORAGE_KEY);
    if (!savedValue) {
      return null;
    }

    const parsed: unknown = JSON.parse(savedValue);
    return isPersistedSelectedLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveSelectedLocation(location: IndianLocationResult): boolean {
  const persistedLocation: PersistedSelectedLocation = {
    ...location,
    locationName: location.name,
    region: location.admin1 ?? "",
  };

  try {
    window.localStorage.setItem(
      SELECTED_LOCATION_STORAGE_KEY,
      JSON.stringify(persistedLocation),
    );
    return true;
  } catch {
    return false;
  }
}

export function getForecastTimestampValue(timestamp: string): number | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timestamp);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "0");
  const value = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(value);

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
    ? value
    : null;
}

export function isValidAQIValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 500
  );
}

export function isValidConcentration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isAQIForecastPoint(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const hasValidOptionalConcentration = (concentration: unknown) =>
    concentration === undefined || isValidConcentration(concentration);

  return (
    typeof value.time === "string" &&
    getForecastTimestampValue(value.time) !== null &&
    isValidAQIValue(value.aqi) &&
    hasValidOptionalConcentration(value.pm2_5) &&
    hasValidOptionalConcentration(value.pm10)
  );
}

function isAQIForecast(value: unknown): value is AQIForecast {
  return (
    isRecord(value) &&
    typeof value.locationName === "string" &&
    value.locationName.trim().length > 0 &&
    typeof value.timezone === "string" &&
    value.timezone.trim().length > 0 &&
    typeof value.dataSource === "string" &&
    value.dataSource.trim().length > 0 &&
    Array.isArray(value.points) &&
    value.points.every(isAQIForecastPoint) &&
    (value.generatedAt === undefined ||
      (typeof value.generatedAt === "string" &&
        value.generatedAt.trim().length > 0))
  );
}

function getForecastLocationKey(location?: IndianLocationResult): string {
  if (!location) {
    return "Kolkata|Asia/Kolkata";
  }

  return [
    location.id,
    location.name,
    location.latitude,
    location.longitude,
    location.timezone,
  ].join("|");
}

const AQIDataContext = createContext<AQIDataContextValue | null>(null);

export function AQIDataProvider({ children }: { children: ReactNode }) {
  const [selectedLocation, setSelectedLocation] =
    useState<IndianLocationResult | null>(null);
  const [currentAQI, setCurrentAQI] = useState<AQIReading | null>(null);
  const [isAQILoading, setIsAQILoading] = useState(true);
  const [aqiError, setAqiError] = useState<string | null>(null);
  const [forecast, setForecast] = useState<AQIForecast | null>(null);
  const [isForecastLoading, setIsForecastLoading] = useState(true);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [isLocationReady, setIsLocationReady] = useState(false);
  const [locationPersistenceError, setLocationPersistenceError] =
    useState<string | null>(null);

  const selectedLocationRef = useRef<IndianLocationResult | null>(null);
  const currentAQIControllerRef = useRef<AbortController | null>(null);
  const forecastControllerRef = useRef<AbortController | null>(null);
  const currentAQIRequestIdRef = useRef(0);
  const forecastRequestIdRef = useRef(0);
  const userSelectedLocationRef = useRef(false);
  const isLocationReadyRef = useRef(false);
  const forecastInFlightKeyRef = useRef<string | null>(null);
  const loadedForecastKeyRef = useRef<string | null>(null);
  const forecastRef = useRef<AQIForecast | null>(null);

  const requestAQI = useCallback(
    async (
      location: IndianLocationResult | null,
      allowDemoFallback: boolean,
    ) => {
      currentAQIControllerRef.current?.abort();
      const requestId = ++currentAQIRequestIdRef.current;
      const controller = new AbortController();
      currentAQIControllerRef.current = controller;
      setCurrentAQI(null);
      setAqiError(null);
      setIsAQILoading(true);

      try {
        let endpoint = "/api/aqi";
        if (location) {
          const params = new URLSearchParams({
            latitude: String(location.latitude),
            longitude: String(location.longitude),
            locationName: location.name,
            timezone: location.timezone,
          });
          if (location.admin1) params.set("region", location.admin1);
          if (location.country) params.set("country", location.country);
          endpoint = `/api/aqi?${params.toString()}`;
        }

        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("AQI API request failed.");
        }

        const payload: unknown = await response.json();
        if (
          !isAQIReading(payload) ||
          (location !== null && payload.city !== location.name)
        ) {
          throw new Error("AQI API returned invalid data.");
        }

        if (
          requestId === currentAQIRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          setCurrentAQI(payload);
          setAqiError(null);
        }
      } catch {
        if (
          controller.signal.aborted ||
          requestId !== currentAQIRequestIdRef.current
        ) {
          return;
        }

        if (location) {
          setCurrentAQI(null);
          setAqiError(
            `Could not load AQI data for ${location.name}. Please try again later.`,
          );
        } else if (allowDemoFallback) {
          setCurrentAQI(sampleReading);
          setAqiError("Could not load model-based data. Showing demo data instead.");
        } else {
          setCurrentAQI(null);
          setAqiError("Could not load AQI data. Please try again later.");
        }
      } finally {
        if (
          requestId === currentAQIRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          currentAQIControllerRef.current = null;
          setIsAQILoading(false);
        }
      }
    },
    [],
  );

  const loadForecast = useCallback(
    async (location: IndianLocationResult | null, force = false) => {
      const requestKey = getForecastLocationKey(location ?? undefined);
      if (
        forecastInFlightKeyRef.current === requestKey ||
        (!force &&
          loadedForecastKeyRef.current === requestKey &&
          forecastRef.current !== null)
      ) {
        return;
      }

      forecastControllerRef.current?.abort();
      const requestId = ++forecastRequestIdRef.current;
      const controller = new AbortController();
      forecastControllerRef.current = controller;
      forecastInFlightKeyRef.current = requestKey;
      const locationName = location?.name.trim() ?? "Kolkata";
      const timezone = location?.timezone.trim() ?? "Asia/Kolkata";
      forecastRef.current = null;
      setForecast(null);
      setForecastError(null);
      setIsForecastLoading(true);

      try {
        let endpoint = "/api/aqi/forecast";
        if (location) {
          const params = new URLSearchParams({
            latitude: String(location.latitude),
            longitude: String(location.longitude),
            locationName: location.name,
            timezone: location.timezone,
            region: location.admin1 ?? "",
            country: location.country ?? "",
          });
          endpoint = `${endpoint}?${params.toString()}`;
        }

        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("AQI forecast request failed.");
        }

        const payload: unknown = await response.json();
        if (
          !isAQIForecast(payload) ||
          payload.locationName !== locationName ||
          payload.timezone !== timezone
        ) {
          throw new Error(
            "AQI forecast response did not match the requested location.",
          );
        }

        if (
          requestId === forecastRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          forecastRef.current = payload;
          loadedForecastKeyRef.current = requestKey;
          setForecast(payload);
          setForecastError(null);
        }
      } catch {
        if (
          requestId === forecastRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          forecastRef.current = null;
          loadedForecastKeyRef.current = null;
          setForecast(null);
          setForecastError(
            `Could not load the five-day AQI forecast for ${locationName}. Please try again later.`,
          );
        }
      } finally {
        if (
          requestId === forecastRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          forecastControllerRef.current = null;
          forecastInFlightKeyRef.current = null;
          setIsForecastLoading(false);
        }
      }
    },
    [],
  );

  const selectLocation = useCallback(
    async (location: IndianLocationResult) => {
      userSelectedLocationRef.current = true;
      selectedLocationRef.current = location;
      isLocationReadyRef.current = true;
      setSelectedLocation(location);
      setIsLocationReady(true);
      setLocationPersistenceError(
        saveSelectedLocation(location)
          ? null
          : "This browser could not save your selected location.",
      );

      forecastControllerRef.current?.abort();
      forecastControllerRef.current = null;
      forecastRequestIdRef.current += 1;
      forecastInFlightKeyRef.current = null;
      loadedForecastKeyRef.current = null;
      forecastRef.current = null;
      setForecast(null);
      setForecastError(null);
      setIsForecastLoading(true);

      await requestAQI(location, false);
    },
    [requestAQI],
  );

  const refreshAQI = useCallback(async () => {
    if (!isLocationReadyRef.current) {
      return;
    }

    const location = selectedLocationRef.current;
    await requestAQI(location, location === null);
  }, [requestAQI]);

  const refreshForecast = useCallback(async () => {
    if (!isLocationReadyRef.current) {
      return;
    }

    await loadForecast(selectedLocationRef.current, true);
  }, [loadForecast]);

  useEffect(() => {
    const startupTimer = window.setTimeout(() => {
      if (!userSelectedLocationRef.current) {
        const savedLocation = readSavedSelectedLocation();
        selectedLocationRef.current = savedLocation;
        setSelectedLocation(savedLocation);
        void requestAQI(savedLocation, savedLocation === null);
      }

      isLocationReadyRef.current = true;
      setIsLocationReady(true);
    }, 0);

    return () => {
      window.clearTimeout(startupTimer);
      currentAQIControllerRef.current?.abort();
      currentAQIControllerRef.current = null;
      currentAQIRequestIdRef.current += 1;
      forecastControllerRef.current?.abort();
      forecastControllerRef.current = null;
      forecastRequestIdRef.current += 1;
    };
  }, [requestAQI]);

  useEffect(() => {
    if (!isLocationReady) {
      return;
    }

    const forecastLoadTimer = window.setTimeout(() => {
      void loadForecast(selectedLocation);
    }, 0);

    return () => window.clearTimeout(forecastLoadTimer);
  }, [isLocationReady, loadForecast, selectedLocation]);

  const value = useMemo<AQIDataContextValue>(
    () => ({
      selectedLocation,
      currentAQI,
      isAQILoading,
      aqiError,
      forecast,
      isForecastLoading,
      forecastError,
      isLocationReady,
      locationPersistenceError,
      selectLocation,
      refreshAQI,
      refreshForecast,
    }),
    [
      selectedLocation,
      currentAQI,
      isAQILoading,
      aqiError,
      forecast,
      isForecastLoading,
      forecastError,
      isLocationReady,
      locationPersistenceError,
      selectLocation,
      refreshAQI,
      refreshForecast,
    ],
  );

  return (
    <AQIDataContext.Provider value={value}>{children}</AQIDataContext.Provider>
  );
}

export function useAQIData(): AQIDataContextValue {
  const context = useContext(AQIDataContext);
  if (!context) {
    throw new Error("useAQIData must be used within an AQIDataProvider.");
  }

  return context;
}
