import { useEffect, useRef, useState } from "react";
import type { AssessmentResponse } from "../../src/api/assessment";
import type { SessionListResponse } from "../../src/api/history";
import { SIMULATION_PROFILE_DETAILS, type SimulationProfile } from "../../src/simulator/profiles";
import { getSimulationHistory, getSimulationSession } from "../lib/assessment";

interface SessionHistoryProps {
  refreshKey: number;
  onSelect: (assessment: AssessmentResponse, profile: SimulationProfile) => void;
}

type SessionSummary = SessionListResponse["sessions"][number];

function displayTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionHistory({ refreshKey, onSelect }: SessionHistoryProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const detailRequest = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => detailRequest.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void getSimulationHistory(controller.signal)
      .then(value => {
        setSessions(value);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [refreshKey]);

  async function selectSession(session: SessionSummary) {
    if (!session.simulationProfile) return;
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setSelectedId(session.sessionId);
    try {
      const detail = await getSimulationSession(session.sessionId, controller.signal);
      if (detail.simulationProfile) onSelect(detail.assessment, detail.simulationProfile);
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    }
  }

  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-heading">
        <div>
          <p className="eyebrow">Durable history</p>
          <h2 id="history-title">Recent simulations</h2>
        </div>
        <span>Latest 12</span>
      </div>

      {status === "error" ? (
        <p className="history-message" role="alert">Assessment history is temporarily unavailable.</p>
      ) : sessions.length === 0 ? (
        <p className="history-message">{status === "loading" ? "Loading history…" : "Run a simulation to create the first stored session."}</p>
      ) : (
        <ul className="history-list">
          {sessions.map(session => (
            <li key={session.sessionId}>
              <button
                type="button"
                className={selectedId === session.sessionId ? "selected" : undefined}
                onClick={() => void selectSession(session)}
              >
                <span>
                  <strong>{session.simulationProfile ? SIMULATION_PROFILE_DETAILS[session.simulationProfile].label : "Simulation"}</strong>
                  <small>{displayTime(session.createdAt)} · {session.flagCodes.length} flag{session.flagCodes.length === 1 ? "" : "s"}</small>
                </span>
                <span className="history-score">
                  <strong>{session.humanScore.toFixed(1)}</strong>
                  <small>{Math.round(session.humanConfidence * 100)}% confidence</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
