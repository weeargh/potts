# Potts Architecture

## Overview

Potts is a meeting recording and transcription application that integrates with Google Calendar and uses MeetingBaas for bot-based meeting recording.

```
┌───────────────────────────────────────────────────────────────────┐
│                         User's Browser                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│   │   Login     │  │  Dashboard  │  │  Meeting    │               │
│   │   (OAuth)   │  │  (Events)   │  │  Details    │               │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │
└──────────┼────────────────┼────────────────┼──────────────────────┘
           │                │                │
           ▼                ▼                ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Next.js Application                            │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ /api/calendar│  │  /api/bots   │  │/api/webhooks │            │
│  │   /connect   │  │  POST/GET    │  │ /meetingbaas │            │
│  │   /callback  │  │              │  │              │            │
│  │   /events    │  │              │  │              │            │
│  │ /schedule-bot│  │              │  │              │            │
│  └──────┬───────┘  └──────┬───────┘  └───────┬──────┘            │
└─────────┼─────────────────┼──────────────────┼───────────────────┘
          │                 │                  │
          ▼                 ▼                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                        MeetingBaas API                            │
│                                                                   │
│  • Calendar sync (Google/Outlook)                                 │
│  • Bot scheduling and management                                  │
│  • Meeting recording                                              │
│  • Transcription (via Gladia)                                     │
│  • Webhooks for status updates                                    │
└─────────────────────────────────────┬────────────────────────────┘
                                      │
                                      ▼
                        ┌──────────────────────────┐
                        │   Meeting Platforms      │
                        │  • Google Meet           │
                        │  • Zoom                  │
                        │  • Microsoft Teams       │
                        └──────────────────────────┘
```

## Core Flows

### 1. User Login & Calendar Connection

```
User → Login Page → Google OAuth → Auth Callback
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
                    ▼                                       ▼
            Create Supabase Session         Clean up existing calendars
                                                    │
                                                    ▼
                                    Create MeetingBaas calendar connection
                                                    │
                                                    ▼
                                    Auto-schedule bots for all events
                                                    │
                                                    ▼
                                            Redirect to Dashboard
```

### 2. New Event → Auto-Schedule

```
User creates event in Google Calendar
                │
                ▼
    Google pushes to MeetingBaas (webhook)
                │
                ▼
    MeetingBaas sends calendar.event_created webhook
                │
                ▼
    /api/webhooks/meetingbaas → handleCalendarEventCreated()
                │
                ▼
    For each event with meeting_url:
        → scheduleCalendarBot()
                │
                ▼
    Bot scheduled on MeetingBaas (joins at meeting start)
```

### 3. Meeting Recording

```
Meeting starts
        │
        ▼
Bot joins meeting (MeetingBaas)
        │
        ▼
Bot records audio/video
        │
        ▼
Meeting ends → Bot leaves
        │
        ▼
MeetingBaas sends bot.completed webhook
        │
        ▼
/api/webhooks/meetingbaas → handleBotCompleted()
        │
        ├─→ Save recording URLs to database
        │
        ├─→ Fetch transcript from MeetingBaas
        │
        └─→ Generate AI summary & action items (Claude)
```

## Database Schema

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for full schema.

| Table | Purpose |
|-------|---------|
| `users` | User profiles (synced from Supabase Auth) |
| `calendar_accounts` | Connected Google Calendar accounts |
| `meetings` | Recording sessions and metadata |
| `transcripts` | Meeting transcripts |
| `summaries` | AI-generated meeting summaries |
| `action_items` | Extracted action items |
| `calendar_events` | Cached calendar events |

## Key Integrations

| Service | Purpose | Auth |
|---------|---------|------|
| Supabase | Auth & Database | Anon key + Row Level Security |
| MeetingBaas | Calendar sync, Bot management | API key |
| Google | OAuth, Calendar access | OAuth 2.0 |
| Claude (Anthropic) | AI summaries & action items | API key |

## Environment Variables

Required variables for deployment:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=
DIRECT_URL=

# MeetingBaas
MEETINGBAAS_API_KEY=
MEETINGBAAS_CALLBACK_URL=
MEETINGBAAS_CALLBACK_SECRET=

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# AI
ANTHROPIC_API_KEY=
```
