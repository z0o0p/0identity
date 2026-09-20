import type { SessionDetailResponse } from "../../src/api/history";
import { HUMAN_COMPONENT_NAMES, type IdentityEvidenceClass } from "../../src/shared/domain";

interface SessionComparisonProps {
  sessions: [SessionDetailResponse, SessionDetailResponse];
}

function identityStatus(session: SessionDetailResponse): string {
  return "matchStatus" in session.assessment.identity ? session.assessment.identity.matchStatus : "unavailable";
}

function evidenceSimilarity(session: SessionDetailResponse, evidenceClass: IdentityEvidenceClass): string {
  const identity = session.assessment.identity;
  if (!("evidence" in identity)) return "—";
  const evidence = identity.evidence.find(item => item.evidenceClass === evidenceClass);
  return evidence ? `${Math.round(evidence.similarity * 100)}%` : "—";
}

export function SessionComparison({ sessions }: SessionComparisonProps) {
  const [left, right] = sessions;
  const rows = [
    ["Human score", left.humanScore.toFixed(1), right.humanScore.toFixed(1)],
    ["Score confidence", `${Math.round(left.humanConfidence * 100)}%`, `${Math.round(right.humanConfidence * 100)}%`],
    ["Continuity", identityStatus(left), identityStatus(right)],
    ["Subject", left.subjectId ?? "Unlinked", right.subjectId ?? "Unlinked"],
    ...HUMAN_COMPONENT_NAMES.map(name => [
      `${name[0]?.toUpperCase()}${name.slice(1)} score`,
      left.assessment.human.components[name]?.score.toFixed(1) ?? "—",
      right.assessment.human.components[name]?.score.toFixed(1) ?? "—",
    ]),
    ...(["behavior", "device", "context", "network"] as const).map(evidenceClass => [
      `${evidenceClass.charAt(0).toUpperCase()}${evidenceClass.slice(1)} similarity`,
      evidenceSimilarity(left, evidenceClass),
      evidenceSimilarity(right, evidenceClass),
    ]),
  ];

  return (
    <section className="comparison-panel" aria-labelledby="comparison-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Evidence comparison</p>
          <h3 id="comparison-title">Two sessions, side by side</h3>
        </div>
      </div>
      <div className="comparison-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col"><code>{left.sessionId}</code></th>
              <th scope="col"><code>{right.sessionId}</code></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, leftValue, rightValue]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{leftValue}</td>
                <td>{rightValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
