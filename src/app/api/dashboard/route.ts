import { NextResponse } from "next/server";
import { db, words, reviewLogs, srsCards } from "@/db";
import { sql, lte, gte, eq, or, and } from "drizzle-orm";

export async function GET() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [dueRes, learningRes, newRes, totalRes, todayRes, streakRes] = await Promise.all([
    // Due review cards (state=2, due now)
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(srsCards)
      .where(and(eq(srsCards.state, 2), lte(srsCards.dueDate, now))),
    // Learning/relearning cards due now (state=1 or 3)
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(srsCards)
      .where(and(or(eq(srsCards.state, 1), eq(srsCards.state, 3)), lte(srsCards.dueDate, now))),
    // New cards available (state=0, direction=0)
    db.select({ count: sql<number>`cast(count(*) as integer)` }).from(srsCards)
      .where(sql`${srsCards.state} = 0 and ${srsCards.direction} = 0`),
    db.select({ count: sql<number>`cast(count(distinct ${words.id}) as integer)` }).from(words),
    db.select({ count: sql<number>`cast(count(distinct ${reviewLogs.wordId}) as integer)` }).from(reviewLogs).where(gte(reviewLogs.reviewedAt, todayStart)),
    db
      .select({ date: sql<string>`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch'))` })
      .from(reviewLogs)
      .groupBy(sql`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch'))`)
      .orderBy(sql`strftime('%Y-%m-%d', datetime(${reviewLogs.reviewedAt}, 'unixepoch')) desc`),
  ]);

  const streak = calcStreak(streakRes.map((r) => r.date));
  const dueCount = (dueRes[0]?.count ?? 0) + (learningRes[0]?.count ?? 0);

  return NextResponse.json({
    dueCount,
    dueReview: dueRes[0]?.count ?? 0,
    learningDue: learningRes[0]?.count ?? 0,
    newAvailable: newRes[0]?.count ?? 0,
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
