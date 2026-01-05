/**
 * Centralized AI Prompts
 *
 * All AI prompts are defined here for easy modification.
 * These prompts are used to generate meeting summaries, action items, etc.
 *
 * To modify AI behavior, edit the prompts in this file.
 * Changes will apply to all future AI generations.
 */

// =============================================================================
// MEETING SUMMARY PROMPTS
// =============================================================================

export const SUMMARY_SYSTEM_PROMPT = `You are an expert meeting analyst. Your task is to analyze meeting transcripts and provide clear, actionable summaries. Be concise but comprehensive. Focus on what matters most for follow-up.`

export const SUMMARY_USER_PROMPT = `Analyze this meeting transcript and provide a structured summary.

Format your response as JSON with this exact structure:
{
  "overview": "2-3 sentence overview of the meeting purpose and outcome",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "decisions": ["Decision 1", "Decision 2"],
  "nextSteps": ["Next step 1", "Next step 2"]
}

Guidelines:
- Overview: What was this meeting about? What was accomplished?
- Key Points: The most important information discussed (3-7 points)
- Decisions: Explicit decisions made during the meeting (can be empty if none)
- Next Steps: Action items or follow-ups mentioned (can be empty if none)

Only include the JSON object in your response, no additional text or markdown code blocks.

Transcript:
{{TRANSCRIPT}}`

// =============================================================================
// ACTION ITEMS PROMPTS
// =============================================================================

export const ACTION_ITEMS_SYSTEM_PROMPT = `You are an expert at identifying action items and tasks from meeting discussions. Extract clear, actionable items with specific ownership when mentioned.`

export const ACTION_ITEMS_USER_PROMPT = `Extract all action items and tasks from this meeting transcript.

Format your response as JSON with this exact structure:
{
  "actionItems": [
    {
      "description": "Clear description of the task",
      "assignee": "Person's name or null if not specified",
      "dueDate": "Due date if mentioned or null",
      "priority": "high" | "medium" | "low",
      "context": "Brief context about why this task exists"
    }
  ]
}

Guidelines:
- Only include explicitly mentioned or strongly implied action items
- Be specific about what needs to be done
- Extract assignee names exactly as mentioned in the transcript
- If no due date mentioned, set to null
- Priority: high = urgent/blocking, medium = important, low = nice-to-have
- Context: 1 sentence explaining the background
- If no action items found, return empty array

Only include the JSON object in your response, no additional text or markdown code blocks.

Transcript:
{{TRANSCRIPT}}`

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Replace {{TRANSCRIPT}} placeholder with actual transcript text
 */
export function buildPrompt(template: string, transcript: string): string {
  return template.replace('{{TRANSCRIPT}}', transcript)
}

/**
 * Format transcript utterances into readable text
 */
export function formatTranscriptForPrompt(
  utterances: Array<{
    speaker: number | string
    text?: string
    words?: Array<{ text: string }>
  }>
): string {
  return utterances
    .map((entry) => {
      const speaker =
        typeof entry.speaker === 'number'
          ? `Speaker ${entry.speaker}`
          : entry.speaker
      const text =
        entry.text || entry.words?.map((w) => w.text).join(' ') || ''
      return `${speaker}: ${text}`
    })
    .join('\n')
}
