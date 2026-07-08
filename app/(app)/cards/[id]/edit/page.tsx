import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import CardForm from "@/components/cards/CardForm";
import { toCardDTO } from "@/components/cards/card-dto";

export const metadata = { title: "Edit card — LexiGlass" };

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const { id } = await params;

  const card = await db.flashcard.findUnique({ where: { id } });
  if (!card || card.userId !== userId) notFound();

  return (
    <main className="rise-in mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-3xl font-semibold">
        Edit “{card.text}”
      </h1>
      <CardForm card={toCardDTO(card)} />
    </main>
  );
}
