import styles from "./App.module.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isHealthResponse } from "../src/shared/health";
import { Dashboard } from "./components/Dashboard";
import { Home } from "./pages/Home";
import { Simulator } from "./pages/Simulator";
import { Faqs } from "./pages/Faqs";
import { pageFromHash } from "./lib/navigation";
import {
  useInteractiveMotion,
  usePageMotion,
} from "./hooks/motion";

type Connection = "checking" | "connected" | "unavailable";

function PageContent({
  children,
  page,
}: {
  children: ReactNode;
  page: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  usePageMotion(root);
  return (
    <div
      ref={root}
      className={[
        styles["page-content"],
        page === "home" ? styles["page-home"] : "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function App() {
  const root = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const [page, setPage] = useState(() => pageFromHash(window.location.hash));
  const [menuOpen, setMenuOpen] = useState(false);
  const [connection, setConnection] = useState<Connection>("checking");
  const [dashboardVersion, setDashboardVersion] = useState(0);
  const year = new Date().getFullYear();
  useInteractiveMotion(root);

  useEffect(() => {
    const navigate = () => {
      setPage(pageFromHash(window.location.hash));
      setMenuOpen(false);
      window.scrollTo({ top: 0, behavior: "instant" });
      main.current?.focus({ preventScroll: true });
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);

  useEffect(() => {
    document.title = "0identity";
  }, []);

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
        if (!response.ok || !isHealthResponse(body))
          throw new Error("Invalid health response.");
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
  }, []);

  const status = {
    checking: "Checking connection…",
    connected: "Worker connected",
    unavailable: "Worker unavailable",
  }[connection];

  return (
    <div className={styles["application"]} ref={root}>
      <a
        className={styles["skip-link"]}
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        Skip to content
      </a>
      <div className={styles["viewport"]}>
        <header className={styles["topbar"]}>
          <a className={styles["wordmark"]} href="#/" aria-label="0identity home">
            <span className={styles["wordmark-symbol"]}>0</span>
            <span className={styles["wordmark-name"]}>identity</span>
          </a>
          <button
            className={styles["menu-toggle"]}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "×" : "☰"}
          </button>
          <nav
            id="primary-navigation"
            className={[
              styles["primary-navigation"],
              menuOpen ? styles["menu-open"] : "",
            ].join(" ")}
            aria-label="Primary navigation"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMenuOpen(false);
                root.current
                  ?.querySelector<HTMLButtonElement>(`.${styles["menu-toggle"]}`)
                  ?.focus();
              }
            }}
          >
            {(["home", "simulator", "faqs"] as const).map((item) => (
              <a
                key={item}
                href={item === "home" ? "#/" : `#/${item}`}
                aria-current={page === item ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {item.toUpperCase()}
                <span aria-hidden="true" />
              </a>
            ))}
            <a
              className={styles["mobile-dashboard"]}
              href="#/dashboard"
              aria-current={page === "dashboard" ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              DASHBOARD
            </a>
          </nav>
          <a
            className={styles["nav-dashboard"]}
            data-motion-interactive
            href="#/dashboard"
            aria-current={page === "dashboard" ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            DASHBOARD
          </a>
        </header>
        <main id="main-content" ref={main} tabIndex={-1}>
          <PageContent key={page} page={page}>
            {page === "home" && <Home />}
            {page === "simulator" && (
              <Simulator
                onAssessmentComplete={() =>
                  setDashboardVersion((value) => value + 1)
                }
              />
            )}
            {page === "faqs" && <Faqs />}
            {page === "dashboard" && (
              <Dashboard refreshKey={dashboardVersion} />
            )}
          </PageContent>
        </main>
      </div>
      <footer
        className={styles["connection"]}
        aria-label="Application status and copyright"
      >
        <div className={styles["connection-footer"]}>
          <p>© {year} Taqmeel Zubeir</p>
        </div>
        <div className={styles["connection-status"]}>
          <span
            role="status"
            className={[styles.status, styles[connection]].join(" ")}
          >
            {status}
          </span>
        </div>
      </footer>
    </div>
  );
}
