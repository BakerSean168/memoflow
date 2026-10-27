/**
 * @memoflow/ai/adapters
 *
 * Canonical AI host adapters shared by the API and Desktop composition roots.
 * Each factory accepts a structural capability object owned by the host, so AI
 * never imports another feature module's server package.
 */

export { createPlannerReadAdapter, type PlannerReadAdapterDeps } from './planner-read.adapter';
