import { useRef, type DependencyList, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const MOTION_ALLOWED = "(prefers-reduced-motion: no-preference)";

export function usePageMotion(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        MOTION_ALLOWED,
        () => {
          const entering = scope.current?.querySelectorAll("[data-enter]");
          if (entering?.length) {
            gsap
              .timeline({ defaults: { duration: 0.8, ease: "power3.out" } })
              .from(entering, {
                y: 26,
                opacity: 0,
                stagger: 0.09,
                clearProps: "transform,opacity",
              });
          }
        },
        scope,
      );
      return () => {
        media.revert();
      };
    },
    { scope },
  );
}

export function useContentMotion<T extends HTMLElement>(
  selector: string,
  dependencies: DependencyList,
) {
  const scope = useRef<T>(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        MOTION_ALLOWED,
        () => {
          const elements = scope.current?.querySelectorAll(selector);
          if (elements?.length)
            gsap.from(elements, {
              y: 12,
              opacity: 0,
              duration: 0.45,
              stagger: 0.035,
              ease: "power2.out",
              clearProps: "transform,opacity",
            });
          const bars = scope.current?.querySelectorAll("[data-score-bar]");
          if (bars?.length)
            gsap.from(bars, {
              scaleX: 0,
              transformOrigin: "left center",
              duration: 0.7,
              stagger: 0.06,
              ease: "power3.out",
              clearProps: "transform",
            });
        },
        scope,
      );
      return () => media.revert();
    },
    { scope, dependencies: [...dependencies], revertOnUpdate: true },
  );
  return scope;
}

export function useInteractiveMotion(scope: RefObject<HTMLElement | null>) {
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add(
        `(hover: hover) and ${MOTION_ALLOWED}`,
        (context) => {
          const root = scope.current;
          if (!root) return;
          const targetFor = (event: Event) =>
            event.target instanceof Element
              ? event.target.closest<HTMLElement>(
                "button:not(:disabled), [data-motion-interactive]",
              )
              : null;
          context.add("enter", (event: Event) => {
            const target = targetFor(event);
            if (target)
              gsap.to(
                target,
                target.hasAttribute("data-motion-lift")
                  ? { y: -2, duration: 0.2, overwrite: "auto" }
                  : { scale: 1.025, duration: 0.2, overwrite: "auto" },
              );
          });
          context.add("leave", (event: Event) => {
            const target = targetFor(event);
            if (target)
              gsap.to(
                target,
                target.hasAttribute("data-motion-lift")
                  ? { y: 0, duration: 0.25, overwrite: "auto" }
                  : { scale: 1, duration: 0.25, overwrite: "auto" },
              );
          });
          const enter = (event: Event) => {
            context.enter(event);
          };
          const leave = (event: Event) => {
            context.leave(event);
          };
          root.addEventListener("pointerover", enter);
          root.addEventListener("pointerout", leave);
          root.addEventListener("focusin", enter);
          root.addEventListener("focusout", leave);
          return () => {
            root.removeEventListener("pointerover", enter);
            root.removeEventListener("pointerout", leave);
            root.removeEventListener("focusin", enter);
            root.removeEventListener("focusout", leave);
          };
        },
        scope,
      );
      return () => media.revert();
    },
    { scope },
  );
}

export { gsap, useGSAP, MOTION_ALLOWED };
