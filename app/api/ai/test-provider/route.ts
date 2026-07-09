import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { badRequest, toErrorResponse } from "@/lib/api-helpers";
import { isSupportedProviderName, testProvider } from "@/lib/ai/test-provider";

/**
 * Tests one AI provider with a single tiny generation request. Never saves
 * anything to the database and never returns key values — only whether the
 * provider is configured and whether it returned a well-formed question.
 */
export async function POST(req: Request) {
  try {
    await requireUserId();
    const body = await req.json().catch(() => ({}));

    if (!isSupportedProviderName(body.provider)) {
      return badRequest("Unsupported provider.");
    }

    const result = await testProvider(body.provider);
    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
