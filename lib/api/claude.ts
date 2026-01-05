/**
 * Claude AI Integration
 *
 * DEPRECATED: This file is kept for backwards compatibility.
 * New code should use lib/ai/generate.ts instead.
 *
 * All AI prompts are now centralized in lib/ai/prompts.ts
 */

// Re-export from centralized AI module
export {
  generateSummary,
  extractActionItems,
  generateMeetingAIContent,
} from '@/lib/ai/generate'
