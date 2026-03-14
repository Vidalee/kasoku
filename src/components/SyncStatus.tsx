"use client";

import { Chip, CircularProgress, Tooltip, IconButton } from "@mui/material";
import SyncIcon from "@mui/icons-material/Sync";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import CheckIcon from "@mui/icons-material/Check";
import { useSync } from "@/lib/useSync";
import type { SyncStatus } from "@/lib/syncEngine";

export function SyncStatusChip() {
  const { status, lastSyncAt, sync } = useSync();

  const label = {
    idle: lastSyncAt ? `Synced ${formatTime(lastSyncAt)}` : "Not synced",
    syncing: "Syncing…",
    error: "Sync failed",
    offline: "Offline",
  }[status];

  const icon = {
    idle: <CheckIcon sx={{ fontSize: 14 }} />,
    syncing: <CircularProgress size={12} />,
    error: <SyncProblemIcon sx={{ fontSize: 14 }} />,
    offline: <WifiOffIcon sx={{ fontSize: 14 }} />,
  }[status];

  const color: Record<SyncStatus, "default" | "success" | "warning" | "error"> = {
    idle: "success",
    syncing: "default",
    error: "error",
    offline: "warning",
  };

  return (
    <Tooltip title={status === "error" ? "Click to retry" : "Click to sync now"}>
      <Chip
        size="small"
        icon={icon}
        label={label}
        color={color[status]}
        variant="outlined"
        onClick={sync}
        sx={{ cursor: "pointer", fontSize: "0.7rem" }}
      />
    </Tooltip>
  );
}

function formatTime(d: Date) {
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
