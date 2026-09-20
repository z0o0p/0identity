import type { AssessmentResponse } from "../../src/api/assessment";
import { HUMAN_COMPONENT_NAMES, type HumanComponentName } from "../../src/shared/domain";
import type { SimulationProfile } from "../../src/simulator/profiles";
import { SIMULATION_PROFILE_DETAILS } from "../../src/simulator/profiles";

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

export function AssessmentResult({ assessment, profile }: AssessmentResultProps) {
  const availableComponents = HUMAN_COMPONENT_NAMES.flatMap(name => {
    const component = assessment.human.components[name];
    return component ? [{ name, component }] : [];
  });
  const identity = assessment.identity;

  return (
    <article className="result" aria-labelledby="result-title">
      <div className="result-heading">
        <div>
          <p className="eyebrow">Simulated result</p>
          <h2 id="result-title">{SIMULATION_PROFILE_DETAILS[profile].label}</h2>
        </div>
        <span className="simulation-badge">Synthetic data</span>
      </div>

      <div className="score-summary">
        <div className="score-value" aria-label={`Human-likelihood score ${assessment.human.score} out of 10`}>
          <strong>{assessment.human.score.toFixed(1)}</strong>
          <span>/ 10</span>
        </div>
        <div className="score-context">
          <p>{scoreLabel(assessment.human.score)}</p>
          <span>{Math.round(assessment.human.confidence * 100)}% evidence confidence</span>
        </div>
      </div>

      <div className="component-list" aria-label="Score components">
        {availableComponents.map(({ name, component }) => (
          <div className="component" key={name}>
            <div className="component-label">
              <span>{COMPONENT_LABELS[name]}</span>
              <span>{component.score.toFixed(1)}</span>
            </div>
            <div className="component-track" aria-hidden="true">
              <span style={{ width: `${component.score * 10}%` }} />
            </div>
            <span className="component-confidence">{Math.round(component.confidence * 100)}% confidence</span>
          </div>
        ))}
      </div>

      <section className="evidence" aria-labelledby="evidence-title">
        <h3 id="evidence-title">Evidence flags</h3>
        {assessment.human.flags.length === 0 ? (
          <p className="no-flags">No consistency or regularity flags were raised.</p>
        ) : (
          <ul>
            {assessment.human.flags.map(flag => (
              <li key={flag.code}>
                <span className={`severity severity-${flag.severity}`}>{flag.severity}</span>
                <span>{flag.explanation}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {"status" in identity ? (
        <p className="identity-result">
          <strong>Subject continuity unavailable.</strong> {identity.reason}
        </p>
      ) : (
        <section className="identity-result" aria-labelledby="identity-title">
          <div>
            <h3 id="identity-title">Anonymous subject continuity</h3>
            <span className={`identity-status identity-status-${identity.matchStatus}`}>{identity.matchStatus}</span>
          </div>
          <p>{identity.reason}</p>
          {identity.subjectId && <code>{identity.subjectId}</code>}
          <small>{Math.round(identity.continuityConfidence * 100)}% continuity confidence</small>
        </section>
      )}
    </article>
  );
}
