"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { runSync, type SyncStatus } from "./syncEngine";

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sync = useCallback(async () => {
    if (!navigator.onLine) { setStatus("offline"); return; }
    setStatus("syncing");
    const result = await runSync();
    setStatus(result);
    if (result === "idle") setLastSyncAt(new Date());
  }, []);

  useEffect(() => {
    // Sync on mount
    sync();

    // Sync on reconnect
    window.addEventListener("online", sync);
    window.addEventListener("offline", () => setStatus("offline"));

    // Periodic sync
    timerRef.current = setInterval(sync, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", sync);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sync]);

  return { status, lastSyncAt, sync };
}
