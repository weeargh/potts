# MeetingBaas API Integration Guide

**Documentation for Potts-App Integration with MeetingBaas API v2**

Last Updated: 2026-01-04

---

## Table of Contents

1. [Overview](#overview)
2. [API Configuration](#api-configuration)
3. [Bot Lifecycle](#bot-lifecycle)
4. [Implementation Details](#implementation-details)
5. [Webhook Integration](#webhook-integration)
6. [Calendar Integration](#calendar-integration)
7. [Error Handling](#error-handling)
8. [Testing](#testing)

---

## Overview

Potts-App integrates with MeetingBaas API v2 to provide AI-powered meeting recording, transcription, and summarization capabilities. The integration includes:

- ✅ Bot creation and management (immediate & scheduled)
- ✅ Real-time status tracking via webhooks
- ✅ Automatic transcription with Gladia provider
- ✅ AI-powered summaries using Claude API
- ✅ Calendar integration (Google Calendar)
- ✅ Action item extraction
- ✅ Comprehensive error handling with retry logic

---

## API Configuration

### Required Environment Variables

```bash
# MeetingBaas API Key (from https://meetingbaas.com/dashboard)
MEETINGBAAS_API_KEY=your_meetingbaas_api_key_here

# Webhook Configuration
MEETINGBAAS_CALLBACK_URL=https://your-domain.com/api/webhooks/meetingbaas
MEETINGBAAS_CALLBACK_SECRET=your_random_secret_here
```

### API Endpoints Used

| Endpoint | Method | Purpose | Implementation |
|----------|--------|---------|----------------|
| `/v2/bots` | POST | Create immediate bot | `lib/api/meetingbaas.ts:createMeetingBot()` |
| `/v2/bots/scheduled` | POST | Schedule future bot | `lib/api/meetingbaas.ts:scheduleBot()` |
| `/v2/bots` | GET | List all bots | `lib/api/meetingbaas.ts:listBots()` |
| `/v2/bots/:id` | GET | Get bot details | `lib/api/meetingbaas.ts:getBotStatus()` |
| `/v2/bots/:id/leave` | POST | Remove bot from meeting | `lib/api/meetingbaas.ts:leaveBot()` |
| `/v2/bots/:id/delete-data` | DELETE | Delete bot data | `lib/api/meetingbaas.ts:deleteBot()` |
| `/v2/calendars` | POST | Connect calendar | `lib/api/meetingbaas.ts:createCalendarConnection()` |
| `/v2/calendars/:id/events` | GET | List calendar events | `lib/api/meetingbaas.ts:listCalendarEvents()` |
| `/v2/calendars/:id/bots` | POST | Schedule bot for event | `lib/api/meetingbaas.ts:scheduleCalendarBot()` |

---

## Bot Lifecycle

### 1. Bot Creation Flow

```
User Request → POST /api/bots
    ↓
Authentication Check (Supabase)
    ↓
Create Bot via MeetingBaas API
    ↓
Store Meeting in Database (with user_id)
    ↓
Return bot_id to User
```

**Implementation:** `app/api/bots/route.ts`

```typescript
// Bot is created and immediately persisted to database
const result = await createMeetingBot({
  meeting_url: body.meeting_url,
  bot_name: body.bot_name || "Mekari Callnote",
  recording_mode: body.recording_mode || "speaker_view",
})

await prisma.meeting.create({
  data: {
    botId: result.bot_id,
    userId: user.id, // Authenticated user
    botName: body.bot_name || "Mekari Callnote",
    meetingUrl: body.meeting_url,
    status: result.status || "queued",
  }
})
```

### 2. Bot Status Lifecycle

```
queued
  ↓
joining_call
  ↓
in_waiting_room (optional)
  ↓
in_call_recording
  ↓
transcribing
  ↓
completed / failed
```

### 3. Webhook Processing Flow

```
MeetingBaas → POST /api/webhooks/meetingbaas
    ↓
Secret Validation (x-mb-secret header)
    ↓
Event Routing (bot.completed | bot.failed | bot.status_change)
    ↓
Database Update
    ↓
[If completed] Fetch Transcript
    ↓
Generate AI Summary (Claude API)
    ↓
Extract Action Items
    ↓
Store in Database
```

**Implementation:** `app/api/webhooks/meetingbaas/route.ts`

---

## Implementation Details

### API Client (`lib/api/meetingbaas.ts`)

**Key Features:**

1. **Retry Logic with Exponential Backoff**
   ```typescript
   export async function fetchWithRetry<T>(
     url: string,
     options: RequestInit,
     retries = 3
   ): Promise<T> {
     for (let attempt = 0; attempt <= retries; attempt++) {
       try {
         const response = await fetch(url, options)

         // Handle 429 rate limits
         if (response.status === 429) {
           const retryAfter = parseInt(response.headers.get("retry-after") || "1", 10)
           await sleep(retryAfter * 1000)
           continue
         }

         if (!response.ok) {
           throw new MeetingBaasError(...)
         }

         return await response.json()
       } catch (error) {
         if (attempt === retries) throw error
         await sleep(Math.pow(2, attempt) * 1000) // Exponential backoff
       }
     }
   }
   ```

2. **Input Validation**
   - Meeting URL validation for Google Meet, Zoom, Teams, Webex
   - UUID format validation for bot/calendar IDs
   - ISO 8601 timestamp validation

3. **Error Handling**
   - Custom `MeetingBaasError` class with status codes
   - Detailed error messages for debugging
   - Proper error propagation

### Transcription Configuration

**Default Configuration:**
```typescript
transcription_enabled: true
transcription_config: {
  provider: "gladia",
  custom_params: {
    summarization: true,
    summarization_config: {
      type: "bullet_points"
    }
  }
}
```

**Implementation:** `lib/api/meetingbaas.ts:281-294`

### Rate Limiting

**MeetingBaas API Limits:**
- Default: 1 request/second
- Enterprise: 20 requests/second
- Daily bot cap: 75-3,000 depending on plan

**Client-Side Handling:**
- Respects `429` status codes
- Honors `retry-after` headers
- Exponential backoff for retries
- Maximum 3 retry attempts

---

## Webhook Integration

### Webhook Events Handled

#### 1. `bot.completed`

**Triggered:** When bot finishes recording and transcription

**Payload Structure:**
```typescript
{
  event: "bot.completed",
  data: {
    bot_id: string,
    transcription?: string, // URL to output_transcription.json
    raw_transcription?: string, // URL to raw_transcription.json
    mp4?: string, // Video URL (valid 4 hours)
    audio?: string, // Audio URL (valid 4 hours)
    diarization?: string, // Diarization data URL
    duration_seconds?: number,
    participants?: string[],
    speakers?: string[]
  }
}
```

**Processing Steps:**
1. Find existing meeting by `bot_id`
2. Update status to "completed"
3. Save artifact URLs (video, audio, transcript)
4. Fetch and parse transcript
5. Generate AI summary via Claude API
6. Extract action items
7. Store all data in database

**Implementation:** `app/api/webhooks/meetingbaas/route.ts:handleBotCompleted()`

#### 2. `bot.failed`

**Triggered:** When bot encounters an error

**Common Error Codes:**
- `BOT_NOT_ACCEPTED`: Bot not admitted to meeting
- `TIMEOUT_WAITING_TO_START`: Meeting didn't start
- `TRANSCRIPTION_FAILED`: Transcription processing failed
- `INSUFFICIENT_TOKENS`: Not enough credits

**Implementation:** `app/api/webhooks/meetingbaas/route.ts:handleBotFailed()`

#### 3. `bot.status_change`

**Triggered:** On every status transition

**Use Case:** Real-time status updates (planned feature)

### Webhook Security

**Secret Verification:**
```typescript
// Verify callback secret is configured
if (!CALLBACK_SECRET) {
  return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
}

// Verify the secret matches
const providedSecret = request.headers.get("x-mb-secret")
if (providedSecret !== CALLBACK_SECRET) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

**Headers Sent by MeetingBaas:**
```
x-mb-secret: your_callback_secret
Content-Type: application/json
```

---

## Calendar Integration

### OAuth Flow

```
User → GET /api/calendar/connect
    ↓
Redirect to Google OAuth
    ↓
User Grants Permission
    ↓
Google → GET /api/calendar/callback?code=...
    ↓
Exchange Code for Tokens
    ↓
Create Calendar Connection via MeetingBaas
    ↓
Store Encrypted Tokens
```

**Implementation:**
- `app/api/calendar/connect/route.ts` - Initiate OAuth
- `app/api/calendar/callback/route.ts` - Handle callback
- `lib/api/google-oauth.ts` - OAuth utilities

### Event Syncing

**Caching Strategy:**
- Cache duration: 8 hours
- Cache key: `calendar_id`
- Force refresh: `?refresh=true` parameter

**Implementation:** `app/api/calendar/events/route.ts`

```typescript
// Check cache first
const cachedCount = await prisma.calendarEvent.count({
  where: {
    calendarId: calendarId,
    lastFetchedAt: { gt: eightHoursAgo }
  }
})

if (cachedCount > 0 && !forceRefresh) {
  // Return cached events
  return cachedEvents
}

// Fetch fresh from API
const events = await listCalendarEvents(calendarId)
```

### Scheduling Bots for Events

**Endpoint:** `POST /api/calendar/schedule-bot`

**Request:**
```json
{
  "calendar_id": "uuid",
  "event_id": "event-id",
  "bot_name": "My Bot"
}
```

**Implementation:** `app/api/calendar/schedule-bot/route.ts`

---

## Error Handling

### Error Categories

#### 1. User-Responsible Errors
**Examples:** `BOT_NOT_ACCEPTED`, `TIMEOUT_WAITING_TO_START`

**Token Charging:** Only recording tokens (waiting room duration)

**Handling:**
- Log error for user visibility
- Don't retry automatically
- Provide clear error message

#### 2. Transcription Errors
**Examples:** `TRANSCRIPTION_FAILED`

**Token Charging:** Recording + streaming tokens (no transcription tokens)

**Handling:**
- Can retry using re-transcribe endpoint
- Check provider status
- Log for debugging

#### 3. System Errors
**Examples:** `INSUFFICIENT_TOKENS`, `DAILY_BOT_CAP_REACHED`

**Token Charging:** No tokens charged (reservation released)

**Handling:**
- Check account limits
- Notify user of issue
- Implement monitoring

### Error Response Format

```typescript
interface MeetingBaasError {
  message: string
  code: string
  statusCode: number
  retryAfter?: number // For 429 responses
}
```

### Retry Strategy

```typescript
// Exponential backoff
const delay = Math.pow(2, attempt) * 1000

// Max retries
const MAX_RETRIES = 3

// Respect rate limit headers
if (response.status === 429) {
  const retryAfter = response.headers.get("retry-after")
  await sleep(retryAfter * 1000)
}
```

---

## Testing

### Unit Tests

**Location:** `lib/api/__tests__/meetingbaas-api.test.ts`

**Coverage:**
- ✅ URL validation (Google Meet, Zoom, Teams, Webex)
- ✅ UUID validation
- ✅ Timestamp validation
- ✅ Error handling
- ✅ Type safety

**Run Tests:**
```bash
npm test
```

### Integration Testing

**Manual Testing Checklist:**

1. **Bot Creation:**
   ```bash
   curl -X POST http://localhost:3000/api/bots \
     -H "Content-Type: application/json" \
     -H "Cookie: your-auth-cookie" \
     -d '{
       "meeting_url": "https://meet.google.com/abc-defg-hij",
       "bot_name": "Test Bot"
     }'
   ```

2. **Bot Status:**
   ```bash
   curl http://localhost:3000/api/bots/BOT_ID \
     -H "Cookie: your-auth-cookie"
   ```

3. **Webhook Testing:**
   ```bash
   curl -X POST http://localhost:3000/api/webhooks/meetingbaas \
     -H "Content-Type: application/json" \
     -H "x-mb-secret: your-secret" \
     -d '{
       "event": "bot.completed",
       "data": {
         "bot_id": "test-bot-id",
         "transcription": "https://example.com/transcript.json"
       }
     }'
   ```

### Environment-Specific Configuration

**Development:**
```bash
MEETINGBAAS_CALLBACK_URL=https://localhost:3000/api/webhooks/meetingbaas
# Use ngrok for local webhook testing:
# MEETINGBAAS_CALLBACK_URL=https://abc123.ngrok.io/api/webhooks/meetingbaas
```

**Production:**
```bash
MEETINGBAAS_CALLBACK_URL=https://your-app.vercel.app/api/webhooks/meetingbaas
```

---

## API Reference Summary

### Create Bot

**Endpoint:** `POST /v2/bots`

**Required Parameters:**
- `meeting_url`: Meeting URL
- `bot_name`: Display name

**Optional Parameters:**
- `recording_mode`: `speaker_view` | `gallery_view` | `audio_only`
- `transcription_enabled`: boolean
- `transcription_config`: object

**Response:**
```json
{
  "success": true,
  "data": {
    "bot_id": "uuid"
  }
}
```

### Get Bot Status

**Endpoint:** `GET /v2/bots/:bot_id`

**Response:**
```json
{
  "success": true,
  "data": {
    "bot_id": "uuid",
    "status": "completed",
    "meeting_url": "https://...",
    "video": "https://s3...",
    "audio": "https://s3...",
    "transcription": "https://s3...",
    "duration_seconds": 3600,
    "participants": ["Alice", "Bob"]
  }
}
```

### Artifact URL Expiration

⚠️ **Important:** All artifact URLs (video, audio, transcription) are presigned S3 URLs valid for **4 hours only**.

**Best Practice:** Download and store artifacts immediately upon receiving `bot.completed` webhook.

---

## Common Issues & Solutions

### Issue 1: Bot Not Joining Meeting

**Symptoms:** Bot status stuck at `joining_call` or `in_waiting_room`

**Possible Causes:**
- Meeting requires manual admission
- Waiting room enabled
- Meeting hasn't started

**Solution:**
- Ensure meeting settings allow bots
- Have host admit bot
- Check `timeout_config` settings

### Issue 2: Transcription Failed

**Symptoms:** `bot.failed` webhook with `TRANSCRIPTION_FAILED` error

**Possible Causes:**
- Audio quality issues
- No speech detected
- Provider API issues

**Solution:**
- Check audio recording quality
- Verify participants spoke
- Retry using re-transcribe endpoint
- Check Gladia provider status

### Issue 3: Webhook Not Receiving Events

**Symptoms:** Bot completes but no webhook received

**Possible Causes:**
- Incorrect callback URL
- Invalid secret
- Firewall blocking requests

**Solution:**
- Verify `MEETINGBAAS_CALLBACK_URL` is publicly accessible
- Check `MEETINGBAAS_CALLBACK_SECRET` matches
- Use ngrok for local testing
- Check server logs for rejected requests

### Issue 4: Rate Limiting

**Symptoms:** `429 Too Many Requests` errors

**Solution:**
- Respect `retry-after` headers
- Implement exponential backoff
- Use batch operations for bulk requests
- Upgrade plan for higher limits

---

## Additional Resources

- [MeetingBaas Official Documentation](https://doc.meetingbaas.com)
- [MeetingBaas API v2 Reference](https://api.meetingbaas.com/docs)
- [Gladia Transcription Docs](https://docs.gladia.io)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

---

## Changelog

### 2026-01-04
- ✅ Added authentication to all API routes
- ✅ Fixed hardcoded user IDs in webhook handler
- ✅ Improved webhook secret validation
- ✅ Enhanced error handling
- ✅ Added comprehensive documentation

---

**Need Help?** Check logs in:
- Browser console: Client-side errors
- Server logs: API route errors
- Webhook logs: MeetingBaas integration issues
