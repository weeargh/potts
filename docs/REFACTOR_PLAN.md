# Potts App Refactoring Plan

## Goal
Refactor potts-app to use MeetingBaas for bot management only, while storing ALL content locally in Supabase. Users should only access content from Supabase, never from MeetingBaas URLs (which expire after 4 hours).

## Architecture Principles
1. **MeetingBaas** = Bot management only (create, schedule, calendar integration)
2. **Supabase** = ALL content storage (transcripts, diarization, summaries, action items, media)
3. **Webhook** = Single entry point for processing completed bots
4. **AI Prompts** = Centralized in one place for easy modification

---

## Phase 1: Schema Changes

### 1.1 Add Diarization Model
```prisma
model Diarization {
  id        String   @id @default(uuid()) @db.Uuid
  meetingId String   @unique @map("meeting_id") @db.Uuid
  data      Json     // Speaker info with timestamps
  createdAt DateTime @default(now()) @map("created_at")
  meeting   Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  @@map("diarizations")
}
```

### 1.2 Add Raw Transcript Storage
- Store raw Gladia response (includes their summaries, translations if configured)
- Keep processed utterances in existing Transcript model

### 1.3 Modify Meeting Model
- Keep URL fields for backwards compatibility during migration
- Add `processingStatus` field: 'pending' | 'processing' | 'completed' | 'failed'
- Add `extra` Json field to store MeetingBaas extra data (includes user_id)

### 1.4 Migration Strategy
- Non-destructive: keep existing URL fields
- Add new fields alongside
- Migrate data gradually

---

## Phase 2: Centralize AI Prompts

### 2.1 Create lib/ai/prompts.ts
- SUMMARY_SYSTEM_PROMPT
- SUMMARY_USER_PROMPT
- ACTION_ITEMS_SYSTEM_PROMPT
- ACTION_ITEMS_USER_PROMPT
- Easy to modify, single source of truth

### 2.2 Create lib/ai/generate.ts
- generateMeetingAIContent(transcript, diarization)
- Returns { summary, actionItems }
- Single function called only from webhook

### 2.3 Update lib/api/claude.ts
- Import prompts from lib/ai/prompts.ts
- Keep existing functions but use centralized prompts

---

## Phase 3: Fix User Association

### 3.1 Pass userId in bot creation
- When creating bot via API: include `extra: { user_id: userId }`
- When scheduling calendar bot: include `extra: { user_id: calendarAccount.userId }`

### 3.2 Update webhook handler
- Extract userId from `data.extra.user_id`
- Fallback to calendar account lookup only if extra not present
- Log warning if using fallback (legacy bots)

---

## Phase 4: Webhook Handler Rewrite

### 4.1 handleBotCompleted() - Complete Rewrite
```
1. Extract userId from data.extra.user_id (or fallback)
2. Find or create Meeting record
3. Download ALL artifacts immediately:
   - Fetch transcript from data.transcription URL
   - Fetch diarization from data.diarization URL
   - Fetch raw transcript from data.raw_transcription URL
4. Store in Supabase:
   - Create/update Transcript record with utterances
   - Create Diarization record with speaker data
   - Update Meeting with metadata (duration, participants, etc.)
5. Generate AI content (single call):
   - Call generateMeetingAIContent(transcript, diarization)
   - Store Summary
   - Store ActionItems
6. Update Meeting.processingStatus = 'completed'
7. Log success
```

### 4.2 Error Handling
- If artifact fetch fails: log error, set processingStatus = 'failed'
- If AI generation fails: still mark content as stored, log AI error
- Implement retry mechanism for transient failures

---

## Phase 5: Simplify API Routes

### 5.1 GET /api/bots
- ONLY read from Supabase
- Remove MeetingBaas API fallback
- Remove sync logic (webhook handles everything)
- Keep pagination

### 5.2 GET /api/bots/[id]
- ONLY read from Supabase
- Remove MeetingBaas API fallback
- Remove on-the-fly AI generation
- Return 404 if not in database

### 5.3 POST /api/bots
- Create bot via MeetingBaas
- Create Meeting record with status='queued'
- Include extra.user_id in bot creation
- Return immediately (webhook handles completion)

### 5.4 POST /api/calendar/schedule-bot
- Schedule bot via MeetingBaas
- Include extra.user_id in bot creation
- Don't create Meeting record (webhook handles it)

---

## Phase 6: Calendar Webhook Handlers

### 6.1 handleCalendarEventCreated()
- When auto-scheduling bot, include extra.user_id from CalendarAccount

### 6.2 handleCalendarEventUpdated()
- TODO: Implement bot rescheduling logic

### 6.3 handleCalendarEventCancelled()
- TODO: Implement bot cancellation logic

---

## Phase 7: Media Storage (Optional/Future)

### 7.1 Supabase Storage for Video/Audio
- Create storage bucket for meeting recordings
- Download and upload video/audio from MeetingBaas URLs
- Store storage keys in Meeting record
- Implement signed URL generation for playback

### 7.2 Considerations
- Storage costs for large video files
- May want to keep using MeetingBaas URLs for 4 hours, then archive
- Or just store audio (smaller) and skip video

---

## Implementation Order

1. [x] Phase 2: Centralize AI prompts (no breaking changes) ✅
2. [x] Phase 1: Schema migration (additive, non-breaking) ✅
3. [x] Phase 3: Fix user association in bot creation ✅
4. [x] Phase 4: Rewrite webhook handler ✅
5. [x] Phase 5: Simplify API routes ✅
6. [x] Phase 6: Fix calendar webhook handlers ✅
7. [ ] Phase 7: Media storage (future - optional)

---

## Files to Modify

### New Files
- `lib/ai/prompts.ts` - Centralized AI prompts
- `lib/ai/generate.ts` - AI generation functions
- `prisma/migrations/xxx_add_diarization.sql` - Schema migration

### Modified Files
- `prisma/schema.prisma` - Add Diarization model, update Meeting
- `lib/api/claude.ts` - Use centralized prompts
- `lib/api/meetingbaas.ts` - Add extra.user_id to bot creation
- `app/api/webhooks/meetingbaas/route.ts` - Complete rewrite of handleBotCompleted
- `app/api/bots/route.ts` - Simplify, remove fallbacks
- `app/api/bots/[id]/route.ts` - Simplify, remove fallbacks
- `app/api/calendar/schedule-bot/route.ts` - Add extra.user_id

---

## Testing Checklist

- [ ] Create immediate bot → Meeting created in DB → Webhook processes → All data in Supabase
- [ ] Create calendar-scheduled bot → Webhook processes → Correct user associated
- [ ] View meeting after 4+ hours → Data still accessible from Supabase
- [ ] Modify AI prompt → Re-run AI generation → New output reflected
- [ ] Multi-user: User A's meetings not visible to User B

---

## Rollback Plan

1. Schema changes are additive - old code still works
2. Keep existing URL fields - can fall back to them
3. Feature flag for new webhook logic if needed
