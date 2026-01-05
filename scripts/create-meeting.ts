import { prisma } from '../lib/prisma'

async function createMeeting() {
  // Bot details from MeetingBaas API
  const botId = '6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f'
  const botName = 'Potts - Test 11:35'
  const meetingUrl = 'https://meet.google.com/vef-hztr-xjb'
  const videoUrl = 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f/output.mp4'
  const audioUrl = 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f/output.flac'
  const transcriptUrl = 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f/output_transcription.json'
  const diarizationUrl = 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f/diarization.jsonl'
  const durationSeconds = 787

  // Get userId from CalendarAccount
  const calendarAccount = await prisma.calendarAccount.findFirst({
    where: { isActive: true },
    select: { userId: true }
  })

  if (!calendarAccount) {
    console.error('No active calendar account found')
    process.exit(1)
  }

  // Check if meeting already exists
  const existing = await prisma.meeting.findUnique({
    where: { botId }
  })

  if (existing) {
    console.log('Meeting already exists:', existing.id)
    process.exit(0)
  }

  // Create the meeting
  const meeting = await prisma.meeting.create({
    data: {
      userId: calendarAccount.userId,
      botId,
      botName,
      meetingUrl,
      status: 'completed',
      durationSeconds,
      videoUrl,
      audioUrl,
      transcriptUrl,
      diarizationUrl,
      completedAt: new Date('2026-01-05T04:48:07.000Z'),
    }
  })

  console.log('Created meeting:', meeting.id)
}

createMeeting()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
