-- Migration: Add calendar caching table
-- Run in Supabase SQL Editor: https://supabase.com/dashboard -> SQL Editor
-- Date: 2026-01-04

-- Caching table for calendar events (avoids API rate limits)
CREATE TABLE IF NOT EXISTS calendar_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    event_id text NOT NULL,
    calendar_id text NOT NULL,
    title text NOT NULL,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone NOT NULL,
    meeting_url text,
    platform text,
    bot_scheduled boolean DEFAULT false,
    raw_data jsonb NOT NULL,
    last_fetched_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,

    CONSTRAINT calendar_events_pkey PRIMARY KEY (id)
);

-- Unique index to prevent duplicates (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_event_id_key ON calendar_events(event_id);

-- Index for querying by calendar
CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id ON calendar_events(calendar_id);
