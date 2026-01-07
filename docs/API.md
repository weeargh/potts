# Notula API Documentation

This document describes all API endpoints and webhooks in the Notula application.

## Overview

| Category | Base Path | Purpose |
|----------|-----------|---------|
| Calendar | `/api/calendar/*` | Google Calendar OAuth and event management |
| Bots | `/api/bots/*` | Create and manage recording bots |
| Webhooks | `/api/webhooks/*` | Receive callbacks from MeetingBaas |

---

## Calendar Endpoints

### `GET /api/calendar/connect`

Initiates Google OAuth flow to connect user's calendar.

**Query Parameters:** None

**Response:** Redirects to Google OAuth consent screen

**After OAuth:**
- User authorizes calendar access
- Redirects to `/api/calendar/callback`
- On success: redirects to dashboard with `?calendar_connected=true`

---

### `GET /api/calendar/callback`

Handles Google OAuth callback, creates MeetingBaas calendar connection, and auto-schedules bots.

**Flow:**
1. Exchanges OAuth code for tokens
2. Cleans up any existing calendar connections (prevents duplicates)
3. Creates new calendar connection on MeetingBaas
4. Auto-schedules bots for all upcoming events with meeting URLs
5. Redirects to dashboard

**Query Parameters:**
- `code`: OAuth authorization code (from Google)
- `next`: Redirect path after success (default: `/`)

---

### `GET /api/calendar/events`

Fetches calendar events from MeetingBaas with local caching.

**Query Parameters:**
- `calendar_id`: Optional, specific calendar to fetch
- `refresh`: Set to `true` to bypass cache and fetch fresh data
- `start_date`: Filter events starting from this date
- `end_date`: Filter events ending before this date

**Response:**
```json
{
  "events": [
    {
      "event_id": "uuid",
      "calendar_id": "uuid",
      "series_id": "uuid",
      "title": "Team Meeting",
      "start_time": "2026-01-05T10:00:00Z",
      "end_time": "2026-01-05T11:00:00Z",
      "meeting_url": "https://meet.google.com/...",
      "bot_scheduled": true
    }
  ],
  "calendars": [
    {
      "uuid": "calendar-id",
      "email": "user@example.com",
      "name": "user"
    }
  ]
}
```

---

### `POST /api/calendar/schedule-bot`

Schedules a recording bot for a specific calendar event.

**Request Body:**
```json
{
  "calendar_id": "uuid",
  "event_id": "uuid",
  "series_id": "uuid",
  "bot_name": "Notula - Team Meeting"
}
```

**Response:**
```json
{
  "success": true,
  "bot_id": "uuid"
}
```

---

## Bot Endpoints

### `POST /api/bots`

Creates a new recording bot for an immediate meeting.

**Request Body:**
```json
{
  "meeting_url": "https://meet.google.com/abc-defg-hij",
  "bot_name": "My Recording Bot"
}
```

**Response:**
```json
{
  "bot_id": "uuid",
  "status": "queued"
}
```

---

### `GET /api/bots/[id]`

Gets status and details for a specific bot.

**Response:**
```json
{
  "bot_id": "uuid",
  "status": "in_call_recording",
  "meeting_url": "https://meet.google.com/...",
  "created_at": "2026-01-05T10:00:00Z"
}
```

---

## Webhook Endpoint

### `POST /api/webhooks/meetingbaas`

Receives webhook callbacks from MeetingBaas for bot and calendar events.

**Authentication:** 
- Header: `x-mb-secret: YOUR_CALLBACK_SECRET`
- Must match `MEETINGBAAS_CALLBACK_SECRET` env variable

**Supported Events:**

#### Bot Events

| Event | Description |
|-------|-------------|
| `bot.completed` | Bot finished recording, transcription ready |
| `bot.failed` | Bot failed to record |
| `bot.status_change` | Bot status updated (joining, recording, etc.) |

#### Calendar Events

| Event | Description |
|-------|-------------|
| `calendar.connection_created` | New calendar connected |
| `calendar.connection_deleted` | Calendar disconnected |
| `calendar.connection_error` | Calendar sync error |
| `calendar.event_created` | New event added → **Auto-schedules bot** |
| `calendar.event_updated` | Event time/details changed |
| `calendar.event_cancelled` | Event cancelled |

**Example Payload (bot.completed):**
```json
{
  "event": "bot.completed",
  "data": {
    "bot_id": "uuid",
    "transcription": "https://...",
    "mp4": "https://...",
    "duration_seconds": 3600
  }
}
```

**Example Payload (calendar.event_created):**
```json
{
  "event": "calendar.event_created",
  "data": {
    "calendar_id": "uuid",
    "event_type": "one_off",
    "series_id": "uuid",
    "instances": [
      {
        "event_id": "uuid",
        "title": "Team Meeting",
        "start_time": "2026-01-05T10:00:00Z",
        "meeting_url": "https://meet.google.com/...",
        "bot_scheduled": false
      }
    ]
  }
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MEETINGBAAS_API_KEY` | Yes | API key for MeetingBaas |
| `MEETINGBAAS_CALLBACK_URL` | Yes | URL for webhooks (e.g., `https://your-app.com/api/webhooks/meetingbaas`) |
| `MEETINGBAAS_CALLBACK_SECRET` | Yes | Secret for webhook verification |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |

---

## Auto-Scheduling Flow

```
User creates meeting on Google Calendar
            ↓
MeetingBaas syncs event (push notification)
            ↓
MeetingBaas sends `calendar.event_created` webhook
            ↓
/api/webhooks/meetingbaas receives event
            ↓
handleCalendarEventCreated() → scheduleCalendarBot()
            ↓
Bot automatically scheduled for meeting
            ↓
Bot joins meeting when it starts
```

---

## Deduplication

MeetingBaas prevents duplicate bots:
- `allow_multiple_bots: false` (our default)
- Same meeting URL → only one bot within 5-minute window
- Second attempt returns `BOT_ALREADY_EXISTS` error
