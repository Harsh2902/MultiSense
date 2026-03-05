# Hosting Recommendation

## Requirements

| Need | Detail |
|---|---|
| Web server | Next.js with `output: 'standalone'` |
| Worker | Long-running Node.js process (queue poller) |
| Database | Supabase (managed — not self-hosted) |
| Redis | Upstash (managed — not self-hosted) |
| Docker | Optional but recommended |

## Platform Comparison

| Feature | Railway | Vercel | Fly.io | Render | DigitalOcean |
|---|---|---|---|---|---|
| **Next.js support** | ✅ Native | ✅ Best | ✅ Docker | ✅ Native | ✅ Docker |
| **Background workers** | ✅ Native | ❌ Serverless only | ✅ Native | ✅ Native | ✅ Docker |
| **Docker support** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Auto-deploy from Git** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Pricing (hobby)** | ~$5/mo | Free tier | ~$3/mo | Free tier | ~$12/mo |
| **Scale to zero** | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Horizontal scaling** | ✅ | ✅ (serverless) | ✅ | ✅ | ✅ |
| **Ease of setup** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

## Recommendation: Railway

**Railway** provides the best balance for this project:

1. **Native worker support** — deploy web + worker as separate services from one repo
2. **Docker support** — use our multi-stage Dockerfiles directly
3. **Simple secrets management** — shared environment variables across services
4. **Affordable** — $5/mo hobby plan, usage-based scaling
5. **Zero config deploys** — auto-detects Dockerfile and deploys on push

### Railway Setup

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway init

# Deploy web service
railway up --service web

# Deploy worker service
railway up --service worker
```

### Service Configuration

- **Web:** Use `Dockerfile`, expose port 3000
- **Worker:** Use `Dockerfile.worker`, no port exposure
- **Shared variables:** Set in Railway's environment UI (shared across services)

## Alternative: Vercel + Separate Worker Host

If minimal infrastructure management is preferred:

1. **Vercel** for Next.js (free tier, optimal DX)
2. **Railway** or **Render** for the worker process only
3. Same Supabase + Upstash backends

This splits deployment but maximizes each platform's strengths.
