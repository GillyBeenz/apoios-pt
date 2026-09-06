"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * Without this the app was not a PWA in any working sense: `public/sw.js` existed
 * and was well thought through, but nothing ever called `register()`, so it never
 * installed, nothing was ever cached, and `/offline` was unreachable precisely
 * when it was needed. The manifest made the app *look* installable; the offline
 * behaviour it implied did not exist.
 *
 * Registration waits for `load` so it never competes with the first paint for
 * bandwidth, and every failure is swallowed: a browser with service workers
 * disabled, or a private window that refuses the registration, must still get a
 * perfectly good website.
 */
export function RegistarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registar = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };

    if (document.readyState === "complete") registar();
    else {
      window.addEventListener("load", registar, { once: true });
      return () => window.removeEventListener("load", registar);
    }
  }, []);

  return null;
}
