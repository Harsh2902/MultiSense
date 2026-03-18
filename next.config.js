/** @type {import('next').NextConfig} */
const nextConfig = {
    // ---------------------------------------------------------------------------
    // Server External Packages
    // These packages have native deps or large binaries that shouldn't be bundled
    // ---------------------------------------------------------------------------
    serverExternalPackages: ['pdfjs-dist', 'tesseract.js', 'mammoth'],

    // ---------------------------------------------------------------------------
    // Security Headers
    // ---------------------------------------------------------------------------
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on',
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=()',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://challenges.cloudflare.com https://*.clerk.accounts.dev",
                            "script-src-elem 'self' 'unsafe-inline' blob: https://challenges.cloudflare.com https://*.clerk.accounts.dev",
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
                            "font-src 'self' https://fonts.gstatic.com",
                            "img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com",
                            "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://api.groq.com https://api.openai.com",
                            "worker-src 'self' blob:",
                            "frame-src 'self' https://challenges.cloudflare.com https://*.clerk.accounts.dev",
                            "frame-ancestors 'none'",
                            "base-uri 'self'",
                            "form-action 'self'",
                            "object-src 'none'",
                            ...(process.env.NODE_ENV === 'production'
                                ? ['upgrade-insecure-requests']
                                : []),
                        ].join('; '),
                    },
                ],
            },
        ];
    },

    // ---------------------------------------------------------------------------
    // Webpack / Turbopack Configuration
    // ---------------------------------------------------------------------------
    turbopack: {},
    webpack: (config, { isServer }) => {
        // pdfjs-dist has an optional canvas peer dependency — ignore it
        if (isServer) {
            config.externals = config.externals || [];
            config.resolve.fallback = {
                ...config.resolve.fallback,
                canvas: false,
            };
        }

        return config;
    },

    // ---------------------------------------------------------------------------
    // Image Optimization
    // ---------------------------------------------------------------------------
    images: {
        formats: ['image/avif', 'image/webp'],
    },

    // ---------------------------------------------------------------------------
    // Production Optimizations
    // ---------------------------------------------------------------------------
    poweredByHeader: false,
    reactStrictMode: true,
    compress: true,

    // ---------------------------------------------------------------------------
    // Environment Variables (validated at runtime in config/env.ts)
    // Build-time NEXT_PUBLIC_* vars are automatically embedded by Next.js
    // ---------------------------------------------------------------------------
};

module.exports = nextConfig;
