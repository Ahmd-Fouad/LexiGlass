import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegistrar from "@/components/offline/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "LexiGlass — English study companion",
  description: "Flashcards, grammar and spaced-repetition quizzes for learning English.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="aurora" aria-hidden />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
