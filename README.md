# Meeting Bot MVP

An AI-powered meeting bot application that joins meetings, records transcripts, and generates summaries with action items using MeetingBaas and Claude AI.

## Features

- **Automated Meeting Bot**: Create bots that join Google Meet, Zoom, or Microsoft Teams meetings
- **Live Transcription**: Real-time transcription powered by Gladia via MeetingBaas
- **AI Summarization**: Claude AI generates meeting summaries with key points, decisions, and next steps
- **Action Items Extraction**: Automatically identify and extract action items from meeting discussions
- **Meeting Dashboard**: View all meetings with status, duration, and participants
- **Recording Downloads**: Access video and audio recordings after meetings

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS with design tokens, shadcn/ui components
- **APIs**:
  - MeetingBaas SDK v2 for bot creation and transcription
  - Anthropic Claude Sonnet 4 for AI analysis
- **Design**: Follows strict design standards from CLAUDE_RULES.md

## Getting Started

### Prerequisites

- Node.js 18+ installed
- MeetingBaas API key ([get one here](https://meetingbaas.com))
- Anthropic API key ([get one here](https://console.anthropic.com))

### Installation

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

Copy `.env.example` to `.env` and add your API keys:

```bash
MEETINGBAAS_API_KEY=your_meetingbaas_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

### Create a Meeting Bot

1. Click "New Meeting Bot" on the dashboard
2. Enter the meeting URL (Google Meet, Zoom, or Teams)
3. Optionally customize the bot name
4. Click "Create Meeting Bot"

The bot will:
- Join the meeting with the specified name
- Record audio and video
- Generate a transcript using Gladia
- After the meeting ends, Claude AI will:
  - Generate a summary
  - Extract action items
  - Identify decisions made

### View Meeting Details

Click on any meeting card to view:
- Meeting status and metadata
- List of participants
- Full transcript with speaker labels
- AI-generated summary
- Action items with assignees
- Download links for recordings

## Cost Estimation

Based on actual usage:
- **MeetingBaas**: $0.69/hour (bot + transcription)
- **Claude AI**: ~$0.06/hour (summary + action items)
- **Total**: ~$0.75/hour per meeting

## Project Structure

```
potts-app/
├── app/
│   ├── api/
│   │   └── bots/            # API routes for bot management
│   ├── meetings/
│   │   ├── [id]/            # Meeting detail page
│   │   └── new/             # Create meeting page
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Dashboard
│   └── globals.css          # Design tokens
├── components/
│   ├── ui/                  # shadcn/ui primitives
│   ├── meeting-card.tsx     # Meeting list card
│   ├── status-badge.tsx     # Status indicator
│   ├── transcript-view.tsx  # Transcript display
│   ├── ai-summary.tsx       # AI summary card
│   ├── action-items-list.tsx # Action items display
│   └── create-meeting-form.tsx # Bot creation form
├── lib/
│   ├── api/
│   │   ├── meetingbaas.ts   # MeetingBaas client
│   │   └── claude.ts        # Claude AI client
│   ├── data/
│   │   └── types.ts         # TypeScript types
│   └── utils.ts             # Utilities (cn, formatters)
└── hooks/                   # Custom React hooks
```

## Design Standards

This project strictly follows the design standards defined in:
- `CLAUDE_RULES.md` - Component patterns, TypeScript rules, state management
- `DESIGN_STANDARDS.md` - Color tokens, spacing, typography, UI patterns

Key principles:
- ✅ Design tokens only (no hardcoded colors)
- ✅ Consistent spacing scale (gap-2, gap-3, gap-4)
- ✅ Strict TypeScript (no `any`)
- ✅ Component prop interfaces exported
- ✅ `cn()` utility for class merging
- ✅ Mobile-responsive
- ✅ Accessible (ARIA, semantic HTML)

## API Routes

### `POST /api/bots`
Create a new meeting bot

**Request:**
```json
{
  "meeting_url": "https://meet.google.com/xxx-yyyy-zzz",
  "bot_name": "My Meeting Bot",
  "recording_mode": "speaker_view"
}
```

**Response:**
```json
{
  "bot_id": "uuid",
  "status": "queued",
  "created_at": "2025-01-03T..."
}
```

### `GET /api/bots`
List all meeting bots

**Response:**
```json
{
  "bots": [...]
}
```

### `GET /api/bots/[id]`
Get meeting details with transcript and AI analysis

**Response:**
```json
{
  "bot_id": "uuid",
  "status": "completed",
  "summary": { ... },
  "actionItems": [ ... ],
  "utterances": [ ... ]
}
```

## Development

### Build for Production

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

## Deployment

This Next.js app can be deployed to:
- Vercel (recommended)
- Netlify
- Any Node.js hosting platform

Make sure to set environment variables in your deployment platform.

## License

MIT

## Support

For issues or questions:
- MeetingBaas: [docs.meetingbaas.com](https://docs.meetingbaas.com)
- Claude AI: [docs.anthropic.com](https://docs.anthropic.com)
