/**
 * Backfill Script: Sync all MeetingBaas data to Supabase
 *
 * This script fetches all bots from MeetingBaas and stores their content
 * (transcripts, diarization, summaries, action items) in Supabase.
 *
 * IMPORTANT: MeetingBaas URLs expire after 4 hours!
 * Only recent meetings will have valid URLs for downloading content.
 *
 * Usage:
 *   npx tsx scripts/backfill-meetings.ts
 *   npx tsx scripts/backfill-meetings.ts --user-id <uuid>
 *   npx tsx scripts/backfill-meetings.ts --dry-run
 */

import { PrismaClient } from '@prisma/client'
import { listBots, getBotStatus, getTranscript } from '../lib/api/meetingbaas'
import { generateMeetingAIContent } from '../lib/ai/generate'

const prisma = new PrismaClient()

// Parse CLI arguments
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const userIdIndex = args.indexOf('--user-id')
const specificUserId = userIdIndex !== -1 ? args[userIdIndex + 1] : null

interface BackfillStats {
  total: number
  alreadyExists: number
  synced: number
  urlsExpired: number
  failed: number
  aiGenerated: number
}

const stats: BackfillStats = {
  total: 0,
  alreadyExists: 0,
  synced: 0,
  urlsExpired: 0,
  failed: 0,
  aiGenerated: 0,
}

async function main() {
  console.log('🔄 Starting MeetingBaas → Supabase backfill...\n')

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n')
  }

  // Get user to associate meetings with
  let userId: string
  if (specificUserId) {
    userId = specificUserId
    console.log(`Using specified user ID: ${userId}\n`)
  } else {
    // Find first user in database
    const user = await prisma.user.findFirst({ select: { id: true, email: true } })
    if (!user) {
      console.error('❌ No users found in database. Create a user first.')
      process.exit(1)
    }
    userId = user.id
    console.log(`Using first user: ${user.email} (${userId})\n`)
  }

  // Fetch all bots from MeetingBaas
  console.log('📡 Fetching bots from MeetingBaas...')
  const bots = await listBots()
  stats.total = bots.length
  console.log(`Found ${bots.length} bots\n`)

  // Process each bot
  for (const bot of bots) {
    console.log(`\n─────────────────────────────────────`)
    console.log(`🤖 Bot: ${bot.bot_id}`)
    console.log(`   Name: ${bot.bot_name || 'Unknown'}`)
    console.log(`   Status: ${bot.status}`)
    console.log(`   Created: ${bot.created_at}`)

    // Check if already exists in database
    const existing = await prisma.meeting.findUnique({
      where: { botId: bot.bot_id },
      include: { transcript: true, summary: true }
    })

    if (existing?.transcript && existing?.summary) {
      console.log(`   ✅ Already fully synced, skipping`)
      stats.alreadyExists++
      continue
    }

    // Only process completed bots
    if (bot.status !== 'completed') {
      console.log(`   ⏭️  Status not completed, skipping`)
      continue
    }

    if (dryRun) {
      console.log(`   🔍 Would sync this bot (dry run)`)
      stats.synced++
      continue
    }

    try {
      // Fetch full bot details
      console.log(`   📥 Fetching bot details...`)
      const details = await getBotStatus(bot.bot_id)

      // Create or update meeting record
      const meeting = await prisma.meeting.upsert({
        where: { botId: bot.bot_id },
        update: {
          status: details.status,
          durationSeconds: details.duration_seconds,
          videoUrl: details.video,
          audioUrl: details.audio,
          transcriptUrl: details.transcription,
          processingStatus: 'processing',
        },
        create: {
          userId,
          botId: bot.bot_id,
          botName: details.bot_name || 'Notula Recorder',
          meetingUrl: details.meeting_url || '',
          status: details.status,
          durationSeconds: details.duration_seconds,
          videoUrl: details.video,
          audioUrl: details.audio,
          transcriptUrl: details.transcription,
          processingStatus: 'processing',
          extra: { backfilled: true, original_created_at: bot.created_at },
        }
      })
      console.log(`   📝 Meeting record created/updated`)

      // Try to fetch transcript (may fail if URL expired)
      let utterances: unknown[] = []
      if (details.transcription) {
        try {
          console.log(`   📜 Downloading transcript...`)
          utterances = await getTranscript(details.transcription)

          // Store transcript
          await prisma.transcript.upsert({
            where: { meetingId: meeting.id },
            update: { data: utterances as object },
            create: { meetingId: meeting.id, data: utterances as object }
          })
          console.log(`   ✅ Transcript saved (${utterances.length} utterances)`)
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          if (errorMsg.includes('403') || errorMsg.includes('expired') || errorMsg.includes('Access Denied')) {
            console.log(`   ⚠️  Transcript URL expired (older than 4 hours)`)
            stats.urlsExpired++
          } else {
            console.log(`   ❌ Failed to fetch transcript: ${errorMsg}`)
          }
        }
      }

      // Try to fetch diarization
      if (details.diarization) {
        try {
          console.log(`   🎤 Downloading diarization...`)
          const response = await fetch(details.diarization, { cache: 'no-store' })
          if (response.ok) {
            const diarizationData = await response.json()
            await prisma.diarization.upsert({
              where: { meetingId: meeting.id },
              update: { data: diarizationData },
              create: { meetingId: meeting.id, data: diarizationData }
            })
            console.log(`   ✅ Diarization saved`)
          } else {
            console.log(`   ⚠️  Diarization URL expired`)
          }
        } catch (err) {
          console.log(`   ⚠️  Failed to fetch diarization`)
        }
      }

      // Generate AI content if we have transcript
      if (utterances.length > 0) {
        try {
          console.log(`   🧠 Generating AI summary...`)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { summary, actionItems } = await generateMeetingAIContent(utterances as any)

          // Store summary
          await prisma.summary.upsert({
            where: { meetingId: meeting.id },
            update: {
              overview: summary.overview,
              keyPoints: summary.keyPoints,
              decisions: summary.decisions,
              nextSteps: summary.nextSteps,
            },
            create: {
              meetingId: meeting.id,
              overview: summary.overview,
              keyPoints: summary.keyPoints,
              decisions: summary.decisions,
              nextSteps: summary.nextSteps,
            }
          })

          // Store action items
          await prisma.actionItem.deleteMany({ where: { meetingId: meeting.id } })
          if (actionItems.length > 0) {
            await prisma.actionItem.createMany({
              data: actionItems.map(item => ({
                meetingId: meeting.id,
                description: item.description,
                assignee: item.assignee,
                dueDate: item.dueDate,
                completed: item.completed ?? false,
              }))
            })
          }

          console.log(`   ✅ AI content generated (${actionItems.length} action items)`)
          stats.aiGenerated++
        } catch (err) {
          console.log(`   ❌ AI generation failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      // Update processing status
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: {
          processingStatus: utterances.length > 0 ? 'completed' : 'failed',
          completedAt: utterances.length > 0 ? new Date() : null,
        }
      })

      stats.synced++
      console.log(`   ✅ Bot synced successfully`)

      // Rate limiting - wait between API calls
      await new Promise(resolve => setTimeout(resolve, 1000))

    } catch (err) {
      console.log(`   ❌ Failed: ${err instanceof Error ? err.message : String(err)}`)
      stats.failed++
    }
  }

  // Print summary
  console.log('\n═══════════════════════════════════════')
  console.log('📊 BACKFILL SUMMARY')
  console.log('═══════════════════════════════════════')
  console.log(`Total bots:        ${stats.total}`)
  console.log(`Already synced:    ${stats.alreadyExists}`)
  console.log(`Newly synced:      ${stats.synced}`)
  console.log(`URLs expired:      ${stats.urlsExpired}`)
  console.log(`AI generated:      ${stats.aiGenerated}`)
  console.log(`Failed:            ${stats.failed}`)
  console.log('═══════════════════════════════════════\n')

  if (stats.urlsExpired > 0) {
    console.log('⚠️  Note: Some transcript URLs were expired (older than 4 hours).')
    console.log('   Those meetings have metadata but no transcript/summary.\n')
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
