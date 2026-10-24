/**
 * Domain-Shared Package
 *
 * This package contains truly shared domain primitives and utilities
 * that are used across multiple domain modules.
 *
 * Feature-specific shared domain code should stay inside the owning module or
 * its centralized contracts package, instead of being re-exported here.
 *
 * This package should NOT re-export domain-shared from other modules to avoid
 * circular dependencies.
 */

export * from './shared';
