import AuthForm from "@/components/AuthForm";
import { getSessionUserId } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Sign in — LexiGlass" };

export default async function LoginPage() {
  if (await getSessionUserId()) redirect("/dashboard");
  return <AuthForm mode="login" />;
}
