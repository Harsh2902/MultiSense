// =============================================================================
// Circuit Breaker - Basic failure tracking for AI providers
// =============================================================================
//
// Simple counter-based circuit breaker to prevent cascading failures
// when an AI provider is experiencing issues.
//
// States:
//   CLOSED  → Normal operation, requests pass through
//   OPEN    → Provider is degraded, requests fail fast
//   HALF    → Testing if provider has recovered
// =============================================================================

import { logger } from '@/lib/logger';

// =============================================================================
// Types
// =============================================================================

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitStatus {
    state: CircuitState;
    failures: number;
    lastFailure: number | null;
    lastSuccess: number | null;
}

// =============================================================================
// Configuration
// =============================================================================

/** Number of consecutive failures before opening the circuit */
const FAILURE_THRESHOLD = 5;

/** How long to wait (ms) before attempting a half-open probe */
const RECOVERY_TIMEOUT_MS = 30_000; // 30 seconds

// =============================================================================
// Circuit Breaker
// =============================================================================

/** Per-provider circuit state */
const circuits = new Map<string, CircuitStatus>();

/**
 * Get or initialize circuit status for a provider.
 */
function getCircuit(provider: string): CircuitStatus {
    let circuit = circuits.get(provider);
    if (!circuit) {
        circuit = {
            state: 'CLOSED',
            failures: 0,
            lastFailure: null,
            lastSuccess: null,
        };
        circuits.set(provider, circuit);
    }
    return circuit;
}

/**
 * Check if a request to the provider should be allowed.
 *
 * @param provider - Provider identifier (e.g., 'groq', 'openai')
 * @returns true if the request should proceed, false if circuit is open
 */
export function isProviderAvailable(provider: string): boolean {
    const circuit = getCircuit(provider);

    switch (circuit.state) {
        case 'CLOSED':
            return true;

        case 'OPEN': {
            const elapsed = Date.now() - (circuit.lastFailure ?? 0);
            if (elapsed >= RECOVERY_TIMEOUT_MS) {
                // Transition to half-open: allow one probe request
                circuit.state = 'HALF_OPEN';
                logger.info('Circuit breaker half-open, probing provider', { provider });
                return true;
            }
            return false;
        }

        case 'HALF_OPEN':
            // Only one request at a time in half-open (already allowed)
            return false;

        default:
            return true;
    }
}

/**
 * Record a successful request to a provider.
 * Resets failure count and closes the circuit.
 */
export function recordSuccess(provider: string): void {
    const circuit = getCircuit(provider);

    if (circuit.state === 'HALF_OPEN') {
        logger.info('Circuit breaker closing, provider recovered', { provider });
    }

    circuit.state = 'CLOSED';
    circuit.failures = 0;
    circuit.lastSuccess = Date.now();
}

/**
 * Record a failed request to a provider.
 * Opens the circuit after reaching the failure threshold.
 */
export function recordFailure(provider: string): void {
    const circuit = getCircuit(provider);
    circuit.failures += 1;
    circuit.lastFailure = Date.now();

    if (circuit.state === 'HALF_OPEN') {
        // Probe failed — reopen
        circuit.state = 'OPEN';
        logger.warn('Circuit breaker re-opened after probe failure', {
            provider,
            failures: circuit.failures,
        });
        return;
    }

    if (circuit.failures >= FAILURE_THRESHOLD) {
        circuit.state = 'OPEN';
        logger.warn('Circuit breaker opened, provider degraded', {
            provider,
            failures: circuit.failures,
            recoveryMs: RECOVERY_TIMEOUT_MS,
        });
    }
}

/**
 * Get the current status of all circuits (for health checks / debugging).
 */
export function getCircuitStatus(): Record<string, CircuitStatus> {
    const result: Record<string, CircuitStatus> = {};
    circuits.forEach((status, provider) => {
        result[provider] = { ...status };
    });
    return result;
}

/**
 * Reset a specific provider's circuit (for testing or manual recovery).
 */
export function resetCircuit(provider: string): void {
    circuits.delete(provider);
    logger.info('Circuit breaker reset', { provider });
}
