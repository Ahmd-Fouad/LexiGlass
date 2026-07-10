"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A small "listen" button that speaks the given text with the browser's
 * built-in speech synthesis (window.speechSynthesis). No paid TTS.
 *
 * Renders nothing when the browser has no speech synthesis. Safe on the
 * server: it assumes support until mounted, so there's no hydration flash for
 * the common (supported) case.
 */
export default function SpeakButton({
  text,
  label,
  className = "",
  rate = 0.95,
  lang = "en-US",
}: {
  text: string;
  label?: string;
  className?: string;
  rate?: number;
  lang?: string;
}) {
  const [supported, setSupported] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      mounted.current = false;
    };
  }, []);

  const speak = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    synth.cancel(); // stop anything already playing
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    utterance.onend = () => mounted.current && setSpeaking(false);
    utterance.onerror = () => mounted.current && setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  }, [text, rate, lang]);

  if (!supported || !text.trim()) return null;

  return (
    <button
      type="button"
      onClick={speak}
      aria-label={label ?? `Listen to ${text}`}
      title={label ?? "Listen"}
      className={`inline-flex size-7 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm transition-colors hover:bg-white/10 ${
        speaking ? "text-violet-200" : "text-ink-muted hover:text-ink"
      } ${className}`}
    >
      <span aria-hidden>{speaking ? "◼" : "🔊"}</span>
    </button>
  );
}
