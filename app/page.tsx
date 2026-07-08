import { redirect } from "next/navigation";

// Middleware normally handles this; kept as a fallback.
export default function Home() {
  redirect("/dashboard");
}
