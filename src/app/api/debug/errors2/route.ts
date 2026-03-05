
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { count, error } = await supabase
            .from('learning_sources')
            .select('*', { count: 'exact', head: true });

        // Also get the failed rows
        const { data: failures } = await supabase
            .from('learning_sources')
            .select('id, status, error_message, source_url')
            .in('status', ['failed', 'pending'])
            .order('created_at', { ascending: false })
            .limit(5);

        return NextResponse.json({
            count,
            failures,
            config: {
                url: process.env.NEXT_PUBLIC_SUPABASE_URL,
                serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
            },
            env: {
                openaiKeyPresent: !!process.env.OPENAI_API_KEY,
                openaiKeyLength: process.env.OPENAI_API_KEY?.length,
            },
            error
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
