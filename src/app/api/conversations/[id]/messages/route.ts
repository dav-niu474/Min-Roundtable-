import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// POST /api/conversations/[id]/messages — add a message
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { role, content, personality_id, personality_name, personality_color } = body;

    if (!role || content === undefined) {
      return NextResponse.json({ error: "role and content are required" }, { status: 400 });
    }

    if (!["user", "assistant"].includes(role)) {
      return NextResponse.json({ error: "role must be 'user' or 'assistant'" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: id,
        role,
        content,
        personality_id: personality_id || null,
        personality_name: personality_name || null,
        personality_color: personality_color || null,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[POST /api/conversations/:id/messages]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Auto-generate title from first user message
    if (role === "user") {
      const { count } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("conversation_id", id);

      if (count === 1) {
        const titleText = content.length > 50 ? content.slice(0, 50) + "…" : content;
        await supabase
          .from("conversations")
          .update({ title: titleText })
          .eq("id", id);
      }
    }

    return NextResponse.json({ message: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[POST /api/conversations/:id/messages]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
