import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { badRequest, readJsonBody, toErrorResponse } from "@/lib/api-helpers";
import { isSupportedProviderName, testProvider } from "@/lib/ai/test-provider";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Tests one AI provider with a single tiny generation request. Never saves
 * anything to the database and never returns key values — only whether the
 * provider is configured and whether it returned a well-formed question.
 */
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const limited = await enforceRateLimit({ req, action: "providerTest", userId });
    if (limited) return limited;
    const parsed = await readJsonBody(req, 2 * 1024);
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;

    if (!isSupportedProviderName(body.provider)) {
      return badRequest("Unsupported provider.");
    }

    const result = await testProvider(body.provider);
    return NextResponse.json(result);
  } catch (e) {
    return toErrorResponse(e);
  }
}
