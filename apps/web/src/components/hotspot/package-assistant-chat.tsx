"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiRequestError } from "@/lib/api-client";
import { Button, Card, Input } from "@/components/ui";
import { IconSparkles, IconSend, IconCheck } from "@/components/icons";

interface AiAssistantConfigStatus {
  configured: boolean;
  isActive: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actionsTaken?: string[];
}

interface ChatResponse {
  reply: string;
  actionsTaken: string[];
}

/** A real chat panel over the package tools every other part of this page already uses (see
 *  apps/api/src/routes/ai-assistant.ts) — the assistant never previews or simulates a change,
 *  it performs the same create/update/deactivate calls the manual form does, so invalidating
 *  the packages query after each reply is what makes the list below reflect what actually
 *  happened, not what the model merely said it did. */
export function PackageAssistantChat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");

  const { data: status } = useQuery({
    queryKey: ["ai-assistant-config"],
    queryFn: () => apiFetch<AiAssistantConfigStatus>("/api/v1/ai-assistant/config"),
  });

  const send = useMutation({
    mutationFn: (message: string) =>
      apiFetch<ChatResponse>("/api/v1/ai-assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          message,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      }),
    onSuccess: (result) => {
      setMessages((prev) => [...prev, { role: "assistant", content: result.reply, actionsTaken: result.actionsTaken }]);
      if (result.actionsTaken.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["hotspot-packages-staff"] });
      }
    },
    onError: (err) => {
      const message = err instanceof ApiRequestError ? err.message : "Something went wrong — try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: message }]);
    },
  });

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || send.isPending) return;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    send.mutate(trimmed);
  };

  if (!status?.configured) {
    return (
      <Card className="border-violet-500/30 bg-violet-50/20 dark:bg-violet-950/20">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <IconSparkles size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Manage packages by describing what you want
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Add your Anthropic API key in{" "}
              <Link href="/settings/ai-assistant" className="font-medium text-violet-600 hover:underline dark:text-violet-400">
                Settings &gt; AI Assistant
              </Link>{" "}
              to turn this on.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-violet-500/30 bg-violet-50/10 dark:bg-violet-950/10">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <IconSparkles size={16} />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Package Assistant</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">e.g. &quot;add a 2 hour package for KES 50&quot;</p>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="mb-3 max-h-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 dark:border-obsidian-800 dark:bg-obsidian-950">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                  m.role === "user"
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-800 dark:bg-obsidian-800 dark:text-slate-200"
                }`}
              >
                {m.content}
              </span>
              {m.actionsTaken && m.actionsTaken.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {m.actionsTaken.map((a, j) => (
                    <p key={j} className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <IconCheck size={12} /> {a}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
          {send.isPending && <p className="text-xs text-slate-400">Thinking...</p>}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Describe the change you want..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={send.isPending}
        />
        <Button onClick={handleSend} disabled={send.isPending || !input.trim()} className="shrink-0 gap-1.5 px-3">
          <IconSend size={14} />
        </Button>
      </div>
    </Card>
  );
}
