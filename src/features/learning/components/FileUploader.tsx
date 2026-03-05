// =============================================================================
// FileUploader - Drag-and-drop file upload component
// =============================================================================

'use client';

import { useState, useCallback, useRef, memo } from 'react';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

interface FileUploaderProps {
    /** Upload handler from hook */
    onUpload: (file: File) => Promise<unknown>;
    /** Whether upload is in progress */
    isUploading: boolean;
    /** Accepted file types */
    accept?: string;
    /** Max file size in bytes (default: 10MB) */
    maxSize?: number;
    /** Upload error */
    error?: string | null;
    /** Additional CSS class */
    className?: string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = '.pdf,.txt,.md,.docx';

// =============================================================================
// Component
// =============================================================================

export const FileUploader = memo(function FileUploader({
    onUpload,
    isUploading,
    accept = ACCEPTED_TYPES,
    maxSize = DEFAULT_MAX_SIZE,
    error,
    className,
}: FileUploaderProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const displayError = error || localError;

    const validateAndUpload = useCallback(async (file: File) => {
        setLocalError(null);

        if (file.size > maxSize) {
            setLocalError(`File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB.`);
            return;
        }

        await onUpload(file);
    }, [maxSize, onUpload]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files?.[0];
        if (file) validateAndUpload(file);
    }, [validateAndUpload]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) validateAndUpload(file);
        // Reset input so same file can be selected again
        if (inputRef.current) inputRef.current.value = '';
    }, [validateAndUpload]);

    return (
        <div
            className={clsx(
                'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ease-in-out cursor-pointer group',
                isDragOver ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50',
                isUploading ? 'opacity-50 pointer-events-none' : '',
                className,
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            aria-label="Upload a file"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    inputRef.current?.click();
                }
            }}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                onChange={handleFileSelect}
                disabled={isUploading}
                className="hidden"
                aria-hidden="true"
                tabIndex={-1}
            />

            {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                    <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-zinc-400">Uploading...</p>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-zinc-800 rounded-full group-hover:scale-110 group-hover:bg-zinc-700 transition-all duration-300">
                        <svg className="w-6 h-6 text-zinc-400 group-hover:text-indigo-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </div>
                    <div>
                        <p className="font-medium text-zinc-200">Drop your file here</p>
                        <p className="text-sm text-zinc-500 mt-1">or click to browse</p>
                    </div>
                    <span className="text-xs px-2 py-1 rounded bg-zinc-800/50 text-zinc-500 border border-zinc-700/50">
                        PDF, TXT, MD, DOCX (Max 10MB)
                    </span>
                </div>
            )}

            {displayError && (
                <p className="absolute bottom-2 left-0 right-0 text-xs text-red-400" role="alert">{displayError}</p>
            )}
        </div>
    );
});
