import { NextResponse } from "next/server";
import pg from "pg";

export const runtime = "nodejs";

// POST /api/db-setup — Create Supabase tables for the Mind Roundtable app
// This endpoint should be called once to initialize the database schema.
// After successful setup, this route can be removed.

const SCHEMA_SQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('chat', 'roundtable')),
  title TEXT,
  personality_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT NOT NULL DEFAULT 'meta/llama-3.1-405b-instruct',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL DEFAULT '',
  personality_id TEXT,
  personality_name TEXT,
  personality_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Auto-update updated_at on conversations
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON conversations;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-update message_count
CREATE OR REPLACE FUNCTION update_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE conversations SET message_count = message_count + 1 WHERE id = NEW.conversation_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE conversations SET message_count = message_count - 1 WHERE id = OLD.conversation_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_message_change ON messages;
CREATE TRIGGER on_message_change
  AFTER INSERT OR DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_message_count();

-- RLS (Row Level Security)
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon (since we use session_id for isolation)
CREATE POLICY "Allow all on conversations" ON conversations
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on messages" ON messages
  FOR ALL USING (true) WITH CHECK (true);
`;

export async function POST() {
  try {
    // Try Vercel Supabase integration env var names first, then standard names
    const connectionString =
      process.env.minRoundtable_POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      "";

    if (!connectionString) {
      return NextResponse.json(
        {
          error:
            "No PostgreSQL connection string found. " +
            "Expected env vars: minRoundtable_POSTGRES_URL_NON_POOLING or POSTGRES_URL_NON_POOLING",
        },
        { status: 500 }
      );
    }

    // Supabase on Vercel uses self-signed certs; override TLS globally for this connection
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const client = new pg.Client({
      connectionString,
    });

    await client.connect();
    console.log("[db-setup] Connected to PostgreSQL");

    // Execute schema SQL
    await client.query(SCHEMA_SQL);
    console.log("[db-setup] Schema executed successfully");

    // Verify tables were created
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('conversations', 'messages')
      ORDER BY table_name;
    `);

    await client.end();

    const createdTables = tablesResult.rows.map((r) => r.table_name);

    return NextResponse.json({
      success: true,
      message: "Database schema created successfully",
      tables: createdTables,
      note: "You can now remove the /api/db-setup route.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[db-setup] Error:", message);
    return NextResponse.json(
      { error: "Failed to create database schema", details: message },
      { status: 500 }
    );
  }
}

// GET /api/db-setup — Check if tables already exist
export async function GET() {
  try {
    const connectionString =
      process.env.minRoundtable_POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      "";

    if (!connectionString) {
      return NextResponse.json(
        { error: "No PostgreSQL connection string found" },
        { status: 500 }
      );
    }

    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const client = new pg.Client({
      connectionString,
    });

    await client.connect();

    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('conversations', 'messages')
      ORDER BY table_name;
    `);

    await client.end();

    return NextResponse.json({
      tables: tablesResult.rows.map((r) => r.table_name),
      ready: tablesResult.rows.length === 2,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
