/**
 * Cleanup Orphaned Calendar Events
 * 
 * This script removes calendar events that belong to calendar_ids
 * which no longer exist in the calendar_accounts table.
 * 
 * Usage: npx tsx scripts/cleanup-orphaned-events.ts [--dry-run]
 */

import { prisma } from '../lib/prisma'

async function cleanupOrphanedEvents(dryRun: boolean = false) {
    console.log(`\n🧹 Calendar Events Cleanup ${dryRun ? '(DRY RUN)' : ''}\n`)

    // 1. Get all valid calendar_ids from calendar_accounts
    const validCalendars = await prisma.calendarAccount.findMany({
        select: { meetingbaasCalendarId: true }
    })
    const validCalendarIds = new Set(
        validCalendars
            .map(c => c.meetingbaasCalendarId)
            .filter(Boolean) as string[]
    )

    console.log(`📋 Valid calendar IDs: ${validCalendarIds.size}`)

    // 2. Find orphaned calendar events
    const allCalendarEvents = await prisma.calendarEvent.findMany({
        select: {
            id: true,
            calendarId: true,
            title: true,
            startTime: true,
            lastFetchedAt: true
        }
    })

    const orphanedEvents = allCalendarEvents.filter(
        event => !validCalendarIds.has(event.calendarId)
    )

    console.log(`📅 Total calendar events: ${allCalendarEvents.length}`)
    console.log(`🗑️  Orphaned events: ${orphanedEvents.length}`)

    if (orphanedEvents.length === 0) {
        console.log('\n✅ No orphaned events found!')
        return
    }

    // 3. Group orphaned events by calendar_id for reporting
    const orphansByCalendar = orphanedEvents.reduce((acc, event) => {
        if (!acc[event.calendarId]) {
            acc[event.calendarId] = []
        }
        acc[event.calendarId].push(event)
        return acc
    }, {} as Record<string, typeof orphanedEvents>)

    console.log('\n📊 Orphaned events by calendar_id:')
    for (const [calendarId, events] of Object.entries(orphansByCalendar)) {
        console.log(`   ${calendarId}: ${events.length} events`)
        // Show first 3 titles
        events.slice(0, 3).forEach(e => {
            console.log(`      - ${e.title} (${e.startTime.toISOString().split('T')[0]})`)
        })
        if (events.length > 3) {
            console.log(`      ... and ${events.length - 3} more`)
        }
    }

    // 4. Delete orphaned events
    if (dryRun) {
        console.log('\n⚠️  DRY RUN - No changes made')
        console.log('Run without --dry-run to delete orphaned events')
    } else {
        const orphanedCalendarIds = Object.keys(orphansByCalendar)

        const result = await prisma.calendarEvent.deleteMany({
            where: {
                calendarId: { in: orphanedCalendarIds }
            }
        })

        console.log(`\n✅ Deleted ${result.count} orphaned calendar events`)
    }

    await prisma.$disconnect()
}

// Run the cleanup
const dryRun = process.argv.includes('--dry-run')
cleanupOrphanedEvents(dryRun).catch(console.error)
