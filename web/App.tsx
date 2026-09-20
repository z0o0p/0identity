import { useEffect, useState } from "react";
import { isHealthResponse } from "../src/shared/health";
import { Simulator } from "./components/Simulator";
import { Dashboard } from "./components/Dashboard";

type Connection = "checking" | "connected" | "unavailable";

export function App() {
  const [connection, setConnection] = useState<Connection>("checking");
  const [attempt, setAttempt] = useState(0);
  const [dashboardVersion, setDashboardVersion] = useState(0);
  const year = new Date().getFullYear();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 8_000);

    async function checkHealth() {
      setConnection("checking");
      try {
        const response = await fetch("/api/v1/health", {
          signal: controller.signal,
          cache: "no-store",
        });
        const body: unknown = await response.json();
        if (!response.ok || !isHealthResponse(body)) throw new Error("Invalid health response.");
        if (active) setConnection("connected");
      } catch {
        if (active) setConnection("unavailable");
      } finally {
        window.clearTimeout(timeout);
      }
    }

    void checkHealth();
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const status = {
    checking: "Checking connection…",
    connected: "Worker connected",
    unavailable: "Worker unavailable",
  }[connection];

  return (
    <main>
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="0identity home"><span className="wordmark-symbol">0</span><span className="wordmark-name">identity</span></a>
      </header>
      <div className="page-content">
        <section className="intro" aria-labelledby="title">
          <h1 id="title" className="editorial">Are you human?</h1>
          <p className="lede">0identity helps developers assess whether an interaction appears human and, independently, whether an anonymous subject may be continuing across sessions.</p>
        </section>
        <Simulator onAssessmentComplete={() => setDashboardVersion(value => value + 1)} />
        <Dashboard refreshKey={dashboardVersion} />
      </div>
      <footer className="connection" aria-label="Application status and copyright">
        <div className="connection-footer">
          <p>© {year} Taqmeel Zubeir</p>
        </div>
        <div className="connection-status">
          <p className={`status ${connection}`} role="status">{status}</p>
          <button
            type="button"
            disabled={connection === "checking"}
            onClick={() => setAttempt(value => value + 1)}
            aria-label="Check Worker connection"
            title="Check Worker connection"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4" />
              <path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />
            </svg>
          </button>
        </div>
      </footer>
    </main>
  );
}
