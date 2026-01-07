const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // Get userId from CalendarAccount
    const calendarAccount = await prisma.calendarAccount.findFirst({
        where: { isActive: true },
        select: { userId: true }
    });

    if (!calendarAccount) {
        console.error('No active calendar account found');
        process.exit(1);
    }

    console.log('Found userId:', calendarAccount.userId);

    // Check if meeting already exists
    const existing = await prisma.meeting.findUnique({
        where: { botId: '6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f' }
    });

    if (existing) {
        console.log('Meeting already exists:', existing.id);
        return;
    }

    // Create the meeting
    const meeting = await prisma.meeting.create({
        data: {
            userId: calendarAccount.userId,
            botId: '6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f',
            botName: 'Notula - Test 11:35',
            meetingUrl: 'https://meet.google.com/vef-hztr-xjb',
            status: 'completed',
            durationSeconds: 787,
            videoUrl: 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f/output.mp4',
            audioUrl: 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f/output.flac',
            transcriptUrl: 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f/output_transcription.json',
            diarizationUrl: 'https://meeting-baas-v2-artifacts.s3.fr-par.scw.cloud/6a4c0136-cf52-4fbb-9fb2-e5ca2a21687f/diarization.jsonl',
            completedAt: new Date('2026-01-05T04:48:07.000Z'),
        }
    });

    console.log('Created meeting:', meeting.id);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
