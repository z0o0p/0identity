import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardOverview } from "../../src/api/dashboard";
import type { SessionDetailResponse, SessionListResponse } from "../../src/api/history";
import type { HistorySource } from "../../src/storage/types";
import { SIMULATION_PROFILE_DETAILS } from "../../src/simulator/profiles";
import {
  getDashboardOverview,
  getDashboardSession,
  getDashboardSessions,
  getSubjectSessions,
} from "../lib/dashboard";
import {
  filterDashboardSessions,
  type ContinuityFilter,
  type HumanFilter,
} from "../lib/session-filters";
import { OverviewCards } from "./OverviewCards";
import { SessionComparison } from "./SessionComparison";
import { SessionInspector } from "./SessionInspector";

interface DashboardProps {
  refreshKey: number;
}

type SessionSummary = SessionListResponse["sessions"][number];

const EMPTY_OVERVIEW: DashboardOverview = {
  totalSessions: 0,
  likelyHumanSessions: 0,
  suspiciousSessions: 0,
  anonymousSubjects: 0,
  uncertainMatches: 0,
};

function displayTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function humanLabel(session: SessionSummary): string {
  if (session.humanConfidence < 0.5) return "Low confidence";
  if (session.humanScore >= 7.5) return "Likely human";
  if (session.humanScore < 4.5) return "Suspicious";
  return "Mixed";
}

export function Dashboard({ refreshKey }: DashboardProps) {
  const [source, setSource] = useState<HistorySource>("simulation");
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [sessions, setSessions] = useState<SessionListResponse["sessions"]>([]);
  const [query, setQuery] = useState("");
  const [humanFilter, setHumanFilter] = useState<HumanFilter>("all");
  const [continuityFilter, setContinuityFilter] = useState<ContinuityFilter>("all");
  const [selected, setSelected] = useState<SessionDetailResponse>();
  const [relatedSessions, setRelatedSessions] = useState<SessionListResponse["sessions"]>([]);
  const [comparison, setComparison] = useState<SessionDetailResponse[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const detailRequest = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => detailRequest.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    detailRequest.current?.abort();
    setStatus("loading");
    setOverview(EMPTY_OVERVIEW);
    setSessions([]);
    setSelected(undefined);
    setRelatedSessions([]);
    setComparison([]);
    void Promise.all([
      getDashboardOverview(source, controller.signal),
      getDashboardSessions(source, controller.signal),
    ]).then(([nextOverview, nextSessions]) => {
      setOverview(nextOverview);
      setSessions(nextSessions);
      setStatus("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setStatus("error");
    });
    return () => controller.abort();
  }, [refreshKey, reloadKey, source]);

  const filteredSessions = useMemo(() => filterDashboardSessions(sessions, {
    query,
    human: humanFilter,
    continuity: continuityFilter,
  }), [continuityFilter, humanFilter, query, sessions]);

  async function inspectSession(session: SessionSummary) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    try {
      const detail = await getDashboardSession(session.sessionId, source, controller.signal);
      const related = detail.subjectId
        ? await getSubjectSessions(detail.subjectId, source, controller.signal)
        : [];
      setSelected(detail);
      setRelatedSessions(related);
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    }
  }

  async function toggleComparison(session: SessionSummary) {
    const existing = comparison.find(item => item.sessionId === session.sessionId);
    if (existing) {
      setComparison(items => items.filter(item => item.sessionId !== session.sessionId));
      return;
    }
    if (comparison.length >= 2) return;
    const controller = new AbortController();
    try {
      const detail = await getDashboardSession(session.sessionId, source, controller.signal);
      setComparison(items => items.length >= 2 || items.some(item => item.sessionId === detail.sessionId)
        ? items
        : [...items, detail]);
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard-heading">
        <div>
          <p className="eyebrow">Developer dashboard</p>
          <h2 id="dashboard-title" className="editorial">Trace every decision.</h2>
          <p>Human likelihood and subject continuity stay separate from summary through evidence.</p>
        </div>
        <div className="dashboard-actions">
          <label>
            Data source
            <select value={source} onChange={event => setSource(event.target.value as HistorySource)}>
              <option value="simulation">Simulations</option>
              <option value="live">Live assessments</option>
            </select>
          </label>
          <button type="button" onClick={() => setReloadKey(value => value + 1)}>Refresh</button>
        </div>
      </div>

      <OverviewCards overview={overview} />

      <div className="session-browser">
        <div className="filter-bar">
          <label className="filter-search">
            Search sessions
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Session, subject, profile, or flag"
            />
          </label>
          <label>
            Human likelihood
            <select value={humanFilter} onChange={event => setHumanFilter(event.target.value as HumanFilter)}>
              <option value="all">All scores</option>
              <option value="likely-human">Likely human</option>
              <option value="mixed">Mixed</option>
              <option value="suspicious">Suspicious</option>
            </select>
          </label>
          <label>
            Continuity
            <select value={continuityFilter} onChange={event => setContinuityFilter(event.target.value as ContinuityFilter)}>
              <option value="all">All statuses</option>
              <option value="matched">Matched</option>
              <option value="new">New</option>
              <option value="uncertain">Uncertain</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </label>
        </div>

        {status === "error" ? (
          <p className="dashboard-message" role="alert">Dashboard data is temporarily unavailable.</p>
        ) : status === "loading" ? (
          <p className="dashboard-message">Loading dashboard…</p>
        ) : filteredSessions.length === 0 ? (
          <p className="dashboard-message">No sessions match the current filters.</p>
        ) : (
          <div className="session-table-scroll">
            <table className="session-table">
              <thead>
                <tr>
                  <th scope="col">Session</th>
                  <th scope="col">Human</th>
                  <th scope="col">Continuity</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Major flags</th>
                  <th scope="col">Observed</th>
                  <th scope="col">Compare</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map(session => {
                  const compared = comparison.some(item => item.sessionId === session.sessionId);
                  return (
                    <tr key={session.sessionId} className={selected?.sessionId === session.sessionId ? "selected" : undefined}>
                      <td>
                        <button className="session-link" type="button" onClick={() => void inspectSession(session)}>
                          <strong>{session.simulationProfile ? SIMULATION_PROFILE_DETAILS[session.simulationProfile].label : "Live session"}</strong>
                          <code>{session.sessionId}</code>
                        </button>
                      </td>
                      <td><strong>{session.humanScore.toFixed(1)}</strong><small>{humanLabel(session)} · {Math.round(session.humanConfidence * 100)}%</small></td>
                      <td>
                        <span className={`table-status table-status-${session.matchStatus}`}>{session.matchStatus}</span>
                        <small>{session.continuityConfidence === null ? "No confidence" : `${Math.round(session.continuityConfidence * 100)}% confidence`}</small>
                      </td>
                      <td><code>{session.subjectId ?? "Unlinked"}</code></td>
                      <td><small>{session.flagCodes.length === 0 ? "None" : session.flagCodes.join(", ")}</small></td>
                      <td>{displayTime(session.createdAt)}</td>
                      <td>
                        <label className="compare-control">
                          <input
                            type="checkbox"
                            checked={compared}
                            disabled={!compared && comparison.length >= 2}
                            onChange={() => void toggleComparison(session)}
                          />
                          <span>Select</span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {comparison.length === 2 && <SessionComparison sessions={[comparison[0]!, comparison[1]!]} />}
      {selected && <SessionInspector session={selected} relatedSessions={relatedSessions} />}
    </section>
  );
}
