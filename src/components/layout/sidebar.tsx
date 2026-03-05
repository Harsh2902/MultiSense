'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Plus, MessageSquare, BookOpen, GraduationCap, Settings, LogOut, PanelLeftClose, PanelLeftOpen, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser, useClerk } from '@clerk/nextjs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConversations, useDeleteConversation } from '@/hooks/use-conversations';
import { useEffect, useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isGuest, setIsGuest] = useState(false);
    const [isChecked, setIsChecked] = useState(false);

    const { user, isLoaded } = useUser();
    const { signOut } = useClerk();

    useEffect(() => {
        setIsGuest(document.cookie.includes('demo_session=true'));
        setIsChecked(true);
    }, []);

    const { mutate: deleteConversationMutation } = useDeleteConversation();

    const { data: conversationList, isLoading } = useConversations({
        enabled: isChecked && !isGuest
    });
    // Only show real conversations. For guests, this will likely be empty.
    const conversations = conversationList || [];

    return (
        <motion.div
            initial={{ width: 260 }}
            animate={{ width: isCollapsed ? 60 : 260 }}
            className={cn(
                "relative flex flex-col h-full bg-black text-white border-r border-white/10 transition-all duration-300",
                isCollapsed ? "items-center" : "items-stretch"
            )}
        >
            {/* Header: New Chat & Toggle */}
            <div className="p-3 flex items-center justify-between">
                {!isCollapsed && (
                    <Button
                        onClick={() => router.push('/chat')}
                        variant="outline"
                        className="flex-1 justify-start gap-2 bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-zinc-100"
                    >
                        <Plus className="h-4 w-4" />
                        <span>New Chat</span>
                    </Button>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="ml-2 text-zinc-400 hover:text-white"
                >
                    {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
                </Button>
            </div>

            {/* Navigation / Mode Selector */}
            <div className="px-3 py-2 flex flex-col gap-1">
                <NavItem
                    href="/chat"
                    icon={<MessageSquare className="h-5 w-5" />}
                    label="Chat"
                    active={pathname?.startsWith('/chat')}
                    collapsed={isCollapsed}
                />
                <NavItem
                    href="/learning"
                    icon={<BookOpen className="h-5 w-5" />}
                    label="Learning"
                    active={pathname?.startsWith('/learning')}
                    collapsed={isCollapsed}
                />
                <NavItem
                    href="/study"
                    icon={<GraduationCap className="h-5 w-5" />}
                    label="Study Tools"
                    active={pathname?.startsWith('/study')}
                    collapsed={isCollapsed}
                />
            </div>

            {/* History List (Scrollable) */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
                {!isCollapsed && (
                    <div className="text-xs font-semibold text-zinc-500 mb-2">Recent</div>
                )}
                <div className="space-y-1">
                    {isLoading ? (
                        <div className="p-2 text-xs text-zinc-500">Loading...</div>
                    ) : conversations.length === 0 ? (
                        <div className="p-2 text-xs text-zinc-500">No history</div>
                    ) : (
                        <AnimatePresence>
                            {conversations.map((chat: any, index: number) => (
                                <motion.div
                                    key={chat.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="group relative"
                                >
                                    <Link href={`/chat?id=${chat.id}`} className="block w-full">
                                        <Button
                                            variant="ghost"
                                            className={cn(
                                                "w-full justify-start text-sm font-normal text-zinc-300 hover:bg-zinc-800/50 hover:text-white h-auto py-2 pr-8",
                                                isCollapsed && "justify-center px-0",
                                                pathname?.includes(chat.id) && "bg-zinc-800 text-white"
                                            )}
                                        >
                                            {!isCollapsed ? (
                                                <span className="truncate text-left w-full">{chat.title || 'Untitled Chat'}</span>
                                            ) : (
                                                <MessageSquare className="h-4 w-4 shrink-0" />
                                            )}
                                        </Button>
                                    </Link>
                                    {!isCollapsed && (
                                        <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-zinc-400 hover:text-red-400 hover:bg-zinc-700/50"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                        }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </AlertDialogTrigger>
                                                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                                    <AlertDialogHeader>
                                                        <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                                                        <AlertDialogDescription>
                                                            This action cannot be undone. This will permanently delete the conversation and all messages.
                                                        </AlertDialogDescription>
                                                    </AlertDialogHeader>
                                                    <AlertDialogFooter>
                                                        <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
                                                        <AlertDialogAction
                                                            className="bg-red-600 hover:bg-red-700 text-white border-transparent"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                deleteConversationMutation(chat.id);
                                                            }}
                                                        >
                                                            Delete
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        </div>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    )}
                </div>
            </div>

            {/* User Profile (Footer) */}
            <div className="p-3 border-t border-white/10 relative z-50">
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className={cn(
                                "w-full justify-start hover:bg-zinc-800 gap-3",
                                isCollapsed && "justify-center px-0"
                            )}
                        >
                            <div className="h-8 w-8 rounded bg-green-600 flex items-center justify-center text-white font-bold overflow-hidden">
                                {isGuest ? 'G' : (user?.imageUrl ? <img src={user.imageUrl} alt="Avatar" className="h-full w-full object-cover" /> : 'S')}
                            </div>
                            {!isCollapsed && (
                                <div className="flex flex-col items-start overflow-hidden">
                                    <span className="text-sm font-medium text-zinc-100 truncate w-full">
                                        {isGuest ? 'Guest User' : (user?.fullName || 'Student')}
                                    </span>
                                    <span className="text-xs text-zinc-500 truncate w-full">
                                        {isGuest ? 'Demo Mode' : (user?.primaryEmailAddress?.emailAddress || 'View Profile')}
                                    </span>
                                </div>
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56 bg-zinc-900 border-zinc-800 text-zinc-100">
                        <DropdownMenuLabel>My Account</DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <Link href="/settings">
                            <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer">
                                <Settings className="mr-2 h-4 w-4" />
                                <span>Settings</span>
                            </DropdownMenuItem>
                        </Link>
                        <Link href="/customize">
                            <DropdownMenuItem className="focus:bg-zinc-800 focus:text-white cursor-pointer">
                                <BookOpen className="mr-2 h-4 w-4" />
                                <span>Customize Learning</span>
                            </DropdownMenuItem>
                        </Link>
                        <DropdownMenuSeparator className="bg-zinc-800" />
                        <DropdownMenuItem
                            className="focus:bg-zinc-800 text-red-400 focus:text-red-400 cursor-pointer"
                            onClick={async () => {
                                // Clear demo cookie
                                document.cookie = 'demo_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

                                if (!isGuest) {
                                    await signOut();
                                }

                                // Redirect
                                router.push('/login');
                                router.refresh();
                            }}
                        >
                            <LogOut className="mr-2 h-4 w-4" />
                            <span>Log out</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </motion.div>
    );
}


function NavItem({
    href,
    icon,
    label,
    active,
    collapsed
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    active?: boolean;
    collapsed?: boolean;
}) {
    return (
        <Link href={href} className="w-full">
            <Button
                variant={active ? "secondary" : "ghost"}
                className={cn(
                    "w-full gap-3",
                    active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white hover:bg-zinc-800/50",
                    collapsed ? "justify-center px-0" : "justify-start"
                )}
            >
                {icon}
                {!collapsed && <span>{label}</span>}
            </Button>
        </Link>
    );
}
