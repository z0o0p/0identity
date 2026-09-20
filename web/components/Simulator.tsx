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
  const [selectedProfile, setSelectedProfile] = useState<SimulationProfile>("normal-human");
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
      const assessment = await submitSimulation(selectedProfile, controller.signal);
      setCompleted({ assessment, profile: selectedProfile });
      onAssessmentComplete?.();
      setStatus("idle");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "The simulated assessment could not be completed.");
      setStatus("error");
    }
  }

  return (
    <section className="prototype" aria-labelledby="simulator-title">
      <div className="simulator">
        <div className="simulator-controls">
          <p className="eyebrow">Deterministic simulator</p>
          <h2 id="simulator-title" className="editorial">Inspect the evidence.</h2>
          <p className="simulator-intro">
            Choose a synthetic session. Its generated signals pass through the same validation and scoring pipeline as a future browser assessment.
          </p>

          <fieldset className="profiles">
            <legend>Simulation profile</legend>
            {SIMULATION_PROFILES.map(profile => {
              const details = SIMULATION_PROFILE_DETAILS[profile];
              return (
                <label className="profile" key={profile}>
                  <input
                    type="radio"
                    name="simulation-profile"
                    value={profile}
                    checked={selectedProfile === profile}
                    onChange={() => setSelectedProfile(profile)}
                  />
                  <span>
                    <strong>{details.label}</strong>
                    <small>{details.description}</small>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <button className="run-assessment" type="button" disabled={status === "running"} onClick={() => void runAssessment()}>
            {status === "running" ? "Assessing…" : "Run simulated assessment"}
          </button>
          {status === "error" && <p className="simulator-error" role="alert">{error}</p>}
        </div>

        <div className="simulator-output" aria-live="polite" aria-busy={status === "running"}>
          {completed ? (
            <AssessmentResult {...completed} />
          ) : (
            <div className="empty-result">
              <span aria-hidden="true">01</span>
              <h2>Awaiting a session</h2>
              <p>Run a profile to see its score, confidence, components, and explainable flags.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
