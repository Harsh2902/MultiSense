import { SignUp } from '@clerk/nextjs';

export default function SignupPage() {
    return (
        <div className="w-full flex items-center justify-center p-8 relative z-50">
            <SignUp
                appearance={{
                    elements: {
                        rootBox: "mx-auto",
                        card: "bg-zinc-900/80 backdrop-blur-xl border border-white/5 shadow-2xl rounded-2xl",
                        headerTitle: "text-white",
                        headerSubtitle: "text-zinc-400",
                        socialButtonsBlockButton: "bg-zinc-950/50 border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white",
                        socialButtonsBlockButtonText: "font-medium",
                        dividerLine: "bg-white/10",
                        dividerText: "text-zinc-500",
                        formFieldLabel: "text-zinc-300",
                        formFieldInput: "bg-zinc-950/50 border-zinc-800 text-white placeholder:text-zinc-600 focus-visible:ring-primary/50 focus-visible:border-primary/50",
                        formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground",
                        footerActionText: "text-zinc-400",
                        footerActionLink: "text-primary hover:text-primary/80"
                    }
                }}
            />
        </div>
    );
}
