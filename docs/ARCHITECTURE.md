# Notula Architecture

> **Last Updated:** 2026-01-07  
> **Stack:** Next.js 15 (App Router) + Supabase + MeetingBaas + Claude AI

---

## System Overview

Notula is a meeting recording and transcription application that integrates with Google Calendar via MeetingBaas for automated bot-based meeting recording.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            User's Browser                                   │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│   │   Login     │  │  Dashboard  │  │  Meeting    │  │  Settings   │       │
│   │   (OAuth)   │  │  (List)     │  │  Details    │  │  (Calendar) │       │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │
└──────────┼────────────────┼────────────────┼────────────────┼──────────────┘
           │                │                │                │
           ▼                ▼                ▼                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        Next.js Application                                  │
│                                                                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────────┐│
│  │  /api/bots     │  │  /api/calendar │  │  /api/webhooks/meetingbaas     ││
│  │  - POST (new)  │  │  - /connect    │  │  - bot.completed               ││
│  │  - GET (list)  │  │  - /callback   │  │  - bot.failed                  ││
│  │  - /[id]       │  │  - /events     │  │  - calendar.event_created      ││
│  │                │  │  - /schedule   │  │  - calendar.event_updated      ││
│  └────────────────┘  └────────────────┘  └────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────────┘
           │                                        │
           ▼                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                            MeetingBaas API                                  │
│                                                                             │
│  • Calendar sync (Google Calendar via OAuth)                                │
│  • Bot scheduling and management (immediate + scheduled)                    │
│  • Meeting recording (audio/video)                                          │
│  • Transcription via Gladia                                                 │
│  • Speaker diarization                                                      │
│  • Webhooks for real-time status updates                                    │
└─────────────────────────────────────────┬──────────────────────────────────┘
                                          │
                                          ▼
                            ┌──────────────────────────┐
                            │   Meeting Platforms      │
                            │  • Google Meet           │
                            │  • Zoom                  │
                            │  • Microsoft Teams       │
                            └──────────────────────────┘
```

---

## Data Storage Strategy

The application follows a **local-first** approach:

1. **Store Everything Locally**: All content (recordings, transcripts, summaries) is saved to Supabase PostgreSQL via webhooks
2. **Generate AI Content Once**: Summary and action items are generated when a meeting completes, then cached
3. **No Runtime API Calls**: Meeting detail pages read entirely from local database
4. **Expiring URLs Don't Matter**: MeetingBaas URLs expire after 4 hours, but we've already stored the data

```
Webhook → Store Transcript → Generate AI Summary → Save to DB → Serve Locally
```

---

## Core Flows

### 1. User Login & Calendar Connection

```
User → Login Page → Supabase Auth (Google OAuth)
                         │
                         ▼
             /auth/callback → Create Session → Redirect to Dashboard
                                                     │
                                                     ▼
                                    User clicks "Connect Calendar" (Settings)
                                                     │
                                                     ▼
                              /api/calendar/connect → Google OAuth Consent
                                                     │
                                                     ▼
                              /api/calendar/callback
                                  ├── Exchange code for tokens
                                  ├── Create MeetingBaas calendar connection
                                  ├── Store encrypted tokens in Supabase
                                  └── Redirect to Settings (success)
```

### 2. Automatic Bot Scheduling (Calendar Events)

```
User creates event in Google Calendar
                │
                ▼
    Google pushes to MeetingBaas (sync)
                │
                ▼
    MeetingBaas sends calendar.event_created webhook
                │
                ▼
    /api/webhooks/meetingbaas → handleCalendarEventCreated()
                │
                ├── For each event with meeting_url:
                │       ├── Check for existing scheduled bot
                │       └── scheduleCalendarBot() → MeetingBaas API
                │
                └── Bot scheduled (joins at meeting start time)
```

### 3. Manual Bot Creation

```
User submits meeting URL (Dashboard)
                │
                ▼
    POST /api/bots
        ├── Authenticate user
        ├── Call createMeetingBot() → MeetingBaas API
        ├── Store meeting record in Supabase (status: queued)
        └── Return bot_id to client
```

### 4. Meeting Recording & Processing

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
        ├── Extract user_id from webhook extra data
        ├── Create/update meeting record
        │
        ├── Download and store transcript (JSON with utterances)
        │      └── Save to `transcripts` table
        │
        ├── Download and store diarization (speaker identification)
        │      └── Save to `diarizations` table
        │
        ├── Store participant info
        │      └── Save to `participants` table
        │
        ├── Generate AI content (Claude)
        │      ├── Summary → `summaries` table
        │      └── Action Items → `action_items` table
        │
        └── Update meeting status: completed, processingStatus: completed
```

### 5. Calendar Event Updates/Cancellations

```
User modifies/cancels event in Google Calendar
                │
                ▼
    MeetingBaas sends calendar.event_updated or calendar.event_cancelled
                │
                ▼
    /api/webhooks/meetingbaas
        │
        ├── event_updated:
        │       ├── Cancel old scheduled bot
        │       └── Schedule new bot with updated time
        │
        └── event_cancelled:
                └── Cancel scheduled bot (if exists)
```

---

## Database Schema

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for full schema.

| Table | Purpose |
|-------|---------|
| `users` | User profiles (synced from Supabase Auth) |
| `calendar_accounts` | Connected Google Calendar accounts with encrypted OAuth tokens |
| `meetings` | Bot recordings and metadata (local cache) |
| `transcripts` | Full transcript data with speaker utterances |
| `diarizations` | Speaker identification data |
| `summaries` | AI-generated meeting summaries |
| `action_items` | Extracted action items/tasks |
| `participants` | Meeting attendees |
| `calendar_events` | Cached calendar events (8-hour TTL) |

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/bots` | POST | Create new immediate bot |
| `/api/bots` | GET | List user's meetings (paginated) |
| `/api/bots/[id]` | GET | Get meeting detail with transcript/summary |
| `/api/bots/[id]` | DELETE | Delete meeting and associated data |
| `/api/calendar/connect` | GET | Initiate Google Calendar OAuth |
| `/api/calendar/callback` | GET | Handle OAuth callback, create MeetingBaas calendar |
| `/api/calendar/events` | GET | List calendar events (cached) |
| `/api/calendar/schedule-bot` | POST | Schedule bot for calendar event |
| `/api/webhooks/meetingbaas` | POST | Handle all MeetingBaas webhooks |

---

## Key Integrations

| Service | Purpose | Auth |
|---------|---------|------|
| **Supabase** | Auth & Database | Anon key + Row Level Security |
| **MeetingBaas** | Calendar sync, Bot management, Recording | API key + Webhook signature (SVIX) |
| **Google** | OAuth for Supabase Auth + Calendar access | OAuth 2.0 |
| **Claude AI (Anthropic)** | Summary generation, Action item extraction | API key |
| **Gladia** (via MeetingBaas) | Transcription, Speaker diarization | Included in MeetingBaas |

---

## Security

### Authentication
- **Supabase Auth** with Google OAuth provider
- Session managed via HTTP-only cookies (SSR)
- Middleware protects routes: `/`, `/meetings/*`

### User Sync
- Users from `auth.users` synced to `public.users` via [`ensureUserExists()`](file:///Users/suwandi/potts/potts-app/lib/utils/ensure-user.ts)
- Called in all authenticated API routes before database operations

### Webhook Verification
- **SVIX signature verification** for MeetingBaas webhooks
- Fallback to Bearer token for backwards compatibility
- User identification via `extra.user_id` in webhook payload

### Token Storage
- OAuth tokens encrypted using AES-256-GCM before storage
- Encryption key stored in environment variable

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
DATABASE_URL=                    # Pooled connection (via Supavisor)
DIRECT_URL=                      # Direct connection (for migrations)

# MeetingBaas
MEETINGBAAS_API_KEY=
MEETINGBAAS_CALLBACK_URL=        # Your webhook URL
MEETINGBAAS_CALLBACK_SECRET=     # Bearer token for webhook
MEETINGBAAS_SVIX_SECRET=         # SVIX signing secret

# Google OAuth (for Calendar)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# AI
ANTHROPIC_API_KEY=

# Security
ENCRYPTION_KEY=                  # 32-byte hex for token encryption
```

---

## Directory Structure

```
potts-app/
├── app/                        # Next.js App Router
│   ├── api/                   # API routes
│   │   ├── bots/             # Bot management
│   │   ├── calendar/         # Calendar integration
│   │   └── webhooks/         # MeetingBaas webhooks
│   ├── auth/                  # Auth callbacks
│   ├── login/                # Login page
│   ├── meetings/             # Meeting detail pages
│   └── settings/             # Settings page
├── components/                # React components
├── lib/
│   ├── ai/                   # AI generation (Claude)
│   ├── api/                  # External API clients
│   │   └── meetingbaas.ts   # MeetingBaas SDK wrapper
│   ├── hooks/                # React hooks
│   ├── supabase/             # Supabase client helpers
│   └── utils/                # Utilities
├── prisma/
│   └── schema.prisma         # Database schema
└── middleware.ts              # Auth middleware
```
