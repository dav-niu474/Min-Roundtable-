import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

// GET /api/conversations?session_id=xxx — list conversations
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("session_id");
    if (!sessionId) {
      return NextResponse.json({ error: "session_id is required" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, session_id, type, title, personality_ids, model, message_count, created_at, updated_at")
      .eq("session_id", sessionId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[GET /api/conversations]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversations: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[GET /api/conversations]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/conversations — create a new conversation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { session_id, type, personality_ids, model, title } = body;

    if (!session_id || !type || !Array.isArray(personality_ids)) {
      return NextResponse.json(
        { error: "session_id, type, and personality_ids are required" },
        { status: 400 }
      );
    }

    if (!["chat", "roundtable"].includes(type)) {
      return NextResponse.json({ error: "type must be 'chat' or 'roundtable'" }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        session_id,
        type,
        personality_ids: personality_ids,
        model: model || "meta/llama-3.1-405b-instruct",
        title: title || null,
      })
      .select("id, session_id, type, title, personality_ids, model, message_count, created_at, updated_at")
      .single();

    if (error) {
      console.error("[POST /api/conversations]", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conversation: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[POST /api/conversations]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
