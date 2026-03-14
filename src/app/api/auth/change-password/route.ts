import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

// NOTE: This only works if AUTH_PASSWORD_HASH is in a writable config.
// Since we store it in env vars, we log the new hash for the user to update manually.
// A future improvement would be to store it in the DB.
export async function POST(req: NextRequest) {
  const { currentPassword, newPassword } = await req.json();
  const hash = process.env.AUTH_PASSWORD_HASH!;

  const valid = await bcrypt.compare(currentPassword, hash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  // Log to server console — user must update AUTH_PASSWORD_HASH in .env
  console.log("\n[kasoku] New password hash — update AUTH_PASSWORD_HASH in your .env:\n" + newHash + "\n");

  return NextResponse.json({
    ok: true,
    message: "Hash printed to server logs. Update AUTH_PASSWORD_HASH in .env and restart.",
    hash: newHash,
  });
}
