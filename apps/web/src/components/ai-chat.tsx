"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AiChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "List all deals over $10k",
  "Show overdue activities",
  "Summarize active projects",
];

export function AiChat({ open, onOpenChange }: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  async function send(text?: string) {
    const userMsg = (text ?? input).trim();
    if (!userMsg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setLoading(true);
    try {
      const result = await api.chat(userMsg, messages);
      setMessages((m) => [...m, { role: "assistant", content: result.response }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: `Something went wrong. Check your API connection and try again. (${(err as Error).message})`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col border-border/80 bg-card p-0 sm:max-w-md">
        <SheetHeader className="h-16 shrink-0 flex-row items-center border-b border-border/80 px-6 py-0">
          <SheetTitle className="flex items-center gap-2.5 text-sm font-semibold uppercase tracking-tight">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            AI Assistant
          </SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="scrollbar-thin flex-1 space-y-6 overflow-y-auto overscroll-contain p-6"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-primary">
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                    Meridian AI
                  </div>
                  <div className="max-w-[90%] rounded-2xl rounded-tl-none border border-border/80 bg-muted/30 p-4 text-sm leading-relaxed shadow-sm">
                    Good afternoon. I&apos;m ready to help you analyze CRM data, manage projects, or generate business
                    insights. What&apos;s on your mind?
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-border/80 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground touch-manipulation"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn("flex flex-col gap-2", msg.role === "user" ? "items-end" : "items-start")}
              >
                <div
                  className={cn(
                    "flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest",
                    msg.role === "user" ? "text-muted-foreground" : "text-primary",
                  )}
                >
                  {msg.role === "assistant" ? (
                    <>
                      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                      Meridian AI
                    </>
                  ) : (
                    <>
                      You
                      <User className="h-3.5 w-3.5" aria-hidden="true" />
                    </>
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-3 text-sm",
                    msg.role === "user"
                      ? "rounded-tr-none bg-primary text-primary-foreground shadow-lg"
                      : "rounded-tl-none border border-border/80 bg-muted/30 text-foreground shadow-sm",
                  )}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex flex-col gap-2" aria-live="polite">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-primary">
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                  Meridian AI
                </div>
                <div className="rounded-2xl rounded-tl-none border border-border/80 bg-muted/30 px-3.5 py-2 text-sm text-muted-foreground">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex shrink-0 gap-2 border-t border-border/80 bg-muted/20 p-4">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Meridian AI…"
              disabled={loading}
              rows={2}
              className="flex min-h-[44px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-base sm:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Message to AI assistant"
            />
            <Button
              size="icon"
              className="shrink-0 touch-manipulation"
              onClick={() => send()}
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
