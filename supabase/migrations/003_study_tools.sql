-- =============================================================================
-- Study Tools Tables - Quiz, Flashcards, Summary (Phase 8)
-- =============================================================================

-- Requires: 002_learning_sources.sql (learning_sources, source_chunks, embeddings)

-- =============================================================================
-- Quizzes
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Quiz',
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  question_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_user_conversation
  ON public.quizzes(user_id, conversation_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_status
  ON public.quizzes(status);

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quizzes"
  ON public.quizzes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own quizzes"
  ON public.quizzes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quizzes"
  ON public.quizzes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own quizzes"
  ON public.quizzes FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- Quiz Questions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_index integer NOT NULL,
  question_text text NOT NULL,
  options jsonb NOT NULL,               -- JSON array of 4 option strings
  correct_option_index integer NOT NULL CHECK (correct_option_index BETWEEN 0 AND 3),
  explanation text NOT NULL DEFAULT '',
  source_chunk_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(quiz_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id
  ON public.quiz_questions(quiz_id);

ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view questions of their quizzes"
  ON public.quiz_questions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.quizzes
      WHERE id = quiz_questions.quiz_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert questions for their quizzes"
  ON public.quiz_questions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.quizzes
      WHERE id = quiz_questions.quiz_id
      AND user_id = auth.uid()
    )
  );

-- =============================================================================
-- Quiz Attempts
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer_hash text NOT NULL, -- MD5 of sorted answers for dedup
  score integer NOT NULL DEFAULT 0,
  percentage numeric(5,2) NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id
  ON public.quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user_id
  ON public.quiz_attempts(user_id);

-- Prevent exact duplicate answer submissions per quiz per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_attempts_dedup
  ON public.quiz_attempts(quiz_id, user_id, answer_hash);

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own attempts"
  ON public.quiz_attempts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can submit attempts for quizzes they own"
  ON public.quiz_attempts FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.quizzes
      WHERE id = quiz_attempts.quiz_id
      AND user_id = auth.uid()
    )
  );

-- =============================================================================
-- Flashcard Sets
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.flashcard_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Flashcards',
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  card_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcard_sets_user_conversation
  ON public.flashcard_sets(user_id, conversation_id);

ALTER TABLE public.flashcard_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own flashcard sets"
  ON public.flashcard_sets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own flashcard sets"
  ON public.flashcard_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own flashcard sets"
  ON public.flashcard_sets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own flashcard sets"
  ON public.flashcard_sets FOR DELETE
  USING (auth.uid() = user_id);

-- =============================================================================
-- Flashcards
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.flashcard_sets(id) ON DELETE CASCADE,
  card_index integer NOT NULL,
  front text NOT NULL,
  back text NOT NULL,
  is_learned boolean NOT NULL DEFAULT false,
  review_count integer NOT NULL DEFAULT 0,
  last_reviewed_at timestamptz,
  source_chunk_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(set_id, card_index)
);

CREATE INDEX IF NOT EXISTS idx_flashcards_set_id
  ON public.flashcards(set_id);

ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view flashcards of their sets"
  ON public.flashcards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_sets
      WHERE id = flashcards.set_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert flashcards for their sets"
  ON public.flashcards FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.flashcard_sets
      WHERE id = flashcards.set_id
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update flashcards of their sets"
  ON public.flashcards FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_sets
      WHERE id = flashcards.set_id
      AND user_id = auth.uid()
    )
  );

-- =============================================================================
-- Summaries
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  summary_type text NOT NULL CHECK (summary_type IN ('bullet', 'paragraph', 'exam')),
  title text NOT NULL DEFAULT 'Summary',
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'ready', 'failed')),
  version integer NOT NULL DEFAULT 1, -- Increments on regeneration
  word_count integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_summaries_user_conversation
  ON public.summaries(user_id, conversation_id);

-- Only one summary per type per version per conversation (allows version history)
CREATE UNIQUE INDEX IF NOT EXISTS idx_summaries_unique_type_version
  ON public.summaries(user_id, conversation_id, summary_type, version)
  WHERE status != 'failed';

ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own summaries"
  ON public.summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own summaries"
  ON public.summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own summaries"
  ON public.summaries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own summaries"
  ON public.summaries FOR DELETE
  USING (auth.uid() = user_id);
