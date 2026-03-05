import { Sidebar } from '@/components/layout/sidebar';

// All dashboard pages require auth and runtime data — skip static prerendering
export const dynamic = 'force-dynamic';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen w-full overflow-hidden bg-zinc-900">
            {/* Sidebar - Hidden on mobile by default (TODO: Add mobile trigger) */}
            <aside className="hidden md:flex h-full flex-shrink-0">
                <Sidebar />
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Mobile Header (TODO) */}
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
