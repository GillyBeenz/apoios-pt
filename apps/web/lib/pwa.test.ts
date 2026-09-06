import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GET } from "../app/manifest.webmanifest/route.ts";

const PUBLICO = join(import.meta.dirname, "..", "public");

/**
 * A PWA fails quietly in every direction.
 *
 * The manifest previously listed `/icone-192.png` and `/icone-512.png`, neither of
 * which existed anywhere in the repository, so the install prompt never appeared —
 * and nothing in the build, the tests or the deploy said a word. `sw.js` had the
 * same problem from the other end: a carefully written service worker that nothing
 * ever registered, so it never installed and `/offline` was unreachable exactly
 * when it was needed.
 *
 * These are the assertions that would have caught both.
 */
describe("manifesto", () => {
  it("aponta só para ficheiros que existem", async () => {
    const manifesto = await (GET() as Response).json();
    for (const icone of manifesto.icons as { src: string }[]) {
      expect(existsSync(join(PUBLICO, icone.src)), `falta ${icone.src}`).toBe(true);
    }
  });

  /**
   * Android crops a maskable icon to roughly its central 80%. Declaring one file as
   * "any maskable" — as this did — means either the whole icon is shown with the
   * padding a maskable one needs, or the unpadded one loses its edges. The two
   * purposes need two different pictures.
   */
  it("separa os ícones mascaráveis dos normais", async () => {
    const manifesto = await (GET() as Response).json();
    const icones = manifesto.icons as { src: string; purpose?: string }[];

    for (const i of icones) {
      expect(i.purpose, `${i.src} declara dois propósitos`).not.toMatch(/any.*maskable/);
    }
    expect(icones.some((i) => i.purpose === "maskable")).toBe(true);
    expect(icones.some((i) => i.purpose === "any")).toBe(true);
  });

  it("tem o mínimo que um browser exige para oferecer a instalação", async () => {
    const m = await (GET() as Response).json();
    expect(m.name).toBeTruthy();
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBeTruthy();
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(m.display);
    // 192 and 512 are the two sizes Chrome checks for.
    const tamanhos = (m.icons as { sizes: string }[]).map((i) => i.sizes);
    expect(tamanhos).toContain("192x192");
    expect(tamanhos).toContain("512x512");
  });
});

describe("service worker", () => {
  it("é registado por alguém", () => {
    const registo = readFileSync(
      join(import.meta.dirname, "..", "components", "RegistarServiceWorker.tsx"),
      "utf8",
    );
    expect(registo).toContain("serviceWorker.register");

    const layout = readFileSync(join(import.meta.dirname, "..", "app", "layout.tsx"), "utf8");
    expect(layout).toContain("RegistarServiceWorker");
  });

  /**
   * The one thing this app must never do is serve a cached page saying a programme
   * is open after it closed. Only content-hashed build output may be cache-first.
   */
  it("só serve da cache primeiro o que tem hash no URL", () => {
    const sw = readFileSync(join(PUBLICO, "sw.js"), "utf8");
    const chamadas = [...sw.matchAll(/cachePrimeiro\(/g)];
    expect(chamadas.length).toBe(2); // a definição e uma única utilização
    expect(sw).toMatch(/_next\/static\/[\s\S]{0,200}cachePrimeiro/);
  });
});
