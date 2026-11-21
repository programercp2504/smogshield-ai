"use client";

import { useEffect, useRef, useState } from "react";
import {
  isAQIReading,
  isIndianLocationResult,
  isValidAQIValue,
  isValidConcentration,
  useAQIData,
} from "@/app/providers/aqi-data-provider";
import {
  getAirQualityStatus,
  type AirQualityStatus,
  type AQIReading,
  type PollutantName,
} from "@/lib/aqi";
import type { IndianLocationResult } from "@/lib/geocoding";

interface CityComparisonResult {
  primaryLocation: IndianLocationResult;
  comparisonLocation: IndianLocationResult;
  reading: AQIReading;
}

interface CityComparisonError {
  primaryLocation: IndianLocationResult;
  comparisonLocation: IndianLocationResult;
  message: string;
}

interface ComparisonCityCard {
  key: "primary" | "comparison";
  label: string;
  location: IndianLocationResult;
  reading: AQIReading;
  isBetter: boolean;
}

const airQualityStyles: Record<AirQualityStatus, { badge: string; dot: string }> = {
  Good: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  Moderate: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  "Unhealthy for Sensitive Groups": {
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",
    dot: "bg-orange-500",
  },
  Unhealthy: {
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200",
    dot: "bg-rose-500",
  },
  "Very Unhealthy": {
    badge: "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
    dot: "bg-red-500",
  },
  Hazardous: {
    badge: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/60 dark:text-fuchsia-200",
    dot: "bg-fuchsia-600",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeocodingResponse(
  value: unknown,
): value is { results: IndianLocationResult[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.results) &&
    value.results.length <= 10 &&
    value.results.every(isIndianLocationResult)
  );
}

function getPollutantValue(
  reading: AQIReading,
  pollutant: PollutantName,
): string {
  const value = reading.pollutants.find((item) => item.pollutant === pollutant);
  return value && isValidConcentration(value.value)
    ? `${value.value} ${value.unit}`
    : "Unavailable";
}

function getLocationSubtitle(location: IndianLocationResult): string {
  return [location.admin1, location.admin2, location.country]
    .filter(Boolean)
    .join(" · ");
}

export default function ComparePage() {
  const {
    selectedLocation,
    currentAQI,
    isAQILoading,
    aqiError,
    isLocationReady,
    refreshAQI,
  } = useAQIData();
  const [comparisonQuery, setComparisonQuery] = useState("");
  const [comparisonSearchResults, setComparisonSearchResults] = useState<
    IndianLocationResult[]
  >([]);
  const [isComparisonSearching, setIsComparisonSearching] = useState(false);
  const [comparisonSearchError, setComparisonSearchError] = useState<
    string | null
  >(null);
  const [showComparisonSearchResults, setShowComparisonSearchResults] =
    useState(false);
  const [comparisonLocation, setComparisonLocation] =
    useState<IndianLocationResult | null>(null);
  const [comparisonResult, setComparisonResult] =
    useState<CityComparisonResult | null>(null);
  const [comparisonError, setComparisonError] =
    useState<CityComparisonError | null>(null);
  const [comparisonRetryCount, setComparisonRetryCount] = useState(0);
  const comparisonSearchControllerRef = useRef<AbortController | null>(null);
  const comparisonAQIControllerRef = useRef<AbortController | null>(null);
  const comparisonSearchRequestIdRef = useRef(0);
  const comparisonAQIRequestIdRef = useRef(0);
  const comparisonSearchInProgressRef = useRef(false);

  const primaryReading =
    !isAQILoading &&
    selectedLocation &&
    isAQIReading(currentAQI) &&
    isValidAQIValue(currentAQI.aqi) &&
    !currentAQI.isDemo &&
    currentAQI.city === selectedLocation.name
      ? currentAQI
      : null;

  const currentComparisonResult =
    selectedLocation &&
    comparisonLocation &&
    comparisonResult?.primaryLocation === selectedLocation &&
    comparisonResult.comparisonLocation === comparisonLocation
      ? comparisonResult
      : null;
  const currentComparisonError =
    selectedLocation &&
    comparisonLocation &&
    comparisonError?.primaryLocation === selectedLocation &&
    comparisonError.comparisonLocation === comparisonLocation
      ? comparisonError.message
      : null;
  const comparisonPending = Boolean(
    selectedLocation &&
      comparisonLocation &&
      selectedLocation.id !== comparisonLocation.id &&
      !currentComparisonResult &&
      !currentComparisonError,
  );
  const comparisonWinner =
    primaryReading && currentComparisonResult
      ? primaryReading.aqi < currentComparisonResult.reading.aqi
        ? "primary"
        : primaryReading.aqi > currentComparisonResult.reading.aqi
          ? "comparison"
          : "tie"
      : null;

  function handleComparisonQueryChange(value: string) {
    comparisonSearchControllerRef.current?.abort();
    comparisonSearchControllerRef.current = null;
    comparisonSearchRequestIdRef.current += 1;
    comparisonSearchInProgressRef.current = false;
    setIsComparisonSearching(false);
    setComparisonQuery(value);
    setComparisonSearchResults([]);
    setComparisonSearchError(null);
    setShowComparisonSearchResults(false);
  }

  async function searchComparisonLocations() {
    const query = comparisonQuery.trim();
    if (
      comparisonSearchInProgressRef.current ||
      query.length < 2 ||
      query.length > 100
    ) {
      return;
    }

    comparisonSearchInProgressRef.current = true;
    const requestId = ++comparisonSearchRequestIdRef.current;
    const controller = new AbortController();
    comparisonSearchControllerRef.current = controller;
    setIsComparisonSearching(true);
    setComparisonSearchError(null);
    setComparisonSearchResults([]);
    setShowComparisonSearchResults(false);

    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/geocode?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Comparison city search request failed.");
      }

      const payload: unknown = await response.json();
      if (!isGeocodingResponse(payload)) {
        throw new Error("Comparison city search returned invalid results.");
      }

      if (
        requestId === comparisonSearchRequestIdRef.current &&
        !controller.signal.aborted
      ) {
        const results = payload.results
          .filter((location) => location.id !== selectedLocation?.id)
          .slice(0, 10);
        setComparisonSearchResults(results);
        setShowComparisonSearchResults(true);
      }
    } catch {
      if (
        requestId === comparisonSearchRequestIdRef.current &&
        !controller.signal.aborted
      ) {
        setComparisonSearchError(
          "Could not search comparison cities right now. Please try again.",
        );
        setShowComparisonSearchResults(true);
      }
    } finally {
      if (
        requestId === comparisonSearchRequestIdRef.current &&
        !controller.signal.aborted
      ) {
        comparisonSearchInProgressRef.current = false;
        comparisonSearchControllerRef.current = null;
        setIsComparisonSearching(false);
      }
    }
  }

  function selectComparisonLocation(location: IndianLocationResult) {
    comparisonSearchControllerRef.current?.abort();
    comparisonSearchControllerRef.current = null;
    comparisonSearchRequestIdRef.current += 1;
    comparisonSearchInProgressRef.current = false;
    setIsComparisonSearching(false);
    setComparisonLocation(location);
    setComparisonQuery(location.name);
    setComparisonSearchResults([]);
    setComparisonSearchError(null);
    setShowComparisonSearchResults(false);
    setComparisonResult(null);
    setComparisonError(null);
  }

  useEffect(() => {
    comparisonSearchControllerRef.current?.abort();
    comparisonAQIControllerRef.current?.abort();
    comparisonSearchRequestIdRef.current += 1;
    comparisonAQIRequestIdRef.current += 1;

    return () => {
      comparisonSearchControllerRef.current?.abort();
      comparisonAQIControllerRef.current?.abort();
      comparisonSearchRequestIdRef.current += 1;
      comparisonAQIRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    comparisonAQIControllerRef.current?.abort();
    comparisonAQIControllerRef.current = null;
    const requestId = ++comparisonAQIRequestIdRef.current;
    const requestLocations =
      selectedLocation &&
      comparisonLocation &&
      selectedLocation.id !== comparisonLocation.id
        ? { primary: selectedLocation, comparison: comparisonLocation }
        : null;

    if (!requestLocations) {
      return;
    }

    const { primary, comparison } = requestLocations;
    const controller = new AbortController();
    comparisonAQIControllerRef.current = controller;

    async function loadComparisonAQI() {
      try {
        const params = new URLSearchParams({
          latitude: String(comparison.latitude),
          longitude: String(comparison.longitude),
          locationName: comparison.name,
          timezone: comparison.timezone,
        });
        if (comparison.admin1) {
          params.set("region", comparison.admin1);
        }
        if (comparison.country) {
          params.set("country", comparison.country);
        }

        const response = await fetch(`/api/aqi?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Comparison city AQI request failed.");
        }

        const payload: unknown = await response.json();
        if (
          !isAQIReading(payload) ||
          !isValidAQIValue(payload.aqi) ||
          payload.city !== comparison.name ||
          payload.isDemo
        ) {
          throw new Error("Comparison city AQI response was invalid.");
        }

        if (
          requestId === comparisonAQIRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          setComparisonResult({
            primaryLocation: primary,
            comparisonLocation: comparison,
            reading: payload,
          });
          setComparisonError(null);
        }
      } catch {
        if (
          requestId === comparisonAQIRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          setComparisonResult(null);
          setComparisonError({
            primaryLocation: primary,
            comparisonLocation: comparison,
            message: `Could not load a valid, location-matched, non-demo model-based AQI reading for ${comparison.name}. Please try again.`,
          });
        }
      } finally {
        if (
          requestId === comparisonAQIRequestIdRef.current &&
          !controller.signal.aborted
        ) {
          comparisonAQIControllerRef.current = null;
        }
      }
    }

    void loadComparisonAQI();

    return () => {
      controller.abort();
      if (comparisonAQIControllerRef.current === controller) {
        comparisonAQIControllerRef.current = null;
      }
      if (comparisonAQIRequestIdRef.current === requestId) {
        comparisonAQIRequestIdRef.current += 1;
      }
    };
  }, [selectedLocation, comparisonLocation, comparisonRetryCount]);

  const selectedCityName = selectedLocation?.name;
  const primaryUnavailableMessage =
    aqiError ??
    (selectedLocation
      ? `A valid, location-matched, non-demo model-based AQI reading for ${selectedLocation.name} is unavailable.`
      : "Select a city on the dashboard to use it as the primary comparison city.");

  function retryComparison() {
    setComparisonResult(null);
    setComparisonError(null);
    setComparisonRetryCount((count) => count + 1);
  }

  const comparisonCards: ComparisonCityCard[] =
    selectedLocation && primaryReading && currentComparisonResult
      ? [
          {
            key: "primary",
            label: "Selected city",
            location: selectedLocation,
            reading: primaryReading,
            isBetter: comparisonWinner === "primary",
          },
          {
            key: "comparison",
            label: "Comparison city",
            location: currentComparisonResult.comparisonLocation,
            reading: currentComparisonResult.reading,
            isBetter: comparisonWinner === "comparison",
          },
        ]
      : [];

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-6 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-6 rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Compare air quality
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Compare Two Cities
              </h1>
              <p
                aria-live="polite"
                className="mt-2 text-sm text-slate-500 dark:text-slate-300"
              >
                {selectedCityName
                  ? `Primary city · ${selectedCityName} · ${selectedLocation.timezone}`
                  : isLocationReady
                    ? "Select a primary city on the dashboard to compare its AQI."
                    : "Restoring your selected primary city..."}
              </p>
            </div>
            <p className="max-w-xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Compare the selected city with another Indian city using current,
              non-demo AQI data. Lower AQI indicates better air quality.
            </p>
          </div>
        </header>

        <section
          aria-labelledby="comparison-heading"
          className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2
                id="comparison-heading"
                className="text-lg font-bold tracking-tight text-slate-900 dark:text-white"
              >
                Current AQI comparison
              </h2>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                The primary city and AQI come from your shared selected
                location. Choose a second Indian city or district to compare.
              </p>
            </div>
            {comparisonLocation && (
              <p className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                Comparing with {comparisonLocation.name}
              </p>
            )}
          </div>

          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              void searchComparisonLocations();
            }}
          >
            <label
              htmlFor="comparison-location-search"
              className="mb-2 block text-sm font-bold text-slate-800 dark:text-slate-100"
            >
              Find a second Indian city
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="comparison-location-search"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showComparisonSearchResults}
                aria-controls="comparison-location-results"
                aria-describedby="comparison-location-help"
                value={comparisonQuery}
                onChange={(event) =>
                  handleComparisonQueryChange(event.target.value)
                }
                placeholder="Search a city or district..."
                maxLength={100}
                className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-800 dark:focus:ring-emerald-950/60"
              />
              <button
                type="submit"
                disabled={
                  isComparisonSearching ||
                  comparisonQuery.trim().length < 2 ||
                  comparisonQuery.trim().length > 100
                }
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isComparisonSearching && (
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                )}
                {isComparisonSearching ? "Searching..." : "Search"}
              </button>
            </div>
            <p
              id="comparison-location-help"
              className="mt-2 text-[11px] text-slate-500 dark:text-slate-400"
            >
              Search results are limited to India. The selected city remains
              the first city in the comparison.
            </p>
          </form>

          {showComparisonSearchResults && (
            <div
              id="comparison-location-results"
              className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
              aria-live="polite"
            >
              {comparisonSearchError ? (
                <div role="alert" className="p-4">
                  <p className="text-sm text-rose-700 dark:text-rose-300">
                    {comparisonSearchError}
                  </p>
                  <button
                    type="button"
                    onClick={() => void searchComparisonLocations()}
                    disabled={isComparisonSearching}
                    className="mt-2 min-h-10 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50 dark:border-rose-900 dark:text-rose-200 dark:hover:bg-rose-950/50"
                  >
                    Retry search
                  </button>
                </div>
              ) : comparisonSearchResults.length === 0 ? (
                <p className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                  No different Indian cities found. Try another city or
                  district name.
                </p>
              ) : (
                <ul
                  role="listbox"
                  aria-label="Matching comparison cities"
                  className="max-h-80 overflow-y-auto"
                >
                  {comparisonSearchResults.map((location) => (
                    <li key={location.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={comparisonLocation?.id === location.id}
                        onClick={() => selectComparisonLocation(location)}
                        className="w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-emerald-50 focus-visible:bg-emerald-50 focus-visible:outline-none dark:border-slate-800 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
                      >
                        <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {location.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          {getLocationSubtitle(location)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!isLocationReady ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-5 flex min-h-24 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200"
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700 dark:border-sky-800 dark:border-t-sky-300"
              />
              Restoring the primary city from shared location state...
            </div>
          ) : !selectedLocation ? (
            <div
              role="status"
              className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200"
            >
              Select a city in the dashboard location search to use it as the
              first comparison city.
            </div>
          ) : isAQILoading ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-5 flex min-h-24 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200"
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700 dark:border-sky-800 dark:border-t-sky-300"
              />
              Loading current AQI for {selectedLocation.name}...
            </div>
          ) : !comparisonLocation ? (
            <div
              role="status"
              className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
            >
              Search for and select a second city to compare current AQI
              readings.
            </div>
          ) : selectedLocation.id === comparisonLocation.id ? (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
            >
              Choose a city different from the selected city.
            </div>
          ) : !primaryReading ? (
            <div
              role="status"
              className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <p>{primaryUnavailableMessage}</p>
              {currentAQI?.isDemo && (
                <p className="mt-1 text-xs font-semibold">
                  DEMO DATA is not used for city comparisons.
                </p>
              )}
              <button
                type="button"
                onClick={() => void refreshAQI()}
                className="mt-3 min-h-10 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950"
              >
                Retry selected-city AQI
              </button>
            </div>
          ) : comparisonPending ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-5 flex min-h-24 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200"
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700 dark:border-sky-800 dark:border-t-sky-300"
              />
              Loading current AQI for {comparisonLocation.name}...
            </div>
          ) : currentComparisonError ? (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
            >
              <p>{currentComparisonError}</p>
              <button
                type="button"
                onClick={retryComparison}
                className="mt-3 min-h-10 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-900 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-rose-950"
              >
                Retry comparison
              </button>
            </div>
          ) : currentComparisonResult ? (
            <div className="mt-5">
              <div
                role="group"
                aria-label="Current AQI comparison; lower AQI indicates better air quality"
                className="grid gap-3 md:grid-cols-2"
              >
                {comparisonCards.map((city) => {
                  const category = getAirQualityStatus(city.reading.aqi);

                  return (
                    <article
                      key={city.key}
                      className={`rounded-2xl border p-4 transition-colors sm:p-5 ${
                        city.isBetter
                          ? "border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:ring-emerald-900/50"
                          : "border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            {city.label}
                          </p>
                          <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">
                            {city.location.name}
                          </h3>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {getLocationSubtitle(city.location)}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                            Timezone · {city.location.timezone}
                          </p>
                        </div>
                        {city.isBetter && (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                            Cleaner air
                          </span>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Current AQI
                          </p>
                          <p className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
                            {city.reading.aqi}
                          </p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${airQualityStyles[category].badge}`}
                        >
                          <span
                            aria-hidden="true"
                            className={`size-1.5 rounded-full ${airQualityStyles[category].dot}`}
                          />
                          {category}
                        </span>
                      </div>

                      <div
                        role="meter"
                        aria-label={`${city.location.name} AQI`}
                        aria-valuemin={0}
                        aria-valuemax={500}
                        aria-valuenow={city.reading.aqi}
                        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                      >
                        <span
                          aria-hidden="true"
                          className="block h-full rounded-full bg-emerald-600 transition-[width]"
                          style={{
                            width: `${Math.min((city.reading.aqi / 500) * 100, 100)}%`,
                          }}
                        />
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                        <div>
                          <dt className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            PM2.5
                          </dt>
                          <dd className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100">
                            {getPollutantValue(city.reading, "PM2.5")}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                            PM10
                          </dt>
                          <dd className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100">
                            {getPollutantValue(city.reading, "PM10")}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                        {city.reading.dataSource}
                      </p>
                    </article>
                  );
                })}
              </div>

              <p
                role="status"
                aria-live="polite"
                className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100"
              >
                {comparisonWinner === "tie"
                  ? "Both cities currently have the same AQI."
                  : `${comparisonWinner === "primary" ? selectedLocation.name : comparisonLocation.name} currently has cleaner air based on its lower AQI.`}
              </p>
              <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                AQI bars use a 0–500 scale. Lower AQI indicates better air
                quality. Readings are model-based and not verified
                ground-station measurements.
              </p>
            </div>
          ) : (
            <div
              role="status"
              className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200"
            >
              Preparing current AQI readings for comparison...
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
