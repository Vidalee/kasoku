import { NextResponse } from "next/server";
import { db, words, reviewLogs, srsCards } from "@/db";
import { sql, gte, lte } from "drizzle-orm";

export async function GET() {
  const now = new Date();
  const yearAgo = new Date(now);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    totalWordsRes,
    dueCountRes,
    wordsByJlptRes,
    reviewsByDayRes,
    retentionRes,
    wordsOverTimeRes,
    streakRes,
    todayDistinctRes,
  ] = await Promise.all([
    // Total words
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(words),

    // Due today
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(srsCards).where(lte(srsCards.dueDate, now)),

    // Words by JLPT level
    db
      .select({ jlptLevel: words.jlptLevel, count: sql<number>`cast(count(*) as integer)` })
      .from(words)
      .groupBy(words.jlptLevel),

    // Reviews per day (last 365 days) — for heatmap
    db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch'))`,
        count: sql<number>`cast(count(*) as integer)`,
        correct: sql<number>`cast(count(*) filter (where ${reviewLogs.rating} >= 3) as integer)`,
      })
      .from(reviewLogs)
      .where(gte(reviewLogs.reviewedAt, yearAgo))
      .groupBy(sql`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch'))`),

    // Retention rate (Good or Easy / total, last 30 days)
    db
      .select({
        total: sql<number>`cast(count(*) as integer)`,
        good: sql<number>`cast(count(*) filter (where ${reviewLogs.rating} >= 3) as integer)`,
      })
      .from(reviewLogs)
      .where(gte(reviewLogs.reviewedAt, new Date(now.getTime() - 30 * 86400000))),

    // Words added per day (cumulative) — last 90 days
    db
      .select({
        date: sql<string>`strftime('%Y-%m-%d', datetime(${words.createdAt}, 'unixepoch'))`,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(words)
      .where(gte(words.createdAt, new Date(now.getTime() - 90 * 86400000)))
      .groupBy(sql`strftime('%Y-%m-%d', datetime(${words.createdAt}, 'unixepoch'))`),

    // Streak: consecutive days with at least 1 review
    db
      .select({ date: sql<string>`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch'))` })
      .from(reviewLogs)
      .groupBy(sql`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch'))`)
      .orderBy(sql`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch')) desc`),

    // Today's distinct words reviewed
    db.select({ count: sql<number>`cast(count(distinct ${reviewLogs.wordId}) as integer)` })
      .from(reviewLogs).where(gte(reviewLogs.reviewedAt, todayStart)),
  ]);

  const streak = calcStreak(streakRes.map((r) => r.date));
  const retention = retentionRes[0]?.total
    ? Math.round((retentionRes[0].good / retentionRes[0].total) * 100)
    : null;

  // 7-day forecast
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), day: i };
  });

  return NextResponse.json({
    totalWords: totalWordsRes[0]?.count ?? 0,
    dueNow: dueCountRes[0]?.count ?? 0,
    wordsByJlpt: wordsByJlptRes,
    reviewsByDay: reviewsByDayRes,
    retention,
    wordsOverTime: wordsOverTimeRes,
    streak,
    forecast,
    todayReviews: todayDistinctRes[0]?.count ?? 0,
  });
}

function calcStreak(sortedDates: string[]): number {
  if (!sortedDates.length) return 0;
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let expected = today;
  for (const d of sortedDates) {
    if (d === expected) {
      streak++;
      const prev = new Date(expected);
      prev.setDate(prev.getDate() - 1);
      expected = prev.toISOString().slice(0, 10);
    } else break;
  }
  return streak;
}
