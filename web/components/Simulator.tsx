import styles from "./Simulator.module.css";
import { useEffect, useRef, useState } from "react";
import type { AssessmentResponse } from "../../src/api/assessment";
import {
  SIMULATION_PROFILE_DETAILS,
  SIMULATION_PROFILES,
  type SimulationProfile,
} from "../../src/simulator/profiles";
import { submitSimulation } from "../lib/assessment";
import { AssessmentResult } from "./AssessmentResult";

interface CompletedAssessment {
  assessment: AssessmentResponse;
  profile: SimulationProfile;
}

interface SimulatorProps {
  onAssessmentComplete?: () => void;
}

export function Simulator({ onAssessmentComplete }: SimulatorProps) {
  const [selectedProfile, setSelectedProfile] =
    useState<SimulationProfile>("normal-human");
  const [completed, setCompleted] = useState<CompletedAssessment>();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState<string>();
  const activeRequest = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => activeRequest.current?.abort(), []);

  async function runAssessment() {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setStatus("running");
    setError(undefined);

    try {
      const assessment = await submitSimulation(
        selectedProfile,
        controller.signal,
      );
      setCompleted({ assessment, profile: selectedProfile });
      onAssessmentComplete?.();
      setStatus("idle");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "The simulated assessment could not be completed.",
      );
      setStatus("error");
    }
  }

  return (
    <section className={styles["prototype"]} aria-label="Simulator">
      <div className={styles["simulator"]}>
        <div className={styles["simulator-controls"]}>
          <fieldset className={styles["profiles"]}>
            <legend>Simulation profile</legend>
            {SIMULATION_PROFILES.map((profile) => {
              const details = SIMULATION_PROFILE_DETAILS[profile];
              return (
                <label
                  className={styles["profile"]}
                  key={profile}
                  title={details.description}
                >
                  <input
                    type="radio"
                    name="simulation-profile"
                    value={profile}
                    checked={selectedProfile === profile}
                    onChange={() => setSelectedProfile(profile)}
                  />
                  <span>
                    <strong>{details.label}</strong>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <button
            className={styles["run-assessment"]}
            type="button"
            disabled={status === "running"}
            onClick={() => void runAssessment()}
          >
            {status === "running" ? "Assessing…" : "Run simulated assessment"}
          </button>
          {status === "error" && (
            <p className={styles["simulator-error"]} role="alert">
              {error}
            </p>
          )}
        </div>

        <div
          className={styles["simulator-output"]}
          tabIndex={0}
          role="region"
          aria-label="Simulation results"
          aria-live="polite"
          aria-busy={status === "running"}
        >
          {completed ? (
            <AssessmentResult {...completed} />
          ) : (
            <div className={styles["empty-result"]}>
              <h2>Awaiting a session</h2>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
