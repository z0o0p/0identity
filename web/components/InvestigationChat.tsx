import styles from "./InvestigationChat.module.css";
import { isToolUIPart, getToolName } from "ai";
import { useState, type FormEvent } from "react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import {
  MAX_INVESTIGATION_QUESTION_CHARS,
  investigationAgentName,
} from "../../src/agents/investigation-scope";
import type { HistorySource } from "../../src/storage/types";
import { useContentMotion } from "../hooks/motion";

interface InvestigationChatProps {
  source: HistorySource;
  sessionId?: string | undefined;
}

function messageText(
  parts: ReadonlyArray<{ type: string; text?: string }>,
): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("");
}

export function InvestigationChat({
  source,
  sessionId,
}: InvestigationChatProps) {
  const [input, setInput] = useState("");
  const agent = useAgent({
    agent: "InvestigationAgent",
    name: investigationAgentName(source),
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
  const motion = useContentMotion<HTMLElement>(
    `.${styles["chat-message"]}:last-child, .${styles["investigation-empty"]}`,
    [messages.length],
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput("");
    void sendMessage({ text: prompt }, { body: { sessionId: sessionId ?? null } });
  }

  return (
    <section
      ref={motion}
      className={styles["investigation-panel"]}
      aria-labelledby="investigation-title"
    >
      <div
        className={[
          styles["panel-heading"],
          styles["investigation-heading"],
        ].join(" ")}
      >
        <div>
          <h3 id="investigation-title">Investigation agent</h3>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className={styles["quiet-button"]}
            onClick={clearHistory}
            disabled={busy}
          >
            Clear chat
          </button>
        )}
      </div>

      <div className={styles["investigation-messages"]} aria-live="polite">
        {messages.length === 0 ? (
          <div className={styles["investigation-empty"]}>
            <p>Trace suspicious activity, inspect score evidence, or compare anonymous subject continuity.</p>
            <p>I can find sessions and follow the evidence using read-only investigation tools.</p>
          </div>
        ) : (
          messages.map((message) => {
            const text = messageText(message.parts);
            const toolParts = message.parts.filter(isToolUIPart);
            if (!text && message.role !== "assistant") return null;
            return (
              <article
                key={message.id}
                className={[
                  styles["chat-message"],
                  styles[`chat-message-${message.role}`] ?? "",
                ].join(" ")}
              >
                <strong>{message.role === "user" ? "You" : "0identity"}</strong>
                {toolParts.length > 0 && (
                  <ul className={styles["tool-activity"]} aria-label="Investigation activity">
                    {toolParts.map((part) => (
                      <li key={part.toolCallId}>
                        <span>{getToolName(part).replace(/([A-Z])/g, " $1")}</span>
                        <strong>{part.state === "output-available" ? "Complete"
                          : part.state === "output-error" ? "Failed"
                          : part.state === "output-denied" ? "Denied" : "Working…"}</strong>
                      </li>
                    ))}
                  </ul>
                )}
                {text && <p>{text}</p>}
              </article>
            );
          })
        )}
        {isRecovering && (
          <p className={styles["chat-state"]}>
            Recovering the interrupted response…
          </p>
        )}
        {error && (
          <p className={styles["chat-error"]} role="alert">
            The investigation assistant is temporarily unavailable.
          </p>
        )}
        {agent.connectionError && (
          <p className={styles["chat-error"]} role="alert">
            The investigation connection is unavailable.
          </p>
        )}
      </div>

      <div className={styles["investigation-actions"]} aria-label="Investigation shortcuts">
        {(sessionId
          ? ["Investigate this session", "Explain its risk flags", "Compare with related sessions"]
          : ["Investigate recent suspicious sessions", "Review uncertain continuity matches"]
        ).map((task) => (
          <button key={task} type="button" disabled={busy}
            onClick={() => void sendMessage({ text: task }, { body: { sessionId: sessionId ?? null } })}>
            {task}
          </button>
        ))}
      </div>
      <form className={styles["investigation-form"]} onSubmit={submit}>
        <div>
          <textarea
            id="investigation-question"
            aria-label="Investigation request"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={MAX_INVESTIGATION_QUESTION_CHARS}
            rows={2}
            placeholder="Describe what you want to investigate…"
          />
          <button
            type={busy ? "button" : "submit"}
            onClick={busy ? () => stop() : undefined}
            disabled={!busy && !input.trim()}
          >
            {busy ? "Stop" : "Investigate"}
          </button>
        </div>
      </form>
    </section>
  );
}
