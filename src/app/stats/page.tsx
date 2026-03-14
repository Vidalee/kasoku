"use client";
import { useEffect, useState } from "react";
import {
  Box, Typography, Card, CardContent, Stack, CircularProgress,
  Chip, useTheme,
} from "@mui/material";
import LocalFireDepartmentIcon from "@mui/icons-material/LocalFireDepartment";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import StyleIcon from "@mui/icons-material/Style";
import CalendarHeatmap from "react-calendar-heatmap";
import "react-calendar-heatmap/dist/styles.css";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface StatsData {
  totalWords: number;
  dueNow: number;
  streak: number;
  retention: number | null;
  todayReviews: number;
  wordsByJlpt: { jlptLevel: number | null; count: number }[];
  reviewsByDay: { date: string; count: number; correct: number }[];
  wordsOverTime: { date: string; count: number }[];
}

const JLPT_COLORS: Record<string, string> = {
  "5": "#4CAF50", "4": "#8BC34A", "3": "#FFC107", "2": "#FF9800", "1": "#F44336", "null": "#9E9E9E",
};

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setStats);
  }, []);

  if (!stats) return <Box sx={{ display: "flex", justifyContent: "center", pt: 8 }}><CircularProgress /></Box>;

  // Build cumulative words over time
  let cumulative = 0;
  const cumulativeWords = stats.wordsOverTime
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => { cumulative += d.count; return { date: d.date.slice(5), words: cumulative }; });

  // Heatmap: last 365 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);
  const heatValues = stats.reviewsByDay.map((d) => ({ date: d.date, count: d.count }));

  // Words by JLPT for bar chart
  const jlptData = stats.wordsByJlpt
    .filter((d) => d.jlptLevel !== null)
    .sort((a, b) => (b.jlptLevel ?? 0) - (a.jlptLevel ?? 0))
    .map((d) => ({ name: `N${d.jlptLevel}`, count: d.count, color: JLPT_COLORS[String(d.jlptLevel)] }));

  const primary = theme.palette.primary.main;
  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const textColor = theme.palette.text.secondary;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3}>Stats</Typography>

      {/* Big numbers */}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 2, mb: 4 }}>
        <BigStat icon={<LibraryBooksIcon color="primary" />} value={stats.totalWords} label="Total words" />
        <BigStat icon={<LocalFireDepartmentIcon color="error" />} value={stats.streak} label="Day streak" />
        <BigStat icon={<StyleIcon color="success" />} value={stats.todayReviews} label="Reviewed today" />
        <BigStat
          icon={<TrendingUpIcon color="warning" />}
          value={stats.retention !== null ? `${stats.retention}%` : "—"}
          label="30-day retention"
        />
      </Box>

      {/* Heatmap */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Review activity</Typography>
          <Box sx={{
            "& .react-calendar-heatmap": { width: "100%" },
            "& .react-calendar-heatmap text": { fill: textColor, fontSize: "9px" },
            "& .color-empty": { fill: isDark ? "#2B2930" : "#eee" },
            "& .color-scale-1": { fill: isDark ? "#3b2f6e" : "#c4b5fd" },
            "& .color-scale-2": { fill: isDark ? "#5b3fae" : "#8b5cf6" },
            "& .color-scale-3": { fill: isDark ? "#7c3aed" : "#6d28d9" },
            "& .color-scale-4": { fill: isDark ? "#a855f7" : "#4c1d95" },
          }}>
            <CalendarHeatmap
              startDate={startDate}
              endDate={endDate}
              values={heatValues}
              classForValue={(value) => {
                if (!value || value.count === 0) return "color-empty";
                if (value.count < 5) return "color-scale-1";
                if (value.count < 15) return "color-scale-2";
                if (value.count < 30) return "color-scale-3";
                return "color-scale-4";
              }}
              tooltipDataAttrs={(value) =>
                (value as { date?: string; count?: number } | undefined)?.date
                  ? ({ "data-tip": `${(value as { date: string; count: number }).date}: ${(value as { date: string; count: number }).count} reviews` } as Record<string, string>)
                  : ({} as Record<string, string>)
              }
            />
          </Box>
        </CardContent>
      </Card>

      {/* Charts row */}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3, mb: 3 }}>
        {/* Words over time */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>Words learned (last 90 days)</Typography>
            {cumulativeWords.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={cumulativeWords}>
                  <defs>
                    <linearGradient id="wordGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="date" tick={{ fill: textColor, fontSize: 11 }} />
                  <YAxis tick={{ fill: textColor, fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${gridColor}` }}
                    labelStyle={{ color: theme.palette.text.primary }}
                  />
                  <Area type="monotone" dataKey="words" stroke={primary} fill="url(#wordGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary" variant="body2">No data yet.</Typography>
            )}
          </CardContent>
        </Card>

        {/* Words by JLPT level */}
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>Words by JLPT level</Typography>
            {jlptData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={jlptData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                  <XAxis type="number" tick={{ fill: textColor, fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fill: textColor, fontSize: 11 }} width={32} />
                  <Tooltip
                    contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${gridColor}` }}
                    labelStyle={{ color: theme.palette.text.primary }}
                  />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {jlptData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Typography color="text.secondary" variant="body2">No data yet.</Typography>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Daily reviews sparkline */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={600} mb={2}>Daily reviews (last 30 days)</Typography>
          {stats.reviewsByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={stats.reviewsByDay.slice(-30).map((d) => ({ date: d.date.slice(5), reviews: d.count, correct: d.correct }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fill: textColor, fontSize: 10 }} interval={4} />
                <YAxis tick={{ fill: textColor, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: theme.palette.background.paper, border: `1px solid ${gridColor}` }}
                  labelStyle={{ color: theme.palette.text.primary }}
                />
                <Bar dataKey="correct" stackId="a" fill={theme.palette.success.main} radius={[0, 0, 0, 0]} name="Correct" />
                <Bar dataKey="reviews" stackId="a" fill={theme.palette.error.light} radius={[3, 3, 0, 0]} name="Again/Hard" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Typography color="text.secondary" variant="body2">No reviews yet — start reviewing to see data here!</Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}

function BigStat({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 2 }}>
        {icon}
        <Typography variant="h4" fontWeight={700} mt={0.5}>{value}</Typography>
        <Typography variant="caption" color="text.secondary" textAlign="center">{label}</Typography>
      </CardContent>
    </Card>
  );
}
