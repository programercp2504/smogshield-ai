"use client";

import { useMemo } from "react";
import {
  getForecastTimestampValue,
  isValidAQIValue,
  useAQIData,
} from "@/app/providers/aqi-data-provider";
import { getAirQualityStatus, type AirQualityStatus } from "@/lib/aqi";
import type { AQIForecastPoint } from "@/lib/aqi-api";

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

function formatForecastDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const localCalendarDate = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(localCalendarDate);
}

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
      const chronologicalPoints = [...dayPoints].sort((first, second) =>
        first.time.localeCompare(second.time),
      );
      const aqiValues = chronologicalPoints.map((point) => point.aqi);

      return {
        date,
        points: chronologicalPoints,
        averageAQI:
          aqiValues.reduce((total, value) => total + value, 0) /
          aqiValues.length,
        maximumAQI: Math.max(...aqiValues),
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

function getAQIForecastRecommendation(
  insights: AQIForecastInsights,
  timezone: string,
): string {
  const cleanestDate = formatForecastDate(insights.cleanestDay.date);
  const peakDateTime = `${formatForecastDate(
    insights.highestPoint.time.slice(0, 10),
  )} at ${insights.highestPoint.time.slice(11, 16)} (${timezone})`;

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

function CategoryBadge({ aqi }: { aqi: number }) {
  const category = getAirQualityStatus(aqi);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${airQualityStyles[category].badge}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${airQualityStyles[category].dot}`}
      />
      {category}
    </span>
  );
}

export default function InsightsPage() {
  const {
    selectedLocation,
    forecast,
    isForecastLoading,
    forecastError,
    isLocationReady,
    refreshForecast,
  } = useAQIData();

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
    () => getDailyAQIForecastSummaries(validPoints),
    [validPoints],
  );
  const insights = useMemo(
    () => getAQIForecastInsights(dailySummaries),
    [dailySummaries],
  );

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-6 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-6 rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Forecast analysis
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                AI Forecast Insights
              </h1>
              <p
                aria-live="polite"
                className="mt-2 text-sm text-slate-500 dark:text-slate-300"
              >
                {locationName
                  ? `For ${locationName}`
                  : "Restoring your selected location"}
                {timezone ? ` · Local dates and times in ${timezone}` : ""}
              </p>
            </div>
            <p className="max-w-xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Insights are calculated from the shared five-day forecast. Values
              are model-based estimates, not guaranteed ground-station
              measurements.
            </p>
          </div>
        </header>

        {!isLocationReady || isForecastLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex min-h-40 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600"
            />
            {!isLocationReady
              ? "Restoring the selected location..."
              : `Loading the five-day forecast${locationName ? ` for ${locationName}` : ""}...`}
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
        ) : !currentForecast || validPoints.length === 0 ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <p>
              No valid forecast points are currently available
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
              aria-labelledby="insights-summary-heading"
              className="rounded-[26px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 shadow-sm dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-7"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800 dark:text-emerald-300">
                  Data-driven outlook
                </p>
                <h2
                  id="insights-summary-heading"
                  className="mt-2 text-lg font-bold text-slate-900 dark:text-white"
                >
                  AQI Forecast Insights
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Based on {currentForecast.locationName}&apos;s valid forecast
                  points in {currentForecast.timezone}.
                </p>
              </div>

              {insights ? (
                <>
                  <dl className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Overall five-day AQI trend
                      </dt>
                      <dd className="mt-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                            insights.trend === "improving"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                              : insights.trend === "worsening"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                          }`}
                        >
                          <span aria-hidden="true">
                            {insights.trend === "improving"
                              ? "↓"
                              : insights.trend === "worsening"
                                ? "↑"
                                : insights.trend === "stable"
                                  ? "→"
                                  : ""}
                          </span>
                          {insights.trend === "improving"
                            ? "Improving"
                            : insights.trend === "worsening"
                              ? "Worsening"
                              : insights.trend === "stable"
                                ? "Stable"
                                : "Insufficient days"}
                        </span>
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {insights.changeFromFirstToLast !== null
                            ? `First to last daily average: ${insights.changeFromFirstToLast > 0 ? "+" : ""}${insights.changeFromFirstToLast.toFixed(1)} AQI`
                            : "At least two valid forecast days are needed for a trend."}
                        </p>
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Cleanest forecast day
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
                            Average AQI {insights.cleanestDay.averageAQI.toFixed(1)}
                          </span>
                          <CategoryBadge aqi={insights.cleanestDay.averageAQI} />
                        </span>
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Most polluted forecast day
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
                            Average AQI{" "}
                            {insights.mostPollutedDay.averageAQI.toFixed(1)}
                          </span>
                          <CategoryBadge
                            aqi={insights.mostPollutedDay.averageAQI}
                          />
                        </span>
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-800/80">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Highest predicted hourly AQI
                      </dt>
                      <dd className="mt-2">
                        <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                          {insights.highestPoint.aqi}
                        </span>
                        <time
                          dateTime={insights.highestPoint.time}
                          className="mt-1 block text-xs text-slate-500 dark:text-slate-400"
                        >
                          {formatForecastDate(
                            insights.highestPoint.time.slice(0, 10),
                          )}{" "}
                          at {insights.highestPoint.time.slice(11, 16)} (
                          {currentForecast.timezone})
                        </time>
                        <div className="mt-2">
                          <CategoryBadge aqi={insights.highestPoint.aqi} />
                        </div>
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-4 rounded-xl border border-emerald-100 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
                    <span className="mr-1 font-bold text-emerald-800 dark:text-emerald-300">
                      Planning recommendation:
                    </span>
                    {getAQIForecastRecommendation(insights, currentForecast.timezone)}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                    Trend compares the first and last available daily averages;
                    changes of 5 AQI points or less are treated as stable.
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
              aria-labelledby="daily-summaries-heading"
              className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"
            >
              <div>
                <h2
                  id="daily-summaries-heading"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  Daily forecast breakdown
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Average and maximum AQI from valid hourly readings ·{" "}
                  {currentForecast.timezone}
                </p>
              </div>

              {dailySummaries.length === 0 ? (
                <p
                  role="status"
                  className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200"
                >
                  No valid daily summaries can be calculated from the available
                  forecast points.
                </p>
              ) : (
                <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {dailySummaries.map((day) => (
                    <li
                      key={day.date}
                      className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <time
                          dateTime={day.date}
                          className="text-sm font-bold text-slate-900 dark:text-white"
                        >
                          {formatForecastDate(day.date)}
                        </time>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">
                          {day.points.length}{" "}
                          {day.points.length === 1 ? "reading" : "readings"}
                        </span>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Daily average
                          </dt>
                          <dd className="mt-2">
                            <span className="block text-2xl font-bold text-slate-900 dark:text-white">
                              {day.averageAQI.toFixed(1)}
                            </span>
                            <span className="mt-2 block">
                              <CategoryBadge aqi={day.averageAQI} />
                            </span>
                          </dd>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            Maximum AQI
                          </dt>
                          <dd className="mt-2">
                            <span className="block text-2xl font-bold text-slate-900 dark:text-white">
                              {day.maximumAQI}
                            </span>
                            <span className="mt-2 block">
                              <CategoryBadge aqi={day.maximumAQI} />
                            </span>
                          </dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              These estimates are model-based and may differ from measured
              conditions. Recheck current local air quality before making
              outdoor plans.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
