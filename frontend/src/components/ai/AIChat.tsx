"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/components/feedback/Toast";
import { useAuth } from "@/context/AuthContext";
import { Button, Card, CardHeader, CardContent, EmptyState, Icon } from "@/components/ui";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ActionItem[];
}

interface ActionItem {
  type: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface SSEEvent {
  text: string;
  done: boolean;
  actions?: ActionItem[] | null;
}

/**
 * AI Financial Coach chat.
 *
 * Streams `POST /api/ai/coach/chat` (Node proxy → FastAPI SSE) using a raw
 * `fetch` with the JWT from sessionStorage in the Authorization header.
 * We don't use `authFetch` here because the response is an SSE stream —
 * `authFetch`/`apiFetch` calls `.json()` which breaks streaming.
 * Streaming is cancellable via AbortController.
 */
export function AIChat({ householdId }: { householdId?: number }) {
  const { t } = useLanguage();
  const toast = useToast();
  const { token } = useAuth();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // householdId is resolved server-side from the authenticated user; kept on
  // the prop for API symmetry but not appended to the request.
  void householdId;

  // Auto-scroll to the latest message whenever the list changes (incl. streams).
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    // Placeholder for the streaming response.
    const assistantId = `assistant-${Date.now()}`;
    let accumulatedContent = "";
    let accumulatedActions: ActionItem[] | null = null;

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", actions: [] },
    ]);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/ai/coach/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr || dataStr === "[DONE]") continue;

          try {
            const event: SSEEvent = JSON.parse(dataStr);
            if (event.text) accumulatedContent += event.text;
            if (event.actions) accumulatedActions = event.actions;

            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: accumulatedContent, actions: accumulatedActions || [] }
                  : m,
              ),
            );
          } catch {
            // Ignore malformed SSE chunks.
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("AI chat error:", err);
      toast.error(t("aiChat.error"));
      // Drop the partial assistant message on failure.
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  };

  const handleClear = () => {
    abortControllerRef.current?.abort();
    setMessages([]);
  };

  // Show empty state when there are no user messages (only welcome/empty)
  const hasUserMessages = messages.some((m) => m.role === "user");

  return (
    <Card variant="glass" className="fade-in-up h-full flex flex-col">
      <CardHeader
        title={t("aiChat.title")}
        subtitle={t("aiChat.subtitle")}
        icon={<Icon name="messageSquare" className="h-5 w-5" />}
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={messages.length === 0}
            aria-label={t("common.clear") || "Clear"}
            title={t("common.clear") || "Clear"}
          >
            <Icon name="trash2" className="h-4 w-4" />
          </Button>
        }
      />
      <CardContent className="flex-1 flex flex-col min-h-0">
        {/* Messages */}
        <div
          className="flex-1 space-y-4 overflow-y-auto pb-4 pr-1"
          role="log"
          aria-live="polite"
          aria-label={t("aiChat.title")}
        >
          // Show empty state when there are no user messages (only welcome/empty)
          {!hasUserMessages ? (
            // Empty state with welcome message and quick suggestions
            <EmptyState
              icon={<Icon name="messageSquare" className="h-10 w-10 text-muted" />}
              title={t("aiChat.welcomeTitle") || t("aiChat.title")}
              hint={t("aiChat.welcomeDescription")}
              action={
                <div className="mt-4 flex flex-wrap gap-2 justify-center" role="list" aria-label={t("aiChat.suggestionsLabel")}>
                  {["aiChat.suggest1", "aiChat.suggest2", "aiChat.suggest3", "aiChat.suggest4"].map((key) => (
                    <Button key={key} variant="ghost" size="sm" onClick={() => setInput(t(key))}>
                      {t(key)}
                    </Button>
                  ))}
                </div>
              }
              className="h-full flex flex-col justify-center"
            />
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
                      <Icon name="spark" className="h-4 w-4" />
                    </span>
                  )}
                  <div
                    className={`max-w-[80%] ${
                      msg.role === "user"
                        ? "rounded-2xl bg-brand-600 px-4 py-2 text-white"
                        : "rounded-2xl bg-ink-100 px-4 py-2 text-ink-900 dark:bg-ink-800 dark:text-ink-50"
                    }`}
                  >
                    {msg.content ? (
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-ink-500 dark:text-ink-400">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                        <span>{t("aiChat.thinking")}</span>
                      </div>
                    )}

                    {/* Action chips returned by the coach */}
                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.actions.map((action, i) => (
                          <Button
                            key={i}
                            variant="ghost"
                            size="sm"
                            onClick={() => toast.info(action.description)}
                          >
                            <Icon
                              name={action.type === "budget_alert" ? "alert" : "check"}
                              className="h-3 w-3"
                            />
                            {action.description}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                      <Icon name="user" className="h-4 w-4" />
                    </span>
                  )}
                </div>
              ))}

              {/* Streaming indicator */}
              {isStreaming && (
                <div className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
                    <Icon name="spark" className="h-4 w-4" />
                  </span>
                  <div className="rounded-2xl bg-ink-100 px-4 py-2 text-ink-900 dark:bg-ink-800 dark:text-ink-50">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                      <span>{t("aiChat.streaming")}</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isStreaming ? t("aiChat.waiting") : t("aiChat.placeholder")}
            disabled={isStreaming}
            className="input flex-1"
            maxLength={2000}
            aria-label={t("aiChat.inputLabel")}
            autoFocus
          />
          {isStreaming ? (
            <Button
              type="button"
              variant="ghost"
              onClick={handleStop}
              className="shrink-0 min-h-[44px] min-w-[44px]"
              aria-label={t("aiChat.streaming")}
              title={t("aiChat.streaming")}
            >
              <Icon name="x" className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              isLoading={isStreaming}
              disabled={!input.trim()}
              className="shrink-0 min-h-[44px] min-w-[44px]"
              aria-label={t("aiChat.inputLabel")}
            >
              <Icon name="send" className="h-4 w-4" />
            </Button>
          )}
        </form>

        {/* Quick suggestions for returning users (optional, shown below composer) */}
        {!isStreaming && hasUserMessages && messages.length <= 2 && (
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="list"
            aria-label={t("aiChat.suggestionsLabel")}
          >
            {["aiChat.suggest1", "aiChat.suggest2", "aiChat.suggest3", "aiChat.suggest4"].map((key) => (
              <Button key={key} variant="ghost" size="sm" onClick={() => setInput(t(key))}>
                {t(key)}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
