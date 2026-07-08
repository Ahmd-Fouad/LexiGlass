// Small client-side fetch helper: JSON in/out, throws Error with the API's message.
export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Something went wrong");
  }
  return data as T;
}

export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "due today", "in 3 days", "2 days overdue" */
export function dueLabel(due: string | Date): { text: string; overdue: boolean } {
  const diff = Math.ceil((new Date(due).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (diff <= 0 && diff > -1) return { text: "due today", overdue: true };
  if (diff <= -1) return { text: `${Math.abs(Math.floor(diff))}d overdue`, overdue: true };
  if (diff === 1) return { text: "due tomorrow", overdue: false };
  return { text: `due in ${diff}d`, overdue: false };
}
