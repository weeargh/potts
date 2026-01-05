/**
 * Centralized AI Content Generation
 *
 * This module handles all AI-generated content for meetings.
 * It uses prompts from ./prompts.ts and should be the ONLY place
 * that generates AI content for meetings.
 *
 * Called from: webhook handler (handleBotCompleted)
 * NOT called from: API routes (they only read from database)
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  SUMMARY_SYSTEM_PROMPT,
  SUMMARY_USER_PROMPT,
  ACTION_ITEMS_SYSTEM_PROMPT,
  ACTION_ITEMS_USER_PROMPT,
  buildPrompt,
  formatTranscriptForPrompt,
} from './prompts'
import type { TranscriptUtterance, AISummary, ActionItem } from '@/lib/data/types'
import { logger } from '@/lib/logger'

const aiLogger = logger.child('ai:generate')

// Anthropic client - lazy initialization
let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    })
  }
  return client
}

// Model configuration - change here to switch models
const AI_MODEL = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 2048

/**
 * Clean JSON response from Claude (removes markdown code blocks if present)
 */
function cleanJsonResponse(text: string): string {
  let cleaned = text.trim()
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  return cleaned.trim()
}

/**
 * Generate meeting summary from transcript
 */
export async function generateSummary(
  utterances: TranscriptUtterance[]
): Promise<AISummary> {
  const transcriptText = formatTranscriptForPrompt(utterances)
  const userPrompt = buildPrompt(SUMMARY_USER_PROMPT, transcriptText)

  aiLogger.info('Generating summary', { utterance_count: utterances.length })

  const message = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = message.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  try {
    const cleaned = cleanJsonResponse(content.text)
    const parsed = JSON.parse(cleaned) as AISummary
    aiLogger.info('Summary generated successfully')
    return parsed
  } catch (parseError) {
    aiLogger.warn('Failed to parse summary JSON, using raw text', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
    })
    return {
      overview: content.text,
      keyPoints: [],
      decisions: [],
      nextSteps: [],
    }
  }
}

/**
 * Extract action items from transcript
 */
export async function extractActionItems(
  utterances: TranscriptUtterance[]
): Promise<ActionItem[]> {
  const transcriptText = formatTranscriptForPrompt(utterances)
  const userPrompt = buildPrompt(ACTION_ITEMS_USER_PROMPT, transcriptText)

  aiLogger.info('Extracting action items', { utterance_count: utterances.length })

  const message = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: ACTION_ITEMS_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = message.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  try {
    const cleaned = cleanJsonResponse(content.text)
    const parsed = JSON.parse(cleaned) as { actionItems: ActionItem[] }
    const items = parsed.actionItems || []
    aiLogger.info('Action items extracted', { count: items.length })
    return items
  } catch (parseError) {
    aiLogger.warn('Failed to parse action items JSON', {
      error: parseError instanceof Error ? parseError.message : String(parseError),
    })
    return []
  }
}

/**
 * Generate all AI content for a meeting
 *
 * This is the main entry point for AI generation.
 * Called from webhook handler when a meeting is completed.
 */
export async function generateMeetingAIContent(
  utterances: TranscriptUtterance[]
): Promise<{ summary: AISummary; actionItems: ActionItem[] }> {
  aiLogger.info('Generating all AI content for meeting', {
    utterance_count: utterances.length,
  })

  // Run both generations in parallel
  const [summary, actionItems] = await Promise.all([
    generateSummary(utterances),
    extractActionItems(utterances),
  ])

  aiLogger.info('AI content generation complete', {
    has_summary: !!summary.overview,
    action_item_count: actionItems.length,
  })

  return { summary, actionItems }
}
