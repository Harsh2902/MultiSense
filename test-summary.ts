import { SummaryService } from './src/services/summary.service';
import { prisma } from './src/lib/prisma';

async function main() {
    // Find latest YouTube Summarizer conversation
    const conv = await prisma.conversation.findFirst({
        where: { title: 'YouTube Summarizer' },
        orderBy: { created_at: 'desc' }
    });

    if (!conv) {
        console.log('No conversation found');
        return;
    }

    console.log(`Using Conversation: ${conv.id} (User: ${conv.user_id})`);

    const summaryService = new SummaryService(conv.user_id);

    try {
        console.log('Calling generateSummary...');
        const result = await summaryService.generateSummary(
            conv.id,
            'paragraph',
            'this YouTube video'
        );
        console.log('SUCCESS:', result);
    } catch (e: any) {
        console.error('ERROR during generateSummary:');
        console.error(e.message);
        console.error(e.stack);
    }
}

main().catch(console.error);
