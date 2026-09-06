import type { MetadataRoute } from "next";

/**
 * The install manifest.
 *
 * Two things here were wrong before and both broke installability outright: it
 * pointed at `/icone-192.png` and `/icone-512.png`, which did not exist anywhere
 * in the repository, and it declared the same unpadded file as `"any maskable"`.
 * A maskable icon is cropped by the launcher to roughly its central 80%, so an
 * unpadded one loses its edges; the two purposes need two different pictures.
 *
 * `start_url` is /apoios rather than /: someone who installed this did so to
 * check funding, not to read the landing page again.
 */
export function GET(): Response {
  const manifest: MetadataRoute.Manifest = {
    id: "/",
    name: "Apoios — financiamento ambiental para a sua casa",
    short_name: "Apoios",
    description:
      "Apoios ambientais e energéticos para habitação em Portugal, com alerta " +
      "quando abre financiamento para o que quer melhorar em casa.",
    lang: "pt-PT",
    dir: "ltr",
    start_url: "/apoios",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fbfbf9",
    theme_color: "#2b7a55",
    categories: ["utilities", "finance", "lifestyle"],
    icons: [
      { src: "/icone.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icone-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icone-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Apoios abertos",
        short_name: "Abertos",
        url: "/apoios?estado=aberto&beneficiario=particular,condominio",
      },
      { name: "Preferências de alerta", short_name: "Alertas", url: "/conta/preferencias" },
    ],
  };

  return Response.json(manifest, {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
