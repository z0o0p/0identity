import styles from "./SessionInspector.module.css";
import type {
  SessionDetailResponse,
  SessionListResponse,
} from "../../src/api/history";
import { HUMAN_COMPONENT_NAMES } from "../../src/shared/domain";

interface SessionInspectorProps {
  session: SessionDetailResponse;
  relatedSessions: SessionListResponse["sessions"];
  onSelectSession: (session: SessionListResponse["sessions"][number]) => void;
}

export function SessionInspector({
  session,
  relatedSessions,
  onSelectSession,
}: SessionInspectorProps) {
  const { assessment, signals } = session;
  const identity = assessment.identity;
  const environment = signals.environment;
  const behavior = signals.behavior;

  return (
    <section
      className={styles["inspector-panel"]}
      data-evidence-panel
      aria-label="Session evidence"
    >
      <div className={styles["inspector-summary"]}>
        <div>
          <strong>{session.humanScore.toFixed(1)}</strong>
          <span>Human score</span>
        </div>
        <div>
          <strong>{Math.round(session.humanConfidence * 100)}%</strong>
          <span>Score confidence</span>
        </div>
        <div>
          <strong>{session.matchStatus}</strong>
          <span>Continuity status</span>
        </div>
        <div>
          <strong>
            {session.continuityConfidence === null
              ? "—"
              : `${Math.round(session.continuityConfidence * 100)}%`}
          </strong>
          <span>Continuity confidence</span>
        </div>
      </div>

      <div className={styles["inspector-columns"]}>
        <section>
          <h4>Human-likelihood components</h4>
          <dl className={styles["evidence-list"]}>
            {HUMAN_COMPONENT_NAMES.map((name) => {
              const component = assessment.human.components[name];
              return component ? (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    {component.score.toFixed(1)},{" "}
                    {Math.round(component.confidence * 100)}% confidence,{" "}
                    {component.evidenceCount} signals
                  </dd>
                </div>
              ) : null;
            })}
          </dl>
          <h4>Risk flags</h4>
          {assessment.human.flags.length === 0 ? (
            <p>No risk flags.</p>
          ) : (
            <ul className={styles["plain-list"]}>
              {assessment.human.flags.map((flag) => (
                <li key={flag.code}>
                  {flag.code}, {flag.severity}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4>Continuity evidence</h4>
          <p>{identity.reason}</p>
          {identity.subjectId && <code>{identity.subjectId}</code>}
          {"evidence" in identity && identity.evidence.length > 0 ? (
            <dl className={styles["evidence-list"]}>
              {identity.evidence.map((item) => (
                <div key={item.evidenceClass}>
                  <dt>{item.evidenceClass}</dt>
                  <dd>
                    {Math.round(item.similarity * 100)}% similar,{" "}
                    {item.comparableFeatures} comparable features
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>No prior candidate evidence was available.</p>
          )}
        </section>

        <section>
          <h4>Normalized signals</h4>
          <dl className={styles["evidence-list"]}>
            <div>
              <dt>Environment</dt>
              <dd>
                {environment
                  ? `${environment.browserFamily}, ${environment.platformFamily}`
                  : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Locale / timezone</dt>
              <dd>
                {environment?.locale ?? "—"}, {environment?.timezone ?? "—"}
              </dd>
            </div>
            <div>
              <dt>Pointer events</dt>
              <dd>{behavior?.pointer?.eventCount ?? 0}</dd>
            </div>
            <div>
              <dt>Scroll events</dt>
              <dd>{behavior?.scroll?.eventCount ?? 0}</dd>
            </div>
            <div>
              <dt>Keyboard timing events</dt>
              <dd>{behavior?.keyboard?.eventCount ?? 0}</dd>
            </div>
            <div>
              <dt>Session duration</dt>
              <dd>
                {behavior?.session
                  ? `${(behavior.session.durationMs / 1_000).toFixed(1)}s`
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h4>Related subject history</h4>
          {!session.subjectId ? (
            <p>This session is intentionally unlinked.</p>
          ) : relatedSessions.length === 0 ? (
            <p>No related sessions were found.</p>
          ) : (
            <ul className={styles["plain-list"]}>
              {relatedSessions.slice(0, 5).map((related) => (
                <li key={related.sessionId}>
                  <button type="button" className={styles["related-session"]}
                    onClick={() => onSelectSession(related)}>
                    <code>{related.sessionId}</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
