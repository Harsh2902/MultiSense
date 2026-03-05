// =============================================================================
// Markdown Renderer - Secure markdown rendering with HTML stripping
// =============================================================================

import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';

// =============================================================================
// Configuration
// =============================================================================

/**
 * Configure marked to disable raw HTML
 */
marked.setOptions({
    // async: false, // parsed by compiler, can be omitted if default
    // pedantic: false,
    gfm: true,
});

/**
 * Custom renderer that strips raw HTML and escapes code blocks
 */
const renderer = new marked.Renderer();

// Strip all raw HTML tags (security)
renderer.html = () => '';

// Escape HTML in code blocks
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const langClass = lang ? `language-${lang}` : 'language-text';
    return `<pre><code class="${langClass}">${escaped}</code></pre>`;
};

// =============================================================================
// DOMPurify Configuration
// =============================================================================

/**
 * Allowed HTML tags after sanitization
 */
const ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'b', 'i', 'u',
    'code', 'pre',
    'ul', 'ol', 'li',
    'a',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'hr',
];

/**
 * Allowed HTML attributes after sanitization
 */
const ALLOWED_ATTR = ['href', 'class', 'target', 'rel'];

// =============================================================================
// Render Functions
// =============================================================================

/**
 * Render markdown to sanitized HTML
 * 
 * Security guarantees:
 * 1. Raw HTML tags are stripped by custom renderer
 * 2. Output is sanitized by DOMPurify as defense-in-depth
 * 3. Only whitelisted tags and attributes are allowed
 * 
 * @param content - Markdown content to render
 * @returns Sanitized HTML string
 */
export function renderMarkdown(content: string): string {
    if (!content) return '';

    // 1. Parse markdown with custom renderer
    const html = marked(content, { renderer }) as string;

    // 2. Sanitize output
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        ALLOW_DATA_ATTR: false,
        ADD_ATTR: ['target'], // Allow target for links
    });
}

/**
 * Render markdown to plain text (no HTML)
 * Useful for previews and summaries
 * 
 * @param content - Markdown content
 * @param maxLength - Maximum length of output
 * @returns Plain text string
 */
export function renderMarkdownToText(content: string, maxLength?: number): string {
    if (!content) return '';

    // Strip markdown syntax
    let text = content
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove bold/italic
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        // Remove links
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove headers
        .replace(/^#+\s+/gm, '')
        // Remove blockquotes
        .replace(/^>\s+/gm, '')
        // Remove horizontal rules
        .replace(/^---+$/gm, '')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim();

    if (maxLength && text.length > maxLength) {
        text = text.substring(0, maxLength - 3) + '...';
    }

    return text;
}

/**
 * Check if content contains code blocks
 * Useful for adjusting UI styling
 * 
 * @param content - Markdown content
 * @returns True if content has code blocks
 */
export function hasCodeBlocks(content: string): boolean {
    return /```[\s\S]*?```/.test(content);
}
