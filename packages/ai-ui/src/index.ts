/**
 * AI module barrel — re-exports composables, components, and router.
 *
 * @module modules/ai
 */
export * from './composables/index';
export * from './components/index';
export { aiRoutes } from './router/index';

export { bindAiUiHost, type AiUiHost } from './ai-ui-host';
