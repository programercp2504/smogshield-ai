"use client";

import { useMemo, useState } from "react";
import {
  getForecastTimestampValue,
  isValidAQIValue,
  isValidConcentration,
  useAQIData,
} from "@/app/providers/aqi-data-provider";
import { getAirQualityStatus, type AirQualityStatus } from "@/lib/aqi";
import type { AQIForecastPoint } from "@/lib/aqi-api";

const CHART = {
  width: 760,
  height: 280,
  left: 48,
  right: 18,
  top: 20,
  bottom: 38,
};

const AIR_QUALITY_STYLES: Record<
  AirQualityStatus,
  { badge: string; dot: string }
> = {
  Good: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  Moderate: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  "Unhealthy for Sensitive Groups": {
    badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200",
    dot: "bg-orange-500",
  },
  Unhealthy: {
    badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
    dot: "bg-rose-500",
  },
  "Very Unhealthy": {
    badge: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
    dot: "bg-red-500",
  },
  Hazardous: {
    badge: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/50 dark:text-fuchsia-200",
    dot: "bg-fuchsia-600",
  },
};

interface DailySummary {
  date: string;
  points: AQIForecastPoint[];
  averageAQI: number;
  maximumAQI: number;
}

interface ForecastInsights {
  trend: "improving" | "worsening" | "stable" | null;
  change: number | null;
  cleanestDay: DailySummary;
  mostPollutedDay: DailySummary;
  highestPoint: AQIForecastPoint;
}

interface ChartPoint {
  point: AQIForecastPoint;
  x: number;
  y: number;
}

interface ForecastChart {
  points: ChartPoint[];
  minAQI: number;
  maxAQI: number;
}

function getDailySummaries(points: AQIForecastPoint[]): DailySummary[] {
  const groupedPoints = new Map<string, AQIForecastPoint[]>();

  for (const point of points) {
    if (
      getForecastTimestampValue(point.time) === null ||
      !isValidAQIValue(point.aqi)
    ) {
      continue;
    }

    const date = point.time.slice(0, 10);
    const dayPoints = groupedPoints.get(date) ?? [];
    dayPoints.push(point);
    groupedPoints.set(date, dayPoints);
  }

  return [...groupedPoints.entries()]
    .map(([date, dayPoints]) => {
      const chronologicalPoints = [...dayPoints].sort((first, second) =>
        first.time.localeCompare(second.time),
      );
      const values = chronologicalPoints.map((point) => point.aqi);

      return {
        date,
        points: chronologicalPoints,
        averageAQI: values.reduce((total, value) => total + value, 0) / values.length,
        maximumAQI: Math.max(...values),
      };
    })
    .sort((first, second) => first.date.localeCompare(second.date));
}

function getInsights(days: DailySummary[]): ForecastInsights | null {
  const validDays = days.filter(
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
      change: null,
      cleanestDay,
      mostPollutedDay,
      highestPoint,
    };
  }

  const change =
    validDays[validDays.length - 1].averageAQI - validDays[0].averageAQI;

  return {
    trend:
      Math.abs(change) <= 5
        ? "stable"
        : change < 0
          ? "improving"
          : "worsening",
    change,
    cleanestDay,
    mostPollutedDay,
    highestPoint,
  };
}

function getChart(points: AQIForecastPoint[]): ForecastChart {
  if (points.length === 0) {
    return { points: [], minAQI: 0, maxAQI: 100 };
  }

  const timestamps = points.map((point) =>
    getForecastTimestampValue(point.time),
  );
  if (timestamps.some((timestamp) => timestamp === null)) {
    return { points: [], minAQI: 0, maxAQI: 100 };
  }

  const validTimestamps = timestamps.filter(
    (timestamp): timestamp is number => timestamp !== null,
  );
  const aqiValues = points.map((point) => point.aqi);
  const minimum = Math.min(...aqiValues);
  const maximum = Math.max(...aqiValues);
  const padding = Math.max((maximum - minimum) * 0.15, 5);
  const minAQI = Math.max(0, Math.floor(minimum - padding));
  const maxAQI = Math.min(500, Math.ceil(maximum + padding));
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const timeRange =
    Math.max(...validTimestamps) - Math.min(...validTimestamps);
  const aqiRange = Math.max(maxAQI - minAQI, 1);
  const firstTime = Math.min(...validTimestamps);

  return {
    minAQI,
    maxAQI,
    points: points.map((point, index) => ({
      point,
      x:
        CHART.left +
        (timeRange === 0
          ? plotWidth / 2
          : ((validTimestamps[index] - firstTime) / timeRange) * plotWidth),
      y: CHART.top + ((maxAQI - point.aqi) / aqiRange) * plotHeight,
    })),
  };
}

function formatForecastDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function getRecommendation(insights: ForecastInsights): string {
  const peakCategory = getAirQualityStatus(insights.highestPoint.aqi);

  if (
    peakCategory === "Unhealthy" ||
    peakCategory === "Very Unhealthy" ||
    peakCategory === "Hazardous"
  ) {
    return `Prefer ${formatForecastDate(insights.cleanestDay.date)} for outdoor plans where possible. The forecast peaks at AQI ${insights.highestPoint.aqi}; limit prolonged or heavy outdoor exertion around that time.`;
  }

  if (peakCategory === "Unhealthy for Sensitive Groups") {
    return `Consider ${formatForecastDate(insights.cleanestDay.date)} for outdoor plans. Children, older adults, and people with respiratory sensitivities should reduce prolonged exertion around the forecast peak.`;
  }

  if (peakCategory === "Moderate") {
    return `Consider ${formatForecastDate(insights.cleanestDay.date)} for longer outdoor activities, especially if you are sensitive to air pollution.`;
  }

  return "The forecast remains in the Good category. Usual outdoor activities are generally reasonable; recheck local conditions before longer outings.";
}

function CategoryBadge({ aqi }: { aqi: number }) {
  const category = getAirQualityStatus(aqi);
  const styles = AIR_QUALITY_STYLES[category];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${styles.badge}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${styles.dot}`} />
      {category}
    </span>
  );
}

export default function ForecastPage() {
  const {
    selectedLocation,
    forecast,
    isForecastLoading,
    forecastError,
    isLocationReady,
    refreshForecast,
  } = useAQIData();
  const [expandedDays, setExpandedDays] = useState<string[]>([]);

  const locationName =
    selectedLocation?.name.trim() ?? (isLocationReady ? "Kolkata" : null);
  const timezone =
    selectedLocation?.timezone.trim() ??
    (isLocationReady ? "Asia/Kolkata" : null);
  const currentForecast =
    locationName !== null &&
    timezone !== null &&
    forecast?.locationName === locationName &&
    forecast.timezone === timezone
      ? forecast
      : null;

  const validPoints = useMemo(
    () =>
      currentForecast?.points.filter(
        (point) =>
          getForecastTimestampValue(point.time) !== null &&
          isValidAQIValue(point.aqi),
      ) ?? [],
    [currentForecast],
  );
  const dailySummaries = useMemo(
    () => getDailySummaries(validPoints),
    [validPoints],
  );
  const insights = useMemo(
    () => getInsights(dailySummaries),
    [dailySummaries],
  );
  const chart = useMemo(() => getChart(validPoints), [validPoints]);
  const chartPath = chart.points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const chartTicks = [0, 1, 2].map((index) => ({
    value: Math.round(
      chart.maxAQI - ((chart.maxAQI - chart.minAQI) * index) / 2,
    ),
    y:
      CHART.top +
      ((CHART.height - CHART.top - CHART.bottom) * index) / 2,
  }));
  const dateTickIndexes = [
    ...new Set([
      0,
      Math.floor((chart.points.length - 1) / 2),
      chart.points.length - 1,
    ]),
  ].filter((index) => index >= 0);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#f7faf8] px-4 py-6 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-6 rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Model-based estimates
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                5-Day AQI Forecast
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">
                {locationName
                  ? `For ${locationName}`
                  : "Restoring your selected location"}
                {timezone ? ` · Local times in ${timezone}` : ""}
              </p>
            </div>
            <p className="max-w-xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Estimates use the shared Open-Meteo/CAMS forecast and are not
              verified ground-station measurements.
            </p>
          </div>
        </header>

        {isForecastLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-40 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
            />
            Loading the five-day forecast
            {locationName ? ` for ${locationName}` : ""}...
          </div>
        ) : forecastError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
          >
            <p className="text-sm">{forecastError}</p>
            <button
              type="button"
              onClick={() => void refreshForecast()}
              className="min-h-11 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-bold text-rose-800 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 dark:border-rose-800 dark:bg-slate-900 dark:text-rose-200 dark:hover:bg-rose-950"
            >
              Retry forecast
            </button>
          </div>
        ) : !currentForecast || currentForecast.points.length === 0 ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <p>
              No forecast points are currently available
              {locationName ? ` for ${locationName}` : " for the selected location"}.
            </p>
            <button
              type="button"
              onClick={() => void refreshForecast()}
              className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-900 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950"
            >
              Refresh forecast
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <section
              aria-labelledby="insights-heading"
              className="rounded-[26px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-sm dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-7"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-300">
                  Forecast analysis
                </p>
                <h2
                  id="insights-heading"
                  className="mt-2 text-lg font-bold text-slate-900 dark:text-white"
                >
                  AI Forecast Insights
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Calculated from {currentForecast.locationName}&apos;s valid
                  forecast points in {currentForecast.timezone}.
                </p>
              </div>

              {insights ? (
                <>
                  <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Overall AQI trend
                      </dt>
                      <dd className="mt-2">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                            insights.trend === "improving"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                              : insights.trend === "worsening"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                          }`}
                        >
                          {insights.trend === "improving"
                            ? "↓ Improving"
                            : insights.trend === "worsening"
                              ? "↑ Worsening"
                              : insights.trend === "stable"
                                ? "→ Relatively stable"
                                : "Insufficient days"}
                        </span>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {insights.change !== null
                            ? `First to last daily average: ${insights.change > 0 ? "+" : ""}${insights.change.toFixed(1)} AQI`
                            : "At least two valid forecast days are needed for a trend."}
                        </p>
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Cleanest day · daily average
                      </dt>
                      <dd className="mt-2">
                        <time
                          dateTime={insights.cleanestDay.date}
                          className="block text-sm font-bold text-slate-900 dark:text-white"
                        >
                          {formatForecastDate(insights.cleanestDay.date)}
                        </time>
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-lg font-bold text-slate-900 dark:text-white">
                            AQI {insights.cleanestDay.averageAQI.toFixed(1)}
                          </span>
                          <CategoryBadge aqi={insights.cleanestDay.averageAQI} />
                        </span>
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Most polluted day · daily average
                      </dt>
                      <dd className="mt-2">
                        <time
                          dateTime={insights.mostPollutedDay.date}
                          className="block text-sm font-bold text-slate-900 dark:text-white"
                        >
                          {formatForecastDate(insights.mostPollutedDay.date)}
                        </time>
                        <span className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="text-lg font-bold text-slate-900 dark:text-white">
                            AQI {insights.mostPollutedDay.averageAQI.toFixed(1)}
                          </span>
                          <CategoryBadge aqi={insights.mostPollutedDay.averageAQI} />
                        </span>
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Highest predicted AQI
                      </dt>
                      <dd className="mt-2">
                        <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                          {insights.highestPoint.aqi}
                        </span>
                        <time
                          dateTime={insights.highestPoint.time}
                          className="mt-1 block text-xs text-slate-500 dark:text-slate-400"
                        >
                          {formatForecastDate(insights.highestPoint.time.slice(0, 10))}{" "}
                          at {insights.highestPoint.time.slice(11, 16)} local time
                        </time>
                        <div className="mt-2">
                          <CategoryBadge aqi={insights.highestPoint.aqi} />
                        </div>
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                    <span className="mr-1 font-bold text-emerald-800 dark:text-emerald-300">
                      Planning tip:
                    </span>
                    {getRecommendation(insights)}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-400">
                    Trend compares the first and last available daily averages;
                    changes of 5 AQI points or less are treated as relatively stable.
                  </p>
                </>
              ) : (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  There are not enough valid AQI forecast points to generate
                  insights for this location.
                </p>
              )}
            </section>

            <section
              aria-labelledby="chart-heading"
              className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"
            >
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2
                    id="chart-heading"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    AQI trend
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Five-day model-based estimates · US AQI
                  </p>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {validPoints.length} valid hourly readings
                </p>
              </div>

              {chart.points.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-2xl bg-slate-50 p-3 dark:bg-slate-950/50">
                  <svg
                    className="h-auto min-w-[560px] w-full"
                    viewBox={`0 0 ${CHART.width} ${CHART.height}`}
                    role="img"
                    aria-labelledby="forecast-chart-title forecast-chart-description"
                  >
                    <title id="forecast-chart-title">
                      Five-day AQI forecast for {currentForecast.locationName}
                    </title>
                    <desc id="forecast-chart-description">
                      Hourly model-based AQI values plotted in the local
                      timestamps for {currentForecast.timezone}.
                    </desc>
                    {chartTicks.map((tick, index) => (
                      <g key={`tick-${index}`}>
                        <line
                          className="text-slate-500 dark:text-slate-400"
                          x1={CHART.left}
                          x2={CHART.width - CHART.right}
                          y1={tick.y}
                          y2={tick.y}
                          stroke="currentColor"
                          strokeOpacity="0.8"
                          strokeDasharray="4 5"
                        />
                        <text
                          className="text-slate-500 dark:text-slate-400"
                          x={CHART.left - 10}
                          y={tick.y}
                          textAnchor="end"
                          dominantBaseline="middle"
                          fill="currentColor"
                          fontSize="11"
                        >
                          {tick.value}
                        </text>
                      </g>
                    ))}
                    <path
                      d={chartPath}
                      fill="none"
                      stroke="#059669"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="3"
                    />
                    {chart.points.map((chartPoint, index) => (
                      <circle
                        key={`${chartPoint.point.time}-${index}`}
                        cx={chartPoint.x}
                        cy={chartPoint.y}
                        r={chart.points.length > 36 ? 2.5 : 4}
                        fill="#059669"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      >
                        <title>
                          AQI {chartPoint.point.aqi} at{" "}
                          {chartPoint.point.time.slice(0, 16)} (
                          {currentForecast.timezone}), model-based estimate
                        </title>
                      </circle>
                    ))}
                    {dateTickIndexes.map((index) => {
                      const chartPoint = chart.points[index];
                      const anchor =
                        index === 0
                          ? "start"
                          : index === chart.points.length - 1
                            ? "end"
                            : "middle";

                      return (
                        <text
                          key={`date-${index}`}
                          className="text-slate-500 dark:text-slate-400"
                          x={chartPoint?.x ?? CHART.left}
                          y={CHART.height - 8}
                          textAnchor={anchor}
                          fill="currentColor"
                          fontSize="10"
                        >
                          {chartPoint?.point.time.slice(0, 10)}
                        </text>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <p
                  role="status"
                  className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-950/50 dark:text-slate-300"
                >
                  The chart is unavailable for these timestamps. Valid forecast
                  readings are still summarized below.
                </p>
              )}
              <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                Estimates from {currentForecast.dataSource}. Values are not
                verified station measurements.
              </p>
            </section>

            <section
              aria-labelledby="daily-heading"
              className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"
            >
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="daily-heading"
                    className="text-base font-bold text-slate-900 dark:text-white"
                  >
                    Daily summaries and hourly details
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Local API dates and times · {currentForecast.timezone}
                  </p>
                </div>
                {currentForecast.generatedAt && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Source generated · {currentForecast.generatedAt}
                  </p>
                )}
              </div>

              {dailySummaries.length === 0 ? (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  No valid hourly AQI values are available for this forecast.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {dailySummaries.map((day) => {
                    const isExpanded = expandedDays.includes(day.date);
                    const dateLabel = formatForecastDate(day.date);
                    const detailsId = `forecast-hours-${day.date}`;

                    return (
                      <article
                        key={day.date}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/50"
                      >
                        <div className="p-4 sm:p-5">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                                {dateLabel}
                              </h3>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {day.points.length} hourly{" "}
                                {day.points.length === 1 ? "reading" : "readings"}
                              </p>
                            </div>
                            <button
                              type="button"
                              aria-label={`${isExpanded ? "Hide" : "Show"} hourly details for ${dateLabel}`}
                              aria-expanded={isExpanded}
                              aria-controls={detailsId}
                              onClick={() =>
                                setExpandedDays((currentDays) =>
                                  currentDays.includes(day.date)
                                    ? currentDays.filter(
                                        (date) => date !== day.date,
                                      )
                                    : [...currentDays, day.date],
                                )
                              }
                              className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-emerald-200 bg-white px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-950/50"
                            >
                              {isExpanded ? "Hide hourly details" : "Show hourly details"}
                              <span aria-hidden="true">{isExpanded ? "▴" : "▾"}</span>
                            </button>
                          </div>

                          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                              <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Average AQI
                              </dt>
                              <dd className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                                  {day.averageAQI.toFixed(1)}
                                </span>
                                <CategoryBadge aqi={day.averageAQI} />
                              </dd>
                            </div>
                            <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                              <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                Maximum AQI
                              </dt>
                              <dd className="mt-2 flex flex-wrap items-center gap-2">
                                <span className="text-2xl font-bold text-slate-900 dark:text-white">
                                  {day.maximumAQI}
                                </span>
                                <CategoryBadge aqi={day.maximumAQI} />
                              </dd>
                            </div>
                          </dl>
                        </div>

                        <div
                          id={detailsId}
                          hidden={!isExpanded}
                          className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:p-4"
                        >
                          <ol
                            aria-label={`Hourly forecast details for ${dateLabel}`}
                            className="grid gap-2 sm:grid-cols-2"
                          >
                            {day.points.map((point) => (
                              <li
                                key={point.time}
                                className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/70 sm:grid-cols-4"
                              >
                                <div>
                                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                                    Local time
                                  </span>
                                  <time
                                    dateTime={point.time}
                                    className="text-sm font-semibold text-slate-800 dark:text-slate-100"
                                  >
                                    {point.time.slice(11, 16)}
                                  </time>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                                    AQI
                                  </span>
                                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                                    {point.aqi}
                                  </span>
                                  <span className="mt-1 block">
                                    <CategoryBadge aqi={point.aqi} />
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                                    PM2.5 · µg/m³
                                  </span>
                                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {isValidConcentration(point.pm2_5)
                                      ? point.pm2_5
                                      : "Unavailable"}
                                  </span>
                                </div>
                                <div>
                                  <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                                    PM10 · µg/m³
                                  </span>
                                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    {isValidConcentration(point.pm10)
                                      ? point.pm10
                                      : "Unavailable"}
                                  </span>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
