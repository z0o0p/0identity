import styles from "./OverviewCards.module.css";
import type { DashboardOverview } from "../../src/api/dashboard";

interface OverviewCardsProps {
  overview: DashboardOverview;
}

const METRIC_GROUPS: Array<{
  label: string;
  description: string;
  values: Array<{ key: keyof DashboardOverview; label: string }>;
}> = [
    {
      label: "Sessions and profiles",
      description: "All persisted sessions and anonymous subject profiles in this data source.",
      values: [
        { key: "totalSessions", label: "Sessions" },
        { key: "anonymousSubjects", label: "Profiles" },
      ],
    },
    {
      label: "Assessment outcomes",
      description: "Human-likelihood and continuity outcomes across this data source.",
      values: [
        { key: "likelyHumanSessions", label: "Likely human" },
        { key: "suspiciousSessions", label: "Automation indicators" },
        { key: "uncertainMatches", label: "Uncertain continuity" },
      ],
    },
  ];

export function OverviewCards({ overview }: OverviewCardsProps) {
  return (
    <div className={styles["overview-grid"]} aria-label="Dashboard overview">
      {METRIC_GROUPS.map((group) => (
        <article
          className={styles["metric-card"]}
          data-metric
          key={group.label}
          title={group.description}
        >
          <h2>{group.label}</h2>
          <dl>
            {group.values.map((metric) => (
              <div key={metric.key}>
                <dt>{metric.label}</dt>
                <dd>{overview[metric.key]}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
