import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// PATCH /api/messages/[id] — update message content (used for streaming)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { content } = body;

    if (content === undefined) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("messages")
      .update({ content })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      console.error("[PATCH /api/messages/:id]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[PATCH /api/messages/:id]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
