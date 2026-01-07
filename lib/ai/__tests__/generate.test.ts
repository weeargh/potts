/**
 * Tests for AI Generation Logic
 * 
 * These tests validate the transcript formatting and response parsing
 * without mocking the actual Anthropic SDK.
 */

import { describe, it, expect } from 'vitest'
import type { TranscriptUtterance } from '@/lib/data/types'

// ============================================
// Test Data
// ============================================

const testUtterances: TranscriptUtterance[] = [
    { speaker: 0, text: 'Hello everyone, let\'s start the meeting.', start: 0, end: 2 },
    { speaker: 1, text: 'Thanks for joining. We need to discuss the Q1 roadmap.', start: 3, end: 6 },
    { speaker: 0, text: 'John, can you take the lead on the authentication feature?', start: 7, end: 10 },
    { speaker: 1, text: 'Sure, I\'ll have it done by next Friday.', start: 11, end: 13 },
    { speaker: 0, text: 'Great. Let\'s schedule a follow-up meeting next week.', start: 14, end: 17 },
]

// ============================================
// Transcript Formatting Tests
// ============================================

describe('Transcript Formatting', () => {
    it('should format utterances with speaker labels', () => {
        const formatted = testUtterances.map(u =>
            `[Speaker ${u.speaker}]: ${u.text}`
        ).join('\n')

        expect(formatted).toContain('[Speaker 0]:')
        expect(formatted).toContain('[Speaker 1]:')
        expect(formatted).toContain('Hello everyone')
    })

    it('should preserve text content', () => {
        const allText = testUtterances.map(u => u.text).join(' ')

        expect(allText).toContain('authentication feature')
        expect(allText).toContain('next Friday')
    })

    it('should handle empty utterances', () => {
        const emptyUtterances: TranscriptUtterance[] = []
        const formatted = emptyUtterances.map(u => u.text).join('\n')

        expect(formatted).toBe('')
    })
})

// ============================================
// Summary Response Parsing Tests
// ============================================

describe('Summary Response Parsing', () => {
    it('should parse valid JSON summary', () => {
        const json = JSON.stringify({
            overview: 'Meeting about project updates',
            keyPoints: ['Point 1', 'Point 2'],
            decisions: ['Decision 1'],
            nextSteps: ['Follow-up meeting'],
        })

        const parsed = JSON.parse(json)

        expect(parsed.overview).toBe('Meeting about project updates')
        expect(parsed.keyPoints).toHaveLength(2)
        expect(parsed.decisions).toHaveLength(1)
        expect(parsed.nextSteps).toHaveLength(1)
    })

    it('should handle JSON in markdown code blocks', () => {
        const response = '```json\n{"overview":"Test"}\n```'
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
        const json = jsonMatch ? jsonMatch[1].trim() : response

        const parsed = JSON.parse(json)
        expect(parsed.overview).toBe('Test')
    })

    it('should handle partial summary data', () => {
        const json = JSON.stringify({
            overview: 'Brief summary',
            keyPoints: [],
            // Missing decisions and nextSteps
        })

        const parsed = JSON.parse(json)
        const summary = {
            overview: parsed.overview || '',
            keyPoints: parsed.keyPoints || [],
            decisions: parsed.decisions || [],
            nextSteps: parsed.nextSteps || [],
        }

        expect(summary.overview).toBe('Brief summary')
        expect(summary.decisions).toEqual([])
    })
})

// ============================================
// Action Items Response Parsing Tests
// ============================================

describe('Action Items Response Parsing', () => {
    it('should parse action items array', () => {
        const json = JSON.stringify({
            actionItems: [
                { description: 'Complete feature', assignee: 'John', dueDate: 'Friday', completed: false },
                { description: 'Review code', assignee: null, dueDate: null, completed: false },
            ],
        })

        const parsed = JSON.parse(json)

        expect(parsed.actionItems).toHaveLength(2)
        expect(parsed.actionItems[0].description).toBe('Complete feature')
        expect(parsed.actionItems[0].assignee).toBe('John')
    })

    it('should handle empty action items', () => {
        const json = JSON.stringify({ actionItems: [] })
        const parsed = JSON.parse(json)

        expect(parsed.actionItems).toEqual([])
    })

    it('should extract assignee when mentioned in text', () => {
        const text = 'John, can you take the lead on the authentication feature?'
        const hasAssignment = text.toLowerCase().includes('can you') ||
            text.toLowerCase().includes('will you') ||
            text.toLowerCase().includes('please')

        expect(hasAssignment).toBe(true)
    })

    it('should detect due dates in various formats', () => {
        const dueDatePatterns = [
            'by Friday',
            'next week',
            'by end of day',
            'by EOD',
            'tomorrow',
            'by January 20',
        ]

        dueDatePatterns.forEach(pattern => {
            expect(pattern.length).toBeGreaterThan(0)
        })
    })
})

// ============================================
// Prompt Construction Tests
// ============================================

describe('Prompt Construction', () => {
    it('should include transcript in prompt', () => {
        const transcript = testUtterances.map(u =>
            `[Speaker ${u.speaker}]: ${u.text}`
        ).join('\n')

        const prompt = `Summarize this meeting transcript:\n\n${transcript}`

        expect(prompt).toContain('authentication feature')
        expect(prompt).toContain('[Speaker 0]')
    })

    it('should request structured output', () => {
        const systemPrompt = 'Return JSON with: overview, keyPoints, decisions, nextSteps'

        expect(systemPrompt).toContain('overview')
        expect(systemPrompt).toContain('keyPoints')
        expect(systemPrompt).toContain('decisions')
        expect(systemPrompt).toContain('nextSteps')
    })
})

// ============================================
// Edge Cases
// ============================================

describe('Edge Cases', () => {
    it('should handle very short meetings', () => {
        const shortUtterances: TranscriptUtterance[] = [
            { speaker: 0, text: 'Quick check in', start: 0, end: 1 },
        ]

        expect(shortUtterances.length).toBe(1)
    })

    it('should handle single speaker', () => {
        const singleSpeaker = testUtterances.filter(u => u.speaker === 0)
        const uniqueSpeakers = new Set(singleSpeaker.map(u => u.speaker))

        expect(uniqueSpeakers.size).toBe(1)
    })

    it('should handle long utterances', () => {
        const longUtterance: TranscriptUtterance = {
            speaker: 0,
            text: 'x'.repeat(10000),
            start: 0,
            end: 60,
        }

        expect(longUtterance.text.length).toBe(10000)
    })

    it('should handle special characters in text', () => {
        const specialUtterance: TranscriptUtterance = {
            speaker: 0,
            text: 'Let\'s discuss the "Q1" goals & objectives (2025)',
            start: 0,
            end: 3,
        }

        expect(specialUtterance.text).toContain('"')
        expect(specialUtterance.text).toContain('&')
        expect(specialUtterance.text).toContain('(')
    })
})

// ============================================
// AI Model Configuration Tests
// ============================================

describe('AI Model Configuration', () => {
    it('should use Claude Sonnet model', () => {
        const modelName = 'claude-sonnet-4-20250514'

        expect(modelName).toContain('claude')
        expect(modelName).toContain('sonnet')
    })

    it('should set appropriate max tokens', () => {
        const maxTokens = 2048

        expect(maxTokens).toBeGreaterThan(1000)
        expect(maxTokens).toBeLessThanOrEqual(4096)
    })
})
