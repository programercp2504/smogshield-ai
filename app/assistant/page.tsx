"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAQIData } from "@/app/providers/aqi-data-provider";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
};

type ChatLocation = {
  latitude: number;
  longitude: number;
  locationName: string;
  timezone: string;
  region: string;
  country: string;
};

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_ENTRY_LENGTH = 2_000;
const MAX_HISTORY_CHARACTERS = 10_000;

function isChatReply(value: unknown): value is { reply: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "reply" in value &&
    typeof value.reply === "string" &&
    value.reply.trim().length > 0
  );
}

function getHistory(messages: ChatMessage[]) {
  const recentMessages: Array<Pick<ChatMessage, "role" | "content">> = [];
  let totalCharacters = 0;

  for (
    let index = messages.length - 1;
    index >= 0 && recentMessages.length < MAX_HISTORY_MESSAGES;
    index -= 1
  ) {
    const { role, content } = messages[index];
    if (content.length > MAX_HISTORY_ENTRY_LENGTH) {
      continue;
    }
    if (totalCharacters + content.length > MAX_HISTORY_CHARACTERS) {
      break;
    }

    recentMessages.push({ role, content });
    totalCharacters += content.length;
  }

  return recentMessages.reverse();
}

const quickPrompts = [
  "What does today's AQI mean for my health?",
  "Is it safe to go outside today?",
  "How can I improve my indoor air quality?",
  "What precautions should I take in unhealthy air?",
];

const followUpTopics = [
  {
    pattern: /\b(aqi|air quality|air-quality|category|pollution level|current reading)\b/,
    suggestions: (locationName?: string) => {
      const location = locationName ? ` in ${locationName}` : "";
      return [
        `What does this AQI category mean for outdoor activities${location}?`,
        `Which available pollutant readings stand out${location}?`,
        `What should I prioritize today${location}?`,
      ];
    },
  },
  {
    pattern:
      /\b(pm2\.5|pm10|no2|o3|so2|pollutants?|particulate matter|nitrogen dioxide|ozone|carbon monoxide|sulphur dioxide|sulfur dioxide|\bco\b)\b/,
    suggestions: (locationName?: string) => {
      const location = locationName ? ` in ${locationName}` : "";
      return [
        `Which available pollutant readings are most concerning${location}?`,
        "How can PM2.5 and PM10 affect health?",
        `How should these readings affect outdoor plans${location}?`,
      ];
    },
  },
  {
    pattern: /\b(children?|kids?|older adults?|elderly|seniors?|asthma|respiratory|sensitive groups?)\b/,
    suggestions: (locationName?: string) => {
      const location = locationName ? ` in ${locationName}` : "";
      return [
        `What precautions should children and older adults take${location}?`,
        "What should people with asthma or respiratory sensitivities consider?",
        `When should sensitive groups limit outdoor activity${location}?`,
      ];
    },
  },
  {
    pattern: /\b(health|precautions?|risk|wellbeing|medical advice)\b/,
    suggestions: (locationName?: string) => {
      const location = locationName ? ` in ${locationName}` : "";
      return [
        `What precautions are appropriate for generally healthy adults${location}?`,
        `What should children and older adults consider${location}?`,
        "What should people with respiratory sensitivities consider?",
      ];
    },
  },
  {
    pattern: /\b(outdoor|exercise|activities|activity|walk|walking|run|running|sport|exertion)\b/,
    suggestions: (locationName?: string) => {
      const location = locationName ? ` in ${locationName}` : "";
      return [
        `Is outdoor exercise advisable${location}?`,
        `How can I reduce exposure during essential outdoor trips${location}?`,
        "What indoor activities could I choose instead?",
      ];
    },
  },
  {
    pattern: /\b(indoor|ventilat\w*|air purifier|purifier|windows?|home)\b/,
    suggestions: (locationName?: string) => {
      const location = locationName ? ` in ${locationName}` : "";
      return [
        `Should I open windows based on outdoor air quality${location}?`,
        "What practical steps can improve indoor air quality?",
        "What are the limits of a portable air cleaner?",
      ];
    },
  },
  {
    pattern: /\b(masks?|respirator|protection|protective|filter)\b/,
    suggestions: (locationName?: string) => {
      const location = locationName ? ` in ${locationName}` : "";
      return [
        `When might a well-fitting mask help outdoors${location}?`,
        "What are the limits of masks for air pollution?",
        `What other steps can reduce exposure${location}?`,
      ];
    },
  },
];

function getFollowUpSuggestions(
  userMessage: string,
  assistantResponse: string,
  locationName?: string,
): string[] {
  const userText = userMessage.toLowerCase();
  const assistantText = assistantResponse.toLowerCase();
  const topics = followUpTopics
    .map((topic) => ({
      ...topic,
      relevance:
        (topic.pattern.test(userText) ? 2 : 0) +
        (topic.pattern.test(assistantText) ? 1 : 0),
    }))
    .filter((topic) => topic.relevance > 0)
    .sort((first, second) => second.relevance - first.relevance);
  const candidates =
    topics.length > 0
      ? topics[0].suggestions(locationName)
      : [
          "How should I interpret an AQI reading?",
          "What practical steps can improve indoor air quality?",
          "What precautions should sensitive groups consider outdoors?",
        ];

  return [...new Set(candidates)].slice(0, 3);
}

const assistantMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h2 className="mb-2 mt-5 text-2xl font-bold tracking-tight text-slate-900 first:mt-0 dark:text-white">
      {children}
    </h2>
  ),
  h2: ({ children }) => (
    <h3 className="mb-2 mt-5 text-xl font-bold tracking-tight text-slate-900 first:mt-0 dark:text-white">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-2 mt-4 text-lg font-bold text-emerald-800 first:mt-0 dark:text-emerald-300">
      {children}
    </h4>
  ),
  h4: ({ children }) => (
    <h5 className="mb-1.5 mt-4 text-base font-semibold text-emerald-800 first:mt-0 dark:text-emerald-300">
      {children}
    </h5>
  ),
  h5: ({ children }) => (
    <h6 className="mb-1.5 mt-3 text-sm font-semibold text-emerald-800 first:mt-0 dark:text-emerald-300">
      {children}
    </h6>
  ),
  h6: ({ children }) => (
    <h6 className="mb-1 mt-3 text-xs font-semibold text-emerald-800 first:mt-0 dark:text-emerald-300">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="mb-3 break-words text-sm leading-6 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-emerald-600 dark:marker:text-emerald-400 [&_ol]:my-1 [&_ul]:my-1">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-emerald-700 dark:marker:text-emerald-400 [&_ol]:my-1 [&_ul]:my-1">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="break-words pl-1">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-emerald-300 bg-emerald-50/60 px-4 py-2 text-slate-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-slate-200 [&_p]:mb-2 [&_p:last-child]:mb-0">
      {children}
    </blockquote>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-slate-800 dark:text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-slate-700 dark:text-slate-200">{children}</em>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:text-emerald-300 dark:decoration-emerald-700 dark:hover:text-emerald-200 dark:focus-visible:outline-emerald-400"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-emerald-100 dark:border-emerald-900" />,
  br: () => <br />,
  table: ({ children }) => (
    <div
      role="region"
      aria-label="Scrollable assistant response table"
      tabIndex={0}
      className="my-4 max-w-full min-w-0 overflow-x-auto rounded-xl border border-emerald-100 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:outline-emerald-400"
    >
      <table className="w-full min-w-max border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
      {children}
    </thead>
  ),
  th: ({ children, style }) => (
    <th
      scope="col"
      style={style}
      className="border-b border-emerald-100 px-3 py-2.5 font-semibold dark:border-emerald-900"
    >
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td
      style={style}
      className="border-b border-slate-100 px-3 py-2.5 text-slate-600 last:border-b-0 dark:border-slate-700 dark:text-slate-200"
    >
      {children}
    </td>
  ),
  pre: ({ children }) => (
    <div
      role="region"
      aria-label="Scrollable code block"
      tabIndex={0}
      className="my-4 max-w-full min-w-0 overflow-x-auto rounded-xl border border-emerald-900/10 bg-emerald-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:border-emerald-800 dark:focus-visible:outline-emerald-400"
    >
      <pre className="w-max min-w-full p-4">{children}</pre>
    </div>
  ),
  code: ({ children, className }) => {
    const isCodeBlock =
      Boolean(className) ||
      (typeof children === "string" && children.endsWith("\n"));

    return (
      <code
        className={
          isCodeBlock
            ? `font-mono text-xs leading-5 text-emerald-50 ${className ?? ""}`
            : "break-all rounded-md bg-emerald-100/80 px-1.5 py-0.5 font-mono text-[0.85em] text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200"
        }
      >
        {children}
      </code>
    );
  },
};

export default function AssistantPage() {
  const { selectedLocation, isLocationReady } = useAQIData();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const requestInProgress = useRef(false);
  const nextMessageId = useRef(0);

  async function sendMessage(draft = message) {
    const submittedMessage = draft.trim();
    if (!submittedMessage || requestInProgress.current) {
      return;
    }

    if (!isLocationReady) {
      setRequestError(
        "Please wait while your selected location is being restored before sending a message.",
      );
      return;
    }

    const location: ChatLocation | null = selectedLocation
      ? {
          latitude: selectedLocation.latitude,
          longitude: selectedLocation.longitude,
          locationName: selectedLocation.name,
          timezone: selectedLocation.timezone,
          region: selectedLocation.admin1 ?? "",
          country: selectedLocation.country,
        }
      : null;

    requestInProgress.current = true;
    setIsLoading(true);
    setRequestError(null);
    setMessage("");
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: nextMessageId.current++,
        role: "user",
        content: submittedMessage,
      },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: submittedMessage,
          history: getHistory(messages),
          location,
        }),
        cache: "no-store",
      });
      const result: unknown = await response.json();

      if (!response.ok || !isChatReply(result)) {
        throw new Error("The assistant returned an invalid response.");
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: nextMessageId.current++,
          role: "assistant",
          content: result.reply.trim(),
          suggestions: getFollowUpSuggestions(
            submittedMessage,
            result.reply,
            location?.locationName,
          ),
        },
      ]);
    } catch {
      setRequestError(
        "Sorry, I couldn’t get a response right now. Please try again in a moment.",
      );
    } finally {
      requestInProgress.current = false;
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7faf8] text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <header className="border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-7 lg:px-10">
          <Link
            href="/"
            className="flex items-center gap-3 focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:focus-visible:outline-emerald-400"
          >
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-2xl bg-emerald-600 text-xl text-white shadow-sm shadow-emerald-200">
              ✳
            </span>
            <span className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white">
              SmogShield <span className="text-emerald-700 dark:text-emerald-600">AI</span>
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white dark:focus-visible:outline-emerald-400"
          >
            <span aria-hidden="true">←</span>
            Back to dashboard
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-8 sm:px-7 sm:py-12 lg:px-10">
        <div className="mb-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-slate-900 dark:text-emerald-200">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Connected to SmogShield AI
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            AI Air Quality Assistant
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-300">
            Ask questions about air quality and get practical guidance to help you breathe easier.
          </p>
          <p
            aria-live="polite"
            className="mt-2 text-xs text-slate-500 dark:text-slate-400"
          >
            {!isLocationReady
              ? "Restoring the selected city before using location context."
              : selectedLocation
                ? `Current location context: ${selectedLocation.name} · ${selectedLocation.timezone}`
                : "No city selected · using Kolkata as the default current AQI context."}
          </p>
        </div>

        <section
          aria-label="Assistant conversation"
          aria-busy={isLoading}
          className="overflow-hidden rounded-[26px] border border-slate-100 bg-white shadow-[0_8px_30px_rgba(27,75,54,0.05)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-lg text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                ✳
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  SmogShield assistant
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Air quality guidance
                </p>
              </div>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700 sm:inline-flex dark:bg-emerald-900/40 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          </div>

          <div className="min-h-[280px] space-y-5 px-4 py-6 sm:min-h-[320px] sm:px-7 sm:py-8">
            {messages.length === 0 ? (
              <div className="flex max-w-2xl items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                >
                  ✳
                </span>
                <div className="rounded-2xl rounded-tl-md border border-slate-100 bg-[#f8faf9] px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Welcome to SmogShield AI.
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Ask me about AQI, outdoor precautions, pollution, or ways to improve your
                    indoor air quality.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((chatMessage, index) => (
                <div
                  key={chatMessage.id}
                  className={`flex items-start gap-3 ${
                    chatMessage.role === "user" ? "justify-end" : ""
                  }`}
                >
                  {chatMessage.role === "assistant" && (
                    <span
                      aria-hidden="true"
                      className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    >
                      ✳
                    </span>
                  )}
                  <div className="min-w-0 max-w-[85%] sm:max-w-2xl">
                    <div
                      className={`rounded-2xl px-4 py-3.5 ${
                        chatMessage.role === "user"
                          ? "rounded-tr-md border border-emerald-600 bg-emerald-600 text-white"
                          : "rounded-tl-md border border-slate-100 bg-[#f8faf9] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {chatMessage.role === "assistant" ? (
                        <div className="min-w-0 max-w-full break-words text-sm leading-6 text-slate-600 dark:text-slate-200">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={assistantMarkdownComponents}
                          >
                            {chatMessage.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">
                          {chatMessage.content}
                        </p>
                      )}
                    </div>
                    {chatMessage.role === "assistant" &&
                      index === messages.length - 1 &&
                      chatMessage.suggestions && (
                        <div
                          className="mt-3"
                          role="group"
                          aria-label="Suggested follow-up questions"
                        >
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                            Continue the conversation
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {chatMessage.suggestions.map((suggestion) => (
                              <button
                                key={suggestion}
                                type="button"
                                disabled={isLoading}
                                onClick={() => void sendMessage(suggestion)}
                                className="rounded-full border border-emerald-100 bg-white px-3 py-2 text-left text-xs font-medium leading-4 text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-slate-800 dark:text-emerald-200 dark:hover:border-emerald-600 dark:hover:bg-emerald-950/50 dark:focus-visible:outline-emerald-400 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-300 dark:disabled:opacity-100"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              ))
            )}

            {isLoading && (
              <div className="flex items-start gap-3" role="status" aria-live="polite">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                >
                  ✳
                </span>
                <div className="rounded-2xl rounded-tl-md border border-slate-100 bg-[#f8faf9] px-4 py-3.5 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    SmogShield AI is responding…
                  </p>
                </div>
              </div>
            )}

            {requestError && (
              <p
                role="alert"
                className="ml-11 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-200"
              >
                {requestError}
              </p>
            )}

            <div className="mt-8">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
                Try asking
              </p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setMessage(prompt)}
                    className="group flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-xs font-medium leading-5 text-slate-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:text-[13px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200 dark:focus-visible:outline-emerald-400"
                  >
                    <span>{prompt}</span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-base text-slate-300 transition-colors group-hover:text-emerald-600 dark:text-slate-500 dark:group-hover:text-emerald-300"
                    >
                      →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="border-t border-slate-100 bg-white p-4 sm:px-6 sm:py-5 dark:border-slate-800 dark:bg-slate-900"
          >
            <label htmlFor="assistant-message" className="sr-only">
              Your message
            </label>
            <div className="flex items-end gap-2 rounded-2xl border border-slate-500 bg-white p-2 shadow-sm focus-within:border-emerald-700 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-600 focus-within:ring-4 focus-within:ring-emerald-50 dark:border-slate-400 dark:bg-slate-800 dark:focus-within:border-emerald-500 dark:focus-within:outline-emerald-400 dark:focus-within:ring-emerald-950/60">
              <textarea
                id="assistant-message"
                rows={1}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                maxLength={MAX_MESSAGE_LENGTH}
                placeholder="Ask a question about air quality..."
                className="max-h-32 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-500 dark:text-slate-100 dark:placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!message.trim() || isLoading}
                aria-label={isLoading ? "Sending message" : "Send message"}
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 dark:focus-visible:outline-emerald-400 dark:disabled:bg-emerald-900 dark:disabled:text-emerald-200 dark:disabled:opacity-100"
              >
                <span className="hidden sm:inline">{isLoading ? "Sending" : "Send"}</span>
                <span aria-hidden="true" className="text-base">
                  {isLoading ? "…" : "↑"}
                </span>
              </button>
            </div>
            <p className="mt-2 px-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Press Enter to send · Shift + Enter for a new line.
            </p>
          </form>
        </section>

        <p className="mt-5 text-center text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Information provided by AI is for general informational purposes only and is not a
          substitute for professional medical advice.
        </p>
      </main>
    </div>
  );
}