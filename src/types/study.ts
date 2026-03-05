// =============================================================================
// Study Tools Types - Quiz, Flashcards, Summary
// =============================================================================

// =============================================================================
// Configuration Constants
// =============================================================================

export const STUDY_CONFIG = {
    /** Quiz generation */
    QUIZ_QUESTION_COUNT: 5,
    QUIZ_OPTIONS_PER_QUESTION: 4,
    QUIZ_MAX_RETAKES: 10,
    QUIZ_GENERATION_COOLDOWN_MS: 30_000,

    /** Flashcards */
    FLASHCARD_COUNT: 10,
    FLASHCARD_MAX_PER_SET: 20,

    /** Summary */
    SUMMARY_MAX_TOKENS: 2000,

    /** Rate limits */
    GENERATION_RATE_LIMIT_PER_HOUR: 20,

    /** Token budget for LLM calls */
    MAX_PROMPT_TOKENS: 6000,

    /** Insufficient context threshold */
    MIN_CONTEXT_CHUNKS: 1,
    MIN_CONTEXT_TOKENS: 100,
} as const;

// =============================================================================
// Quiz Types
// =============================================================================

export type QuizStatus = 'generating' | 'ready' | 'failed';

export interface QuizRow {
    id: string;
    user_id: string;
    conversation_id: string;
    title: string;
    status: QuizStatus;
    question_count: number;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface QuizQuestionRow {
    id: string;
    quiz_id: string;
    question_index: number;
    question_text: string;
    options: string[];           // JSON array of 4 options
    correct_option_index: number; // 0-3
    explanation: string;
    source_chunk_ids: string[];  // Grounding reference
    created_at: string;
}

export interface QuizAttemptRow {
    id: string;
    quiz_id: string;
    user_id: string;
    answers: AttemptAnswer[];
    score: number;           // Correct count
    percentage: number;      // Auto-calculated
    completed_at: string;
    created_at: string;
}

export interface AttemptAnswer {
    question_id: string;
    selected_option_index: number;
    is_correct: boolean;
}

// =============================================================================
// Flashcard Types
// =============================================================================

export type FlashcardSetStatus = 'generating' | 'ready' | 'failed';

export interface FlashcardSetRow {
    id: string;
    user_id: string;
    conversation_id: string;
    title: string;
    status: FlashcardSetStatus;
    card_count: number;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface FlashcardRow {
    id: string;
    set_id: string;
    card_index: number;
    front: string;             // Question
    back: string;              // Answer
    is_learned: boolean;
    review_count: number;
    last_reviewed_at: string | null;
    source_chunk_ids: string[];
    created_at: string;
}

// =============================================================================
// Summary Types
// =============================================================================

export type SummaryType = 'bullet' | 'paragraph' | 'exam';
export type SummaryStatus = 'generating' | 'ready' | 'failed';

export interface SummaryRow {
    id: string;
    user_id: string;
    conversation_id: string;
    summary_type: SummaryType;
    title: string;
    content: string;
    status: SummaryStatus;
    word_count: number;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

// =============================================================================
// API Request Types
// =============================================================================

export interface GenerateQuizRequest {
    conversation_id: string;
    topic?: string; // Optional topic focus
}

export interface SubmitQuizRequest {
    quiz_id: string;
    answers: Array<{
        question_id: string;
        selected_option_index: number;
    }>;
}

export interface GenerateFlashcardsRequest {
    conversation_id: string;
    topic?: string;
}

export interface MarkFlashcardRequest {
    is_learned: boolean;
}

export interface GenerateSummaryRequest {
    conversation_id: string;
    summary_type: SummaryType;
    topic?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface QuizResponse {
    quiz: QuizRow;
    questions: QuizQuestionRow[];
}

export interface QuizAttemptResponse {
    attempt: QuizAttemptRow;
    quiz: QuizRow;
    results: Array<{
        question: QuizQuestionRow;
        selected_option_index: number;
        is_correct: boolean;
    }>;
}

export interface FlashcardSetResponse {
    set: FlashcardSetRow;
    cards: FlashcardRow[];
}

export interface SummaryResponse {
    summary: SummaryRow;
}

// =============================================================================
// LLM Prompt Output Types (parsed from JSON)
// =============================================================================

export interface GeneratedQuizQuestion {
    question: string;
    options: [string, string, string, string];
    correct_index: number;
    explanation: string;
}

export interface GeneratedFlashcard {
    front: string;
    back: string;
}

export interface GeneratedSummary {
    title: string;
    content: string;
}

// =============================================================================
// Study Tool Grounding Prompts
// =============================================================================

export const QUIZ_SYSTEM_PROMPT = `You are a quiz generator for educational content. Generate multiple-choice questions STRICTLY from the provided context.

CRITICAL RULES:
1. Every question MUST be answerable from the CONTEXT below. Do NOT use external knowledge.
2. Generate exactly {count} questions, each with exactly 4 options (A, B, C, D).
3. Exactly ONE option must be correct per question.
4. Options should be plausible but clearly distinguishable.
5. Include a brief explanation referencing the context.
6. If there is insufficient material, respond with: {"error": "insufficient_context"}

CONTEXT:
{context}

Respond with a JSON array:
[
  {
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct_index": 0,
    "explanation": "..."
  }
]

Output ONLY valid JSON. No markdown, no extra text.`;

export const FLASHCARD_SYSTEM_PROMPT = `You are a flashcard generator for educational content. Generate question-answer pairs STRICTLY from the provided context.

CRITICAL RULES:
1. Every Q/A pair MUST come from the CONTEXT below. Do NOT use external knowledge.
2. Generate exactly {count} flashcards.
3. Questions should test key concepts, definitions, and important facts.
4. Answers should be concise but complete.
5. If there is insufficient material, respond with: {"error": "insufficient_context"}

CONTEXT:
{context}

Respond with a JSON array:
[
  {
    "front": "Question text here?",
    "back": "Answer text here."
  }
]

Output ONLY valid JSON. No markdown, no extra text.`;

export const SUMMARY_PROMPTS: Record<SummaryType, string> = {
    bullet: `You are a summarizer. Create a concise bullet-point summary STRICTLY from the provided context.

CRITICAL RULES:
1. Use ONLY information from the CONTEXT below.
2. Organize into logical sections with bullet points.
3. Cover all key topics from the material.
4. If insufficient material, respond with: {"error": "insufficient_context"}

CONTEXT:
{context}

Respond with JSON:
{
  "title": "Summary of [topic]",
  "content": "## Section 1\\n- Point 1\\n- Point 2\\n\\n## Section 2\\n- Point 3"
}

Output ONLY valid JSON.`,

    paragraph: `You are a summarizer. Create a concise paragraph summary STRICTLY from the provided context.

CRITICAL RULES:
1. Use ONLY information from the CONTEXT below.
2. Write clear, well-structured paragraphs.
3. Cover all major topics.
4. If insufficient material, respond with: {"error": "insufficient_context"}

CONTEXT:
{context}

Respond with JSON:
{
  "title": "Summary of [topic]",
  "content": "Paragraph text here..."
}

Output ONLY valid JSON.`,

    exam: `You are an exam preparation summarizer. Create a focused exam-prep summary STRICTLY from the provided context.

CRITICAL RULES:
1. Use ONLY information from the CONTEXT below.
2. Highlight key definitions, formulas, and concepts likely to appear on an exam.
3. Organize by topic with clear headings.
4. Include "Key Terms" and "Important Concepts" sections.
5. If insufficient material, respond with: {"error": "insufficient_context"}

CONTEXT:
{context}

Respond with JSON:
{
  "title": "Exam Prep: [topic]",
  "content": "## Key Terms\\n- Term: Definition\\n\\n## Important Concepts\\n..."
}

Output ONLY valid JSON.`,
};

// =============================================================================
// Insufficient Context Response
// =============================================================================

export const INSUFFICIENT_CONTEXT_MESSAGE =
    'Not enough relevant material found in your uploaded sources. ' +
    'Please upload more files or videos related to this topic before generating study tools.';
