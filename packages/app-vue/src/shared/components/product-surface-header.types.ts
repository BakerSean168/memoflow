export const PRODUCT_SURFACE_HEADER_FAMILIES = [
  'collection',
  'entity',
  'calendar',
  'document',
  'settings',
  'diagnostic',
] as const;

export type ProductSurfaceHeaderFamily = (typeof PRODUCT_SURFACE_HEADER_FAMILIES)[number];
