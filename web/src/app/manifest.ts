import type { MetadataRoute } from "next";

/**
 * Lets phones install Owezy to the home screen ("Add to Home screen" /
 * "Install app"). Icons come from scripts/make-icons.mjs. Opens on "/",
 * which goes straight to the last group.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Owezy",
    short_name: "Owezy",
    description: "Split expenses with friends in a few taps.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f6f8",
    theme_color: "#f5f6f8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
