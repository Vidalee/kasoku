import { NextRequest, NextResponse } from "next/server";
import { mergeClientChanges, getServerChangesSince } from "@/lib/sync-merge";

export async function POST(req: NextRequest) {
  const { clientId, lastSyncAt, changes } = await req.json();

  try {
    // 1. Merge client changes into server DB (with conflict resolution)
    await mergeClientChanges(changes, lastSyncAt);

    // 2. Return everything the client is missing since lastSyncAt
    const serverChanges = await getServerChangesSince(lastSyncAt);
    const syncedAt = Date.now();

    return NextResponse.json({ syncedAt, serverChanges });
  } catch (e) {
    console.error("Sync error:", e);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
