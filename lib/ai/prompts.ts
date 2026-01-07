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

export const SUMMARY_SYSTEM_PROMPT = `You are an expert meeting analyst. Your task is to analyze meeting transcripts and provide clear, actionable summaries. Be concise but comprehensive. Focus on what matters most for follow-up.

IMPORTANT: The transcript may contain Indonesian and/or English content. Always output your response in English, translating any Indonesian content.`

export const SUMMARY_USER_PROMPT = `Analyze this meeting transcript and provide a structured summary.

Format your response as JSON with this exact structure:
{
  "overview": "2-4 sentence overview of the meeting purpose and outcome",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"],
  "decisions": ["Decision 1", "Decision 2"],
  "nextSteps": ["Next step 1", "Next step 2"]
}

Guidelines:
- Overview: What was this meeting about? What was accomplished? Give 2-4 sentences that best describe the meeting.
- Key Points: The most important information discussed (3-5 points)
- Decisions: Explicit decisions made during the meeting (can be empty if none)
- Next Steps: Action items or follow-ups mentioned (can be empty if none)

Only include the JSON object in your response, no additional text or markdown code blocks.

Transcript:
{{TRANSCRIPT}}`

// =============================================================================
// ACTION ITEMS PROMPTS
// =============================================================================

export const ACTION_ITEMS_SYSTEM_PROMPT = `You are an expert at identifying action items and tasks from meeting discussions. Extract clear, actionable items with specific ownership when mentioned.

IMPORTANT: The transcript may contain Indonesian and/or English content. Always output your response in English, translating any Indonesian content.`

export const ACTION_ITEMS_USER_PROMPT = `Extract all action items and tasks from this meeting transcript. Check for duplicates, make sure only key action items are extracted.

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
- Context: 1 sentence explaining the background
- If no action items found, return empty array

Only include the JSON object in your response, no additional text or markdown code blocks.

Transcript:
{{TRANSCRIPT}}`

// =============================================================================
// Q&A PROMPTS
// =============================================================================

export const QA_SYSTEM_PROMPT = `You are an expert at identifying questions and their answers from meeting discussions. Extract clear question-answer pairs that were discussed during the meeting.

IMPORTANT: The transcript may contain Indonesian and/or English content. Always output your response in English, translating any Indonesian content.`

export const QA_USER_PROMPT = `Extract all questions asked and their answers from this meeting transcript.

Format your response as JSON with this exact structure:
{
  "questions": [
    {
      "question": "The question that was asked",
      "answer": "The answer that was provided (or 'Not answered' if left unanswered)",
      "askedBy": "Speaker who asked or null if unclear",
      "answeredBy": "Speaker who answered or null if unclear",
      "timestamp": "Approximate time context if mentioned or null"
    }
  ]
}

Guidelines:
- Include both explicit questions and implicit questions (requests for information)
- Capture the essence of the answer, even if it was spread across multiple responses
- Mark questions as "Not answered" or "Deferred" if no clear answer was given
- Include follow-up questions as separate entries
- Focus on substantive questions, skip small talk like "How are you?"
- If no questions found, return empty array

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

