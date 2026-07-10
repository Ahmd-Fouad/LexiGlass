"use client";

/** The friendly explanation shown while the user is offline. */
export default function OfflineReviewBanner() {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100"
    >
      You are offline. You can review recently loaded cards. Your ratings will
      sync when you are back online.
    </div>
  );
}
