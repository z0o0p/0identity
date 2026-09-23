import styles from "./Simulator.module.css";
import { Simulator as AssessmentSimulator } from "../components/Simulator";

export function Simulator({
  onAssessmentComplete,
}: {
  onAssessmentComplete: () => void;
}) {
  return (
    <section
      className={styles["simulator-page"]}
      aria-label="Simulator"
    >
      <header className={styles["page-intro"]}>
        <h1>Simulator</h1>
        <p>
          Run a simulated session to see two separate estimates: whether the
          activity appears human, and whether it resembles a previously seen
          anonymous session.
        </p>
      </header>
      <div className={styles["simulator-summary"]} data-enter>
        <section>
          <h2>Signals</h2>
          <p>Interaction timing, browser properties, and session context.</p>
        </section>
        <section>
          <h2>Human likelihood</h2>
          <p>
            Behavioral patterns, browser consistency, and session context are
            combined into an explainable score and confidence estimate.
          </p>
        </section>
        <section>
          <h2>Subject continuity</h2>
          <p>
            Anonymous session evidence is compared separately, allowing a
            match, uncertainty, or a new subject without changing the human
            score.
          </p>
        </section>
      </div>
      <AssessmentSimulator onAssessmentComplete={onAssessmentComplete} />
    </section>
  );
}
