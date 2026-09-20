import { useState, type FormEvent } from "react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import {
  MAX_INVESTIGATION_QUESTION_CHARS,
  investigationAgentName,
} from "../../src/agents/investigation-scope";
import type { HistorySource } from "../../src/storage/types";

interface InvestigationChatProps {
  source: HistorySource;
  sessionId: string;
}

function messageText(parts: ReadonlyArray<{ type: string; text?: string }>): string {
  return parts.filter(part => part.type === "text").map(part => part.text ?? "").join("");
}

export function InvestigationChat({ source, sessionId }: InvestigationChatProps) {
  const [input, setInput] = useState("");
  const agent = useAgent({
    agent: "InvestigationAgent",
    name: investigationAgentName(source, sessionId),
  });
  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    clearHistory,
    isRecovering,
  } = useAgentChat({ agent });
  const busy = status === "submitted" || status === "streaming" || isRecovering;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    void sendMessage({ text: prompt });
  }

  return (
    <section className="investigation-panel" aria-labelledby="investigation-title">
      <div className="panel-heading investigation-heading">
        <div>
          <p className="eyebrow">Workers AI investigation</p>
          <h3 id="investigation-title">Ask about this session</h3>
          <p>Answers are read-only and grounded in persisted evidence.</p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="quiet-button" onClick={clearHistory} disabled={busy}>Clear chat</button>
        )}
      </div>

      <div className="investigation-messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="investigation-empty">
            <p>Try “Why did this session receive its human score?” or “Explain the continuity result.”</p>
          </div>
        ) : messages.map(message => {
          const text = messageText(message.parts);
          if (!text && message.role !== "assistant") return null;
          return (
            <article key={message.id} className={`chat-message chat-message-${message.role}`}>
              <strong>{message.role === "user" ? "You" : "0identity"}</strong>
              <p>{text || "Reviewing structured evidence…"}</p>
            </article>
          );
        })}
        {isRecovering && <p className="chat-state">Recovering the interrupted response…</p>}
        {error && <p className="chat-error" role="alert">The investigation assistant is temporarily unavailable.</p>}
        {agent.connectionError && <p className="chat-error" role="alert">The investigation connection is unavailable.</p>}
      </div>

      <form className="investigation-form" onSubmit={submit}>
        <label htmlFor={`investigation-${sessionId}`}>Question about <code>{sessionId}</code></label>
        <div>
          <textarea
            id={`investigation-${sessionId}`}
            value={input}
            onChange={event => setInput(event.target.value)}
            maxLength={MAX_INVESTIGATION_QUESTION_CHARS}
            rows={3}
            placeholder="Ask about scores, flags, continuity evidence, or related sessions"
            disabled={busy}
          />
          <button type={busy ? "button" : "submit"} onClick={busy ? () => stop() : undefined} disabled={!busy && !input.trim()}>
            {busy ? "Stop" : "Ask"}
          </button>
        </div>
      </form>
    </section>
  );
}
