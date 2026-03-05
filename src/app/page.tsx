
import Link from 'next/link';

export default function Home() {
    return (
        <main style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
            <h1>Student Learning Platform</h1>
            <p>Welcome to your AI-powered study assistant.</p>

            <div style={{ display: 'grid', gap: '1rem', marginTop: '2rem' }}>
                <Link href="/chat" style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', textDecoration: 'none', color: 'inherit' }}>
                    <h2>Chat Assistant &rarr;</h2>
                    <p>Chat with AI about your documents and questions.</p>
                </Link>

                <Link href="/learning" style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', textDecoration: 'none', color: 'inherit' }}>
                    <h2>Learning Sources &rarr;</h2>
                    <p>Upload and manage your study materials.</p>
                </Link>

                <Link href="/study" style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', textDecoration: 'none', color: 'inherit' }}>
                    <h2>Study Tools &rarr;</h2>
                    <p>Generate quizzes, flashcards, and summaries.</p>
                </Link>
            </div>
        </main>
    );
}
