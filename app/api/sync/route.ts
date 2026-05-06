import { NextResponse } from "next/server";
import { runSummarize } from "@/lib/summarize-runner";
import { runSync } from "@/lib/sync";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const sync = await runSync();
    const summarize = await runSummarize({ limit: 50 });
    return NextResponse.json({ ok: true, sync, summarize });
  } catch (err) {
    console.error("cron sync failed", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
