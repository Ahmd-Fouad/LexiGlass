"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { clearOfflineData, countQueuedActions, syncQueuedReviewActions } from "@/lib/client-offline";
import OfflineStatus from "@/components/offline/OfflineStatus";

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

export default function AppShell({ children, userName, userKey }: { children: ReactNode; userName: string; userKey: string }) {
  const pathname = usePathname();
  const [logoutBusy, setLogoutBusy] = useState(false);

  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      const queued = await countQueuedActions();
      if (queued > 0) {
        const syncFirst = window.confirm(
          `You have ${queued} unsynced offline ${queued === 1 ? "rating" : "ratings"}. ` +
          "Choose OK to sync before signing out, or Cancel for discard/cancel options."
        );
        if (syncFirst) {
          const outcome = await syncQueuedReviewActions();
          if (!outcome.ok || outcome.remaining > 0) {
            const discard = window.confirm(
              `Sync did not settle ${outcome.remaining} ${outcome.remaining === 1 ? "rating" : "ratings"}. ` +
              "Choose OK to discard them and sign out, or Cancel to stay signed in."
            );
            if (!discard) return;
          }
        } else {
          const discard = window.confirm(
            `Discard ${queued} unsynced offline ${queued === 1 ? "rating" : "ratings"} and sign out? ` +
            "Choose Cancel to stay signed in."
          );
          if (!discard) return;
        }
      }
      await clearOfflineData();
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out");
      window.location.assign("/login");
    } catch {
      window.alert("Could not complete sign out. Please try again while online.");
    } finally {
      setLogoutBusy(false);
    }
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
          <OfflineStatus userKey={userKey} className="mt-1 px-2" />
          <button
            onClick={logout}
            disabled={logoutBusy}
            className="mt-2 w-full rounded-xl px-3.5 py-2 text-left text-sm text-ink-muted transition-colors hover:bg-white/5 hover:text-ink"
          >
            {logoutBusy ? "Signing out…" : "Sign out"}
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
          <div className="flex items-center gap-3">
            <OfflineStatus userKey={userKey} />
            <button onClick={logout} disabled={logoutBusy} className="text-sm text-ink-muted hover:text-ink">
              {logoutBusy ? "Signing out…" : "Sign out"}
            </button>
          </div>
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
