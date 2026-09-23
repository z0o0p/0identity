export const PAGE_TITLES = {
  home: "Are you human?",
  simulator: "Simulator",
  faqs: "Frequently asked questions",
  dashboard: "Developer dashboard",
} as const;

export type Page = keyof typeof PAGE_TITLES;

export function pageFromHash(hash: string): Page {
  const candidate = hash.replace(/^#\/?/, "").replace(/\/$/, "");
  return Object.hasOwn(PAGE_TITLES, candidate) ? (candidate as Page) : "home";
}
