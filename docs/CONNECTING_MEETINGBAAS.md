# Connecting to MeetingBaas - Complete Integration Guide

This document provides a comprehensive guide for integrating with MeetingBaas API v2, including bot creation, calendar integration, webhook handling, and storing meeting data in your database.

## Table of Contents

1. [Overview](#overview)
2. [Environment Variables](#environment-variables)
3. [API Endpoints](#api-endpoints)
4. [Webhook Events & Payloads](#webhook-events--payloads)
5. [Database Schema Requirements](#database-schema-requirements)
6. [Complete Data Flow](#complete-data-flow)
7. [Critical Implementation Details](#critical-implementation-details)
8. [Common Issues & Solutions](#common-issues--solutions)
9. [Code Patterns](#code-patterns)

---

## Overview

MeetingBaas provides a bot-as-a-service platform that joins video meetings (Google Meet, Zoom, Teams, Webex), records them, and provides transcriptions.

### Two Ways to Create Bots

| Method | Use Case | Bot ID Availability |
|--------|----------|---------------------|
| **Direct Bot** (`POST /bots`) | Immediate recording | `bot_id` returned immediately |
| **Calendar Bot** (`POST /calendars/{id}/bots`) | Scheduled recording | `bot_id` NOT returned until bot joins |

**CRITICAL:** Calendar bots do NOT return a `bot_id` when scheduled. The `bot_id` is only assigned when the bot actually joins the meeting. Your code must handle this!

### Two Webhook Authentication Methods

| Method | Header | Use Case |
|--------|--------|----------|
| **Per-bot callback** | `x-mb-secret` | Bot events (bot.completed, bot.failed) |
| **Account webhook (SVIX)** | `svix-id`, `svix-timestamp`, `svix-signature` | Calendar events, account-level events |

---

## Environment Variables

```bash
# Required - MeetingBaas API
MEETINGBAAS_API_KEY=mb-xxxxxxxxxxxxx

# Required - Webhook callback URL (must be publicly accessible)
MEETINGBAAS_CALLBACK_URL=https://your-domain.com/api/webhooks/meetingbaas

# Required - Secret for per-bot callback verification
MEETINGBAAS_CALLBACK_SECRET=your-random-secret-string

# Required - SVIX secret for account-level webhooks (from MeetingBaas dashboard)
MEETINGBAAS_SVIX_SECRET=whsec_xxxxxxxxxxxxx

# Optional - Google OAuth for calendar integration
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
```

---

## API Endpoints

### Base URL
```
https://api.meetingbaas.com/v2
```

### Authentication Header
```
x-meeting-baas-api-key: {MEETINGBAAS_API_KEY}
```

### Bot Endpoints

#### Create Direct Bot (Immediate Join)
```http
POST /bots
Content-Type: application/json

{
  "meeting_url": "https://meet.google.com/abc-defg-hij",
  "bot_name": "My Recorder",
  "recording_mode": "speaker_view",  // or "gallery_view", "audio_only"
  "transcription_enabled": true,
  "transcription_config": {
    "provider": "gladia",
    "custom_params": {
      "summarization": true,
      "summarization_config": { "type": "bullet_points" }
    }
  },
  "callback_enabled": true,
  "callback_config": {
    "url": "https://your-domain.com/api/webhooks/meetingbaas",
    "method": "POST",
    "secret": "your-callback-secret"
  },
  "extra": {
    "user_id": "your-internal-user-id",
    "any_custom_data": "you want to pass"
  }
}
```

**Response:**
```json
{
  "bot_id": "uuid-of-the-bot",
  "status": "queued"
}
```

### Bot Name & Avatar Configuration

The bot name and avatar shown in meetings is configured when creating the bot:

```json
{
  "bot_name": "Notula - AI Notetaker",  // Shown in meeting participant list
  "bot_image": "https://your-domain.com/bot-avatar.png"  // Bot's profile picture
}
```

**Important:** For calendar-scheduled bots, do NOT pass `bot_name` as a config option - let it use the default so all bots appear consistently as "Notula - AI Notetaker". Store the meeting title separately in your database for display purposes.

#### Get Bot Status
```http
GET /bots/{bot_id}
```

#### Leave Meeting
```http
POST /bots/{bot_id}/leave
```

### Calendar Endpoints

#### Connect Calendar
```http
POST /calendars
Content-Type: application/json

{
  "calendar_platform": "google",
  "oauth_client_id": "your-google-client-id",
  "oauth_client_secret": "your-google-client-secret",
  "oauth_refresh_token": "user-refresh-token",
  "raw_calendar_id": "primary"
}
```

**Response:**
```json
{
  "calendar_id": "uuid-of-calendar",
  "calendar_platform": "google",
  "account_email": "user@gmail.com",
  "status": "active"
}
```

#### Schedule Bot for Calendar Event
```http
POST /calendars/{calendar_id}/bots
Content-Type: application/json

{
  "event_id": "calendar-event-uuid",
  "all_occurrences": false,
  "bot_name": "Meeting Recorder",
  "recording_mode": "speaker_view",
  "transcription_enabled": true,
  "transcription_config": { ... },
  "callback_enabled": true,
  "callback_config": { ... },
  "extra": {
    "user_id": "your-internal-user-id",
    "calendar_id": "calendar-uuid",
    "event_id": "event-uuid"
  }
}
```

**Response:**
```json
{
  // Returns updated event, NOT a bot_id!
  // bot_id is only assigned when bot joins
}
```

---

## Webhook Events & Payloads

### Webhook Endpoint Requirements

Your webhook endpoint must:
1. Accept `POST` requests
2. Verify authentication (see below)
3. Return `200 OK` quickly (process async if needed)
4. Handle duplicate deliveries (webhooks may retry)

### Authentication Verification

**Per-bot callbacks:**
```javascript
const secret = request.headers.get("x-mb-secret")
if (secret !== process.env.MEETINGBAAS_CALLBACK_SECRET) {
  return Response.json({ error: "Unauthorized" }, { status: 401 })
}
```

**SVIX webhooks:**
```javascript
import { Webhook } from "svix"

const wh = new Webhook(process.env.MEETINGBAAS_SVIX_SECRET)
const body = await request.text()
wh.verify(body, {
  "svix-id": request.headers.get("svix-id"),
  "svix-timestamp": request.headers.get("svix-timestamp"),
  "svix-signature": request.headers.get("svix-signature"),
})
```

### Bot Events

#### bot.completed

Sent when bot finishes recording and processing.

```json
{
  "event": "bot.completed",
  "data": {
    "bot_id": "uuid",
    "event_id": "calendar-event-uuid",  // Only for calendar bots
    "duration_seconds": 3600,
    "joined_at": "2024-01-01T10:00:00.000Z",
    "exited_at": "2024-01-01T11:00:00.000Z",
    "video": "https://s3-url/video.mp4",
    "audio": "https://s3-url/audio.flac",
    "transcription": "https://s3-url/transcription.json",
    "raw_transcription": "https://s3-url/raw_transcription.json",
    "diarization": "https://s3-url/diarization.jsonl",
    "participants": [
      { "id": null, "name": "John Doe" }
    ],
    "speakers": [
      { "id": null, "name": "John Doe" }
    ]
  }
}
```

**CRITICAL NOTES:**
- `extra` field is **NOT** returned in webhooks! You cannot rely on it.
- URLs expire after **4 hours**. Download content immediately!
- `video` field is used, NOT `mp4`
- `participants` is array of objects `{id, name}`, NOT strings

#### bot.failed

```json
{
  "event": "bot.failed",
  "data": {
    "bot_id": "uuid",
    "error_code": "BOT_NOT_ACCEPTED",
    "error_message": "Bot was not admitted to the meeting"
  }
}
```

#### bot.status_change

```json
{
  "event": "bot.status_change",
  "data": {
    "bot_id": "uuid",
    "status": {
      "code": "in_call_recording",
      "created_at": "2024-01-01T10:00:00.000Z"
    }
  }
}
```

Status codes: `queued`, `joining_call`, `in_waiting_room`, `in_call_not_recording`, `in_call_recording`, `call_ended`, `transcribing`, `recording_succeeded`, `completed`, `failed`

### Calendar Events

#### calendar.event_created

```json
{
  "event": "calendar.event_created",
  "data": {
    "calendar_id": "uuid",
    "event_type": "one_off",  // or "recurring"
    "series_id": "uuid",  // For recurring events
    "instances": [
      {
        "event_id": "uuid",
        "title": "Team Meeting",
        "start_time": "2024-01-01T10:00:00.000Z",
        "end_time": "2024-01-01T11:00:00.000Z",
        "meeting_url": "https://meet.google.com/abc-defg-hij",
        "bot_scheduled": false
      }
    ]
  }
}
```

#### calendar.event_updated

Same structure as `calendar.event_created` but with `affected_instances` instead of `instances`.

#### calendar.event_cancelled

```json
{
  "event": "calendar.event_cancelled",
  "data": {
    "calendar_id": "uuid",
    "cancelled_instances": [
      {
        "event_id": "uuid",
        "bot_id": "uuid"  // If bot was scheduled
      }
    ]
  }
}
```

---

## Database Schema Requirements

### Minimum Required Tables

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL
);

-- Meetings table
CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  bot_id TEXT NOT NULL,  -- Can be placeholder for calendar bots!
  bot_name TEXT NOT NULL,
  meeting_url TEXT NOT NULL,
  calendar_event_id TEXT,  -- CRITICAL for calendar bot lookup!
  status TEXT NOT NULL,
  processing_status TEXT,
  duration_seconds INTEGER,
  participant_count INTEGER,
  video_url TEXT,
  audio_url TEXT,
  transcript_url TEXT,
  diarization_url TEXT,
  error_code TEXT,
  error_message TEXT,
  extra JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Index for calendar event lookup
CREATE INDEX idx_meetings_calendar_event_id ON meetings(calendar_event_id);

-- Transcripts table (store locally, URLs expire!)
CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID UNIQUE NOT NULL REFERENCES meetings(id),
  data JSONB NOT NULL,  -- Array of utterances
  raw_data JSONB,       -- Raw Gladia response
  created_at TIMESTAMP DEFAULT NOW()
);

-- Calendar accounts table
CREATE TABLE calendar_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  provider TEXT DEFAULT 'google',
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMP NOT NULL,
  meetingbaas_calendar_id TEXT,  -- Store MeetingBaas calendar UUID
  is_active BOOLEAN DEFAULT true
);
```

---

## Complete Data Flow

### Flow 1: Direct Bot (POST /api/bots)

```
User clicks "Record Meeting"
         ↓
POST /api/bots with meeting_url
         ↓
Your API calls MeetingBaas POST /bots
         ↓
MeetingBaas returns { bot_id: "uuid" }  ← IMMEDIATE!
         ↓
Create Meeting record in DB with bot_id
         ↓
Bot joins meeting, records, transcribes
         ↓
MeetingBaas sends bot.completed webhook
         ↓
Find Meeting by bot_id ← WORKS!
         ↓
Download transcript, diarization, save to DB
         ↓
Done!
```

### Flow 2: Calendar Bot (Auto-scheduled)

```
User connects Google Calendar
         ↓
MeetingBaas syncs calendar events
         ↓
MeetingBaas sends calendar.event_created webhook
         ↓
Your webhook calls POST /calendars/{id}/bots
         ↓
MeetingBaas returns updated event, NO bot_id!  ← CRITICAL!
         ↓
Create Meeting record with:
  - bot_id: "pending-{event_id}"  ← PLACEHOLDER!
  - calendar_event_id: "{event_id}"  ← FOR LOOKUP!
         ↓
Bot joins meeting at scheduled time
         ↓
MeetingBaas sends bot.completed webhook with:
  - bot_id: "real-uuid"
  - event_id: "{event_id}"
         ↓
Lookup Meeting:
  1. Try by bot_id → FAILS (placeholder doesn't match)
  2. Try by calendar_event_id → WORKS!
         ↓
Update Meeting with real bot_id
         ↓
Download transcript, diarization, save to DB
         ↓
Done!
```

---

## Critical Implementation Details

### 1. Calendar Bots Don't Return bot_id

When scheduling a calendar bot, MeetingBaas does NOT return a `bot_id`. You must:

```javascript
// Schedule the bot
const result = await scheduleCalendarBot(calendarId, eventId, config)
// result may NOT have bot_id!

// Create meeting with placeholder
await db.meeting.create({
  bot_id: result.bot_id || `pending-${eventId}`,  // Placeholder!
  calendar_event_id: eventId,  // For lookup later!
  // ...
})
```

### 2. extra Field is NOT Returned in Webhooks

Whatever you pass in `extra` when creating a bot is NOT returned in webhooks:

```javascript
// When creating bot:
{ extra: { user_id: "123" } }

// In webhook payload:
{ data: { bot_id: "...", /* NO extra field! */ } }
```

**Solution:** Store meeting record in your DB before/when bot is scheduled. Look up by `bot_id` or `calendar_event_id`.

### 3. URLs Expire After 4 Hours

Video, audio, transcript URLs in webhook expire quickly. Download immediately:

```javascript
// In webhook handler - download NOW!
const transcriptResponse = await fetch(data.transcription)
const transcript = await transcriptResponse.json()
await db.transcript.create({ data: transcript })
// Now you have it forever, URL can expire
```

### 4. Video Field is "video" not "mp4"

```javascript
// WRONG
const videoUrl = data.mp4

// CORRECT
const videoUrl = data.video
```

### 5. Participants are Objects

```javascript
// WRONG - assuming strings
data.participants.map(name => ({ name }))

// CORRECT - they're objects
data.participants.map(p => ({
  name: typeof p === 'string' ? p : p.name
}))
```

### 6. Webhook Lookup Strategy

```javascript
async function handleBotCompleted(data) {
  let meeting = null

  // 1. Try by bot_id (works for direct bots)
  meeting = await db.meeting.findUnique({
    where: { bot_id: data.bot_id }
  })

  // 2. Try by calendar_event_id (works for calendar bots)
  if (!meeting && data.event_id) {
    meeting = await db.meeting.findFirst({
      where: { calendar_event_id: data.event_id }
    })

    // Update with real bot_id
    if (meeting && meeting.bot_id !== data.bot_id) {
      await db.meeting.update({
        where: { id: meeting.id },
        data: { bot_id: data.bot_id }
      })
    }
  }

  // 3. No meeting found = error
  if (!meeting) {
    throw new Error("Meeting not found for webhook")
  }

  // Process the meeting...
}
```

---

## Common Issues & Solutions

### Issue: Bot joins but transcript not saved

**Cause:** Meeting record not found in webhook handler

**Solutions:**
1. Ensure meeting record is created when bot is scheduled
2. Use placeholder `bot_id` for calendar bots
3. Store `calendar_event_id` for lookup
4. Implement multi-step lookup (bot_id → calendar_event_id)

### Issue: "Cannot process bot - no user_id"

**Cause:** Relying on `extra.user_id` which isn't returned

**Solution:** Look up meeting by `bot_id` or `calendar_event_id`, use `meeting.user_id`

### Issue: Webhook rejected with 401

**Causes:**
1. Missing webhook secret in environment
2. Wrong secret value
3. Using wrong authentication method

**Debug:**
```javascript
// Log all headers to see what's sent
console.log("Headers:", Object.fromEntries(request.headers))
```

### Issue: Calendar events not auto-scheduling bots

**Cause:** `calendar.event_created` webhook not processed correctly

**Check:**
1. SVIX secret configured (`MEETINGBAAS_SVIX_SECRET`)
2. CalendarAccount has `meetingbaas_calendar_id` stored
3. Webhook handler processes `calendar.event_created` event
4. Event has `meeting_url` (skip events without video links)

### Issue: Duplicate webhook processing

**Cause:** MeetingBaas retries webhooks if no 200 response

**Solution:**
1. Return 200 immediately, process async
2. Use idempotency - check if already processed
3. Store webhook `svix-id` to detect duplicates

---

## Code Patterns

### Webhook Handler Template

```typescript
export async function POST(request: Request) {
  try {
    // 1. Check authentication
    const mbSecret = request.headers.get("x-mb-secret")
    const svixId = request.headers.get("svix-id")

    if (mbSecret) {
      // Per-bot callback
      if (mbSecret !== process.env.MEETINGBAAS_CALLBACK_SECRET) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
      }
      const payload = await request.json()
      return await processWebhook(payload)

    } else if (svixId) {
      // SVIX webhook
      const wh = new Webhook(process.env.MEETINGBAAS_SVIX_SECRET!)
      const body = await request.text()
      wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": request.headers.get("svix-timestamp")!,
        "svix-signature": request.headers.get("svix-signature")!,
      })
      const payload = JSON.parse(body)
      return await processWebhook(payload)

    } else {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
  } catch (error) {
    console.error("Webhook error:", error)
    return Response.json({ error: "Processing failed" }, { status: 500 })
  }
}

async function processWebhook(payload: { event: string; data: any }) {
  switch (payload.event) {
    case "bot.completed":
      await handleBotCompleted(payload.data)
      break
    case "bot.failed":
      await handleBotFailed(payload.data)
      break
    case "bot.status_change":
      await handleStatusChange(payload.data)
      break
    case "calendar.event_created":
      await handleCalendarEventCreated(payload.data)
      break
    // ... other events
  }

  return Response.json({ success: true })
}
```

### Transcript Download Pattern

```typescript
interface TranscriptUtterance {
  speaker: number
  text: string
  start: number
  end: number
  words?: Array<{ text: string; start: number; end: number }>
}

async function downloadTranscript(url: string): Promise<TranscriptUtterance[]> {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`Failed to fetch transcript: ${response.statusText}`)
  }

  const data = await response.json()

  // Handle different response formats
  if (data.result?.utterances) {
    return data.result.utterances
  }
  if (Array.isArray(data)) {
    return data
  }
  if (data.utterances) {
    return data.utterances
  }

  return []
}
```

### Diarization Download Pattern

```typescript
async function downloadDiarization(url: string): Promise<any[]> {
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) return []

  // JSONL format - one JSON object per line
  const text = await response.text()
  return text
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .filter(Boolean)
}
```

---

## Testing Checklist

- [ ] Direct bot creation works (`POST /api/bots`)
- [ ] Bot joins meeting and records
- [ ] `bot.completed` webhook received and authenticated
- [ ] Transcript downloaded and stored
- [ ] Calendar connection works
- [ ] `calendar.event_created` webhook received
- [ ] Bot auto-scheduled for calendar event
- [ ] Meeting record created with placeholder bot_id
- [ ] `bot.completed` finds meeting by calendar_event_id
- [ ] Real bot_id updated in meeting record
- [ ] Transcript stored for calendar-scheduled meeting

---

## Support Resources

- MeetingBaas Docs: https://docs.meetingbaas.com
- MeetingBaas API Reference: https://docs.meetingbaas.com/api/reference
- MeetingBaas TypeScript SDK: `@meeting-baas/sdk`

---

*Document created: January 2026*
*Last updated after resolving calendar bot integration issues*
