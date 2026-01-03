-- Mekari Callnote Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor

-- Users table (additional data, auth handled by Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,  -- Supabase Auth user ID (UUID)
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Calendar accounts (Google Calendar OAuth tokens)
CREATE TABLE IF NOT EXISTS calendar_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,  -- Store encrypted
  refresh_token TEXT,          -- Store encrypted
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, provider, email)
);

-- Meetings / Bots
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bot_id TEXT UNIQUE NOT NULL,  -- MeetingBaas bot ID
  bot_name TEXT NOT NULL,
  meeting_url TEXT NOT NULL,
  calendar_event_id TEXT,  -- If created from calendar
  status TEXT NOT NULL,  -- queued, waiting, recording, completed, failed
  duration_seconds INTEGER,
  participant_count INTEGER,
  video_url TEXT,
  audio_url TEXT,
  transcript_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_meetings_user_created ON meetings(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status);

-- Transcripts
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID UNIQUE NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  data JSONB NOT NULL,  -- Full transcript JSON
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI-generated summaries
CREATE TABLE IF NOT EXISTS summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID UNIQUE NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  overview TEXT NOT NULL,
  key_points TEXT[] DEFAULT '{}',
  decisions TEXT[] DEFAULT '{}',
  next_steps TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Action items
CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  assignee TEXT,
  due_date TEXT,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_meeting ON action_items(meeting_id);

-- Participants
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  left_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_participants_meeting ON participants(meeting_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own data
CREATE POLICY "Users can view own data" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own calendar accounts" ON calendar_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own calendar accounts" ON calendar_accounts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own meetings" ON meetings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own meetings" ON meetings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own meetings" ON meetings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own meetings" ON meetings FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view transcripts of own meetings" ON transcripts FOR SELECT
  USING (EXISTS (SELECT 1 FROM meetings WHERE meetings.id = transcripts.meeting_id AND meetings.user_id = auth.uid()));

CREATE POLICY "Users can view summaries of own meetings" ON summaries FOR SELECT
  USING (EXISTS (SELECT 1 FROM meetings WHERE meetings.id = summaries.meeting_id AND meetings.user_id = auth.uid()));

CREATE POLICY "Users can view action items of own meetings" ON action_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM meetings WHERE meetings.id = action_items.meeting_id AND meetings.user_id = auth.uid()));

CREATE POLICY "Users can manage action items of own meetings" ON action_items FOR ALL
  USING (EXISTS (SELECT 1 FROM meetings WHERE meetings.id = action_items.meeting_id AND meetings.user_id = auth.uid()));

CREATE POLICY "Users can view participants of own meetings" ON participants FOR SELECT
  USING (EXISTS (SELECT 1 FROM meetings WHERE meetings.id = participants.meeting_id AND meetings.user_id = auth.uid()));

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_accounts_updated_at BEFORE UPDATE ON calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_action_items_updated_at BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
