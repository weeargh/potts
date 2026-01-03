import Anthropic from "@anthropic-ai/sdk"
import type { AISummary, ActionItem, TranscriptUtterance } from "@/lib/data/types"

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || "",
})

function formatTranscript(utterances: TranscriptUtterance[]): string {
  return utterances
    .map((entry) => {
      const speaker =
        typeof entry.speaker === "number"
          ? `Speaker ${entry.speaker}`
          : entry.speaker
      const text =
        entry.text || entry.words?.map((w) => w.text).join(" ") || ""
      return `${speaker}: ${text}`
    })
    .join("\n")
}

export async function generateSummary(
  utterances: TranscriptUtterance[]
): Promise<AISummary> {
  const transcriptText = formatTranscript(utterances)

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Please analyze this meeting transcript and provide a concise summary.

Format your response as JSON with this structure:
{
  "overview": "2-3 sentence overview of the meeting",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "decisions": ["Decision 1", "Decision 2"],
  "nextSteps": ["Next step 1", "Next step 2"]
}

Only include the JSON object in your response, no additional text.

Transcript:
${transcriptText}`,
      },
    ],
  })

  const content = message.content[0]
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response type from Claude")
  }

  try {
    return JSON.parse(content.text) as AISummary
  } catch {
    return {
      overview: content.text,
      keyPoints: [],
      decisions: [],
      nextSteps: [],
    }
  }
}

export async function extractActionItems(
  utterances: TranscriptUtterance[]
): Promise<ActionItem[]> {
  const transcriptText = formatTranscript(utterances)

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Please extract all action items and todos from this meeting transcript.

Format your response as JSON with this structure:
{
  "actionItems": [
    {
      "id": "1",
      "description": "Task description",
      "assignee": "Person name or null",
      "dueDate": "Due date or null",
      "completed": false
    }
  ]
}

Only include clear, actionable items that were explicitly mentioned or strongly implied in the meeting.
If no action items are found, return an empty array.
Only include the JSON object in your response, no additional text.

Transcript:
${transcriptText}`,
      },
    ],
  })

  const content = message.content[0]
  if (!content || content.type !== "text") {
    throw new Error("Unexpected response type from Claude")
  }

  try {
    const parsed = JSON.parse(content.text) as { actionItems: ActionItem[] }
    return parsed.actionItems || []
  } catch {
    return []
  }
}
