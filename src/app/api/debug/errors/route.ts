
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
    // Force rebuild timestamp: 123456
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { count, error } = await supabase
        .from('learning_sources')
        .select('*', { count: 'exact', head: true });

    return NextResponse.json({
        count,
        config: {
            url: process.env.NEXT_PUBLIC_SUPABASE_URL,
            serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length,
        },
        env: {
            openaiKeyPresent: !!process.env.OPENAI_API_KEY,
            openaiKeyLength: process.env.OPENAI_API_KEY?.length,
            groqKeyPresent: !!process.env.GROQ_API_KEY,
        },
        error
    });
}
