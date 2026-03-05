export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-zinc-950 text-zinc-100 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-zinc-950 opacity-50" />
            <div className="absolute top-0 left-0 right-0 h-[500px] bg-primary/10 blur-[100px] rounded-full pointer-events-none opacity-20 transform -translate-y-1/2" />

            <div className="w-full max-w-md space-y-8 relative z-10">
                {children}
            </div>
        </div>
    );
}
