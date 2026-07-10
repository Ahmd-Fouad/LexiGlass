import Link from "next/link";
import OfflineReviewBanner from "@/components/offline/OfflineReviewBanner";
import OfflineReviewSession from "@/components/offline/OfflineReviewSession";
import OfflineSyncPanel from "@/components/offline/OfflineSyncPanel";

export const metadata = { title: "Offline — LexiGlass" };

/**
 * Offline fallback page. The service worker precaches it (with its assets)
 * and serves it for any navigation while the network is unreachable. It is
 * public (no session needed) and renders no server-side user data — the
 * review cards come from this browser's IndexedDB cache.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div className="text-center">
        <Link href="/dashboard" className="font-display text-2xl font-semibold">
          Lexi<span className="bg-gradient-to-r from-violet-glow to-teal-glow bg-clip-text text-transparent">Glass</span>
        </Link>
        <h1 className="mt-4 font-display text-3xl font-semibold">Offline review</h1>
        <p className="mx-auto mt-1 max-w-xl text-sm text-ink-muted">
          Cards from your recent review sessions are stored in this browser, so a dropped
          connection doesn&apos;t have to end your studying.
        </p>
      </div>

      <OfflineReviewBanner />
      <OfflineReviewSession />
      <OfflineSyncPanel />

      <p className="text-center text-xs text-ink-muted">
        Back online?{" "}
        <Link href="/dashboard" className="underline underline-offset-2 hover:text-ink">
          Return to the dashboard
        </Link>
      </p>
    </main>
  );
}
