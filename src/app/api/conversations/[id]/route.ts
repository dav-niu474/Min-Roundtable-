import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/conversations/[id] — get conversation with messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = getServerSupabase();

    // Get conversation
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, session_id, type, title, personality_ids, model, message_count, created_at, updated_at")
      .eq("id", id)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Get messages
    const { data: msgs, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("[GET /api/conversations/:id/messages]", msgError);
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    return NextResponse.json({ conversation: conv, messages: msgs || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[GET /api/conversations/:id]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/conversations/[id] — update conversation title or personality_ids
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, personality_ids, model } = body;

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (personality_ids !== undefined) updates.personality_ids = personality_ids;
    if (model !== undefined) updates.model = model;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", id)
      .select("id, session_id, type, title, personality_ids, model, message_count, created_at, updated_at")
      .single();

    if (error) {
      console.error("[PATCH /api/conversations/:id]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversation: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[PATCH /api/conversations/:id]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/conversations/[id] — delete conversation and its messages
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = getServerSupabase();
    const { error } = await supabase.from("conversations").delete().eq("id", id);

    if (error) {
      console.error("[DELETE /api/conversations/:id]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[DELETE /api/conversations/:id]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
