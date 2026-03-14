"use client";
import { useState } from "react";
import {
  Box, Typography, Card, CardContent, Stack, Button, TextField,
  Alert, Divider, Switch, FormControlLabel,
} from "@mui/material";
import { useThemeMode } from "@/lib/ThemeContext";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutIcon from "@mui/icons-material/Logout";

export default function SettingsPage() {
  const { mode, toggle } = useThemeMode();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  async function handleChangePassword() {
    setPwLoading(true);
    setPwMsg(null);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    setPwLoading(false);
    if (res.ok) {
      setPwMsg({ type: "success", text: "Password changed successfully." });
      setCurrentPw(""); setNewPw("");
    } else {
      const data = await res.json();
      setPwMsg({ type: "error", text: data.error ?? "Failed to change password." });
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <Box sx={{ maxWidth: 560, mx: "auto" }}>
      <Typography variant="h5" fontWeight={700} mb={3}>Settings</Typography>

      {/* Appearance */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Appearance</Typography>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" gap={1}>
              {mode === "dark" ? <DarkModeIcon /> : <LightModeIcon />}
              <Typography>{mode === "dark" ? "Dark mode" : "Light mode"}</Typography>
            </Stack>
            <Switch checked={mode === "dark"} onChange={toggle} />
          </Stack>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Change password</Typography>
          <Stack gap={2}>
            {pwMsg && <Alert severity={pwMsg.type}>{pwMsg.text}</Alert>}
            <TextField label="Current password" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} fullWidth size="small" />
            <TextField label="New password" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} fullWidth size="small" />
            <Button
              variant="outlined"
              onClick={handleChangePassword}
              disabled={pwLoading || !currentPw || !newPw}
              sx={{ alignSelf: "flex-start" }}
            >
              {pwLoading ? "Saving…" : "Change password"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* About */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={1}>About</Typography>
          <Typography variant="body2" color="text.secondary">加速 Kasoku — Personal Japanese learning app</Typography>
          <Typography variant="body2" color="text.secondary">FSRS spaced repetition · kuromoji tokenizer · Jisho dictionary</Typography>
        </CardContent>
      </Card>

      {/* Logout */}
      <Button variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleLogout}>
        Logout
      </Button>
    </Box>
  );
}
