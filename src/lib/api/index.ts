// =============================================================================
// API Utilities - Barrel export for all API helpers
// =============================================================================

export { requireAuth, getOptionalUser } from './auth';
export type { AuthResult } from './auth';

export { verifyCsrf, getClientIP } from './csrf';

export { withApiHandler } from './handler';
export type { HandlerOptions, RouteHandler } from './handler';

export { checkRateLimit } from './rate-limit';
export type { RateLimitType } from './rate-limit';
