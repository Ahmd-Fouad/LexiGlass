"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "◈" },
  { href: "/cards", label: "Flashcards", icon: "▤" },
  { href: "/review", label: "Review", icon: "↻" },
  { href: "/collections", label: "Collections", icon: "▦" },
  { href: "/writing", label: "Writing", icon: "✍" },
  { href: "/pronunciation", label: "Pronunciation", icon: "🔊" },
  { href: "/quiz/vocab", label: "Vocab quiz", icon: "?" },
  { href: "/grammar", label: "Grammar", icon: "¶" },
  { href: "/quiz/grammar", label: "Grammar quiz", icon: "✎" },
  { href: "/mistakes", label: "Mistake Bank", icon: "⚑" },
  { href: "/stats", label: "Progress", icon: "∿" },
];

export default function AppShell({ children, userName }: { children: ReactNode; userName: string }) {
  const pathname = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  }

  const linkClass = (href: string) => {
    const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
    return `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors ${
      active
        ? "bg-white/10 font-semibold text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
        : "text-ink-muted hover:bg-white/5 hover:text-ink"
    }`;
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-4 sm:px-6">
      {/* Desktop sidebar */}
      <aside className="glass sticky top-4 hidden h-[calc(100vh-2rem)] w-60 shrink-0 flex-col rounded-2xl p-4 lg:flex">
        <Link href="/dashboard" className="mb-8 block px-2 pt-2">
          <span className="font-display text-2xl font-semibold tracking-tight">
            Lexi<span className="bg-gradient-to-r from-violet-glow to-teal-glow bg-clip-text text-transparent">Glass</span>
          </span>
          <span className="mt-0.5 block text-xs text-ink-muted">English study companion</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass(item.href)}>
              <span className="w-5 text-center text-base opacity-80" aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="truncate px-2 text-sm font-medium">{userName}</p>
          <button
            onClick={logout}
            className="mt-2 w-full rounded-xl px-3.5 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 pb-24 lg:pb-4">
        {/* Mobile top bar */}
        <div className="glass mb-4 flex items-center justify-between rounded-2xl px-4 py-3 lg:hidden">
          <Link href="/dashboard" className="font-display text-xl font-semibold">
            Lexi<span className="bg-gradient-to-r from-violet-glow to-teal-glow bg-clip-text text-transparent">Glass</span>
          </Link>
          <button onClick={logout} className="text-sm text-ink-muted hover:text-ink">
            Sign out
          </button>
        </div>
        {children}
      </div>

      {/* Mobile bottom nav */}
      <nav className="glass fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-2xl px-1 py-2 lg:hidden">
        {NAV.slice(0, 5).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] ${
                active ? "text-ink" : "text-ink-muted"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>{item.icon}</span>
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
