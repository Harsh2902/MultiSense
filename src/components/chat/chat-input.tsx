'use client';

import * as React from 'react';
import { SendHorizontal, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface ChatInputProps {
    onSend: (message: string) => void;
    disabled?: boolean;
    onFileSelect?: (file: File) => void;
    selectedFile?: File | null;
    onClearFile?: () => void;
}

export function ChatInput({ onSend, disabled, onFileSelect, selectedFile, onClearFile }: ChatInputProps) {
    const [input, setInput] = React.useState('');
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleSend = () => {
        if ((!input.trim() && !selectedFile) || disabled) return;
        onSend(input);
        setInput('');
        // Reset height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        // Auto-resize
        e.target.style.height = 'auto';
        e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onFileSelect) {
            onFileSelect(file);
        }
        // Reset value
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="relative flex flex-col w-full max-w-3xl mx-auto p-4">
            {selectedFile && (
                <div className="absolute -top-12 left-4 flex items-center gap-2 bg-zinc-800 border border-zinc-700 p-2 rounded-lg shadow-lg z-50">
                    <div className="bg-zinc-700/50 p-1 rounded">
                        <Paperclip className="h-4 w-4 text-zinc-300" />
                    </div>
                    <span className="text-sm text-zinc-200 max-w-[200px] truncate">
                        {selectedFile.name}
                    </span>
                    <button
                        onClick={onClearFile}
                        className="ml-2 hover:bg-zinc-700 p-1 rounded-full transition-colors"
                        type="button"
                    >
                        <X className="h-3 w-3 text-zinc-400 hover:text-white" />
                    </button>
                </div>
            )}

            <div className="relative flex items-end gap-2 p-3 bg-zinc-800/50 rounded-xl border border-zinc-700/50 shadow-lg focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/50 transition-all duration-300 z-50">
                {/* Hidden File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    className="absolute opacity-0 w-0 h-0"
                    onChange={handleFileChange}
                    disabled={disabled}
                />

                {/* Attachment Button */}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 flex-shrink-0 text-zinc-400 hover:text-white rounded-lg mb-1 pointer-events-auto relative z-[120]"
                    onClick={() => {
                        if (fileInputRef.current) {
                            fileInputRef.current.click();
                        }
                    }}
                    disabled={disabled}
                >
                    <Paperclip className="h-5 w-5" />
                </Button>

                <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Message MultiSense..."
                    className="min-h-[24px] max-h-[200px] flex-1 w-auto resize-none bg-transparent border-0 focus-visible:ring-0 p-1.5 text-base text-zinc-100 placeholder:text-zinc-500 pointer-events-auto relative z-[120]"
                    disabled={disabled}
                    rows={1}
                />

                <Button
                    type="button"
                    size="icon"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if ((!input.trim() && !selectedFile) || disabled) return;
                        handleSend();
                    }}
                    className={cn(
                        "h-8 w-8 flex-shrink-0 rounded-lg mb-1 transition-all pointer-events-auto relative z-[120]",
                        input.trim() || selectedFile ? "bg-white text-black hover:bg-zinc-200 shadow-md" : "bg-zinc-700 text-zinc-500"
                    )}
                >
                    <SendHorizontal className="h-5 w-5" />
                </Button>
            </div>
            <div className="text-center mt-2.5">
                <p className="text-xs text-zinc-500">
                    MultiSense can make mistakes. Consider checking important information.
                </p>
            </div>
        </div>
    );
}
