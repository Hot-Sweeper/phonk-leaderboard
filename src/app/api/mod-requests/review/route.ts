import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH — approve or reject a mod request (admin only)
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId, action, reviewNote } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const modRequest = await prisma.modRequest.findUnique({
    where: { id: requestId },
  });

  if (!modRequest || modRequest.status !== "PENDING") {
    return NextResponse.json(
      { error: "Request not found or already reviewed." },
      { status: 404 }
    );
  }

  if (action === "approve") {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: modRequest.userId },
        data: { role: "MODERATOR" },
      }),
      prisma.modRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          reviewedBy: session.user.id,
          reviewNote: reviewNote?.trim() || null,
        },
      }),
    ]);
  } else {
    await prisma.modRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedBy: session.user.id,
        reviewNote: reviewNote?.trim() || null,
      },
    });
  }

  return NextResponse.json({ success: true });
}
