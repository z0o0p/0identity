import styles from "./Home.module.css";
import { SignalIllustration } from "../components/SignalIllustration";

export function Home() {
  return (
    <section className={styles["home-stage"]} aria-labelledby="page-title">
      <h1 id="page-title" className={styles["hero-title"]} data-enter>
        ARE YOU <span>human?</span>
      </h1>
      <p className={styles["hero-description"]} data-enter>
        0identity helps websites understand whether a visit looks like a real
        person or an automated bot, using patterns in clicks, scrolling, and
        browser signals. Separately, it estimates whether the visitor may be a
        returning anonymous subject, without needing a name or login.
      </p>
      <SignalIllustration />
    </section>
  );
}
