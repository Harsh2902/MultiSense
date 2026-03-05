-- =============================================================================
-- Migration: Switch to Gemini Embeddings (768 dimensions)
-- =============================================================================

-- 1. Drop existing embeddings table (incompatible dimensions)
-- WARNING: This deletes all existing embeddings! They must be re-generated.
DROP TABLE IF EXISTS public.embeddings CASCADE;

-- 2. Re-create embeddings table with 768 dimensions
CREATE TABLE public.embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL REFERENCES public.source_chunks(id) ON DELETE CASCADE,
  embedding vector(768), -- Gemini embedding dimension
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(chunk_id)
);

-- 3. Re-create index
CREATE INDEX idx_embeddings_vector 
  ON public.embeddings 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. Enable RLS
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

-- 5. Update match_chunks function for 768 dimensions
CREATE OR REPLACE FUNCTION match_chunks(
  p_conversation_id uuid,
  p_embedding vector(768), -- Updated dimension
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

-- Grant access
GRANT EXECUTE ON FUNCTION match_chunks(uuid, vector, float, int) TO authenticated;
