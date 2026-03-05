
import type { SupabaseClient } from '@supabase/supabase-js';


export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            users: UsersTable
            conversations: ConversationsTable
            messages: MessagesTable
            learning_sources: LearningSourcesTable
            source_chunks: SourceChunksTable
            [key: string]: any // fallback for missing tables
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            match_embeddings: MatchEmbeddingsFunction
            claim_pending_sources: ClaimPendingSourcesFunction
            reset_stale_sources: ResetStaleSourcesFunction
            jsonb_merge: JsonbMergeFunction
            update_source_metadata: UpdateSourceMetadataFunction
            [key: string]: any // fallback for missing functions
        }
        Enums: {
            [_ in never]: never
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

export type TypedSupabaseClient = SupabaseClient<Database>

// Table Types with robust Json handling
interface UsersTable {
    Row: {
        id: string
        email: string
        full_name: string | null
        avatar_url: string | null
        preferences: Json
        created_at: string
        updated_at: string
    }
    Insert: {
        id: string
        email: string
        full_name?: string | null
        avatar_url?: string | null
        preferences?: Json
        created_at?: string
        updated_at?: string
    }
    Update: {
        email?: string
        full_name?: string | null
        avatar_url?: string | null
        preferences?: Json
        updated_at?: string
    }
    Relationships: any[]
}

interface ConversationsTable {
    Row: {
        id: string
        user_id: string
        title: string
        mode: 'chat' | 'learning'
        settings: Json
        created_at: string
        updated_at: string
    }
    Insert: {
        id?: string
        user_id: string
        title?: string
        mode?: 'chat' | 'learning'
        settings?: Json
        created_at?: string
        updated_at?: string
    }
    Update: {
        title?: string
        mode?: 'chat' | 'learning'
        settings?: Json
        updated_at?: string
    }
    Relationships: [
        {
            foreignKeyName: "conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
        }
    ]
}

interface MessagesTable {
    Row: {
        id: string
        conversation_id: string
        role: 'user' | 'assistant' | 'system'
        content: string
        metadata: Json
        token_count: number | null
        created_at: string
    }
    Insert: {
        id?: string
        conversation_id: string
        role: 'user' | 'assistant' | 'system'
        content: string
        metadata?: Json
        token_count?: number | null
        created_at?: string
    }
    Update: {
        content?: string
        metadata?: Json
        token_count?: number | null
    }
    Relationships: [
        {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
        }
    ]
}

interface LearningSourcesTable {
    Row: {
        id: string
        user_id: string
        conversation_id: string | null
        source_type: 'file' | 'youtube' | 'web'
        source_url: string | null
        title: string
        original_filename: string | null
        file_type: 'pdf' | 'docx' | 'txt' | 'md' | 'video' | 'html' | 'image'
        status: 'pending' | 'processing' | 'completed' | 'failed'
        metadata: Json
        chunks_count: number
        file_size: number | null
        storage_path: string | null
        error_message: string | null
        created_at: string
        updated_at: string
    }
    Insert: {
        id?: string
        user_id: string
        conversation_id?: string | null
        source_type: 'file' | 'youtube' | 'web'
        source_url?: string | null
        title?: string
        original_filename?: string | null
        file_type: 'pdf' | 'docx' | 'txt' | 'md' | 'video' | 'html' | 'image'
        status?: 'pending' | 'processing' | 'completed' | 'failed'
        metadata?: Json
        chunks_count?: number
        file_size?: number | null
        storage_path?: string | null
        error_message?: string | null
        created_at?: string
        updated_at?: string
    }
    Update: {
        status?: 'pending' | 'processing' | 'completed' | 'failed'
        metadata?: Json
        chunks_count?: number
        error_message?: string | null
        updated_at?: string
    }
    Relationships: [
        {
            foreignKeyName: "learning_sources_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
        },
        {
            foreignKeyName: "learning_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
        }
    ]
}

interface SourceChunksTable {
    Row: {
        id: string
        source_id: string
        chunk_index: number
        content: string
        token_count: number
        embedding: number[] | null
        metadata: Json
        created_at: string
    }
    Insert: {
        id?: string
        source_id: string
        chunk_index: number
        content: string
        token_count: number
        embedding?: number[] | null
        metadata?: Json
        created_at?: string
    }
    Update: {
        content?: string
        token_count?: number
        embedding?: number[] | null
        metadata?: Json
    }
    Relationships: [
        {
            foreignKeyName: "source_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "learning_sources"
            referencedColumns: ["id"]
        }
    ]
}

interface MatchEmbeddingsFunction {
    Args: {
        query_embedding: number[]
        match_threshold?: number
        match_count?: number
    }
    Returns: {
        chunk_id: string
        source_id: string
        content: string
        similarity: number
    }[]
}

interface ClaimPendingSourcesFunction {
    Args: {
        p_user_id: string | null
        p_limit: number
    }
    Returns: unknown[]
}

interface ResetStaleSourcesFunction {
    Args: Record<PropertyKey, never>
    Returns: number
}

interface JsonbMergeFunction {
    Args: {
        target: string
        patch: Json
    }
    Returns: Json
}

interface UpdateSourceMetadataFunction {
    Args: {
        p_source_id: string
        p_updates: Json
    }
    Returns: void
}

export type TableName = keyof Database['public']['Tables'];
export type TableRow<T extends TableName> = Database['public']['Tables'][T]['Row'];
export type TableInsert<T extends TableName> = Database['public']['Tables'][T]['Insert'];
export type TableUpdate<T extends TableName> = Database['public']['Tables'][T]['Update'];
