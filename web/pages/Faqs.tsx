import styles from "./Faqs.module.css";
import { useId, useState } from "react";
import { useContentMotion } from "../hooks/motion";

const FAQS = [
  [
    "Does 0identity verify a real person?",
    "No. Human likelihood and anonymous subject continuity are separate estimates. A subject ID is not a verified real-world identity.",
  ],
  [
    "What’s the difference between score and confidence?",
    "The score describes how human-like the evidence appears. Confidence reflects its quality and quantity; missing data is not proof of automation.",
  ],
  [
    "Does AI decide the scores?",
    "No. Deterministic rules calculate scores. AI explains stored evidence through read-only tools. Scoring works without AI.",
  ],
  [
    "Can it recognize someone on a different device?",
    "Not reliably. The current policy prevents changed-device sessions from becoming strong matches. Similar behavior alone is insufficient.",
  ],
  [
    "What information is collected?",
    "The SDK collects aggregated interaction statistics and browser properties when explicitly started. It excludes typed content, passwords, clipboard contents, and raw event streams. This demo uses synthetic signals.",
  ],
  [
    "Are simulations accuracy measurements?",
    "No. Synthetic profiles demonstrate the scoring and continuity pipeline. Real-world accuracy requires independently labeled evaluation data.",
  ],
  [
    "How do I test a returning session?",
    "In Simulator, run Human visitor first, then a returning-visitor profile. Dashboard contains the saved assessments and subject history.",
  ],
] as const;

function FaqItem({
  question,
  answer,
  open,
  onToggle,
}: {
  question: string;
  answer: string;
  open: boolean;
  onToggle: () => void;
}) {
  const id = useId();
  const scope = useContentMotion<HTMLElement>(`.${styles["faq-answer"]} p`, [
    open,
  ]);
  return (
    <article ref={scope} className={styles["faq-item"]}>
      <h2>
        <button
          type="button"
          data-motion-lift
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
        >
          <span>{question}</span>
          <span className={styles["faq-toggle"]} aria-hidden="true">
            {open ? "Hide" : "Show"}
          </span>
        </button>
      </h2>
      <div className={styles["faq-answer"]} id={id} hidden={!open}>
        <p>{answer}</p>
      </div>
    </article>
  );
}

export function Faqs() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  return (
    <section
      className={styles["faq-list"]}
      aria-label="Frequently asked questions"
      data-enter
    >
      <header className={styles["page-intro"]}>
        <h1>Frequently asked questions</h1>
        <p>Understand the scores, the signals we collect, and the limits of anonymous continuity.</p>
      </header>
      {FAQS.map(([question, answer], index) => (
        <FaqItem
          key={question}
          question={question}
          answer={answer}
          open={openIndex === index}
          onToggle={() =>
            setOpenIndex((current) => (current === index ? null : index))
          }
        />
      ))}
    </section>
  );
}
