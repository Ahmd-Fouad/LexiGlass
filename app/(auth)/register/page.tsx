import AuthForm from "@/components/AuthForm";
import { getSessionUserId } from "@/lib/auth";
import { redirect } from "next/navigation";

export const metadata = { title: "Create account — LexiGlass" };

export default async function RegisterPage() {
  if (await getSessionUserId()) redirect("/dashboard");
  return <AuthForm mode="register" />;
}
