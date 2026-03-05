
import Providers from './providers';
import { RootErrorBoundary } from '@/features/shared/components/ErrorBoundary';
import './globals.css';

export const metadata = {
    title: 'Student Learning Platform',
    description: 'AI-powered learning assistant for students',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body suppressHydrationWarning>
                <Providers>
                    <RootErrorBoundary>
                        {children}
                    </RootErrorBoundary>
                </Providers>
            </body>
        </html>
    );
}
