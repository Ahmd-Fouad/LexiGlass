import type { Metadata } from "next";
import { Fraunces, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora" });
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
});

export const metadata: Metadata = {
  title: "LexiGlass — English study companion",
  description: "Flashcards, grammar and spaced-repetition quizzes for learning English.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${fraunces.variable}`}>
      <body>
        <div className="aurora" aria-hidden />
        {children}
      </body>
    </html>
  );
}
