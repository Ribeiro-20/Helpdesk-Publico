import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ announcementNumber: string }> },
) {
  const resolved = await params;
  const announcementNumber = decodeURIComponent(
    String(resolved.announcementNumber ?? ""),
  ).trim();

  const target = new URL("/oportunidades", req.url);
  if (announcementNumber) {
    target.searchParams.set("announcement_number", announcementNumber);
  }

  return NextResponse.redirect(target, 307);
}
