-- Enable the pgvector extension to work with embedding vectors
create extension if not exists vector;

-- 1. Documents Table: Tracks source files uploaded by users
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  title text not null,
  original_filename text not null,
  file_path text not null, -- Path in Supabase Storage
  file_type text not null, -- 'pdf', 'video', 'audio', 'image', 'text'
  mime_type text,
  metadata jsonb default '{}'::jsonb, -- dynamic metadata like duration, page_count
  status text default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS on documents
alter table documents enable row level security;

-- Policies for documents
create policy "Users can insert their own documents"
on documents for insert
with check (auth.uid() = user_id);

create policy "Users can view their own documents"
on documents for select
using (auth.uid() = user_id);

create policy "Users can update their own documents"
on documents for update
using (auth.uid() = user_id);

create policy "Users can delete their own documents"
on documents for delete
using (auth.uid() = user_id);


-- 2. Document Chunks: Stores the actual text chunks and their vector embeddings
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade not null,
  content text not null,
  chunk_index integer not null,
  embedding vector(768), -- Dimensions for nomic-embed-text-v1.5
  metadata jsonb default '{}'::jsonb, -- e.g., { "page": 1, "start_time": 10.5 }
  created_at timestamptz default now()
);

-- Enable RLS on chunks
alter table document_chunks enable row level security;

-- Policies for chunks (inherit from document ownership)
create policy "Users can view chunks of their own documents"
on document_chunks for select
using (
  exists (
    select 1 from documents
    where documents.id = document_chunks.document_id
    and documents.user_id = auth.uid()
  )
);

-- Index for similarity search
-- lists = 100 is a good default for < 100k rows. 
-- For larger datasets, this might need tuning.
create index on document_chunks using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Function to match documents (RPC)
create or replace function match_document_chunks (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_user_id uuid
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  similarity float,
  metadata jsonb
)
language plpgsql
stable
as $$
begin
  return query
  select
    document_chunks.id,
    document_chunks.document_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity,
    document_chunks.metadata
  from document_chunks
  join documents on documents.id = document_chunks.document_id
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  and documents.user_id = filter_user_id
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
