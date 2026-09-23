import styles from "./SignalIllustration.module.css";
import { useLayoutEffect, useRef } from "react";
import { gsap, useGSAP, MOTION_ALLOWED } from "../hooks/motion";

const SIGNAL_PATHS = [
  "M190 65 H285 Q310 65 310 90 V130 Q310 150 335 150 H450",
  "M190 150 H450",
  "M190 235 H285 Q310 235 310 210 V170 Q310 150 335 150 H450",
  "M550 150 H650 Q685 150 685 120 V85 Q685 70 710 70 H790",
  "M550 150 H650 Q685 150 685 180 V215 Q685 230 710 230 H790",
];

export function SignalIllustration() {
  const root = useRef<HTMLDivElement>(null);
  const flow = useRef<gsap.core.Timeline | null>(null);
  const barTransition = useRef<gsap.core.Tween | null>(null);
  useLayoutEffect(() => {
    const canvas = root.current?.querySelector<HTMLElement>(`.${styles["signal-canvas"]}`);
    const wires = root.current?.querySelector<SVGSVGElement>(`.${styles["signal-wires"]}`);
    const core = root.current?.querySelector<HTMLElement>(`.${styles["signal-core"]}`);
    if (!canvas || !wires || !core) return;
    const inputs = Array.from(canvas.querySelectorAll<HTMLElement>(`.${styles["signal-input"]}`));
    const outputs = Array.from(canvas.querySelectorAll<HTMLElement>(`.${styles["signal-output"]}`));
    const anchor = (element: HTMLElement, side: "left" | "right") => {
      let x = side === "right" ? element.offsetWidth : 0;
      let y = element.offsetHeight / 2;
      let current: HTMLElement | null = element;
      while (current && current !== canvas) {
        x += current.offsetLeft;
        y += current.offsetTop;
        current = current.offsetParent as HTMLElement | null;
      }
      return { x, y };
    };
    const updatePaths = () => {
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      wires.setAttribute("viewBox", `0 0 ${canvas.clientWidth} ${canvas.clientHeight}`);
      const curve = (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const middle = (from.x + to.x) / 2;
        return `M${from.x} ${from.y} C${middle} ${from.y} ${middle} ${to.y} ${to.x} ${to.y}`;
      };
      const paths = [
        ...inputs.map((input) => curve(anchor(input, "right"), anchor(core, "left"))),
        ...outputs.map((output) => curve(anchor(core, "right"), anchor(output, "left"))),
      ];
      wires.querySelectorAll<SVGPathElement>("[data-path-index]").forEach((path) => {
        const d = paths[Number(path.dataset.pathIndex)];
        if (d) path.setAttribute("d", d);
      });
    };
    const observer = new ResizeObserver(updatePaths);
    [canvas, core, ...inputs, ...outputs].forEach((element) => observer.observe(element));
    updatePaths();
    return () => observer.disconnect();
  }, []);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        MOTION_ALLOWED,
        (context) => {
          const bars = Array.from(root.current?.querySelectorAll<HTMLElement>(
            `.${styles["signal-mini-bars"]} i`,
          ) ?? []);
          const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>(
            `.${styles["continuity-node"]}`,
          ) ?? []);
          context.add("updateBars", () => {
            // Each independent tween starts from the displayed heights, outside
            // the repeating timeline so its rewind cannot restore old values.
            barTransition.current = gsap.to(bars, {
              scaleY: () => 0.25 + Math.random() * 0.75,
              transformOrigin: "center bottom",
              duration: 0.55,
              ease: "power2.inOut",
              overwrite: "auto",
            });
          });
          // Randomness is illustrative only; it never touches assessment results.
          flow.current = gsap
            .timeline({
              delay: 1.6,
              repeat: -1,
              repeatDelay: 0.8,
            })
            .fromTo(
              `.${styles["flow-in"]}`,
              { strokeDashoffset: 6, opacity: 0 },
              {
                strokeDashoffset: -106,
                opacity: 1,
                duration: 0.65,
                stagger: 0.08,
                ease: "none",
              },
            )
            .to(
              `.${styles["signal-core"]}`,
              { opacity: 0.75, duration: 0.15, yoyo: true, repeat: 1 },
              "-=0.15",
            )
            .fromTo(
              `.${styles["flow-out"]}`,
              { strokeDashoffset: 6, opacity: 0 },
              {
                strokeDashoffset: -106,
                opacity: 1,
                duration: 0.6,
                stagger: 0.05,
                ease: "none",
              },
              "<0.1",
            )
            .call(() => context.updateBars(), [], "-=0.2")
            .to({}, { duration: 0.55 })
            .to(`.${styles["flow-packet"]}`, { opacity: 0, duration: 0.1 })
            .call(() => {
              const selected = Math.floor(Math.random() * nodes.length);
              nodes.forEach((node, index) => {
                node.classList.toggle(styles["continuity-selected"]!, index === selected);
              });
            });
          return () => {
            barTransition.current?.kill();
            barTransition.current = null;
            nodes.forEach((node) => node.classList.remove(styles["continuity-selected"]!));
            flow.current = null;
          };
        },
        root,
      );
      return () => media.revert();
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      className={styles["signal-illustration"]}
      data-enter
      role="group"
      aria-label="Illustrative data flow, not live results: behavior, browser environment, and session context feed separate human-likelihood and subject-continuity engines."
    >
      <div className={styles["signal-canvas"]} aria-hidden="true">
        <svg
          className={styles["signal-wires"]}
          viewBox="0 0 1000 300"
          preserveAspectRatio="none"
        >
          <g fill="none" stroke="currentColor" strokeWidth="1.25">
            <path
              data-path-index={0}
              className={styles["signal-path"]}
              pathLength="100"
              strokeDasharray="100"
              d="M190 65 H285 Q310 65 310 90 V130 Q310 150 335 150 H450"
            />
            <path
              data-path-index={1}
              className={styles["signal-path"]}
              pathLength="100"
              strokeDasharray="100"
              d="M190 150 H450"
            />
            <path
              data-path-index={2}
              className={styles["signal-path"]}
              pathLength="100"
              strokeDasharray="100"
              d="M190 235 H285 Q310 235 310 210 V170 Q310 150 335 150 H450"
            />
            <path
              data-path-index={3}
              className={styles["signal-path"]}
              pathLength="100"
              strokeDasharray="100"
              d="M550 150 H650 Q685 150 685 120 V85 Q685 70 710 70 H790"
            />
            <path
              data-path-index={4}
              className={styles["signal-path"]}
              pathLength="100"
              strokeDasharray="100"
              d="M550 150 H650 Q685 150 685 180 V215 Q685 230 710 230 H790"
            />
          </g>
          <g
            fill="none"
            stroke="var(--color-secondary)"
            strokeWidth="3"
            strokeLinecap="round"
          >
            {SIGNAL_PATHS.map((path, index) => (
              <path
                key={path}
                data-path-index={index}
                d={path}
                pathLength="100"
                strokeDasharray="4 200"
                strokeDashoffset="6"
                className={[
                  styles["flow-packet"],
                  index < 3 ? styles["flow-in"] : styles["flow-out"],
                ].join(" ")}
              />
            ))}
          </g>
        </svg>
        <div className={styles["signal-inputs"]}>
          <div className={styles["signal-input"]}>Behavioral patterns</div>
          <div className={styles["signal-input"]}>Browser environment</div>
          <div className={styles["signal-input"]}>Session context</div>
        </div>
        <div className={styles["signal-center"]}>
          <div className={styles["signal-core"]}>
            <svg viewBox="0 0 76.21 88" width="100%" height="100%">
              <polygon points="38.105,0 76.21,22 38.105,44 0,22" fill="var(--color-ternary)" />
              <polygon points="0,22 38.105,44 38.105,88 0,66" fill="var(--color-primary)" />
              <polygon points="38.105,44 76.21,22 76.21,66 38.105,88" fill="var(--color-secondary)" />
            </svg>
          </div>
        </div>
        <div className={styles["signal-outputs"]}>
          <div className={styles["signal-output"]}>
            <strong>Human likelihood</strong>
            <small>Score and confidence</small>
            <div className={styles["signal-mini-bars"]}>
              {[43, 71, 54, 90, 73, 86].map(
                (height, i) => (
                  <i key={i} style={{ height: `${height}%` }} />
                ),
              )}
            </div>
          </div>
          <div
            className={[
              styles["signal-output"],
              styles["continuity-output"],
            ].join(" ")}
          >
            <strong>Subject continuity</strong>
            <small>Anonymous session linkage</small>
            <div className={styles["continuity-nodes"]}>
              {["New", "Uncertain", "Matched"].map((label) => (
                <div className={styles["continuity-state"]} key={label}>
                  <i className={styles["continuity-node"]} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
