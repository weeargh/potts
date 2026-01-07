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
  QA_SYSTEM_PROMPT,
  QA_USER_PROMPT,
  buildPrompt,
  formatTranscriptForPrompt,
} from './prompts'
import type { TranscriptUtterance, AISummary, ActionItem, QuestionAnswer } from '@/lib/data/types'
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
 * Build system prompt with vocabulary context
 */
function buildSystemPromptWithVocabulary(basePrompt: string, vocabulary?: string[]): string {
  if (!vocabulary || vocabulary.length === 0) {
    return basePrompt
  }
  return `${basePrompt}

CUSTOM VOCABULARY: The following domain-specific terms should be recognized and used correctly: ${vocabulary.join(', ')}`
}

/**
 * Generate meeting summary from transcript
 */
export async function generateSummary(
  utterances: TranscriptUtterance[],
  vocabulary?: string[]
): Promise<AISummary> {
  const transcriptText = formatTranscriptForPrompt(utterances)
  const userPrompt = buildPrompt(SUMMARY_USER_PROMPT, transcriptText)
  const systemPrompt = buildSystemPromptWithVocabulary(SUMMARY_SYSTEM_PROMPT, vocabulary)

  aiLogger.info('Generating summary', { utterance_count: utterances.length, vocab_count: vocabulary?.length ?? 0 })

  const message = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
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
  utterances: TranscriptUtterance[],
  vocabulary?: string[]
): Promise<ActionItem[]> {
  const transcriptText = formatTranscriptForPrompt(utterances)
  const userPrompt = buildPrompt(ACTION_ITEMS_USER_PROMPT, transcriptText)
  const systemPrompt = buildSystemPromptWithVocabulary(ACTION_ITEMS_SYSTEM_PROMPT, vocabulary)

  aiLogger.info('Extracting action items', { utterance_count: utterances.length })

  const message = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
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
 * Extract Q&A pairs from transcript
 */
export async function extractQA(
  utterances: TranscriptUtterance[],
  vocabulary?: string[]
): Promise<QuestionAnswer[]> {
  const transcriptText = formatTranscriptForPrompt(utterances)
  const userPrompt = buildPrompt(QA_USER_PROMPT, transcriptText)
  const systemPrompt = buildSystemPromptWithVocabulary(QA_SYSTEM_PROMPT, vocabulary)

  aiLogger.info('Extracting Q&A', { utterance_count: utterances.length })

  const message = await getClient().messages.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const content = message.content[0]
  if (!content || content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  try {
    const cleaned = cleanJsonResponse(content.text)
    const parsed = JSON.parse(cleaned) as { questions: QuestionAnswer[] }
    const questions = parsed.questions || []
    aiLogger.info('Q&A extracted', { count: questions.length })
    return questions
  } catch (parseError) {
    aiLogger.warn('Failed to parse Q&A JSON', {
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
  utterances: TranscriptUtterance[],
  vocabulary?: string[]
): Promise<{ summary: AISummary; actionItems: ActionItem[]; questions: QuestionAnswer[] }> {
  aiLogger.info('Generating all AI content for meeting', {
    utterance_count: utterances.length,
    vocab_count: vocabulary?.length ?? 0,
  })

  // Run all generations in parallel with vocabulary context
  const [summary, actionItems, questions] = await Promise.all([
    generateSummary(utterances, vocabulary),
    extractActionItems(utterances, vocabulary),
    extractQA(utterances, vocabulary),
  ])

  aiLogger.info('AI content generation complete', {
    has_summary: !!summary.overview,
    action_item_count: actionItems.length,
    qa_count: questions.length,
  })

  return { summary, actionItems, questions }
}

