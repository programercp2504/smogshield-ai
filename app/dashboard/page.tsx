"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  isAQIReading,
  getForecastTimestampValue,
  isIndianLocationResult,
  isValidAQIValue,
  isValidConcentration,
  useAQIData,
} from "../providers/aqi-data-provider";
import type { IndianLocationResult } from "@/lib/geocoding";
import type { AQIForecastPoint } from "@/lib/aqi-api";
import {
  getAirQualityStatus,
  getHealthRecommendation,
  type AirQualityStatus,
  type AQIReading,
  type PollutantName,
  type PollutantReading,
} from "@/lib/aqi";

type DailyActionCategory =
  | "Outdoor Activities"
  | "Mask & Outdoor Protection"
  | "Indoor Air Protection"
  | "Sensitive Groups"
  | "Today's Priority Actions";

interface DailyAction {
  category: DailyActionCategory;
  detail: string;
  mark: string;
  tone: string;
}

const dailyActionStyles: Record<
  DailyActionCategory,
  Pick<DailyAction, "mark" | "tone">
> = {
  "Outdoor Activities": {
    mark: "↗",
    tone: "bg-emerald-50 text-emerald-700",
  },
  "Mask & Outdoor Protection": {
    mark: "◌",
    tone: "bg-sky-50 text-sky-700",
  },
  "Indoor Air Protection": {
    mark: "⌂",
    tone: "bg-cyan-50 text-cyan-700",
  },
  "Sensitive Groups": {
    mark: "♡",
    tone: "bg-amber-50 text-amber-700",
  },
  "Today's Priority Actions": {
    mark: "✓",
    tone: "bg-violet-50 text-violet-700",
  },
};

const dailyActionCategories = Object.keys(dailyActionStyles) as DailyActionCategory[];

const dailyActionGuidance: Record<
  AirQualityStatus,
  Record<DailyActionCategory, string>
> = {
  Good: {
    "Outdoor Activities":
      "Usual outdoor plans are generally reasonable for this AQI category. Recheck local advisories if conditions change.",
    "Mask & Outdoor Protection":
      "This AQI alone does not call for specific mask use. Follow any local public-health or workplace guidance.",
    "Indoor Air Protection":
      "Ventilate as convenient while outdoor conditions remain favorable, and maintain indoor filters as usual.",
    "Sensitive Groups":
      "Sensitive individuals can follow their usual routines and personal care guidance.",
    "Today's Priority Actions":
      "Use the favorable AQI window for planned outdoor activity and check conditions again before heading out.",
  },
  Moderate: {
    "Outdoor Activities":
      "Routine outdoor plans are generally reasonable. If you are unusually sensitive, consider lighter or shorter exertion.",
    "Mask & Outdoor Protection":
      "No specific mask action is indicated by this category alone; follow local advice if you have concerns.",
    "Indoor Air Protection":
      "Ventilate when outdoor air is acceptable and close windows if local conditions worsen.",
    "Sensitive Groups":
      "Unusually sensitive people may choose to reduce prolonged or heavy outdoor exertion.",
    "Today's Priority Actions":
      "Consider a lighter outdoor session if sensitive, and check local air-quality updates later today.",
  },
  "Unhealthy for Sensitive Groups": {
    "Outdoor Activities":
      "Most people may continue outdoor activities; sensitive groups should reduce prolonged or heavy exertion.",
    "Mask & Outdoor Protection":
      "If outdoor exposure is unavoidable, sensitive individuals may consider a well-fitting particulate respirator. Fit matters, and it does not remove all pollutants.",
    "Indoor Air Protection":
      "Limit outdoor air entering during elevated readings; use a properly sized air cleaner if available.",
    "Sensitive Groups":
      "Children, older adults, and people with heart or lung conditions should reduce prolonged or heavy outdoor exertion.",
    "Today's Priority Actions":
      "Reschedule strenuous outdoor plans for sensitive groups and follow local public-health guidance.",
  },
  Unhealthy: {
    "Outdoor Activities":
      "Reduce prolonged or heavy outdoor exertion. Move strenuous activity indoors or postpone it when practical.",
    "Mask & Outdoor Protection":
      "If going outside is unavoidable, a well-fitting particulate respirator may reduce particle inhalation, but it does not eliminate exposure. Follow local advice.",
    "Indoor Air Protection":
      "Keep windows closed during elevated outdoor pollution when practical; use a properly sized air cleaner if available.",
    "Sensitive Groups":
      "Sensitive groups should avoid prolonged or heavy outdoor exertion and follow personal health guidance.",
    "Today's Priority Actions":
      "Reduce or move strenuous outdoor activity indoors, and check local public-health advisories before heading out.",
  },
  "Very Unhealthy": {
    "Outdoor Activities":
      "Avoid strenuous outdoor exercise and keep outdoor time brief and necessary where possible.",
    "Mask & Outdoor Protection":
      "If essential outdoor exposure cannot be avoided, follow public-health advice. A well-fitting particulate respirator may reduce particle exposure but is not complete protection.",
    "Indoor Air Protection":
      "Keep windows closed when outdoor pollution is high, use filtration if available, and avoid adding indoor smoke.",
    "Sensitive Groups":
      "Sensitive groups should avoid outdoor exertion where possible and follow local advisories and personal care guidance.",
    "Today's Priority Actions":
      "Move or cancel outdoor exercise and check local public-health notices before going outside.",
  },
  Hazardous: {
    "Outdoor Activities":
      "Avoid outdoor exertion and minimize non-essential time outside. Follow local public-health guidance.",
    "Mask & Outdoor Protection":
      "If you must go outside, follow public-health recommendations for protective equipment. A particulate respirator cannot eliminate exposure to all pollutants.",
    "Indoor Air Protection":
      "Stay indoors where feasible, close windows and doors, use a properly sized air cleaner if available, and avoid indoor particle sources.",
    "Sensitive Groups":
      "Sensitive groups should remain indoors where feasible and follow local public-health and personal care guidance.",
    "Today's Priority Actions":
      "Avoid outdoor exertion, postpone non-essential outdoor plans, and follow local public-health guidance.",
  },
};

function getDailyActions(reading: AQIReading): DailyAction[] {
  return dailyActionCategories.map((category) => ({
    category,
    detail: dailyActionGuidance[reading.category][category],
    ...dailyActionStyles[category],
  }));
}

const FORECAST_CHART_SIZE = {
  width: 720,
  height: 250,
  left: 48,
  right: 16,
  top: 18,
  bottom: 34,
};

interface CityComparisonResult {
  primaryLocationId: number;
  comparisonLocationId: number;
  reading: AQIReading;
}

const airQualityStyles: Record<AirQualityStatus, { badge: string; dot: string }> = {
  Good: { badge: "bg-emerald-100/80 text-emerald-800", dot: "bg-emerald-500" },
  Moderate: { badge: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  "Unhealthy for Sensitive Groups": {
    badge: "bg-orange-100 text-orange-800",
    dot: "bg-orange-500",
  },
  Unhealthy: { badge: "bg-rose-100 text-rose-800", dot: "bg-rose-500" },
  "Very Unhealthy": { badge: "bg-red-100 text-red-800", dot: "bg-red-500" },
  Hazardous: { badge: "bg-fuchsia-100 text-fuchsia-800", dot: "bg-fuchsia-600" },
};

const airQualitySummaries: Record<AirQualityStatus, string> = {
  Good: "A breath of fresh air",
  Moderate: "Air quality is moderate",
  "Unhealthy for Sensitive Groups": "Sensitive groups should take care",
  Unhealthy: "Consider limiting outdoor exertion",
  "Very Unhealthy": "Reduce prolonged outdoor activity",
  Hazardous: "Avoid outdoor exertion",
};

type AQIHealthAlertSeverity = "normal" | "warning" | "critical";

interface AQIHealthAlertRecommendation {
  audience: string;
  guidance: string;
}

interface AQIHealthAlertPresentation {
  label: string;
  title: string;
  panel: string;
  badge: string;
  recommendations: AQIHealthAlertRecommendation[];
}

const healthAlertSeverityByStatus: Record<
  AirQualityStatus,
  AQIHealthAlertSeverity
> = {
  Good: "normal",
  Moderate: "warning",
  "Unhealthy for Sensitive Groups": "warning",
  Unhealthy: "critical",
  "Very Unhealthy": "critical",
  Hazardous: "critical",
};

const healthAlertPresentation: Record<
  AQIHealthAlertSeverity,
  AQIHealthAlertPresentation
> = {
  normal: {
    label: "Normal",
    title: "Air quality is good",
    panel: "border-emerald-100 bg-emerald-50/70",
    badge: "bg-emerald-100 text-emerald-800",
    recommendations: [
      {
        audience: "Children and older adults",
        guidance:
          "Usual outdoor activities are generally reasonable. Recheck local conditions before longer outings if air quality changes.",
      },
      {
        audience: "Asthma and respiratory sensitivities",
        guidance:
          "Follow your usual care plan and reduce exertion if symptoms occur.",
      },
      {
        audience: "General population",
        guidance:
          "Continue routine activities and ventilate normally while outdoor air remains good.",
      },
    ],
  },
  warning: {
    label: "Warning",
    title: "Take care during outdoor activity",
    panel: "border-amber-200 bg-amber-50/70",
    badge: "bg-amber-100 text-amber-900",
    recommendations: [
      {
        audience: "Children and older adults",
        guidance:
          "Consider shorter or lighter outdoor activity, especially when air quality is unhealthy for sensitive groups.",
      },
      {
        audience: "Asthma and respiratory sensitivities",
        guidance:
          "Limit prolonged or heavy outdoor exertion and follow your usual respiratory care plan.",
      },
      {
        audience: "General population",
        guidance:
          "Most people can continue routine plans. Sensitive people should limit prolonged exertion; close windows if outdoor readings worsen and ventilate when air improves.",
      },
    ],
  },
  critical: {
    label: "Critical",
    title: "High pollution health alert",
    panel: "border-rose-200 bg-rose-50/70",
    badge: "bg-rose-100 text-rose-900",
    recommendations: [
      {
        audience: "Children and older adults",
        guidance:
          "Avoid prolonged or strenuous outdoor activity. Stay indoors when practical and follow local health advisories.",
      },
      {
        audience: "Asthma and respiratory sensitivities",
        guidance:
          "Avoid outdoor exertion, follow your personal care plan, and use cleaner indoor air if available.",
      },
      {
        audience: "General population",
        guidance:
          "Reschedule strenuous outdoor activity, keep windows closed while pollution is high, and use filtration if available. If going out is essential, follow local advice; a well-fitted particulate respirator may reduce particle exposure but does not protect against every pollutant.",
      },
    ],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatForecastDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate);
}

interface DailyAQIForecastSummary {
  date: string;
  points: AQIForecastPoint[];
  averageAQI: number;
  maximumAQI: number;
}

type AQIForecastTrend = "improving" | "worsening" | "stable";

interface AQIForecastInsights {
  trend: AQIForecastTrend | null;
  changeFromFirstToLast: number | null;
  cleanestDay: DailyAQIForecastSummary;
  mostPollutedDay: DailyAQIForecastSummary;
  highestPoint: AQIForecastPoint;
  cleanestCategory: AirQualityStatus;
  mostPollutedCategory: AirQualityStatus;
  highestCategory: AirQualityStatus;
}

const AQI_TREND_STABILITY_THRESHOLD = 5;

function getDailyAQIForecastSummaries(
  points: AQIForecastPoint[],
): DailyAQIForecastSummary[] {
  const pointsByDate = new Map<string, AQIForecastPoint[]>();

  for (const point of points) {
    if (
      getForecastTimestampValue(point.time) === null ||
      !isValidAQIValue(point.aqi)
    ) {
      continue;
    }

    const date = point.time.slice(0, 10);
    const dayPoints = pointsByDate.get(date) ?? [];
    dayPoints.push(point);
    pointsByDate.set(date, dayPoints);
  }

  return [...pointsByDate.entries()]
    .map(([date, dayPoints]) => {
      const chronologicalPoints = [...dayPoints].sort(
        (first, second) => first.time.localeCompare(second.time),
      );
      const aqiValues = chronologicalPoints.map((point) => point.aqi);

      return {
        date,
        points: chronologicalPoints,
        averageAQI:
          aqiValues.reduce((total, value) => total + value, 0) / aqiValues.length,
        maximumAQI: aqiValues.reduce(
          (maximum, value) => Math.max(maximum, value),
          0,
        ),
      };
    })
    .sort((first, second) => first.date.localeCompare(second.date));
}

function getAQIForecastInsights(
  dailySummaries: DailyAQIForecastSummary[],
): AQIForecastInsights | null {
  const validDays = dailySummaries.filter(
    (day) =>
      isValidAQIValue(day.averageAQI) &&
      day.points.some(
        (point) =>
          getForecastTimestampValue(point.time) !== null &&
          isValidAQIValue(point.aqi),
      ),
  );
  const validPoints = validDays
    .flatMap((day) => day.points)
    .filter(
      (point) =>
        getForecastTimestampValue(point.time) !== null &&
        isValidAQIValue(point.aqi),
    );

  if (validDays.length === 0 || validPoints.length === 0) {
    return null;
  }

  const cleanestDay = validDays.reduce((cleanest, day) =>
    day.averageAQI < cleanest.averageAQI ? day : cleanest,
  );
  const mostPollutedDay = validDays.reduce((mostPolluted, day) =>
    day.averageAQI > mostPolluted.averageAQI ? day : mostPolluted,
  );
  const highestPoint = validPoints.reduce((highest, point) =>
    point.aqi > highest.aqi ? point : highest,
  );

  if (validDays.length < 2) {
    return {
      trend: null,
      changeFromFirstToLast: null,
      cleanestDay,
      mostPollutedDay,
      highestPoint,
      cleanestCategory: getAirQualityStatus(cleanestDay.averageAQI),
      mostPollutedCategory: getAirQualityStatus(mostPollutedDay.averageAQI),
      highestCategory: getAirQualityStatus(highestPoint.aqi),
    };
  }

  const changeFromFirstToLast =
    validDays[validDays.length - 1].averageAQI - validDays[0].averageAQI;
  const trend =
    Math.abs(changeFromFirstToLast) <= AQI_TREND_STABILITY_THRESHOLD
      ? "stable"
      : changeFromFirstToLast < 0
        ? "improving"
        : "worsening";

  return {
    trend,
    changeFromFirstToLast,
    cleanestDay,
    mostPollutedDay,
    highestPoint,
    cleanestCategory: getAirQualityStatus(cleanestDay.averageAQI),
    mostPollutedCategory: getAirQualityStatus(mostPollutedDay.averageAQI),
    highestCategory: getAirQualityStatus(highestPoint.aqi),
  };
}

function getAQIForecastRecommendation(insights: AQIForecastInsights): string {
  const cleanestDate = formatForecastDate(insights.cleanestDay.date);
  const peakDateTime = `${formatForecastDate(
    insights.highestPoint.time.slice(0, 10),
  )} at ${insights.highestPoint.time.slice(11, 16)}`;

  if (
    insights.highestCategory === "Unhealthy" ||
    insights.highestCategory === "Very Unhealthy" ||
    insights.highestCategory === "Hazardous"
  ) {
    return `Prefer ${cleanestDate} for outdoor plans where possible. The forecast peaks at AQI ${insights.highestPoint.aqi} on ${peakDateTime}; limit prolonged or heavy outdoor exertion around then, especially for sensitive groups.`;
  }

  if (insights.highestCategory === "Unhealthy for Sensitive Groups") {
    return `Consider ${cleanestDate} for outdoor plans. At the forecast peak of AQI ${insights.highestPoint.aqi} on ${peakDateTime}, children, older adults, and people with respiratory sensitivities should reduce prolonged outdoor exertion.`;
  }

  if (insights.highestCategory === "Moderate") {
    return `Consider ${cleanestDate} for longer outdoor activities, especially if you are sensitive to air pollution. Recheck local conditions before heading out.`;
  }

  if (insights.trend === "worsening") {
    return `Forecast AQI is trending upward. Consider ${cleanestDate} for longer outdoor activities and recheck local conditions before making plans.`;
  }

  return "Forecast AQI remains in the Good category. Usual outdoor activities are generally reasonable; recheck local conditions before longer outings.";
}

interface AQIForecastChartPoint {
  point: AQIForecastPoint;
  x: number;
  y: number;
}

interface AQIForecastChart {
  points: AQIForecastChartPoint[];
  minAQI: number;
  maxAQI: number;
}

function getAQIForecastChart(points: AQIForecastPoint[]): AQIForecastChart {
  if (points.length === 0) {
    return { points: [], minAQI: 0, maxAQI: 100 };
  }

  const times = points.map((point) => getForecastTimestampValue(point.time));
  const validTimes = times.filter((time): time is number => time !== null);
  const aqiValues = points.map((point) => point.aqi);
  const minimum = Math.min(...aqiValues);
  const maximum = Math.max(...aqiValues);
  const padding = Math.max((maximum - minimum) * 0.15, 5);
  const minAQI = Math.max(0, Math.floor(minimum - padding));
  const maxAQI = Math.min(500, Math.ceil(maximum + padding));

  if (validTimes.length !== points.length) {
    return { points: [], minAQI, maxAQI };
  }

  const minTime = Math.min(...validTimes);
  const maxTime = Math.max(...validTimes);
  const plotWidth =
    FORECAST_CHART_SIZE.width - FORECAST_CHART_SIZE.left - FORECAST_CHART_SIZE.right;
  const plotHeight =
    FORECAST_CHART_SIZE.height - FORECAST_CHART_SIZE.top - FORECAST_CHART_SIZE.bottom;
  const aqiRange = Math.max(maxAQI - minAQI, 1);
  const timeRange = maxTime - minTime;

  return {
    minAQI,
    maxAQI,
    points: points.map((point, index) => ({
      point,
      x:
        FORECAST_CHART_SIZE.left +
        (timeRange === 0
          ? plotWidth / 2
          : ((validTimes[index] - minTime) / timeRange) * plotWidth),
      y:
        FORECAST_CHART_SIZE.top +
        ((maxAQI - point.aqi) / aqiRange) * plotHeight,
    })),
  };
}

function isGeocodingResponse(value: unknown): value is {
  results: IndianLocationResult[];
} {
  return (
    isRecord(value) &&
    Array.isArray(value.results) &&
    value.results.length <= 10 &&
    value.results.every(isIndianLocationResult)
  );
}

function getPollutant(reading: AQIReading, pollutant: PollutantName) {
  return reading.pollutants.find((item) => item.pollutant === pollutant);
}

function formatPollutant(reading: PollutantReading | undefined): string {
  return reading ? `${reading.value} ${reading.unit}` : "Unavailable";
}

function getPollutantBarWidth(reading: PollutantReading | undefined): string {
  return `${Math.min(reading?.value ?? 0, 100)}%`;
}

function getPollutantBarScaleLabel(reading: PollutantReading | undefined): string {
  return reading && reading.value > 100
    ? "Normalized scale · capped above 100 µg/m³"
    : "Normalized scale · max 100 µg/m³";
}

function formatLastUpdated(timestamp: string): string {
  const timestampWithOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp)
    ? timestamp
    : `${timestamp}+05:30`;
  const date = new Date(timestampWithOffset);

  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);

  return `${formattedDate} IST`;
}

function getLocalGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Hello";
}

function formatDashboardDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export default function Home() {
  const {
    selectedLocation,
    currentAQI: reading,
    isAQILoading: isLoading,
    aqiError: loadError,
    forecast,
    isForecastLoading,
    forecastError,
    isLocationReady: isForecastLocationReady,
    locationPersistenceError,
    selectLocation: selectPrimaryLocation,
    refreshForecast,
  } = useAQIData();
  const [expandedForecastDays, setExpandedForecastDays] = useState<string[]>([]);
  const [greeting, setGreeting] = useState("Hello");
  const [dashboardDate, setDashboardDate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<IndianLocationResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [comparisonQuery, setComparisonQuery] = useState("");
  const [comparisonSearchResults, setComparisonSearchResults] = useState<
    IndianLocationResult[]
  >([]);
  const [isComparisonSearching, setIsComparisonSearching] = useState(false);
  const [comparisonSearchError, setComparisonSearchError] = useState<string | null>(
    null,
  );
  const [showComparisonSearchResults, setShowComparisonSearchResults] =
    useState(false);
  const [comparisonLocation, setComparisonLocation] =
    useState<IndianLocationResult | null>(null);
  const [comparisonResult, setComparisonResult] =
    useState<CityComparisonResult | null>(null);
  const [isComparisonLoading, setIsComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const comparisonSearchControllerRef = useRef<AbortController | null>(null);
  const comparisonAQIControllerRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  const comparisonSearchRequestIdRef = useRef(0);
  const comparisonAQIRequestIdRef = useRef(0);
  const searchInProgressRef = useRef(false);
  const comparisonSearchInProgressRef = useRef(false);

  function handleSearchQueryChange(value: string) {
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    searchRequestIdRef.current += 1;
    searchInProgressRef.current = false;
    setIsSearching(false);
    setSearchQuery(value);
    setSearchResults([]);
    setSearchError(null);
    setShowSearchResults(false);
  }

  async function searchLocations() {
    const query = searchQuery.trim();
    if (searchInProgressRef.current || query.length < 2 || query.length > 100) {
      return;
    }

    searchInProgressRef.current = true;
    const requestId = ++searchRequestIdRef.current;
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setShowSearchResults(false);

    try {
      const params = new URLSearchParams({ q: query });
      const response = await fetch(`/api/geocode?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error("Location search request failed.");
      }

      const payload: unknown = await response.json();
      if (!isGeocodingResponse(payload)) {
        throw new Error("Location search returned invalid results.");
      }

      if (requestId === searchRequestIdRef.current && !controller.signal.aborted) {
        setSearchResults(payload.results.slice(0, 10));
        setShowSearchResults(true);
      }
    } catch {
      if (requestId === searchRequestIdRef.current && !controller.signal.aborted) {
        setSearchError("Could not search locations right now. Please try again.");
        setShowSearchResults(true);
      }
    } finally {
      if (requestId === searchRequestIdRef.current && !controller.signal.aborted) {
        searchInProgressRef.current = false;
        searchControllerRef.current = null;
        setIsSearching(false);
      }
    }
  }

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

      if (requestId === comparisonSearchRequestIdRef.current && !controller.signal.aborted) {
        const results = payload.results
          .filter((location) => location.id !== selectedLocation?.id)
          .slice(0, 10);
        setComparisonSearchResults(results);
        setShowComparisonSearchResults(true);
      }
    } catch {
      if (requestId === comparisonSearchRequestIdRef.current && !controller.signal.aborted) {
        setComparisonSearchError(
          "Could not search comparison cities right now. Please try again.",
        );
        setShowComparisonSearchResults(true);
      }
    } finally {
      if (requestId === comparisonSearchRequestIdRef.current && !controller.signal.aborted) {
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
    setIsComparisonLoading(
      Boolean(selectedLocation && selectedLocation.id !== location.id),
    );
    setComparisonLocation(location);
    setComparisonQuery(location.name);
    setComparisonSearchResults([]);
    setComparisonSearchError(null);
    setShowComparisonSearchResults(false);
    setComparisonResult(null);
    setComparisonError(null);
  }

  async function selectLocation(location: IndianLocationResult) {
    const primaryLocationChanged = selectedLocation?.id !== location.id;
    if (primaryLocationChanged) {
      comparisonSearchControllerRef.current?.abort();
      comparisonSearchControllerRef.current = null;
      comparisonSearchRequestIdRef.current += 1;
      comparisonSearchInProgressRef.current = false;
      comparisonAQIControllerRef.current?.abort();
      comparisonAQIControllerRef.current = null;
      comparisonAQIRequestIdRef.current += 1;
    }
    setSearchResults([]);
    setShowSearchResults(false);
    setSearchError(null);
    if (primaryLocationChanged) {
      setIsComparisonSearching(false);
      setComparisonSearchResults([]);
      setComparisonSearchError(null);
      setShowComparisonSearchResults(false);
      setComparisonResult(null);
      setIsComparisonLoading(
        Boolean(comparisonLocation && comparisonLocation.id !== location.id),
      );
      setComparisonError(null);
    }
    setExpandedForecastDays([]);
    await selectPrimaryLocation(location);
  }

  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setGreeting(getLocalGreeting(now.getHours()));
      setDashboardDate(formatDashboardDate(now));
    }

    updateClock();
    const clockInterval = window.setInterval(updateClock, 60_000);

    return () => window.clearInterval(clockInterval);
  }, []);

  useEffect(
    () => () => {
      searchControllerRef.current?.abort();
      searchControllerRef.current = null;
      searchRequestIdRef.current += 1;
      searchInProgressRef.current = false;
      comparisonSearchControllerRef.current?.abort();
      comparisonSearchControllerRef.current = null;
      comparisonSearchRequestIdRef.current += 1;
      comparisonSearchInProgressRef.current = false;
      comparisonAQIControllerRef.current?.abort();
      comparisonAQIControllerRef.current = null;
      comparisonAQIRequestIdRef.current += 1;
    },
    [],
  );

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
          payload.city !== comparison.name ||
          payload.isDemo
        ) {
          throw new Error("Comparison city AQI response was invalid.");
        }

        if (requestId === comparisonAQIRequestIdRef.current && !controller.signal.aborted) {
          setComparisonResult({
            primaryLocationId: primary.id,
            comparisonLocationId: comparison.id,
            reading: payload,
          });
          setComparisonError(null);
        }
      } catch {
        if (requestId === comparisonAQIRequestIdRef.current && !controller.signal.aborted) {
          setComparisonResult(null);
          setComparisonError(
            `Could not load a valid, location-matched, non-demo model-based AQI reading for ${comparison.name}. Please try again.`,
          );
        }
      } finally {
        if (requestId === comparisonAQIRequestIdRef.current && !controller.signal.aborted) {
          comparisonAQIControllerRef.current = null;
          setIsComparisonLoading(false);
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
  }, [selectedLocation, comparisonLocation]);

  const pm25Reading = reading ? getPollutant(reading, "PM2.5") : undefined;
  const pm10Reading = reading ? getPollutant(reading, "PM10") : undefined;
  const no2Reading = reading ? getPollutant(reading, "NO2") : undefined;
  const ozoneReading = reading ? getPollutant(reading, "O3") : undefined;
  const coReading = reading ? getPollutant(reading, "CO") : undefined;
  const so2Reading = reading ? getPollutant(reading, "SO2") : undefined;
  const displayedLocation =
    selectedLocation
      ? [
          selectedLocation.name,
          selectedLocation.admin2,
          selectedLocation.admin1,
          selectedLocation.country,
        ]
          .filter(Boolean)
          .join(", ")
      : reading
        ? [reading.city, reading.region, reading.country].filter(Boolean).join(", ")
        : isForecastLocationReady
          ? "Kolkata"
          : "Restoring selected location";
  const dataLabel = isLoading
    ? selectedLocation
      ? "Loading selected location"
      : reading
        ? "Loading · demo data shown"
        : "Loading air quality"
    : !reading
      ? "AQI unavailable"
      : reading.isDemo
      ? loadError
        ? "DEMO DATA · API unavailable"
        : "DEMO DATA"
      : "Model-based data · Open-Meteo";
  const dailyActions = reading ? getDailyActions(reading) : null;
  const healthAlertReading =
    reading &&
    isAQIReading(reading) &&
    !reading.isDemo &&
    (!selectedLocation || reading.city === selectedLocation.name)
      ? reading
      : null;
  const healthAlertStatus = healthAlertReading
    ? getAirQualityStatus(healthAlertReading.aqi)
    : null;
  const healthAlertSeverity = healthAlertStatus
    ? healthAlertSeverityByStatus[healthAlertStatus]
    : null;
  const healthAlertUnavailableMessage =
    loadError ??
    (reading?.isDemo
      ? "Only sample/demo AQI data is available. It is not used to generate health alerts."
      : selectedLocation
        ? `A valid, location-matched, non-demo model-based AQI reading for ${selectedLocation.name} is unavailable.`
        : "A valid, non-demo model-based AQI reading is unavailable.");
  const comparisonPrimaryReading =
    !isLoading &&
    selectedLocation &&
    reading &&
    isAQIReading(reading) &&
    !reading.isDemo &&
    reading.city === selectedLocation.name
      ? reading
      : null;
  const currentComparisonResult =
    selectedLocation &&
    comparisonLocation &&
    comparisonResult &&
    comparisonResult.primaryLocationId === selectedLocation.id &&
    comparisonResult.comparisonLocationId === comparisonLocation.id
      ? comparisonResult
      : null;
  const comparisonPending = Boolean(
    selectedLocation &&
      comparisonLocation &&
      selectedLocation.id !== comparisonLocation.id &&
      !currentComparisonResult &&
      !comparisonError,
  );
  const comparisonWinner =
    comparisonPrimaryReading && currentComparisonResult
      ? comparisonPrimaryReading.aqi < currentComparisonResult.reading.aqi
        ? "primary"
        : comparisonPrimaryReading.aqi > currentComparisonResult.reading.aqi
          ? "comparison"
          : "tie"
      : null;
  const forecastLocationName =
    selectedLocation?.name.trim() ?? (isForecastLocationReady ? "Kolkata" : null);
  const forecastTimezone =
    selectedLocation?.timezone.trim() ?? (isForecastLocationReady ? "Asia/Kolkata" : null);
  const currentForecast =
    forecastLocationName !== null &&
    forecastTimezone !== null &&
    forecast?.locationName === forecastLocationName &&
    forecast.timezone === forecastTimezone
      ? forecast
      : null;
  const dailyForecastSummaries = currentForecast
    ? getDailyAQIForecastSummaries(currentForecast.points)
    : [];
  const forecastInsights = currentForecast
    ? getAQIForecastInsights(dailyForecastSummaries)
    : null;
  const forecastChart = currentForecast
    ? getAQIForecastChart(currentForecast.points)
    : null;
  const forecastChartPath = forecastChart
    ? forecastChart.points
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
        )
        .join(" ")
    : "";
  const chartPlotHeight =
    FORECAST_CHART_SIZE.height - FORECAST_CHART_SIZE.top - FORECAST_CHART_SIZE.bottom;
  const forecastChartTicks = forecastChart
    ? [0, 1, 2].map((index) => ({
        value: Math.round(
          forecastChart.maxAQI -
            ((forecastChart.maxAQI - forecastChart.minAQI) * index) / 2,
        ),
        y: FORECAST_CHART_SIZE.top + (chartPlotHeight * index) / 2,
      }))
    : [];
  const forecastDateTickIndexes = currentForecast
    ? [
        ...new Set([
          0,
          Math.floor((currentForecast.points.length - 1) / 2),
          currentForecast.points.length - 1,
        ]),
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#f7faf8] text-slate-800">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <main id="dashboard" className="min-w-0 flex-1">
          <header className="border-b border-slate-100 bg-white/90 px-4 py-4 sm:px-7 lg:px-10">
            <div className="flex items-center justify-between gap-4">
              <div className="hidden text-sm font-semibold text-slate-500 lg:block">
                Your personal air quality dashboard
              </div>
              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm sm:px-3.5">
                  <span className="text-emerald-600" aria-hidden="true">⌖</span>
                  <span className="sr-only">Current location</span>
                  <span className="max-w-[120px] truncate sm:max-w-none">
                    {selectedLocation?.name ??
                      (isForecastLocationReady
                        ? reading?.city ?? "Kolkata"
                        : "Restoring location...")}
                  </span>
                </label>
                <button
                  type="button"
                  aria-label="Notifications"
                  className="relative flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-base text-slate-500 shadow-sm"
                >
                  ♧
                  <span className="absolute right-2 top-2 size-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
                </button>
                <span className="hidden size-10 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800 sm:flex lg:hidden">
                  SS
                </span>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1320px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10 lg:py-10">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="mb-2 text-xs font-semibold text-slate-400">
                  {dashboardDate && (
                    <>
                      {dashboardDate} <span className="mx-1.5">·</span>
                    </>
                  )}
                  {displayedLocation}
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[30px]">
                  {greeting}
                </h1>
                <p className="mt-1.5 text-sm text-slate-500">
                  Here&apos;s your air quality outlook for today.
                </p>
                {loadError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-amber-700">
                    {loadError}
                  </p>
                )}
              </div>
              <span
                aria-live="polite"
                className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-emerald-100 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 shadow-sm"
              >
                <span
                  className={`size-1.5 rounded-full ${
                    isLoading
                      ? "bg-sky-500"
                      : reading?.isDemo
                        ? "bg-slate-400"
                        : reading
                          ? "bg-emerald-500"
                          : "bg-rose-500"
                  }`}
                />
                <span>{dataLabel}</span>
                {reading && (
                  <span className="font-medium text-slate-400">
                    {reading.isDemo ? "Sample timestamp" : "Last updated"} ·{" "}
                    {formatLastUpdated(reading.lastUpdated)}
                  </span>
                )}
              </span>
            </div>

            <section
              aria-label="Search for an Indian location"
              className="relative z-10 mb-7 rounded-[24px] border border-emerald-100 bg-white p-4 shadow-[0_8px_30px_rgba(27,75,54,0.05)] sm:p-5"
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void searchLocations();
                }}
              >
                <label
                  htmlFor="location-search"
                  className="mb-2 block text-sm font-bold text-slate-800"
                >
                  Find air quality near you
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="location-search"
                    type="search"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={showSearchResults}
                    aria-controls="location-search-results"
                    aria-describedby="location-search-help"
                    value={searchQuery}
                    onChange={(event) => handleSearchQueryChange(event.target.value)}
                    placeholder="Search any city or district in India..."
                    maxLength={100}
                    className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50"
                  />
                  <button
                    type="submit"
                    disabled={isSearching || searchQuery.trim().length < 2}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSearching && (
                      <span
                        aria-hidden="true"
                        className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                      />
                    )}
                    {isSearching ? "Searching..." : "Search"}
                  </button>
                </div>
                <p id="location-search-help" className="mt-2 text-[11px] text-slate-400">
                  Search for a city, town, or district in India.
                </p>
              </form>

              {showSearchResults && (
                <div
                  id="location-search-results"
                  className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  aria-live="polite"
                >
                  {searchError ? (
                    <p role="alert" className="px-4 py-3 text-sm text-rose-700">
                      {searchError}
                    </p>
                  ) : searchResults.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-500">
                      No matching Indian locations found. Try another city or district name.
                    </p>
                  ) : (
                    <ul
                      role="listbox"
                      aria-label="Matching Indian locations"
                      className="max-h-80 overflow-y-auto"
                    >
                      {searchResults.slice(0, 10).map((location) => (
                        <li key={location.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={false}
                            onClick={() => void selectLocation(location)}
                            className="w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-emerald-50 focus-visible:bg-emerald-50 focus-visible:outline-none"
                          >
                            <span className="block text-sm font-semibold text-slate-800">
                              {location.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {[location.admin1, location.admin2]
                                .filter(Boolean)
                                .join(" · ") || location.country}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {selectedLocation && (
                <div className="mt-3 space-y-1">
                  <p className="text-xs font-medium text-emerald-800">
                    Selected location:{" "}
                    {[selectedLocation.name, selectedLocation.admin2, selectedLocation.admin1]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {locationPersistenceError && (
                    <p role="status" className="text-xs text-amber-700">
                      {locationPersistenceError}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section id="indoor-air" aria-label="Current air quality" className="grid gap-4 xl:grid-cols-12">
              {reading ? (
                <>
              <article className="relative overflow-hidden rounded-[26px] border border-emerald-100 bg-gradient-to-br from-[#eefaf3] via-white to-[#eff7ff] p-5 shadow-[0_8px_30px_rgba(27,75,54,0.05)] sm:p-7 xl:col-span-7">
                <div className="absolute -right-14 -top-20 size-64 rounded-full border-[34px] border-white/40" />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                      Current air quality
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Air Quality Index (US AQI){reading.isDemo ? " · DEMO DATA" : ""}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${airQualityStyles[reading.category].badge}`}
                  >
                    <span className={`size-1.5 rounded-full ${airQualityStyles[reading.category].dot}`} />
                    {reading.category}
                  </span>
                </div>
                <div className="relative mt-5 flex flex-wrap items-end gap-x-5 gap-y-3">
                  <span className="text-[76px] font-semibold leading-[0.9] tracking-[-0.07em] text-slate-900 sm:text-[92px]">
                    {reading.aqi}
                  </span>
                  <div className="pb-1">
                    <p className="text-lg font-bold text-emerald-700">
                      {airQualitySummaries[reading.category]}
                    </p>
                    <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
                      <span className="font-semibold">Health recommendation: </span>
                      {reading.healthRecommendation}
                      {reading.isDemo && " Demo guidance only; check local conditions before acting."}
                    </p>
                  </div>
                </div>
                <div className="relative mt-7">
                  <div className="flex justify-between text-[10px] font-medium text-slate-400">
                    <span>Good</span><span>Moderate</span><span>Unhealthy</span><span>Hazardous</span>
                  </div>
                  <div className="relative mt-2 h-2 overflow-visible rounded-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-rose-400">
                    <span
                      className="absolute -top-1.5 size-5 rounded-full border-[3px] border-white bg-emerald-600 shadow-md"
                      style={{ left: `${Math.min(reading.aqi, 200) / 2}%` }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-[9px] text-slate-400">
                    <span>0</span><span>50</span><span>100</span><span>150</span><span>200+</span>
                  </div>
                </div>
                <div className="relative mt-5 flex items-center gap-2 border-t border-emerald-100/80 pt-4 text-xs text-slate-500">
                  <span className="flex size-6 items-center justify-center rounded-full bg-white text-emerald-600">↗</span>
                  <span>Sample weekly comparison · <strong className="font-bold text-slate-700">68%</strong> (demo only)</span>
                </div>
              </article>

              <div className="grid gap-4 sm:grid-cols-2 xl:col-span-5 xl:grid-cols-1">
                <article className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(27,75,54,0.04)] sm:p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-700">PM2.5</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {reading.isDemo ? "DEMO DATA · " : ""}Fine particles
                      </p>
                    </div>
                    <span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sm font-bold text-sky-600">2.5</span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[32px] font-semibold tracking-tight text-slate-900">{pm25Reading?.value ?? "—"}</span>
                    <span className="text-xs text-slate-400">{pm25Reading?.unit ?? ""}</span>
                    <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      {pm25Reading ? (reading.isDemo ? "Sample" : "Available") : "Unavailable"}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-400"
                      style={{ width: getPollutantBarWidth(pm25Reading) }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {getPollutantBarScaleLabel(pm25Reading)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">NO2</p>
                      <p className="mt-1 text-xs font-bold text-slate-700">{formatPollutant(no2Reading)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">O3</p>
                      <p className="mt-1 text-xs font-bold text-slate-700">{formatPollutant(ozoneReading)}</p>
                    </div>
                  </div>
                </article>

                <article className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(27,75,54,0.04)] sm:p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-700">PM10</p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {reading.isDemo ? "DEMO DATA · " : ""}Coarse particles
                      </p>
                    </div>
                    <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-sm font-bold text-violet-600">10</span>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-[32px] font-semibold tracking-tight text-slate-900">{pm10Reading?.value ?? "—"}</span>
                    <span className="text-xs text-slate-400">{pm10Reading?.unit ?? ""}</span>
                    <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
                      {pm10Reading ? (reading.isDemo ? "Sample" : "Available") : "Unavailable"}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-400"
                      style={{ width: getPollutantBarWidth(pm10Reading) }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">
                    {getPollutantBarScaleLabel(pm10Reading)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">CO</p>
                      <p className="mt-1 text-xs font-bold text-slate-700">{formatPollutant(coReading)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400">SO2</p>
                      <p className="mt-1 text-xs font-bold text-slate-700">{formatPollutant(so2Reading)}</p>
                    </div>
                  </div>
                </article>
              </div>
                </>
              ) : (
                <article
                  role={loadError ? "alert" : "status"}
                  aria-live="polite"
                  className={`rounded-[26px] border p-6 shadow-[0_8px_30px_rgba(27,75,54,0.04)] xl:col-span-12 ${
                    loadError
                      ? "border-rose-100 bg-rose-50/70"
                      : "border-sky-100 bg-sky-50/70"
                  }`}
                >
                  <h2
                    className={`text-sm font-bold ${
                      loadError ? "text-rose-900" : "text-sky-900"
                    }`}
                  >
                    {isLoading
                      ? `Loading air quality for ${selectedLocation?.name ?? "the selected location"}...`
                      : "AQI data unavailable"}
                  </h2>
                  <p
                    className={`mt-1 text-xs leading-5 ${
                      loadError ? "text-rose-800" : "text-sky-800"
                    }`}
                  >
                    {loadError ??
                      "The AQI reading for this location is being retrieved. Dashboard measurements and recommendations will appear when it is available."}
                  </p>
                </article>
              )}
            </section>

            <section
              aria-labelledby="health-alert-heading"
              className="mt-7 rounded-[26px] border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(27,75,54,0.04)] sm:p-7"
            >
              <div className="mb-5">
                <h2
                  id="health-alert-heading"
                  className="text-lg font-bold tracking-tight text-slate-900"
                >
                  AQI Health Alert
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Alerts use only a valid, current, non-demo AQI reading.
                </p>
              </div>

              {isLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex min-h-24 items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4"
                >
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600"
                  />
                  <div>
                    <h3 className="text-sm font-bold text-sky-900">
                      Checking current air quality
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-sky-800">
                      A health alert will appear when a valid current reading is available.
                    </p>
                  </div>
                </div>
              ) : healthAlertReading &&
                healthAlertStatus &&
                healthAlertSeverity ? (
                <article
                  role={healthAlertSeverity === "critical" ? "alert" : "status"}
                  aria-labelledby="current-health-alert-title"
                  className={`rounded-2xl border p-4 sm:p-5 ${healthAlertPresentation[healthAlertSeverity].panel}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${healthAlertPresentation[healthAlertSeverity].badge}`}
                        >
                          {healthAlertPresentation[healthAlertSeverity].label} alert
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {healthAlertReading.city}
                        </span>
                      </div>
                      <h3
                        id="current-health-alert-title"
                        className="mt-2 text-base font-bold text-slate-900"
                      >
                        {healthAlertPresentation[healthAlertSeverity].title}
                      </h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
                        {getHealthRecommendation(healthAlertStatus)}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Current AQI
                        </p>
                        <p className="text-2xl font-bold tracking-tight text-slate-900">
                          {healthAlertReading.aqi}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${airQualityStyles[healthAlertStatus].badge}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-1.5 rounded-full ${airQualityStyles[healthAlertStatus].dot}`}
                        />
                        {healthAlertStatus}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 border-t border-slate-900/10 pt-4">
                    <h4 className="text-xs font-bold text-slate-800">
                      Recommended precautions
                    </h4>
                    <ul className="mt-3 grid gap-3 md:grid-cols-3">
                      {healthAlertPresentation[
                        healthAlertSeverity
                      ].recommendations.map((recommendation) => (
                        <li
                          key={recommendation.audience}
                          className="rounded-xl border border-white/80 bg-white/80 p-4"
                        >
                          <h5 className="text-xs font-bold text-slate-800">
                            {recommendation.audience}
                          </h5>
                          <p className="mt-1.5 text-xs leading-5 text-slate-600">
                            {recommendation.guidance}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ) : (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4"
                >
                  <h3 className="text-sm font-bold text-amber-900">
                    Health alert unavailable
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    {healthAlertUnavailableMessage}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Sample or invalid AQI data is never used to generate a health alert.
                  </p>
                </div>
              )}
            </section>

            <section
              aria-labelledby="city-comparison-heading"
              className="mt-7 rounded-[26px] border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(27,75,54,0.04)] sm:p-7"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2
                    id="city-comparison-heading"
                    className="text-lg font-bold tracking-tight text-slate-900"
                  >
                    Compare Two Cities
                  </h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
                    Compare the selected city with another Indian city using current, non-demo AQI data.
                  </p>
                </div>
                {comparisonLocation && (
                  <p className="rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800">
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
                  className="mb-2 block text-sm font-bold text-slate-800"
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
                    className="h-12 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-50"
                  />
                  <button
                    type="submit"
                    disabled={
                      isComparisonSearching || comparisonQuery.trim().length < 2
                    }
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
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
                  className="mt-2 text-[11px] text-slate-400"
                >
                  The selected city remains the first city in the comparison.
                </p>
              </form>

              {showComparisonSearchResults && (
                <div
                  id="comparison-location-results"
                  className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                  aria-live="polite"
                >
                  {comparisonSearchError ? (
                    <p role="alert" className="px-4 py-3 text-sm text-rose-700">
                      {comparisonSearchError}
                    </p>
                  ) : comparisonSearchResults.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-500">
                      No different Indian cities found. Try another city or district name.
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
                            className="w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-emerald-50 focus-visible:bg-emerald-50 focus-visible:outline-none"
                          >
                            <span className="block text-sm font-semibold text-slate-800">
                              {location.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-500">
                              {[location.admin1, location.admin2]
                                .filter(Boolean)
                                .join(" · ") || location.country}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {!selectedLocation ? (
                <div
                  role="status"
                  className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900"
                >
                  Select a city in the dashboard location search to use it as the first comparison city.
                </div>
              ) : isLoading ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-5 flex min-h-24 items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900"
                >
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600"
                  />
                  Loading current AQI for {selectedLocation.name}...
                </div>
              ) : !comparisonLocation ? (
                <div
                  role="status"
                  className="mt-5 rounded-2xl border border-slate-100 bg-[#fbfcfb] p-4 text-sm text-slate-600"
                >
                  Search for and select a second city to compare current AQI readings.
                </div>
              ) : selectedLocation.id === comparisonLocation.id ? (
                <div
                  role="alert"
                  className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-900"
                >
                  Choose a city different from the selected city.
                </div>
              ) : isComparisonLoading || comparisonPending ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="mt-5 flex min-h-24 items-center gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900"
                >
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600"
                  />
                  Loading current AQI for {comparisonLocation.name}...
                </div>
              ) : comparisonError ? (
                <div
                  role="alert"
                  className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-sm text-rose-800"
                >
                  {comparisonError}
                </div>
              ) : !comparisonPrimaryReading ? (
                <div
                  role="status"
                  className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-900"
                >
                  {loadError ??
                    `A valid, location-matched, non-demo model-based AQI reading for ${selectedLocation.name} is unavailable.`}
                </div>
              ) : currentComparisonResult ? (
                <div className="mt-5">
                  <div
                    role="group"
                    aria-label="Current AQI comparison; lower AQI indicates better air quality"
                    className="grid gap-3 md:grid-cols-2"
                  >
                    {[
                      {
                        key: "primary",
                        label: "Selected city",
                        location: selectedLocation,
                        reading: comparisonPrimaryReading,
                        isBetter: comparisonWinner === "primary",
                      },
                      {
                        key: "comparison",
                        label: "Comparison city",
                        location: comparisonLocation,
                        reading: currentComparisonResult.reading,
                        isBetter: comparisonWinner === "comparison",
                      },
                    ].map((city) => {
                      const category = getAirQualityStatus(city.reading.aqi);

                      return (
                        <article
                          key={city.key}
                          className={`rounded-2xl border p-4 transition-colors sm:p-5 ${
                            city.isBetter
                              ? "border-emerald-300 bg-emerald-50/70 ring-2 ring-emerald-100"
                              : "border-slate-100 bg-[#fbfcfb]"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                                {city.label}
                              </p>
                              <h3 className="mt-1 text-base font-bold text-slate-900">
                                {city.location.name}
                              </h3>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {[city.location.admin1, city.location.country]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            </div>
                            {city.isBetter && (
                              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                                Better air quality
                              </span>
                            )}
                          </div>

                          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                Current AQI
                              </p>
                              <p className="text-4xl font-bold tracking-tight text-slate-900">
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
                            className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"
                          >
                            <span
                              aria-hidden="true"
                              className="block h-full rounded-full bg-emerald-600 transition-[width]"
                              style={{
                                width: `${(city.reading.aqi / 500) * 100}%`,
                              }}
                            />
                          </div>

                          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
                            <div>
                              <dt className="text-[10px] font-semibold text-slate-400">
                                PM2.5
                              </dt>
                              <dd className="mt-1 text-xs font-bold text-slate-700">
                                {formatPollutant(
                                  getPollutant(city.reading, "PM2.5"),
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] font-semibold text-slate-400">
                                PM10
                              </dt>
                              <dd className="mt-1 text-xs font-bold text-slate-700">
                                {formatPollutant(
                                  getPollutant(city.reading, "PM10"),
                                )}
                              </dd>
                            </div>
                          </dl>
                        </article>
                      );
                    })}
                  </div>

                  <p
                    role="status"
                    aria-live="polite"
                    className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    {comparisonWinner === "tie"
                      ? "Both cities currently have the same AQI."
                      : `${comparisonWinner === "primary" ? selectedLocation.name : comparisonLocation.name} currently has better air quality based on its lower AQI.`}
                  </p>
                  <p className="mt-2 text-[10px] text-slate-400">
                    The AQI bars use a 0–500 scale. Lower AQI indicates better air quality.
                  </p>
                </div>
              ) : (
                <div
                  role="status"
                  className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900"
                >
                  Preparing current AQI readings for comparison...
                </div>
              )}
            </section>

            <section
              id="forecast"
              aria-labelledby="forecast-heading"
              aria-busy={isForecastLoading}
              className="mt-7 rounded-[26px] border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(27,75,54,0.04)] sm:p-7"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-800">
                    <span className="size-1.5 rounded-full bg-sky-500" />
                    Model-based estimates
                  </span>
                  <h2
                    id="forecast-heading"
                    className="mt-3 text-lg font-bold tracking-tight text-slate-900"
                  >
                    5-Day AQI Forecast
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {currentForecast
                      ? `${currentForecast.locationName} · Local timestamps in ${currentForecast.timezone}`
                      : forecastLocationName && forecastTimezone
                        ? `For ${forecastLocationName} · Forecast times use ${forecastTimezone}`
                        : "Restoring the saved location..."}
                  </p>
                </div>
                <p className="max-w-xs text-[11px] leading-5 text-slate-400">
                  {currentForecast?.dataSource ??
                    "Open-Meteo/CAMS model-based estimates, not verified ground-station measurements."}
                </p>
              </div>

              {isForecastLoading ? (
                <div
                  className="mt-5 flex min-h-32 items-center justify-center gap-3 rounded-2xl border border-slate-100 bg-[#fbfcfb] px-4 text-sm text-slate-500"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    aria-hidden="true"
                    className="size-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
                  />
                  Loading model-based forecast...
                </div>
              ) : forecastError ? (
                <div
                  className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50/70 p-4"
                  role="alert"
                >
                  <p className="text-sm leading-5 text-rose-800">{forecastError}</p>
                  <button
                    type="button"
                    onClick={() => void refreshForecast()}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-800 transition-colors hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600"
                  >
                    Retry forecast
                  </button>
                </div>
              ) : !currentForecast || currentForecast.points.length === 0 ? (
                <div
                  className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-sm text-amber-900"
                  role="status"
                >
                  No forecast points are currently available for this location.
                </div>
              ) : (
                <>
                  <article
                    aria-labelledby="forecast-insights-heading"
                    className="mt-5 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 via-white to-sky-50/50 p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3
                          id="forecast-insights-heading"
                          className="text-sm font-bold text-slate-900"
                        >
                          AQI Forecast Insights
                        </h3>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">
                          Based on {currentForecast.locationName}&apos;s valid forecast
                          points in {currentForecast.timezone}.
                        </p>
                      </div>
                      <span className="self-start rounded-full border border-emerald-100 bg-white/80 px-3 py-1 text-[10px] font-semibold text-emerald-800">
                        Forecast analysis
                      </span>
                    </div>

                    {forecastInsights ? (
                      <>
                        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border border-slate-100 bg-white/90 p-3">
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Overall AQI trend
                            </dt>
                            <dd className="mt-2">
                              {forecastInsights.trend ? (
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                                    forecastInsights.trend === "improving"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : forecastInsights.trend === "worsening"
                                        ? "bg-rose-100 text-rose-800"
                                        : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  <span aria-hidden="true">
                                    {forecastInsights.trend === "improving"
                                      ? "↓"
                                      : forecastInsights.trend === "worsening"
                                        ? "↑"
                                        : "→"}
                                  </span>
                                  {forecastInsights.trend === "improving"
                                    ? "Improving"
                                    : forecastInsights.trend === "worsening"
                                      ? "Worsening"
                                      : "Relatively stable"}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-slate-600">
                                  Insufficient days
                                </span>
                              )}
                              <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
                                {forecastInsights.changeFromFirstToLast !== null
                                  ? `First to last daily average: ${
                                      forecastInsights.changeFromFirstToLast > 0
                                        ? "+"
                                        : ""
                                    }${forecastInsights.changeFromFirstToLast.toFixed(1)} AQI`
                                  : "At least two valid forecast days are needed for a trend."}
                              </p>
                            </dd>
                          </div>

                          <div className="rounded-xl border border-slate-100 bg-white/90 p-3">
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Cleanest day · daily average
                            </dt>
                            <dd className="mt-2">
                              <time
                                dateTime={forecastInsights.cleanestDay.date}
                                className="block text-xs font-bold text-slate-800"
                              >
                                {formatForecastDate(forecastInsights.cleanestDay.date)}
                              </time>
                              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  AQI {forecastInsights.cleanestDay.averageAQI.toFixed(1)}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ${airQualityStyles[forecastInsights.cleanestCategory].badge}`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`size-1.5 rounded-full ${airQualityStyles[forecastInsights.cleanestCategory].dot}`}
                                  />
                                  {forecastInsights.cleanestCategory}
                                </span>
                              </span>
                            </dd>
                          </div>

                          <div className="rounded-xl border border-slate-100 bg-white/90 p-3">
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Most polluted day · daily average
                            </dt>
                            <dd className="mt-2">
                              <time
                                dateTime={forecastInsights.mostPollutedDay.date}
                                className="block text-xs font-bold text-slate-800"
                              >
                                {formatForecastDate(
                                  forecastInsights.mostPollutedDay.date,
                                )}
                              </time>
                              <span className="mt-1.5 flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-slate-900">
                                  AQI{" "}
                                  {forecastInsights.mostPollutedDay.averageAQI.toFixed(1)}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ${airQualityStyles[forecastInsights.mostPollutedCategory].badge}`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`size-1.5 rounded-full ${airQualityStyles[forecastInsights.mostPollutedCategory].dot}`}
                                  />
                                  {forecastInsights.mostPollutedCategory}
                                </span>
                              </span>
                            </dd>
                          </div>

                          <div className="rounded-xl border border-slate-100 bg-white/90 p-3">
                            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Highest predicted AQI
                            </dt>
                            <dd className="mt-2">
                              <span className="text-2xl font-bold tracking-tight text-slate-900">
                                {forecastInsights.highestPoint.aqi}
                              </span>
                              <time
                                dateTime={forecastInsights.highestPoint.time}
                                className="mt-1 block text-[10px] leading-4 text-slate-500"
                              >
                                {formatForecastDate(
                                  forecastInsights.highestPoint.time.slice(0, 10),
                                )}{" "}
                                at {forecastInsights.highestPoint.time.slice(11, 16)}{" "}
                                ({currentForecast.timezone})
                              </time>
                              <span
                                className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ${airQualityStyles[forecastInsights.highestCategory].badge}`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`size-1.5 rounded-full ${airQualityStyles[forecastInsights.highestCategory].dot}`}
                                />
                                {forecastInsights.highestCategory}
                              </span>
                            </dd>
                          </div>
                        </dl>

                        <div className="mt-4 rounded-xl border border-emerald-100 bg-white/80 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                            Planning tip
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-700">
                            {getAQIForecastRecommendation(forecastInsights)}
                          </p>
                        </div>
                        <p className="mt-2 text-[10px] leading-4 text-slate-400">
                          Trend compares the first and last available daily averages;
                          changes of 5 AQI points or less are treated as relatively stable.
                        </p>
                      </>
                    ) : (
                      <p
                        role="status"
                        className="mt-4 rounded-xl border border-amber-100 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900"
                      >
                        There are not enough valid AQI forecast points to generate
                        insights for this location.
                      </p>
                    )}
                  </article>

                  <article className="mt-5 rounded-2xl border border-slate-100 bg-[#fbfcfb] p-3 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                      <h3 className="text-xs font-bold text-slate-700">
                        AQI trend · Model-based estimates
                      </h3>
                      <span className="text-[10px] text-slate-400">
                        US AQI · {currentForecast.points.length} returned points
                      </span>
                    </div>
                    {forecastChart && forecastChart.points.length > 0 ? (
                      <svg
                        className="mt-3 h-auto w-full overflow-visible"
                        viewBox={`0 0 ${FORECAST_CHART_SIZE.width} ${FORECAST_CHART_SIZE.height}`}
                        role="img"
                        aria-labelledby="forecast-chart-title forecast-chart-description"
                      >
                        <title id="forecast-chart-title">
                          Five-day AQI forecast trend for {currentForecast.locationName}
                        </title>
                        <desc id="forecast-chart-description">
                          Model-based AQI estimates plotted using the actual timestamps
                          returned for {currentForecast.timezone}.
                        </desc>
                        {forecastChartTicks.map((tick, index) => (
                          <g key={`aqi-tick-${index}`}>
                            <line
                              x1={FORECAST_CHART_SIZE.left}
                              x2={FORECAST_CHART_SIZE.width - FORECAST_CHART_SIZE.right}
                              y1={tick.y}
                              y2={tick.y}
                              stroke="#e2e8f0"
                              strokeDasharray="4 5"
                            />
                            <text
                              x={FORECAST_CHART_SIZE.left - 10}
                              y={tick.y}
                              textAnchor="end"
                              dominantBaseline="middle"
                              fill="#94a3b8"
                              fontSize="11"
                            >
                              {tick.value}
                            </text>
                          </g>
                        ))}
                        <path
                          d={forecastChartPath}
                          fill="none"
                          stroke="#059669"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="3"
                        />
                        {forecastChart.points.map((chartPoint, index) => (
                          <circle
                            key={`${chartPoint.point.time}-${index}`}
                            cx={chartPoint.x}
                            cy={chartPoint.y}
                            r={currentForecast.points.length > 36 ? 2.5 : 4}
                            fill="#059669"
                            stroke="white"
                            strokeWidth="1.5"
                          >
                            <title>
                              AQI {chartPoint.point.aqi} at {chartPoint.point.time} (
                              {currentForecast.timezone}), model-based estimate
                            </title>
                          </circle>
                        ))}
                        {forecastDateTickIndexes.map((index) => {
                          const chartPoint = forecastChart.points[index];
                          const anchor =
                            index === 0
                              ? "start"
                              : index === currentForecast.points.length - 1
                                ? "end"
                                : "middle";
                          return (
                            <text
                              key={`forecast-date-${index}`}
                              x={chartPoint?.x ?? FORECAST_CHART_SIZE.left}
                              y={FORECAST_CHART_SIZE.height - 8}
                              textAnchor={anchor}
                              fill="#64748b"
                              fontSize="10"
                            >
                              {currentForecast.points[index].time.slice(0, 10)}
                            </text>
                          );
                        })}
                      </svg>
                    ) : (
                      <p className="mt-3 rounded-xl bg-white p-4 text-xs text-slate-500">
                        The AQI trend chart is unavailable for these timestamps. Forecast
                        readings are still listed below.
                      </p>
                    )}
                  </article>

                  <div className="mt-5">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold text-slate-700">
                          Daily summaries and hourly details
                        </h3>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Local API timestamps · {currentForecast.timezone}
                        </p>
                      </div>
                      {currentForecast.generatedAt && (
                        <p className="text-[10px] text-slate-400">
                          Source generated · {currentForecast.generatedAt}
                        </p>
                      )}
                    </div>
                    {dailyForecastSummaries.length === 0 ? (
                      <p
                        role="status"
                        className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-xs text-amber-900"
                      >
                        No valid hourly AQI values are available for this forecast.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {dailyForecastSummaries.map((day) => {
                          const averageCategory = getAirQualityStatus(day.averageAQI);
                          const maximumCategory = getAirQualityStatus(day.maximumAQI);
                          const isExpanded = expandedForecastDays.includes(day.date);
                          const formattedDate = formatForecastDate(day.date);
                          const hourlyDetailsId = `forecast-hours-${day.date}`;

                          return (
                            <article
                              key={day.date}
                              className="overflow-hidden rounded-2xl border border-slate-100 bg-[#fbfcfb]"
                            >
                              <div className="p-4 sm:p-5">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0">
                                    <h4 className="text-sm font-bold text-slate-800">
                                      {formattedDate}
                                    </h4>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                      {day.points.length} hourly{" "}
                                      {day.points.length === 1 ? "reading" : "readings"}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    aria-label={`${isExpanded ? "Hide" : "Show"} hourly details for ${formattedDate}`}
                                    aria-expanded={isExpanded}
                                    aria-controls={hourlyDetailsId}
                                    onClick={() =>
                                      setExpandedForecastDays((currentDays) =>
                                        currentDays.includes(day.date)
                                          ? currentDays.filter((date) => date !== day.date)
                                          : [...currentDays, day.date],
                                      )
                                    }
                                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-emerald-100 bg-white px-3 py-2 text-xs font-bold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                                  >
                                    {isExpanded ? "Hide hourly details" : "Show hourly details"}
                                    <span
                                      aria-hidden="true"
                                      className={`transition-transform ${
                                        isExpanded ? "rotate-180" : ""
                                      }`}
                                    >
                                      ▾
                                    </span>
                                  </button>
                                </div>

                                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                      Average AQI
                                    </dt>
                                    <dd className="mt-2 flex flex-wrap items-center gap-2">
                                      <span className="text-2xl font-bold tracking-tight text-slate-900">
                                        {day.averageAQI.toFixed(1)}
                                      </span>
                                      <span
                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${airQualityStyles[averageCategory].badge}`}
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={`size-1.5 rounded-full ${airQualityStyles[averageCategory].dot}`}
                                        />
                                        {averageCategory}
                                      </span>
                                    </dd>
                                  </div>
                                  <div className="rounded-xl border border-slate-100 bg-white p-3">
                                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                      Maximum AQI
                                    </dt>
                                    <dd className="mt-2 flex flex-wrap items-center gap-2">
                                      <span className="text-2xl font-bold tracking-tight text-slate-900">
                                        {day.maximumAQI}
                                      </span>
                                      <span
                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${airQualityStyles[maximumCategory].badge}`}
                                      >
                                        <span
                                          aria-hidden="true"
                                          className={`size-1.5 rounded-full ${airQualityStyles[maximumCategory].dot}`}
                                        />
                                        {maximumCategory}
                                      </span>
                                    </dd>
                                  </div>
                                </dl>
                              </div>

                              <div
                                id={hourlyDetailsId}
                                hidden={!isExpanded}
                                className="border-t border-slate-100 bg-white p-3 sm:p-4"
                              >
                                {day.points.length === 0 ? (
                                  <p
                                    role="status"
                                    className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500"
                                  >
                                    No valid hourly readings are available for this day.
                                  </p>
                                ) : (
                                  <ol
                                    aria-label={`Hourly forecast details for ${formattedDate}`}
                                    className="grid gap-2 sm:grid-cols-2"
                                  >
                                    {day.points.map((point) => (
                                      <li
                                        key={point.time}
                                        className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-[#fbfcfb] p-3 sm:grid-cols-4 sm:items-center"
                                      >
                                        <div>
                                          <span className="block text-[10px] font-medium text-slate-400">
                                            Local time
                                          </span>
                                          <time
                                            dateTime={point.time}
                                            className="text-xs font-semibold text-slate-700"
                                          >
                                            {point.time.slice(11, 16)}
                                          </time>
                                        </div>
                                        <div>
                                          <span className="block text-[10px] font-medium text-slate-400">
                                            AQI
                                          </span>
                                          <span className="text-sm font-bold text-emerald-800">
                                            {isValidAQIValue(point.aqi)
                                              ? point.aqi
                                              : "Unavailable"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="block text-[10px] font-medium text-slate-400">
                                            PM2.5 · µg/m³
                                          </span>
                                          <span className="text-xs font-semibold text-slate-700">
                                            {isValidConcentration(point.pm2_5)
                                              ? point.pm2_5
                                              : "Unavailable"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="block text-[10px] font-medium text-slate-400">
                                            PM10 · µg/m³
                                          </span>
                                          <span className="text-xs font-semibold text-slate-700">
                                            {isValidConcentration(point.pm10)
                                              ? point.pm10
                                              : "Unavailable"}
                                          </span>
                                        </div>
                                      </li>
                                    ))}
                                  </ol>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>

            <section className="mt-7 grid gap-5 xl:grid-cols-12">
              <div id="planner" className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(27,75,54,0.04)] sm:p-7 xl:col-span-7">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div id="assistant" className="mb-2 flex items-center gap-2">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-sm text-emerald-700">✳</span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                        {reading
                          ? reading.isDemo
                            ? "Demo-based guidance"
                            : "AQI-based guidance"
                          : "Guidance unavailable"}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold tracking-tight text-slate-900">
                      AQI-Based Daily Action Planner
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {reading
                        ? `Based on AQI ${reading.aqi} · ${reading.category} in ${reading.city}.`
                        : `No AQI reading is available for ${selectedLocation?.name ?? "the selected location"}.`}
                      {" "}General guidance only, not personalized medical advice.
                    </p>
                    {reading?.isDemo ? (
                      <p className="mt-1 text-[11px] font-semibold text-amber-700">
                        DEMO DATA · These recommendations are demo-based.
                      </p>
                    ) : reading ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Based on model-based Open-Meteo data, not verified ground-station
                        measurements.
                      </p>
                    ) : null}
                  </div>
                  <Link href="/assistant" className="text-xs font-bold text-emerald-700">
                    Ask AI assistant <span aria-hidden="true">→</span>
                  </Link>
                </div>
                {dailyActions ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {dailyActions.map((action) => (
                      <article
                        key={action.category}
                        className="rounded-2xl border border-slate-100 bg-[#fbfcfb] p-4"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${action.tone}`}
                          >
                            {action.mark}
                          </span>
                          <h3 className="text-xs font-bold leading-5 text-slate-800">
                            {action.category}
                          </h3>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-500">{action.detail}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div
                    role="status"
                    className="mt-5 rounded-2xl border border-amber-100 bg-amber-50/70 p-4"
                  >
                    <h3 className="text-sm font-bold text-amber-900">AQI data unavailable</h3>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      Daily actions are not generated without a valid AQI reading. Check local
                      air-quality and public-health guidance.
                    </p>
                  </div>
                )}
              </div>

              <article id="impact" className="overflow-hidden rounded-[26px] bg-[#173b35] p-5 text-white shadow-[0_12px_35px_rgba(23,59,53,0.13)] sm:p-7 xl:col-span-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-200/75">Demo impact summary</p>
                    <h2 className="mt-2 text-lg font-bold tracking-tight">Building healthier habits</h2>
                    <p className="mt-1 text-xs text-emerald-100/70">Your last 7 days at a glance</p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-2xl bg-white/10 text-lg text-emerald-200">↗</span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                    <p className="text-[10px] font-medium text-emerald-100/70">Cleaner-air time</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">18.5 <span className="text-xs font-medium text-emerald-100/70">hrs</span></p>
                    <p className="mt-1 text-[10px] text-emerald-200">↑ 2.5 hrs this week</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                    <p className="text-[10px] font-medium text-emerald-100/70">Exposure avoided</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight">12<span className="text-base">%</span></p>
                    <p className="mt-1 text-[10px] text-emerald-200">vs. your monthly avg.</p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl bg-white/[0.07] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-white/90">Weekly fresh-air goal</p>
                    <p className="text-[11px] font-bold text-emerald-200">4 of 5 days</p>
                  </div>
                  <div className="mt-3 flex gap-1.5" aria-label="Weekly goal: 4 of 5 days completed">
                    <span className="h-1.5 flex-1 rounded-full bg-emerald-300" />
                    <span className="h-1.5 flex-1 rounded-full bg-emerald-300" />
                    <span className="h-1.5 flex-1 rounded-full bg-emerald-300" />
                    <span className="h-1.5 flex-1 rounded-full bg-emerald-300" />
                    <span className="h-1.5 flex-1 rounded-full bg-white/15" />
                  </div>
                </div>
                <a href="#impact" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-200">
                  View your impact <span aria-hidden="true">→</span>
                </a>
              </article>
            </section>

            <footer className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-4 text-[10px] text-slate-400">
              <span>
                {!reading
                  ? "AQI data is unavailable for the selected location; recommendations are not shown."
                  : reading.isDemo
                    ? "Demo readings are illustrative and are not live monitoring or health guidance."
                    : "Open-Meteo readings are model-based, not ground-station measurements or health guidance."}
              </span>
              <span>Stay informed. Breathe better.</span>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
