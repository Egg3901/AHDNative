/**
 * Shared fixed-footer clearance publication (#436).
 *
 * The fixed footer grows with the home-indicator inset and large text, so
 * both game shells measure its live height instead of trusting a hardcoded
 * floor. The value is published in two scopes:
 *
 * - the screen element, for descendant consumers (`.ahd-main` bottom
 *   padding, `.ahd-mp-layout` clearance, `.ahd-resource-popover`
 *   max-height);
 * - `document.documentElement`, for the document-level consumer
 *   (`html { scroll-padding-bottom }`), which cannot inherit a custom
 *   property set on a descendant screen element. Without the root
 *   publication the document rule always fell back to 9rem, so on a phone
 *   whose footer grew past the 160px budget (home indicator + large text)
 *   keyboard-focus scrolling could park page content under the footer.
 *
 * Publishing higher changes no geometry by itself: descendants inherit the
 * same value they already received, and `env()` is zero on desktop, so
 * desktop layout is byte-identical. Uninstall clears the shared root value
 * so a stale height never leaks onto a footer-less screen; the per-screen
 * inline value dies with its detached element.
 */

export const FOOTER_HEIGHT_VAR = "--ahd-footer-height";

/**
 * Measures `footer` and publishes its height under {@link FOOTER_HEIGHT_VAR}
 * on both `screen` and `document.documentElement`, re-measuring on resize.
 * Returns an uninstall function that disconnects the observer and clears
 * the shared root publication. Safe to call with a null footer (noop).
 */
export function installFooterClearance(
  footer: HTMLElement | null,
  screen: HTMLElement | null,
): () => void {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;
  const clearRoot = () => {
    root.style.removeProperty(FOOTER_HEIGHT_VAR);
  };
  if (!footer) return () => {};
  const measure = () => {
    const value = `${footer.getBoundingClientRect().height}px`;
    screen?.style.setProperty(FOOTER_HEIGHT_VAR, value);
    root.style.setProperty(FOOTER_HEIGHT_VAR, value);
  };
  measure();
  if (typeof ResizeObserver === "undefined") return clearRoot;
  const observer = new ResizeObserver(measure);
  observer.observe(footer);
  return () => {
    observer.disconnect();
    clearRoot();
  };
}
