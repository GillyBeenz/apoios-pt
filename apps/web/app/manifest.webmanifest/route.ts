export function GET(): Response {
  return Response.json({
    name: "Apoios",
    short_name: "Apoios",
    description: "Apoios ambientais para a sua casa, em Portugal.",
    lang: "pt-PT",
    start_url: "/apoios",
    display: "standalone",
    background_color: "#fbfbf9",
    theme_color: "#1f7a4d",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  });
}
