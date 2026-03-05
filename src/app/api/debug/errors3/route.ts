
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: failures } = await supabase
            .from('learning_sources')
            .select('id, status, error_message, source_url, metadata')
            .in('status', ['failed', 'pending'])
            .order('created_at', { ascending: false })
            .limit(5);

        return NextResponse.json({
            failures
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
