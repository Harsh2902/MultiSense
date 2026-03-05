// =============================================================================
// Summary Get API - GET /api/study/summary/[conversationId]
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, withApiHandler } from '@/lib/api';
import { SummaryService } from '@/services/summary.service';
import type { SummaryResponse, SummaryType } from '@/types/study';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { setRequestUserId } from '@/lib/request-context';

// =============================================================================
// GET /api/study/summary/[conversationId]
// =============================================================================

export const GET = withApiHandler(async (
    request: NextRequest,
    context?: { params?: Record<string, string> }
): Promise<NextResponse> => {
    const auth = await requireAuth();
    if (!auth.success) return auth.error;
    setRequestUserId(auth.user.id);

    const conversationId = context?.params?.conversationId;
    if (!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId)) {
        throw new ValidationError('Invalid conversation ID');
    }

    // Verify conversation ownership
    const { data: conv, error: convError } = await auth.supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .eq('user_id', auth.user.id)
        .single();

    if (convError || !conv) {
        throw new NotFoundError('Conversation', conversationId);
    }

    // Optional query param for summary type filter
    const url = new URL(request.url);
    const typeParam = url.searchParams.get('type') as SummaryType | null;
    const validTypes: SummaryType[] = ['bullet', 'paragraph', 'exam'];
    const summaryType = typeParam && validTypes.includes(typeParam) ? typeParam : undefined;

    const summaryService = new SummaryService(auth.supabase, auth.user.id);
    const results = await summaryService.getSummary(conversationId, summaryType);

    return NextResponse.json<SummaryResponse[]>(results);
});
