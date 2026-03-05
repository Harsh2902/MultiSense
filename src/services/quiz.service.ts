// =============================================================================
// Quiz Service - Generate and manage quizzes via RAG
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
    QuizRow,
    QuizQuestionRow,
    QuizAttemptRow,
    AttemptAnswer,
    GeneratedQuizQuestion,
    QuizResponse,
    QuizAttemptResponse,
} from '@/types/study';
import {
    STUDY_CONFIG,
    QUIZ_SYSTEM_PROMPT,
    INSUFFICIENT_CONTEXT_MESSAGE,
} from '@/types/study';
import { RagService } from '@/services/rag.service';
import { createLLMProvider } from '@/lib/ai/registry';
import { estimateTokens, parseLlmJson } from '@/lib/ai/tokens';
import { debitTokenBudget } from '@/lib/token-governance';
import { BudgetExceededError } from '@/lib/errors';
import type { LLMProvider } from '@/types/ai.types';

// =============================================================================
// Service
// =============================================================================

export class QuizService {
    private supabase: SupabaseClient;
    private userId: string;
    private ragService: RagService;
    private llm: LLMProvider;

    constructor(supabase: SupabaseClient, userId: string) {
        this.supabase = supabase;
        this.userId = userId;
        this.ragService = new RagService(supabase, userId);
        this.llm = createLLMProvider();
    }

    // ===========================================================================
    // Generate Quiz
    // ===========================================================================

    async generateQuiz(
        conversationId: string,
        topic?: string
    ): Promise<QuizResponse> {
        // 1. Rate limit check
        await this.checkRateLimit(conversationId);

        // 2. Check for concurrent generation
        await this.checkConcurrentGeneration(conversationId);

        // 3. Retrieve context via RAG
        const query = topic
            ? `Key concepts and facts about: ${topic}`
            : 'All key concepts, definitions, and important facts from the study material';

        const context = await this.ragService.retrieveContext(conversationId, query, {
            k: 8,
            threshold: 0.7,
            maxContextTokens: STUDY_CONFIG.MAX_PROMPT_TOKENS,
        });

        // 4. Check minimum context
        if (
            context.chunks.length < STUDY_CONFIG.MIN_CONTEXT_CHUNKS ||
            context.tokenCount < STUDY_CONFIG.MIN_CONTEXT_TOKENS
        ) {
            throw new StudyToolError(INSUFFICIENT_CONTEXT_MESSAGE, 'INSUFFICIENT_CONTEXT');
        }

        // 5. Create quiz record (status: generating)
        const { data: quiz, error: createError } = await this.supabase
            .from('quizzes')
            .insert({
                user_id: this.userId,
                conversation_id: conversationId,
                title: topic ? `Quiz: ${topic}` : 'Quiz',
                status: 'generating',
                question_count: STUDY_CONFIG.QUIZ_QUESTION_COUNT,
                metadata: { topic, contextTokens: context.tokenCount },
            })
            .select()
            .single();

        if (createError || !quiz) {
            throw new StudyToolError('Failed to create quiz', 'CREATE_FAILED');
        }

        try {
            // 6. Build prompt and call LLM
            const systemPrompt = QUIZ_SYSTEM_PROMPT
                .replace('{count}', String(STUDY_CONFIG.QUIZ_QUESTION_COUNT))
                .replace('{context}', context.formattedContext);

            const userMessage = topic
                ? `Generate ${STUDY_CONFIG.QUIZ_QUESTION_COUNT} multiple-choice questions about "${topic}" from the provided context.`
                : `Generate ${STUDY_CONFIG.QUIZ_QUESTION_COUNT} multiple-choice questions covering the key concepts from the provided context.`;

            // 7. Token budget check
            const promptTokens = estimateTokens(systemPrompt + userMessage);
            if (promptTokens > STUDY_CONFIG.MAX_PROMPT_TOKENS) {
                throw new StudyToolError('Context too large for quiz generation', 'TOKEN_OVERFLOW');
            }

            // 7b. Atomic budget enforcement
            const debit = await debitTokenBudget(this.supabase, {
                userId: this.userId,
                feature: 'quiz',
                provider: 'groq',
                inputTokens: promptTokens,
                outputTokens: 4096, // Quiz JSON is typically large
            });
            if (!debit.allowed) {
                await this.markQuizFailed(quiz.id);
                throw new BudgetExceededError(debit);
            }

            const llmResponse = await this.llm.generate({
                systemPrompt,
                userMessage,
                jsonMode: true,
            });

            // 8. Parse and validate response
            const parsed = parseLlmJson<GeneratedQuizQuestion[] | { error: string }>(
                llmResponse.content
            );

            if (!Array.isArray(parsed)) {
                if ('error' in parsed && parsed.error === 'insufficient_context') {
                    await this.markQuizFailed(quiz.id);
                    throw new StudyToolError(INSUFFICIENT_CONTEXT_MESSAGE, 'INSUFFICIENT_CONTEXT');
                }
                throw new StudyToolError('Invalid quiz response from LLM', 'PARSE_ERROR');
            }

            // 9. Validate each question
            const validQuestions = parsed.filter(q =>
                q.question &&
                Array.isArray(q.options) &&
                q.options.length === 4 &&
                typeof q.correct_index === 'number' &&
                q.correct_index >= 0 &&
                q.correct_index <= 3
            );

            if (validQuestions.length === 0) {
                await this.markQuizFailed(quiz.id);
                throw new StudyToolError('No valid questions generated', 'GENERATION_FAILED');
            }

            // 10. Store questions
            const chunkIds = context.chunks.map(c => c.id);
            const { data: questions, error: qError } = await this.supabase
                .from('quiz_questions')
                .insert(
                    validQuestions.map((q, i) => ({
                        quiz_id: quiz.id,
                        question_index: i,
                        question_text: q.question,
                        options: q.options,
                        correct_option_index: q.correct_index,
                        explanation: q.explanation || '',
                        source_chunk_ids: chunkIds,
                    }))
                )
                .select();

            if (qError) {
                await this.markQuizFailed(quiz.id);
                throw new StudyToolError('Failed to store questions', 'STORE_FAILED');
            }

            // 11. Mark quiz ready
            await this.supabase
                .from('quizzes')
                .update({
                    status: 'ready',
                    question_count: validQuestions.length,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', quiz.id);

            const updatedQuiz = { ...quiz, status: 'ready' as const, question_count: validQuestions.length };

            return { quiz: updatedQuiz, questions: questions || [] };
        } catch (error) {
            if (error instanceof StudyToolError) throw error;
            await this.markQuizFailed(quiz.id);
            throw error;
        }
    }

    // ===========================================================================
    // Submit Quiz Attempt
    // ===========================================================================

    async submitAttempt(
        quizId: string,
        answers: Array<{ question_id: string; selected_option_index: number }>
    ): Promise<QuizAttemptResponse> {
        // 1. Fetch quiz and verify ownership
        const { data: quiz, error: quizError } = await this.supabase
            .from('quizzes')
            .select('*')
            .eq('id', quizId)
            .eq('user_id', this.userId)
            .eq('status', 'ready')
            .single();

        if (quizError || !quiz) {
            throw new StudyToolError('Quiz not found or not ready', 'NOT_FOUND');
        }

        // 2. Fetch questions
        const { data: questions, error: qError } = await this.supabase
            .from('quiz_questions')
            .select('*')
            .eq('quiz_id', quizId)
            .order('question_index', { ascending: true });

        if (qError || !questions || questions.length === 0) {
            throw new StudyToolError('No questions found for quiz', 'NOT_FOUND');
        }

        // 3. Validate all questions answered
        const questionMap = new Map<string, QuizQuestionRow>();
        for (const q of questions) {
            questionMap.set(q.id, q);
        }

        // 4. Score answers
        const attemptAnswers: AttemptAnswer[] = [];
        let correctCount = 0;

        for (const answer of answers) {
            const question = questionMap.get(answer.question_id);
            if (!question) continue;

            const isCorrect = answer.selected_option_index === question.correct_option_index;
            if (isCorrect) correctCount++;

            attemptAnswers.push({
                question_id: answer.question_id,
                selected_option_index: answer.selected_option_index,
                is_correct: isCorrect,
            });
        }

        const percentage = questions.length > 0
            ? Math.round((correctCount / questions.length) * 100 * 100) / 100
            : 0;

        // 5. Compute answer hash for dedup (sorted by question_id for determinism)
        const sortedAnswers = [...attemptAnswers]
            .sort((a, b) => a.question_id.localeCompare(b.question_id))
            .map(a => `${a.question_id}:${a.selected_option_index}`)
            .join('|');
        const answerHash = await this.computeHash(sortedAnswers);

        // 6. Store attempt
        const { data: attempt, error: attemptError } = await this.supabase
            .from('quiz_attempts')
            .insert({
                quiz_id: quizId,
                user_id: this.userId,
                answers: attemptAnswers,
                answer_hash: answerHash,
                score: correctCount,
                percentage,
            })
            .select()
            .single();

        if (attemptError) {
            if (attemptError.code === '23505') {
                throw new StudyToolError('Duplicate submission detected', 'DUPLICATE');
            }
            throw new StudyToolError('Failed to submit attempt', 'STORE_FAILED');
        }

        // 6. Build response
        const results = questions.map((q: QuizQuestionRow) => {
            const answer = attemptAnswers.find(a => a.question_id === q.id);
            return {
                question: q,
                selected_option_index: answer?.selected_option_index ?? -1,
                is_correct: answer?.is_correct ?? false,
            };
        });

        return { attempt, quiz, results };
    }

    // ===========================================================================
    // Get Quiz
    // ===========================================================================

    async getQuiz(quizId: string): Promise<QuizResponse> {
        const { data: quiz, error: quizError } = await this.supabase
            .from('quizzes')
            .select('*')
            .eq('id', quizId)
            .eq('user_id', this.userId)
            .single();

        if (quizError || !quiz) {
            throw new StudyToolError('Quiz not found', 'NOT_FOUND');
        }

        const { data: questions } = await this.supabase
            .from('quiz_questions')
            .select('*')
            .eq('quiz_id', quizId)
            .order('question_index', { ascending: true });

        return { quiz, questions: questions || [] };
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    private async checkRateLimit(conversationId: string): Promise<void> {
        const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();

        const { count } = await this.supabase
            .from('quizzes')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', this.userId)
            .gte('created_at', oneHourAgo);

        if ((count ?? 0) >= STUDY_CONFIG.GENERATION_RATE_LIMIT_PER_HOUR) {
            throw new StudyToolError(
                'Rate limit exceeded. Please wait before generating more quizzes.',
                'RATE_LIMITED'
            );
        }
    }

    private async checkConcurrentGeneration(conversationId: string): Promise<void> {
        const { data } = await this.supabase
            .from('quizzes')
            .select('id')
            .eq('user_id', this.userId)
            .eq('conversation_id', conversationId)
            .eq('status', 'generating')
            .limit(1);

        if (data && data.length > 0) {
            throw new StudyToolError(
                'A quiz is already being generated for this conversation',
                'CONCURRENT_GENERATION'
            );
        }
    }

    private async markQuizFailed(quizId: string): Promise<void> {
        await this.supabase
            .from('quizzes')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', quizId);
    }

    /**
     * Compute a simple hash of a string for deduplication.
     * Uses Web Crypto API (available in Next.js edge + Node 18+).
     */
    private async computeHash(input: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
}

// =============================================================================
// Error Class
// =============================================================================

export class StudyToolError extends Error {
    code: string;
    constructor(message: string, code: string) {
        super(message);
        this.name = 'StudyToolError';
        this.code = code;
    }
}
