"use client";

import { useState, useRef, useCallback, useEffect, FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/components/feedback/Toast";
import { Button, Card, Icon } from "@/components/ui";

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

export function AIChat({ householdId }: { householdId?: number }) {
  const { t } = useLanguage();
  const { user, authFetch } = useAuth();
  const toast = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Initial welcome message
  useEffect(() => {
    if (messages.length === 0 && !isLoading) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: t("aiChat.welcome"),
        },
      ]);
    }
  }, [messages.length, t]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || isStreaming) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsStreaming(true);

    // Create a placeholder for the streaming response
    const assistantId = `assistant-${Date.now()}`;
    let accumulatedContent = "";
    let accumulatedActions: ActionItem[] | null = null;

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", actions: [] },
    ]);

    abortControllerRef.current = new AbortController();

    try {
      // Call the Node.js backend proxy which forwards to FastAPI
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/ai/coach/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // authFetch adds Authorization header automatically
        },
        credentials: "include",
        body: JSON.stringify({ message }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      // Handle SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");

        // Keep the last incomplete line in buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr || dataStr === "[DONE]") continue;

          try {
            const event: SSEEvent = JSON.parse(dataStr);
            if (event.text) {
              accumulatedContent += event.text;
            }
            if (event.actions) {
              accumulatedActions = event.actions;
            }

            // Update the streaming message
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: accumulatedContent, actions: accumulatedActions || [] }
                  : m
              )
            );
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      console.error("AI chat error:", err);
      toast.error(t("aiChat.error") || "Failed to get response");
      // Remove the partial assistant message on error
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
    setMessages([]);
  };

  return (
    <Card className="card-pad card-hover h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl brand-gradient text-white shadow-pop">
            <Icon name="messageSquare" className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-ink-900 dark:text-ink-50">
              {t("aiChat.title")}
            </h3>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {t("aiChat.subtitle")}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClear} disabled={messages.length <= 1}>
          <Icon name="trash2" className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-4" role="log" aria-live="polite">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
          >
            {msg.role === "assistant" && (
              <span className="shrink-0 grid h-8 w-8 place-items-center rounded-xl brand-gradient text-white">
                <Icon name="spark" className="h-4 w-4" />
              </span>
            )}
            <div
              className={`max-w-[80%] ${
                msg.role === "user"
                  ? "rounded-2xl bg-brand-600 px-4 py-2 text-white"
                  : "rounded-2xl bg-ink-100 dark:bg-ink-800 px-4 py-2 text-ink-900 dark:text-ink-50"
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

              {/* Action buttons from AI */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {msg.actions.map((action, i) => (
                    <Button
                      key={i}
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        toast.info(action.description);
                        // Could trigger specific actions here
                      }}
                    >
                      <Icon name={action.type === "budget_alert" ? "alert" : "check"} className="h-3 w-3" />
                      {action.description}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <span className="shrink-0 grid h-8 w-8 place-items-center rounded-xl bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300">
                <Icon name="user" className="h-4 w-4" />
              </span>
            )}
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex gap-3">
            <span className="shrink-0 grid h-8 w-8 place-items-center rounded-xl brand-gradient text-white">
              <Icon name="spark" className="h-4 w-4" />
            </span>
            <div className="rounded-2xl bg-ink-100 dark:bg-ink-800 px-4 py-2 text-ink-900 dark:text-ink-50">
              <div className="flex items-center gap-2 text-sm">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                <span>{t("aiChat.streaming")}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isStreaming ? t("aiChat.waiting") : t("aiChat.placeholder")}
          disabled={isStreaming}
          className="flex-1 input"
          maxLength={2000}
          aria-label={t("aiChat.inputLabel")}
        />
        {isStreaming ? (
          <Button type="button" variant="ghost" onClick={handleStop} className="shrink-0">
            <Icon name="x" className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim() || isLoading} className="shrink-0">
            {isLoading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Icon name="send" className="h-4 w-4" />
            )}
          </Button>
        )}
      </form>

      {/* Quick suggestions */}
      {!isStreaming && messages.length <= 1 && (
        <div className="mt-4 flex flex-wrap gap-2" role="list" aria-label={t("aiChat.suggestionsLabel")}>
          {[
            "aiChat.suggest1",
            "aiChat.suggest2",
            "aiChat.suggest3",
            "aiChat.suggest4",
          ].map((key, i) => (
            <Button
              key={key}
              variant="ghost"
              size="sm"
              onClick={() => setInput(t(key))}
            >
              {t(key)}
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}