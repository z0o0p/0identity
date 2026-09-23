import styles from "./Dashboard.module.css";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { DashboardOverview } from "../../src/api/dashboard";
import type {
  SessionDetailResponse,
  SessionListResponse,
} from "../../src/api/history";
import type { HistorySource } from "../../src/storage/types";
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
import { SessionInspector } from "./SessionInspector";
import { useContentMotion } from "../hooks/motion";

const InvestigationChat = lazy(async () => {
  const module = await import("./InvestigationChat");
  return { default: module.InvestigationChat };
});

interface DashboardProps {
  refreshKey: number;
}

type SessionSummary = SessionListResponse["sessions"][number];
const SESSION_BATCH_SIZE = 15;

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
    year: "numeric",
  });
}

function FlagIcon({ code }: { code: string }) {
  const flagDescriptions: Record<string, string> = {
    highly_regular_pointer: "Pointer movements follow unusually regular timing or paths.",
    highly_regular_keyboard: "Key timing is unusually regular.",
    browser_user_agent_mismatch: "The reported browser conflicts with the browser user agent.",
    browser_platform_mismatch: "The reported platform conflicts with the browser user agent.",
    header_browser_mismatch: "The browser claim conflicts with the request header.",
    unexpected_api_support: "The browser reports an API it would not normally support.",
    implausible_touch_configuration: "Touch capability conflicts with the reported touch points.",
    rendering_environment_mismatch: "Rendering details suggest an inconsistent or automated environment.",
    webdriver_exposed: "The browser exposes an automation controller.",
  };
  const flagShapes: Record<string, ReactNode> = {
    highly_regular_pointer: <path d="M5 3v17l5-5 3 6 3-1-3-6h7z" />,
    highly_regular_keyboard: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 15h10" /></>,
    browser_user_agent_mismatch: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 9h20M6 6.5h.01M9 6.5h.01" /></>,
    browser_platform_mismatch: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 17h6" /></>,
    header_browser_mismatch: <path d="M4 5h16M4 10h12M4 15h16M4 20h9" />,
    unexpected_api_support: <path d="M9 3 5 12h5l-1 9 10-12h-6l2-6z" />,
    implausible_touch_configuration: <path d="M8 12V5a2 2 0 0 1 4 0v6l2-1a2 2 0 0 1 3 2l-2 8H8l-4-6a2 2 0 0 1 3-2z" />,
    rendering_environment_mismatch: <><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 21h8M12 18v3M7 14l3-3 2 2 4-4" /></>,
    webdriver_exposed: <><rect x="4" y="7" width="16" height="13" rx="3" /><path d="M12 3v4M8 13h.01M16 13h.01M9 17h6" /></>,
  };
  const description = flagDescriptions[code] ?? code.replaceAll("_", " ");

  return (
    <span className={styles["flag-tooltip"]} data-tooltip={description}
      tabIndex={0} aria-label={description}>
      <svg className={styles["flag-icon"]} viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden="true">
        {flagShapes[code] ?? <path d="M12 3 2 21h20zM12 9v5M12 18h.01" />}
      </svg>
    </span>
  );
}

export function Dashboard({ refreshKey }: DashboardProps) {
  const [source, setSource] = useState<HistorySource>("simulation");
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [sessions, setSessions] = useState<SessionListResponse["sessions"]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [humanFilter, setHumanFilter] = useState<HumanFilter>("all");
  const [continuityFilter, setContinuityFilter] =
    useState<ContinuityFilter>("all");
  const [selected, setSelected] = useState<SessionDetailResponse>();
  const [relatedSessions, setRelatedSessions] = useState<
    SessionListResponse["sessions"]
  >([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const detailRequest = useRef<AbortController | undefined>(undefined);
  const listRequest = useRef<AbortController | undefined>(undefined);
  const loadMoreTarget = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      detailRequest.current?.abort();
      listRequest.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    detailRequest.current?.abort();
    listRequest.current?.abort();
    setStatus("loading");
    setOverview(EMPTY_OVERVIEW);
    setSessions([]);
    setHasMore(false);
    setLoadingMore(false);
    setSelected(undefined);
    setRelatedSessions([]);
    void Promise.all([
      getDashboardOverview(source, controller.signal),
      getDashboardSessions(source, controller.signal),
    ])
      .then(([nextOverview, nextSessions]) => {
        setOverview(nextOverview);
        setSessions(nextSessions);
        setHasMore(nextSessions.length === SESSION_BATCH_SIZE);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [refreshKey, source]);

  const loadMoreSessions = useCallback(async () => {
    if (loadingMore || !hasMore || status !== "ready") return;
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoadingMore(true);
    try {
      const nextSessions = await getDashboardSessions(
        source,
        controller.signal,
        sessions.length,
      );
      if (controller.signal.aborted) return;
      setSessions((current) => {
        const known = new Set(current.map((session) => session.sessionId));
        return [...current, ...nextSessions.filter((session) => !known.has(session.sessionId))];
      });
      setHasMore(nextSessions.length === SESSION_BATCH_SIZE);
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, sessions.length, source, status]);

  useEffect(() => {
    const target = loadMoreTarget.current;
    if (!target || !hasMore || status !== "ready" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void loadMoreSessions();
      },
      { rootMargin: "160px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMoreSessions, status]);

  const filteredSessions = useMemo(
    () =>
      filterDashboardSessions(sessions, {
        query,
        human: humanFilter,
        continuity: continuityFilter,
      }),
    [continuityFilter, humanFilter, query, sessions],
  );
  const panelsMotion = useContentMotion<HTMLDivElement>(
    "[data-evidence-panel]",
    [selected],
  );
  const overviewMotion = useContentMotion<HTMLDivElement>("[data-metric]", [
    overview,
  ]);

  async function inspectSession(session: SessionSummary) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    try {
      const detail = await getDashboardSession(
        session.sessionId,
        source,
        controller.signal,
      );
      const related = detail.subjectId
        ? await getSubjectSessions(detail.subjectId, source, controller.signal)
        : [];
      setSelected(detail);
      setRelatedSessions(related);
    } catch {
      if (!controller.signal.aborted) setStatus("error");
    }
  }

  return (
    <section className={styles["dashboard"]} aria-labelledby="dashboard-title">
      <div className={styles["dashboard-heading"]}>
        <div>
          <h1 id="dashboard-title">Session Dashboard</h1>
          <p>Review session scores, subject continuity, and flagged behaviour.</p>
        </div>
      </div>

      <div ref={overviewMotion}>
        <OverviewCards overview={overview} />
      </div>

      <div className={styles["session-browser"]}>
        <div className={styles["filter-bar"]}>
          <input
            className={styles["filter-search"]}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions"
            aria-label="Search sessions"
          />
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as HistorySource)}
            aria-label="Data source"
          >
            <option value="simulation">Simulations</option>
            <option value="live">Live assessments</option>
          </select>
          <select
            value={humanFilter}
            onChange={(event) => setHumanFilter(event.target.value as HumanFilter)}
            aria-label="Human likelihood"
          >
            <option value="all">All human likelihood</option>
            <option value="likely-human">Likely human</option>
            <option value="mixed">Mixed</option>
            <option value="suspicious">Automation indicators</option>
          </select>
          <select
            value={continuityFilter}
            onChange={(event) =>
              setContinuityFilter(event.target.value as ContinuityFilter)
            }
            aria-label="Continuity"
          >
            <option value="all">All continuity</option>
            <option value="matched">Matched</option>
            <option value="new">New</option>
            <option value="uncertain">Uncertain</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>

        {status === "error" ? (
          <p className={styles["dashboard-message"]} role="alert">
            Dashboard data is temporarily unavailable.
          </p>
        ) : status === "loading" ? (
          <p className={styles["dashboard-message"]}>Loading dashboard…</p>
        ) : filteredSessions.length === 0 ? (
          <p className={styles["dashboard-message"]}>
            No sessions match the current filters.
          </p>
        ) : (
          <div className={styles["session-table-scroll"]}>
            <table className={styles["session-table"]}>
              <thead>
                <tr>
                  <th scope="col">Observed On</th>
                  <th scope="col">Session</th>
                  <th scope="col">Profile</th>
                  <th scope="col">Human Likelihood</th>
                  <th scope="col">Subject Continuity</th>
                  <th scope="col">Flagged Behaviour</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((session) => (
                  <tr
                    key={session.sessionId}
                    className={
                      selected?.sessionId === session.sessionId
                        ? styles.selected
                        : undefined
                    }
                  >
                    <td><time dateTime={session.createdAt}>{displayTime(session.createdAt)}</time></td>
                    <td>
                      <code>{session.sessionId}</code>
                    </td>
                    <td>
                      <code>{session.subjectId ?? "—"}</code>
                    </td>
                    <td>
                      {Math.round(session.humanScore)}/10
                      <small>
                        {Math.round(session.humanConfidence * 100)}% sure
                      </small>
                    </td>
                    <td>
                      <span
                        className={[
                          styles["table-status"],
                          styles[`table-status-${session.matchStatus}`],
                        ].join(" ")}
                      >
                        {session.matchStatus}
                      </span>
                      <small>
                        {session.continuityConfidence === null
                          ? "—"
                          : `${Math.round(session.continuityConfidence * 100)}% sure`}
                      </small>
                    </td>
                    <td>
                      <div className={styles["flag-icons"]}>
                        {session.flagCodes.map((code) => <FlagIcon key={code} code={code} />)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <div ref={loadMoreTarget} className={styles["load-more-sentinel"]}>
            {loadingMore && (
              <span
                className={styles["load-more-spinner"]}
                role="status"
                aria-label="Loading more sessions"
              />
            )}
          </div>
        )}
      </div>

      <div ref={panelsMotion}>
        {selected && (
          <>
            <SessionInspector
              session={selected}
              relatedSessions={relatedSessions}
            />
            <Suspense
              fallback={
                <p className={styles["dashboard-message"]}>
                  Loading investigation assistant…
                </p>
              }
            >
              <InvestigationChat
                key={`${source}:${selected.sessionId}`}
                source={source}
                sessionId={selected.sessionId}
              />
            </Suspense>
          </>
        )}
      </div>
    </section>
  );
}
