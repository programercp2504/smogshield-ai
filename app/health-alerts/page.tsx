"use client";

import {
  isAQIReading,
  isValidAQIValue,
  useAQIData,
} from "@/app/providers/aqi-data-provider";
import {
  getAirQualityStatus,
  getHealthRecommendation,
  type AirQualityStatus,
} from "@/lib/aqi";

type AlertSeverity = "normal" | "warning" | "critical";

interface AudienceRecommendation {
  audience: string;
  guidance: string;
}

interface AlertPresentation {
  label: string;
  title: string;
  panel: string;
  badge: string;
  recommendations: AudienceRecommendation[];
}

const severityByStatus: Record<AirQualityStatus, AlertSeverity> = {
  Good: "normal",
  Moderate: "warning",
  "Unhealthy for Sensitive Groups": "warning",
  Unhealthy: "critical",
  "Very Unhealthy": "critical",
  Hazardous: "critical",
};

const alertPresentation: Record<AlertSeverity, AlertPresentation> = {
  normal: {
    label: "Normal",
    title: "Air quality is good",
    panel:
      "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/70 dark:bg-emerald-950/40",
    badge:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-200",
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
    panel:
      "border-amber-200 bg-amber-50/80 dark:border-amber-900/70 dark:bg-amber-950/40",
    badge:
      "bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-200",
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
    panel:
      "border-rose-200 bg-rose-50/80 dark:border-rose-900/70 dark:bg-rose-950/40",
    badge:
      "bg-rose-100 text-rose-900 dark:bg-rose-900/70 dark:text-rose-200",
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

const categoryStyles: Record<AirQualityStatus, string> = {
  Good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  Moderate:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  "Unhealthy for Sensitive Groups":
    "bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200",
  Unhealthy: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200",
  "Very Unhealthy":
    "bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200",
  Hazardous:
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/60 dark:text-fuchsia-200",
};

function isReadingForSelectedLocation(
  reading: unknown,
  locationName: string | null,
): reading is NonNullable<ReturnType<typeof useAQIData>["currentAQI"]> {
  return (
    isAQIReading(reading) &&
    isValidAQIValue(reading.aqi) &&
    (locationName === null || reading.city === locationName)
  );
}

export default function HealthAlertsPage() {
  const {
    selectedLocation,
    currentAQI,
    isAQILoading,
    aqiError,
    isLocationReady,
    refreshAQI,
  } = useAQIData();

  const locationName =
    selectedLocation?.name ??
    (isLocationReady
      ? isReadingForSelectedLocation(currentAQI, null)
        ? currentAQI.city
        : "Kolkata"
      : null);
  const matchingReading = isReadingForSelectedLocation(
    currentAQI,
    selectedLocation?.name ?? null,
  )
    ? currentAQI
    : null;
  const availableReading =
    !isAQILoading && matchingReading ? matchingReading : null;
  const healthAlertReading =
    availableReading && !availableReading.isDemo ? availableReading : null;
  const demoReading =
    availableReading?.isDemo === true ? availableReading : null;
  const status = healthAlertReading
    ? getAirQualityStatus(healthAlertReading.aqi)
    : null;
  const severity = status ? severityByStatus[status] : null;
  const unavailableMessage =
    aqiError ??
    (demoReading
      ? "Only sample/demo AQI data is available. It is not used to generate health alerts."
      : selectedLocation
        ? `A valid, location-matched, non-demo model-based AQI reading for ${selectedLocation.name} is unavailable.`
        : "A valid, non-demo model-based AQI reading is unavailable.");
  const region = selectedLocation?.admin1 ?? matchingReading?.region;

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-6 text-slate-800 dark:bg-slate-950 dark:text-slate-100 sm:px-7 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-6 rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Health &amp; safety
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                AQI Health Alerts
              </h1>
              <p
                aria-live="polite"
                className="mt-2 text-sm text-slate-500 dark:text-slate-300"
              >
                {locationName ?? "Restoring selected location"}
                {region ? ` · ${region}` : ""}
              </p>
            </div>
            <p className="max-w-xl text-xs leading-5 text-slate-500 dark:text-slate-400">
              Alerts use a valid current reading for the selected location.
              AQI readings are model-based and are not verified ground-station
              measurements.
            </p>
          </div>
        </header>

        <section
          aria-labelledby="current-alert-heading"
          className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7"
        >
          <div className="mb-5">
            <h2
              id="current-alert-heading"
              className="text-lg font-bold tracking-tight text-slate-900 dark:text-white"
            >
              Current air quality
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              The alert and recommendations update when the selected city or
              its AQI reading changes.
            </p>
          </div>

          {!isLocationReady ? (
            <div
              role="status"
              aria-live="polite"
              className="flex min-h-28 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200"
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700 dark:border-sky-800 dark:border-t-sky-300"
              />
              <div>
                <h3 className="text-sm font-bold">
                  Restoring selected location
                </h3>
                <p className="mt-1 text-xs leading-5">
                  Current AQI and health alerts will appear when location
                  restoration is complete.
                </p>
              </div>
            </div>
          ) : isAQILoading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex min-h-28 items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-900 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200"
            >
              <span
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-700 dark:border-sky-800 dark:border-t-sky-300"
              />
              <div>
                <h3 className="text-sm font-bold">
                  Checking air quality for {locationName}
                </h3>
                <p className="mt-1 text-xs leading-5">
                  No health alert is shown while the current reading is loading.
                </p>
              </div>
            </div>
          ) : healthAlertReading && status && severity ? (
            <article
              role={severity === "critical" ? "alert" : "status"}
              aria-labelledby="health-alert-title"
              className={`rounded-2xl border p-4 sm:p-6 ${alertPresentation[severity].panel}`}
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ${alertPresentation[severity].badge}`}
                    >
                      {alertPresentation[severity].label} alert
                    </span>
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      {healthAlertReading.city}
                    </span>
                  </div>
                  <h3
                    id="health-alert-title"
                    className="mt-3 text-lg font-bold text-slate-900 dark:text-white"
                  >
                    {alertPresentation[severity].title}
                  </h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700 dark:text-slate-200">
                    {getHealthRecommendation(status)}
                  </p>
                  <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {healthAlertReading.dataSource}
                  </p>
                </div>

                <dl className="flex shrink-0 flex-wrap items-center gap-4 rounded-2xl border border-white/80 bg-white/80 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/80">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Current AQI
                    </dt>
                    <dd className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                      {healthAlertReading.aqi}
                    </dd>
                  </div>
                  <div>
                    <dt className="sr-only">AQI category</dt>
                    <dd
                      className={`rounded-full px-3 py-1.5 text-xs font-bold ${categoryStyles[status]}`}
                    >
                      {status}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-6 border-t border-slate-900/10 pt-5 dark:border-slate-100/10">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Recommended precautions
                </h4>
                <ul className="mt-3 grid gap-3 md:grid-cols-3">
                  {alertPresentation[severity].recommendations.map(
                    (recommendation) => (
                      <li
                        key={recommendation.audience}
                        className="rounded-xl border border-white/80 bg-white/85 p-4 dark:border-slate-700 dark:bg-slate-900/80"
                      >
                        <h5 className="text-sm font-bold text-slate-900 dark:text-white">
                          {recommendation.audience}
                        </h5>
                        <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                          {recommendation.guidance}
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            </article>
          ) : demoReading ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/70 dark:bg-amber-950/40 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex rounded-full bg-amber-200 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900 dark:bg-amber-900/70 dark:text-amber-200">
                    Demo data · no health alert
                  </span>
                  <h3 className="mt-3 text-base font-bold text-amber-950 dark:text-amber-100">
                    A health alert requires a valid, non-demo AQI reading
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-amber-900 dark:text-amber-200">
                    {unavailableMessage}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-amber-900 dark:text-amber-200">
                    Sample data is illustrative only and is never used to
                    determine a Normal, Warning, or Critical alert.
                  </p>
                </div>
                <dl className="rounded-xl border border-amber-200 bg-white/80 px-4 py-3 dark:border-amber-900/70 dark:bg-slate-900/70">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">
                    Demo AQI · {demoReading.city}
                  </dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-2xl font-bold text-slate-900 dark:text-white">
                      {demoReading.aqi}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${categoryStyles[getAirQualityStatus(demoReading.aqi)]}`}
                    >
                      {getAirQualityStatus(demoReading.aqi)}
                    </span>
                  </dd>
                </dl>
              </div>
              {aqiError && (
                <button
                  type="button"
                  onClick={() => void refreshAQI()}
                  className="mt-4 min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950"
                >
                  Retry current AQI
                </button>
              )}
            </div>
          ) : (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-900/70 dark:bg-amber-950/40 sm:p-5"
            >
              <h3 className="text-sm font-bold text-amber-950 dark:text-amber-100">
                Health alert unavailable
              </h3>
              <p className="mt-1 text-sm leading-6 text-amber-900 dark:text-amber-200">
                {unavailableMessage}
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-900 dark:text-amber-200">
                A Normal, Warning, or Critical alert requires a valid,
                location-matched, non-demo AQI reading.
              </p>
              <button
                type="button"
                onClick={() => void refreshAQI()}
                className="mt-4 min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-950"
              >
                Retry current AQI
              </button>
            </div>
          )}
        </section>

        <p className="mt-5 text-xs leading-5 text-slate-500 dark:text-slate-400">
          These recommendations are general information, not personalized
          medical advice. Follow local public-health guidance and your own
          clinician&apos;s advice.
        </p>
      </div>
    </main>
  );
}
