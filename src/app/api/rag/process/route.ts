
import { NextRequest, NextResponse } from 'next/server';
import { RagPipeline } from '@/lib/rag/pipeline';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { documentId } = await req.json();

        if (!documentId) {
            return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
        }

        const { prisma } = await import('@/lib/prisma');

        // Fetch document metadata to ensure it exists and we have access
        const doc = await prisma.learningSource.findUnique({
            where: { id: documentId }
        });

        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 });
        }

        // Trigger processing
        // Note: In a production serverless env (Vercel), this might time out.
        // For local/VPS, it's fine. Ideally use a queue.
        const pipeline = new RagPipeline();

        const meta = doc.metadata as Record<string, any> || {};

        // Run in background (fire and forget) if possible, or await if short.
        // For debugging/MVP, let's await to see errors.
        await pipeline.processDocument({
            id: doc.id,
            userId: doc.user_id,
            title: doc.title,
            originalFilename: typeof meta.original_filename === 'string' ? meta.original_filename : doc.title,
            filePath: typeof meta.file_path === 'string' ? meta.file_path : '',
            fileType: (typeof meta.file_type === 'string' ? meta.file_type : 'text') as any,
            mimeType: typeof meta.mime_type === 'string' ? meta.mime_type : '',
            metadata: meta,
            status: doc.status as any,
        });

        return NextResponse.json({ success: true, message: 'Processing started/completed' });

    } catch (error: any) {
        console.error('RAG Process Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
