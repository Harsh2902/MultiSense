-- =============================================================================
-- Learning Mode Tables - Supabase SQL Schema
-- =============================================================================

-- Run this in Supabase SQL Editor

-- -----------------------------------------------------------------------------
-- Learning Sources Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.learning_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('file', 'youtube')),
  title text NOT NULL,
  original_filename text,
  file_type text CHECK (file_type IN ('pdf', 'docx', 'txt', 'image')),
  file_size bigint,
  storage_path text,
  source_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_learning_sources_user_id ON public.learning_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_sources_conversation_id ON public.learning_sources(conversation_id);
CREATE INDEX IF NOT EXISTS idx_learning_sources_status ON public.learning_sources(status);
CREATE INDEX IF NOT EXISTS idx_learning_sources_user_conversation ON public.learning_sources(user_id, conversation_id);

-- Index for hash-based duplicate detection
CREATE INDEX IF NOT EXISTS idx_learning_sources_hash 
  ON public.learning_sources((metadata->>'hash'))
  WHERE metadata->>'hash' IS NOT NULL;

-- Unique partial index to prevent race condition duplicate uploads
-- This ensures only one source with a given hash can exist per conversation
CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_sources_unique_hash_per_conversation
  ON public.learning_sources(conversation_id, (metadata->>'hash'))
  WHERE metadata->>'hash' IS NOT NULL 
  AND status != 'failed';

-- Index for YouTube URL deduplication
CREATE INDEX IF NOT EXISTS idx_learning_sources_source_url
  ON public.learning_sources(conversation_id, source_url)
  WHERE source_url IS NOT NULL;

-- RLS Policies
ALTER TABLE public.learning_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sources"
  ON public.learning_sources FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own sources"
  ON public.learning_sources FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own sources"
  ON public.learning_sources FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own sources"
  ON public.learning_sources FOR DELETE
  USING (user_id = auth.uid());

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_learning_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER learning_sources_updated_at
  BEFORE UPDATE ON public.learning_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_sources_updated_at();

-- -----------------------------------------------------------------------------
-- Atomic Queue Claim Function (for serverless processing)
-- -----------------------------------------------------------------------------

/**
 * claim_pending_sources - Atomically claim pending sources for processing
 * 
 * This function uses UPDATE...RETURNING to atomically:
 * 1. Find sources with status = 'pending'
 * 2. Update their status to 'processing'
 * 3. Return the claimed sources
 * 
 * This prevents race conditions where multiple serverless workers
 * try to process the same source.
 * 
 * @param p_user_id - Optional user ID filter (NULL for all users)
 * @param p_limit - Maximum number of sources to claim
 * @returns Table of claimed learning_sources rows
 */
CREATE OR REPLACE FUNCTION claim_pending_sources(
  p_user_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5
)
RETURNS SETOF public.learning_sources
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM public.learning_sources
    WHERE status = 'pending'
      AND (p_user_id IS NULL OR user_id = p_user_id)
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.learning_sources ls
  SET 
    status = 'processing',
    updated_at = now()
  FROM claimed c
  WHERE ls.id = c.id
  RETURNING ls.*;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION claim_pending_sources(uuid, integer) TO authenticated;

-- -----------------------------------------------------------------------------
-- Source Chunks Table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.source_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.learning_sources(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  token_count integer NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(source_id, chunk_index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_source_chunks_source_id ON public.source_chunks(source_id);

-- RLS (inherit from parent source)
ALTER TABLE public.source_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chunks of their sources"
  ON public.source_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_sources 
      WHERE id = source_chunks.source_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert chunks for their sources"
  ON public.source_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.learning_sources 
      WHERE id = source_chunks.source_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete chunks of their sources"
  ON public.source_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.learning_sources 
      WHERE id = source_chunks.source_id 
      AND user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Embeddings Table (for RAG - Phase 7)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL REFERENCES public.source_chunks(id) ON DELETE CASCADE,
  embedding vector(1536), -- OpenAI/Groq embedding dimension
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(chunk_id)
);

-- Vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
  ON public.embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RLS
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view embeddings of their chunks"
  ON public.embeddings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.source_chunks sc
      JOIN public.learning_sources ls ON sc.source_id = ls.id
      WHERE sc.id = embeddings.chunk_id 
      AND ls.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- Vector Search RPC (for RAG retrieval)
-- -----------------------------------------------------------------------------

-- match_chunks - Find chunks similar to a query embedding
-- Uses pgvector cosine distance operator (<=>).
-- SECURITY INVOKER ensures caller's RLS context is used.
CREATE OR REPLACE FUNCTION match_chunks(
  p_conversation_id uuid,
  p_embedding vector(1536),
  p_threshold float DEFAULT 0.7,
  p_limit int DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  content text,
  chunk_index int,
  source_id uuid,
  source_title text,
  source_file_name text,
  source_type text,
  similarity float
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id,
    sc.content,
    sc.chunk_index,
    ls.id as source_id,
    ls.title as source_title,
    ls.original_filename as source_file_name,
    ls.source_type,
    (1 - (e.embedding <=> p_embedding))::float AS similarity
  FROM public.source_chunks sc
  JOIN public.learning_sources ls ON sc.source_id = ls.id
  JOIN public.embeddings e ON e.chunk_id = sc.id
  WHERE ls.conversation_id = p_conversation_id
  AND (1 - (e.embedding <=> p_embedding)) > p_threshold
  ORDER BY e.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION match_chunks(uuid, vector, float, int) TO authenticated;

-- -----------------------------------------------------------------------------
-- Storage Bucket Setup (Run in Supabase Dashboard > Storage)
-- -----------------------------------------------------------------------------

-- Create the bucket (do this in Dashboard or via API):
-- Name: learning-files
-- Public: false
-- File size limit: 10MB
-- Allowed MIME types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, image/png, image/jpeg, image/webp

-- Storage Policies (run after bucket creation):

-- Policy: Users can upload to their own folder
-- Target: learning-files bucket
-- Operation: INSERT
-- Policy: (bucket_id = 'learning-files' AND auth.uid()::text = (storage.foldername(name))[1])

-- Policy: Users can read their own files
-- Target: learning-files bucket
-- Operation: SELECT
-- Policy: (bucket_id = 'learning-files' AND auth.uid()::text = (storage.foldername(name))[1])

-- Policy: Users can delete their own files
-- Target: learning-files bucket
-- Operation: DELETE
-- Policy: (bucket_id = 'learning-files' AND auth.uid()::text = (storage.foldername(name))[1])

-- -----------------------------------------------------------------------------
-- Alternative: Storage Policies via SQL
-- -----------------------------------------------------------------------------

-- Note: These may need adjustment based on Supabase version

-- INSERT policy
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'learning-files' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- SELECT policy
CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'learning-files' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- DELETE policy
CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'learning-files' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- UPDATE policy (for upsert)
CREATE POLICY "Users can update own files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'learning-files' AND
    auth.uid()::text = (string_to_array(name, '/'))[1]
  );
