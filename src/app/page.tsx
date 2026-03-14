"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Typography, Button, Card, CardContent, Stack, CircularProgress, Chip, LinearProgress } from "@mui/material";
import StyleIcon from "@mui/icons-material/Style";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

interface DashData { dueCount: number; totalWords: number; todayReviews: number; streak: number; }

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress /></Box>;

  const allDone = data.dueCount === 0;

  return (
    <Box sx={{ maxWidth: 640, mx: "auto" }}>
      <Typography variant="h4" fontWeight={700} mb={0.5}>おはよう 👋</Typography>
      <Typography color="text.secondary" mb={4}>
        {allDone ? "All caught up for today!" : `You have ${data.dueCount} card${data.dueCount !== 1 ? "s" : ""} to review.`}
      </Typography>

      {/* CTA */}
      {!allDone ? (
        <Button variant="contained" size="large" startIcon={<StyleIcon />} onClick={() => router.push("/review")} sx={{ mb: 4 }}>
          Start review ({data.dueCount} due)
        </Button>
      ) : (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 4, color: "success.main" }}>
          <CheckCircleIcon />
          <Typography fontWeight={600}>Reviews done for today — come back tomorrow!</Typography>
        </Box>
      )}

      {/* Stats row */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 2, mb: 4 }}>
        <StatCard icon={<LocalFireDepartmentIcon color="error" />} value={data.streak} label="day streak" />
        <StatCard icon={<LibraryBooksIcon color="primary" />} value={data.totalWords} label="words known" />
        <StatCard icon={<StyleIcon color="success" />} value={data.todayReviews} label="reviewed today" />
      </Box>

      {/* Quick links */}
      <Typography variant="overline" color="text.secondary">Quick actions</Typography>
      <Stack direction="row" gap={2} mt={1} flexWrap="wrap">
        <Button variant="outlined" onClick={() => router.push("/vocabulary")}>Add words</Button>
        <Button variant="outlined" onClick={() => router.push("/analyze")}>Analyze text</Button>
        <Button variant="outlined" onClick={() => router.push("/sentences")}>Practice sentences</Button>
        <Button variant="outlined" onClick={() => router.push("/stats")}>View stats</Button>
      </Stack>
    </Box>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 2 }}>
        {icon}
        <Typography variant="h4" fontWeight={700} mt={0.5}>{value}</Typography>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
      </CardContent>
    </Card>
  );
}
