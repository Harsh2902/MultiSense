// =============================================================================
// Quiz Service - Generate and manage quizzes via RAG (Prisma)
// =============================================================================

import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import type {
    QuizRow,
    QuizQuestionRow,
    QuizAttemptRow,
    AttemptAnswer,
    GeneratedQuizQuestion,
    QuizResponse,
    QuizAttemptResponse,
    QuizStatus
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
    private userId: string;
    private ragService: RagService;
    private llm: LLMProvider;

    constructor(userId: string) {
        this.userId = userId;
        this.ragService = new RagService(userId);
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
        await this.checkRateLimit();

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
        let quiz;
        try {
            quiz = await prisma.quiz.create({
                data: {
                    user_id: this.userId,
                    conversation_id: conversationId,
                    title: topic ? `Quiz: ${topic}` : 'Quiz',
                    status: 'generating',
                    question_count: STUDY_CONFIG.QUIZ_QUESTION_COUNT,
                    metadata: { topic, contextTokens: context.tokenCount } as Prisma.JsonObject,
                }
            });
        } catch (error) {
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
            const debit = await debitTokenBudget({
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
                maxTokens: 1536,
                temperature: 0.2,
                jsonMode: true,
            });

            // 8. Parse and validate response
            let parsed: GeneratedQuizQuestion[] | { error: string };
            try {
                parsed = parseLlmJson<GeneratedQuizQuestion[] | { error: string }>(
                    llmResponse.content
                );
            } catch (parseError) {
                await this.markQuizFailed(quiz.id);
                throw new StudyToolError(
                    'The model returned an invalid quiz format. Please try again.',
                    'PARSE_ERROR'
                );
            }

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

            await prisma.quizQuestion.createMany({
                data: validQuestions.map((q, i) => ({
                    quiz_id: quiz.id,
                    question_index: i,
                    question_text: q.question,
                    options: q.options,
                    correct_option_index: q.correct_index,
                    explanation: q.explanation || '',
                    source_chunk_ids: chunkIds,
                }))
            });

            const questions = await prisma.quizQuestion.findMany({
                where: { quiz_id: quiz.id },
                orderBy: { question_index: 'asc' }
            });

            // 11. Mark quiz ready
            const updated = await prisma.quiz.update({
                where: { id: quiz.id },
                data: {
                    status: 'ready',
                    question_count: validQuestions.length,
                }
            });

            const returnedQuiz = { ...updated, status: updated.status as QuizStatus, created_at: updated.created_at.toISOString(), updated_at: updated.updated_at.toISOString() } as unknown as QuizRow;
            return { quiz: returnedQuiz, questions: questions as unknown as QuizQuestionRow[] };
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
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, user_id: this.userId, status: 'ready' }
        });

        if (!quiz) {
            throw new StudyToolError('Quiz not found or not ready', 'NOT_FOUND');
        }

        // 2. Fetch questions
        const questions = await prisma.quizQuestion.findMany({
            where: { quiz_id: quizId },
            orderBy: { question_index: 'asc' }
        });

        if (!questions || questions.length === 0) {
            throw new StudyToolError('No questions found for quiz', 'NOT_FOUND');
        }

        // 3. Validate all questions answered
        const questionMap = new Map<string, any>();
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

        let answerHash: string | null = null;
        try {
            answerHash = await this.computeHash(sortedAnswers);

            // 5.5 Check duplicate deduplication physically via hash
            const existingAttempt = await prisma.quizAttempt.findFirst({
                where: {
                    quiz_id: quizId,
                    answer_hash: answerHash,
                    user_id: this.userId
                }
            });

            if (existingAttempt) {
                throw new StudyToolError('Duplicate submission detected', 'DUPLICATE');
            }
        } catch (hashCheckError) {
            if (!this.isMissingAnswerHashColumnError(hashCheckError)) {
                throw hashCheckError;
            }
            // Backward-compatible fallback for DBs that do not yet have quiz_attempts.answer_hash.
            answerHash = null;

            const existingAttempts = await prisma.quizAttempt.findMany({
                where: {
                    quiz_id: quizId,
                    user_id: this.userId
                },
                select: {
                    id: true,
                    answers: true
                }
            });

            const duplicate = existingAttempts.some((attempt) => {
                const existing = JSON.stringify(attempt.answers ?? []);
                const current = JSON.stringify(attemptAnswers);
                return existing === current;
            });

            if (duplicate) {
                throw new StudyToolError('Duplicate submission detected', 'DUPLICATE');
            }
        }

        // 6. Store attempt
        let attempt;
        try {
            attempt = await prisma.quizAttempt.create({
                data: {
                    quiz_id: quizId,
                    user_id: this.userId,
                    answers: attemptAnswers as any,
                    ...(answerHash ? { answer_hash: answerHash } : {}),
                    score: correctCount,
                    percentage,
                }
            });
        } catch (attemptError: any) {
            if (this.isMissingAnswerHashColumnError(attemptError)) {
                const attemptId = crypto.randomUUID();
                const insertedRows = await prisma.$queryRaw<Array<{
                    id: string;
                    quiz_id: string;
                    user_id: string;
                    answers: unknown;
                    score: number;
                    percentage: number;
                    completed_at: Date | string;
                    created_at: Date | string;
                }>>`
                    INSERT INTO quiz_attempts (id, quiz_id, user_id, answers, score, percentage)
                    VALUES (
                        ${attemptId},
                        ${quizId},
                        ${this.userId},
                        ${JSON.stringify(attemptAnswers)}::jsonb,
                        ${correctCount},
                        ${percentage}
                    )
                    RETURNING id, quiz_id, user_id, answers, score, percentage, completed_at, created_at
                `;

                const inserted = insertedRows[0];
                if (!inserted) {
                    throw new StudyToolError('Failed to submit attempt', 'STORE_FAILED');
                }

                attempt = inserted;
            } else {
                throw new StudyToolError('Failed to submit attempt', 'STORE_FAILED');
            }
        }

        // 6. Build response
        const results = questions.map((q: any) => {
            const answer = attemptAnswers.find(a => a.question_id === q.id);
            return {
                question: q as unknown as QuizQuestionRow,
                selected_option_index: answer?.selected_option_index ?? -1,
                is_correct: answer?.is_correct ?? false,
            };
        });

        const returnedAttempt = {
            ...attempt,
            completed_at: this.safeIso(attempt.completed_at),
            created_at: this.safeIso(attempt.created_at),
        } as unknown as QuizAttemptRow;
        const returnedQuiz = { ...quiz, status: quiz.status as QuizStatus, created_at: quiz.created_at.toISOString(), updated_at: quiz.updated_at.toISOString() } as unknown as QuizRow;

        return { attempt: returnedAttempt, quiz: returnedQuiz, results };
    }

    // ===========================================================================
    // Get Quiz
    // ===========================================================================

    async getQuiz(quizId: string): Promise<QuizResponse> {
        const quiz = await prisma.quiz.findUnique({
            where: { id: quizId, user_id: this.userId }
        });

        if (!quiz) {
            throw new StudyToolError('Quiz not found', 'NOT_FOUND');
        }

        const questions = await prisma.quizQuestion.findMany({
            where: { quiz_id: quizId },
            orderBy: { question_index: 'asc' }
        });

        const returnedQuiz = { ...quiz, status: quiz.status as QuizStatus, created_at: quiz.created_at.toISOString(), updated_at: quiz.updated_at.toISOString() } as unknown as QuizRow;
        return { quiz: returnedQuiz, questions: questions as unknown as QuizQuestionRow[] };
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    private async checkRateLimit(): Promise<void> {
        const oneHourAgo = new Date(Date.now() - 3600_000);

        const count = await prisma.quiz.count({
            where: {
                user_id: this.userId,
                created_at: { gte: oneHourAgo }
            }
        });

        if (count >= STUDY_CONFIG.GENERATION_RATE_LIMIT_PER_HOUR) {
            throw new StudyToolError(
                'Rate limit exceeded. Please wait before generating more quizzes.',
                'RATE_LIMITED'
            );
        }
    }

    private async checkConcurrentGeneration(conversationId: string): Promise<void> {
        const concurrent = await prisma.quiz.findFirst({
            where: {
                user_id: this.userId,
                conversation_id: conversationId,
                status: 'generating'
            },
            select: { id: true, updated_at: true }
        });

        if (concurrent) {
            const staleMs = Number(process.env.QUIZ_GENERATION_STALE_MS || 5 * 60 * 1000);
            const ageMs = Date.now() - new Date(concurrent.updated_at).getTime();

            if (ageMs >= staleMs) {
                await this.markQuizFailed(concurrent.id);
                return;
            }

            throw new StudyToolError(
                'A quiz is already being generated for this conversation. Please wait a moment and try again.',
                'CONCURRENT_GENERATION'
            );
        }
    }

    private async markQuizFailed(quizId: string): Promise<void> {
        await prisma.quiz.update({
            where: { id: quizId },
            data: { status: 'failed' }
        });
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

    private isMissingAnswerHashColumnError(error: unknown): boolean {
        if (!error || typeof error !== 'object') return false;
        const prismaLike = error as { code?: string; message?: string };
        return prismaLike.code === 'P2022' ||
            (typeof prismaLike.message === 'string' && prismaLike.message.includes('answer_hash'));
    }

    private safeIso(value: Date | string | null | undefined): string {
        if (!value) return new Date().toISOString();
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return new Date().toISOString();
        return date.toISOString();
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
