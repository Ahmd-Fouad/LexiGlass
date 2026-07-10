import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest (excluded from the auth middleware).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LexiGlass — English study companion",
    short_name: "LexiGlass",
    description:
      "Flashcards, grammar and spaced-repetition quizzes for learning English.",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#0b0e1a",
    theme_color: "#0b0e1a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
