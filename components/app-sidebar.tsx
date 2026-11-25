"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAQIData } from "@/app/providers/aqi-data-provider";

const navigationItems = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "AQI Forecast", href: "/forecast", icon: "forecast" },
  { label: "Health Alerts", href: "/health-alerts", icon: "health" },
  { label: "City Comparison", href: "/compare", icon: "compare" },
  { label: "AI Insights", href: "/insights", icon: "insights" },
  { label: "AI Assistant", href: "/assistant", icon: "assistant" },
] as const;

type SidebarIconName = (typeof navigationItems)[number]["icon"];

function SidebarIcon({ name }: { name: SidebarIconName }) {
  const commonProps = {
    "aria-hidden": true,
    className: "size-[18px] shrink-0",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    viewBox: "0 0 24 24",
  };

  switch (name) {
    case "dashboard":
      return (
        <svg {...commonProps}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "forecast":
      return (
        <svg {...commonProps}>
          <path d="M3.5 18.5h17" />
          <path d="m5 15 4-4 3 2 6-7 2 2" />
          <path d="M18 8h2v2" />
        </svg>
      );
    case "health":
      return (
        <svg {...commonProps}>
          <path d="M12 20s-7.5-4.4-7.5-10.2A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.7C19.5 15.6 12 20 12 20Z" />
          <path d="M7.5 12h3l1.2-2.2 1.7 4.4 1.1-2.2h2" />
        </svg>
      );
    case "compare":
      return (
        <svg {...commonProps}>
          <path d="M4 8h15" />
          <path d="m16 5 3 3-3 3" />
          <path d="M20 16H5" />
          <path d="m8 13-3 3 3 3" />
        </svg>
      );
    case "insights":
      return (
        <svg {...commonProps}>
          <path d="M9 18h6" />
          <path d="M10 21h4" />
          <path d="M8.2 14.5a6.5 6.5 0 1 1 7.6 0c-.9.7-1.3 1.4-1.4 2.5h-4.8c-.1-1.1-.5-1.8-1.4-2.5Z" />
          <path d="M12 2v1.5M4.6 5.1l1 1M19.4 5.1l-1 1" />
        </svg>
      );
    case "assistant":
      return (
        <svg {...commonProps}>
          <path d="M20.5 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.5-.8L4 20l1.3-4.1A7.4 7.4 0 0 1 5 12a7.5 7.5 0 1 1 15.5-.5Z" />
          <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
        </svg>
      );
  }
}

function NavigationLinks({
  pathname,
  label,
  onNavigate,
}: {
  pathname: string;
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label={label} className="space-y-1">
      {navigationItems.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href === "/dashboard" && pathname === "/");

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              isActive
                ? "relative bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            }`}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute left-1.5 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-emerald-700 dark:bg-emerald-300"
              />
            )}
            <SidebarIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function AppSidebar() {
  const pathname = usePathname();
  const { selectedLocation, currentAQI, isAQILoading, isLocationReady } =
    useAQIData();
  const [mobileMenuPathname, setMobileMenuPathname] = useState<string | null>(
    null,
  );
  const mobileMenuOpen = mobileMenuPathname === pathname;
  const currentCity =
    selectedLocation?.name ??
    (isLocationReady ? currentAQI?.city ?? "Kolkata" : "Restoring location...");
  const aqiSummary = isAQILoading
    ? "Loading current AQI"
    : currentAQI
      ? `AQI ${currentAQI.aqi} · ${currentAQI.category}`
      : "AQI unavailable";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-emerald-700 focus:px-4 focus:py-3 focus:font-semibold focus:text-white focus:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:focus:bg-emerald-300 dark:focus:text-slate-900 dark:focus-visible:outline-emerald-400"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col overflow-y-auto border-r border-slate-100 bg-white px-5 py-7 dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <Link href="/dashboard" className="mb-9 flex items-center gap-3 px-2">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-2xl bg-emerald-600 text-xl text-white shadow-sm shadow-emerald-200">
            ✳
          </span>
          <span>
            <span className="block text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
              SmogShield <span className="text-emerald-700 dark:text-emerald-600">AI</span>
            </span>
            <span className="mt-0.5 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Breathe a little easier
            </span>
          </span>
        </Link>

        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
          Workspace
        </p>
        <NavigationLinks pathname={pathname} label="Main navigation" />

        <section
          aria-label="Currently selected city"
          className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 dark:border-slate-700 dark:bg-slate-800"
        >
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Selected city
          </p>
          <p
            aria-live="polite"
            className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white"
          >
            {currentCity}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
            {aqiSummary}
          </p>
          {currentAQI?.isDemo === true && (
            <span className="mt-1 inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              DEMO DATA
            </span>
          )}
        </section>

        <div
          className="mt-auto rounded-2xl bg-gradient-to-br from-emerald-50 to-sky-50 p-4 dark:from-slate-800 dark:to-slate-800"
        >
          <div aria-hidden="true" className="mb-3 flex size-9 items-center justify-center rounded-xl bg-white text-lg text-emerald-600 shadow-sm dark:bg-slate-700">
            ✧
          </div>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            A healthier day starts here
          </p>
          <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Small, informed choices can make a big difference to the air you breathe.
          </p>
          <Link
            href="/dashboard#planner"
            className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300"
          >
            See today&apos;s plan <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-slate-100 px-2 pt-5 dark:border-slate-800">
          <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-200">
            SS
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-slate-800 dark:text-slate-100">
              Personal account
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
              Personal account
            </span>
          </span>
          <span className="ml-auto text-slate-400" aria-hidden="true">
            ···
          </span>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-4 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-lg text-white">
            ✳
          </span>
          <span className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
            SmogShield <span className="text-emerald-700 dark:text-emerald-600">AI</span>
          </span>
        </Link>
        <button
          type="button"
          aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-app-navigation"
          onClick={() =>
            setMobileMenuPathname(mobileMenuOpen ? null : pathname)
          }
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            {mobileMenuOpen ? (
              <path d="m6 6 12 12M18 6 6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </header>

      {mobileMenuOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuPathname(null)}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      )}
      <div
        id="mobile-app-navigation"
        className={
          mobileMenuOpen
            ? "fixed inset-x-3 top-[4.5rem] z-50 max-h-[calc(100dvh-5.25rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 lg:hidden"
            : "hidden"
        }
      >
        <div className="mb-4 rounded-xl bg-emerald-50 px-3 py-2.5 dark:bg-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            Selected city
          </p>
          <p
            aria-live="polite"
            className="mt-1 truncate text-sm font-bold text-slate-900 dark:text-white"
          >
            {currentCity}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-300">
            {aqiSummary}
          </p>
          {currentAQI?.isDemo === true && (
            <span className="mt-1 inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-900 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
              DEMO DATA
            </span>
          )}
        </div>
        <NavigationLinks
          pathname={pathname}
          label="Mobile navigation"
          onNavigate={() => setMobileMenuPathname(null)}
        />
      </div>
    </>
  );
}
