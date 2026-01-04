-- Migration: Add missing columns and indices to meetings table
-- Run in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor
-- Date: 2026-01-04

-- =============================================
-- Phase 1: Add Missing Columns to Meetings
-- =============================================

-- Add calendar_event_id if missing (older schemas might not have it)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

-- Add error tracking columns (stores MeetingBaas error codes)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Recording mode (speaker_view, gallery_view, audio_only)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_mode TEXT DEFAULT 'speaker_view';

-- End reason from MeetingBaas (NO_ATTENDEES, BOT_REMOVED, etc.)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS end_reason TEXT;

-- Diarization URL (speaker identification data)
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS diarization_url TEXT;

-- =============================================
-- Phase 2: Add Missing Columns to Calendar Accounts
-- =============================================

-- Store MeetingBaas calendar ID for reference
ALTER TABLE calendar_accounts ADD COLUMN IF NOT EXISTS meetingbaas_calendar_id TEXT;

-- =============================================
-- Phase 3: Create Indices
-- =============================================

-- Index for calendar sync queries (partial index for non-null values)
CREATE INDEX IF NOT EXISTS idx_meetings_calendar_event 
  ON meetings(calendar_event_id) 
  WHERE calendar_event_id IS NOT NULL;

-- Composite index for status + created_at (common query pattern)
CREATE INDEX IF NOT EXISTS idx_meetings_status_created 
  ON meetings(status, created_at DESC);

-- Index for calendar ID lookups
CREATE INDEX IF NOT EXISTS idx_calendar_accounts_mb_id 
  ON calendar_accounts(meetingbaas_calendar_id) 
  WHERE meetingbaas_calendar_id IS NOT NULL;

-- =============================================
-- Verify Changes
-- =============================================

-- Check meetings table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'meetings'
ORDER BY ordinal_position;

-- Check indices
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'meetings';
