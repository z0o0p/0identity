import type { DashboardOverview } from "../../src/api/dashboard";

interface OverviewCardsProps {
  overview: DashboardOverview;
}

const METRICS: Array<{
  key: keyof DashboardOverview;
  label: string;
  description: string;
}> = [
  { key: "totalSessions", label: "Sessions", description: "All persisted sessions in this data source." },
  { key: "likelyHumanSessions", label: "Likely human", description: "Score at least 7.5 with confidence at least 50%." },
  { key: "suspiciousSessions", label: "Suspicious", description: "Score below 4.5 with confidence at least 50%." },
  { key: "anonymousSubjects", label: "Subjects", description: "Anonymous subject profiles; not verified identities." },
  { key: "uncertainMatches", label: "Uncertain", description: "Sessions intentionally left without a subject link." },
];

export function OverviewCards({ overview }: OverviewCardsProps) {
  return (
    <div className="overview-grid" aria-label="Dashboard overview">
      {METRICS.map(metric => (
        <article className="metric-card" key={metric.key} title={metric.description}>
          <strong>{overview[metric.key]}</strong>
          <span>{metric.label}</span>
          <small>{metric.description}</small>
        </article>
      ))}
    </div>
  );
}
