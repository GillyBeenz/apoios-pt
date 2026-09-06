"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The filter panel's disclosure.
 *
 * Rendered `open`, always, and collapsed afterwards only on a narrow screen. The
 * order matters, because the two failure modes are not equally bad: a panel that
 * stays open when it could have collapsed costs a scroll, while a panel that fails
 * to open hides every filter in the app.
 *
 * Pure CSS cannot do this safely. Hiding the summary at `md` and forcing the form
 * to `display: block` looks right and is not: Chrome hides a closed `<details>`
 * through `::details-content { content-visibility: hidden }`, which `display` does
 * not override, so the panel measured as completely invisible on desktop —
 * summary hidden by the media query, content hidden by the UA. Firefox and Safari
 * would have shown it. That is exactly the kind of difference nobody notices until
 * someone reports an empty sidebar.
 *
 * So the collapse is done here instead, once, on mount, and only downwards. With
 * JavaScript off the panel is simply open at every width — which is what it was
 * before, and correct.
 */
export function PainelFiltros({
  className,
  resumo,
  children,
}: {
  className?: string;
  resumo: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    // Matches the `md` breakpoint the sidebar layout switches at.
    if (window.matchMedia("(max-width: 47.999rem)").matches) el.open = false;
  }, []);

  return (
    <details ref={ref} open className={className}>
      {resumo}
      {children}
    </details>
  );
}
