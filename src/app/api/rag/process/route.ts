
import { NextRequest, NextResponse } from 'next/server';
import { RagPipeline } from '@/lib/rag/pipeline';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { documentId } = await req.json();

        if (!documentId) {
            return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
        }

        const supabase = await createClient();

        // Fetch document metadata to ensure it exists and we have access
        const { data: doc, error } = await supabase
            .from('documents')
            .select('*')
            .eq('id', documentId)
            .single();

        if (error || !doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Trigger processing
        // Note: In a production serverless env (Vercel), this might time out.
        // For local/VPS, it's fine. Ideally use a queue.
        const pipeline = new RagPipeline();

        // Run in background (fire and forget) if possible, or await if short.
        // For debugging/MVP, let's await to see errors.
        await pipeline.processDocument({
            id: doc.id,
            userId: doc.user_id,
            title: doc.title,
            originalFilename: doc.original_filename,
            filePath: doc.file_path,
            fileType: doc.file_type,
            mimeType: doc.mime_type,
            metadata: doc.metadata,
            status: doc.status,
        });

        return NextResponse.json({ success: true, message: 'Processing started/completed' });

    } catch (error: any) {
        console.error('RAG Process Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
