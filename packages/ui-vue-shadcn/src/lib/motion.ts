/**
 * Shared motion recipes for modal surfaces.
 *
 * Tailwind 4 keeps positional `translate` separate from the transform used by
 * tailwindcss-animate. Dialog motion therefore only needs opacity + scale;
 * directional slide utilities would introduce real movement instead of
 * compensating for centering.
 */
export const dialogOverlayMotionClass =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-150 motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none';

export const dialogContentMotionClass =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:zoom-out-[0.98] duration-150 motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none';

/** Shared opt-out for directional Popover and Sheet animations. */
export const reducedMotionClass =
  'motion-reduce:transition-none motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none';
