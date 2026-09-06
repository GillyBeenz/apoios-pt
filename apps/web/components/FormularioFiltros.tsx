"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent, FormEvent, ReactNode } from "react";

/**
 * The only client-side code in the filter panel.
 *
 * The panel itself stays a server component on purpose. Marking the whole thing
 * `"use client"` pulled `@apoios/core`'s barrel — and through it `node:crypto`,
 * by way of the identity hashing — into the browser bundle, which fails the build
 * outright and would have shipped the ingestion vocabulary to every visitor if it
 * had not. Only the behaviour needs the client; the markup does not.
 *
 * Progressive enhancement in both directions:
 *
 *   * With JavaScript, changing any box pushes the new URL immediately — the same
 *     instant feel the old links had, minus a full page load.
 *   * Without it, this is still a plain GET form pointed at /apoios. The submit
 *     button lives in a `<noscript>` in the parent, so it appears exactly when it
 *     is the only way through.
 *
 * Either way the filter state lives in the URL and nowhere else, so every view is
 * shareable and the back button works.
 */
function urlDoFormulario(form: HTMLFormElement): string {
  const porChave = new Map<string, string[]>();
  for (const [chave, valor] of new FormData(form).entries()) {
    if (typeof valor !== "string") continue;
    porChave.set(chave, [...(porChave.get(chave) ?? []), valor]);
  }

  const p = new URLSearchParams();
  for (const [chave, valores] of porChave) {
    // The hidden empty fields exist only to keep a key present when every box is
    // unticked, so that "cleared" is not read back as "never set". Once a real
    // value is there they have done their job, and dropping them keeps a shared
    // link readable — `?estado=aberto` rather than `?estado=&estado=aberto`.
    const reais = valores.filter((v) => v.length > 0);
    for (const v of reais.length > 0 ? reais : valores) p.append(chave, v);
  }
  return `/apoios?${p.toString()}`;
}

export function FormularioFiltros({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  function aoMudar(evento: ChangeEvent<HTMLFormElement>) {
    router.push(urlDoFormulario(evento.currentTarget));
  }

  function aoSubmeter(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    router.push(urlDoFormulario(evento.currentTarget));
  }

  return (
    <form
      method="get"
      action="/apoios"
      onChange={aoMudar}
      onSubmit={aoSubmeter}
      className={className}
    >
      {children}
    </form>
  );
}
