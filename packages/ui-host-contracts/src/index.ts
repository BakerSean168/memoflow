/**
 * @memoflow/ui-host-contracts — platform renderer host protocol.
 *
 * Type-only package: consumers import the platform contract; the renderer
 * composition root supplies the implementations.
 *
 * @module ui-host-contracts
 */
export {
  bindPlatformRendererHost,
  getPlatformRendererHost,
  platformRendererHost,
  type PanelSurfaceStatus,
  type PanelWidthContext,
  type PanelWidthTier,
  type PlatformLabelCatalog,
  type PlatformLabelOption,
  type PlatformRendererHost,
  type PlatformServerStateRuntime,
} from './platform-renderer-host';
