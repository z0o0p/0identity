import styles from "./AssessmentResult.module.css";
import type { AssessmentResponse } from "../../src/api/assessment";
import {
  HUMAN_COMPONENT_NAMES,
  type HumanComponentName,
} from "../../src/shared/domain";
import type { SimulationProfile } from "../../src/simulator/profiles";
import { SIMULATION_PROFILE_DETAILS } from "../../src/simulator/profiles";
import { useContentMotion } from "../hooks/motion";

interface AssessmentResultProps {
  assessment: AssessmentResponse;
  profile: SimulationProfile;
}

const COMPONENT_LABELS: Record<HumanComponentName, string> = {
  behavior: "Behavior",
  consistency: "Consistency",
  device: "Device",
  network: "Network",
  history: "History",
};

function scoreLabel(score: number): string {
  if (score >= 7.5) return "Strong human-like evidence";
  if (score < 4.5) return "Strong automation indicators";
  return "Mixed evidence";
}

export function AssessmentResult({
  assessment,
  profile,
}: AssessmentResultProps) {
  const motion = useContentMotion<HTMLElement>(
    `.${styles["result-heading"]}, .${styles["score-summary"]}, .${styles["component"]}, .${styles["evidence"]}, .${styles["identity-result"]}`,
    [assessment.assessmentId],
  );
  const availableComponents = HUMAN_COMPONENT_NAMES.flatMap((name) => {
    const component = assessment.human.components[name];
    return component ? [{ name, component }] : [];
  });
  const identity = assessment.identity;

  return (
    <article
      ref={motion}
      className={styles["result"]}
      aria-labelledby="result-title"
    >
      <div className={styles["result-heading"]}>
        <div>
          <h2 id="result-title">{SIMULATION_PROFILE_DETAILS[profile].label}</h2>
        </div>
      </div>

      <div className={styles["score-summary"]}>
        <div
          className={styles["score-value"]}
          aria-label={`Human-likelihood score ${assessment.human.score} out of 10`}
        >
          <strong>{assessment.human.score.toFixed(1)}</strong>
          <span>/ 10</span>
        </div>
        <div className={styles["score-context"]}>
          <p>{scoreLabel(assessment.human.score)}</p>
          <span>
            {Math.round(assessment.human.confidence * 100)}% evidence confidence
          </span>
        </div>
      </div>

      <div className={styles["component-list"]} aria-label="Score components">
        {availableComponents.map(({ name, component }) => (
          <div className={styles["component"]} key={name}>
            <div className={styles["component-label"]}>
              <span>{COMPONENT_LABELS[name]}</span>
              <span>{component.score.toFixed(1)}</span>
            </div>
            <div className={styles["component-track"]} aria-hidden="true">
              <span
                data-score-bar
                style={{ width: `${component.score * 10}%` }}
              />
            </div>
            <span className={styles["component-confidence"]}>
              {Math.round(component.confidence * 100)}% confidence
            </span>
          </div>
        ))}
      </div>

      <section className={styles["evidence"]} aria-labelledby="evidence-title">
        <h3 id="evidence-title">Evidence flags</h3>
        {assessment.human.flags.length === 0 ? (
          <p className={styles["no-flags"]}>
            No consistency or regularity flags were raised.
          </p>
        ) : (
          <ul>
            {assessment.human.flags.map((flag) => (
              <li key={flag.code}>
                <span
                  className={[
                    styles.severity,
                    styles[`severity-${flag.severity}`],
                  ].join(" ")}
                >
                  {flag.severity}
                </span>
                <span>{flag.explanation}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {"status" in identity ? (
        <p className={styles["identity-result"]}>
          <strong>Subject continuity unavailable.</strong> {identity.reason}
        </p>
      ) : (
        <section
          className={styles["identity-result"]}
          aria-labelledby="identity-title"
        >
          <div>
            <h3 id="identity-title">Anonymous subject continuity</h3>
            <span
              className={[
                styles["identity-status"],
                styles[`identity-status-${identity.matchStatus}`],
              ].join(" ")}
            >
              {identity.matchStatus}
            </span>
          </div>
          <p>{identity.reason}</p>
          {identity.subjectId && <code>{identity.subjectId}</code>}
          <small>
            {Math.round(identity.continuityConfidence * 100)}% continuity
            confidence
          </small>
        </section>
      )}
    </article>
  );
}
