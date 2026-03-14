import { NextResponse } from "next/server";
import { db, words, reviewLogs, srsCards } from "@/db";
import { sql, lte, gte } from "drizzle-orm";

export async function GET() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [dueRes, totalRes, todayRes, streakRes] = await Promise.all([
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(srsCards).where(lte(srsCards.dueDate, now)),
    db.select({ count: sql<number>`cast(count(distinct ${words.id}) as integer)` }).from(words),
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(reviewLogs).where(gte(reviewLogs.reviewedAt, todayStart)),
    db
      .select({ date: sql<string>`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch'))` })
      .from(reviewLogs)
      .groupBy(sql`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch'))`)
      .orderBy(sql`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch')) desc`),
  ]);

  const streak = calcStreak(streakRes.map((r) => r.date));

  return NextResponse.json({
    dueCount: dueRes[0]?.count ?? 0,
    totalWords: totalRes[0]?.count ?? 0,
    todayReviews: todayRes[0]?.count ?? 0,
    streak,
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
