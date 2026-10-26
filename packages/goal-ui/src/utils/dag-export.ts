import type { ECharts } from 'echarts/core';

export type ExportFormat = 'png' | 'svg' | 'pdf';

export type ExportOptions = {
  format: ExportFormat;
  quality?: number;
  scale?: number;
  resolution?: number;
  backgroundColor?: string;
  includeMetadata?: boolean;
};

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

export const dagExportService = {
  async exportPNG(chartInstance: ECharts, options: ExportOptions): Promise<Blob> {
    const dataUrl = chartInstance.getDataURL({
      type: 'png',
      pixelRatio: options.scale ?? 2,
      backgroundColor: options.backgroundColor ?? '#ffffff',
    });
    return dataUrlToBlob(dataUrl);
  },

  async exportSVG(chartInstance: ECharts, options: ExportOptions): Promise<Blob> {
    const dataUrl = chartInstance.getDataURL({
      type: 'svg',
      pixelRatio: options.scale ?? 2,
      backgroundColor: options.backgroundColor ?? '#ffffff',
    });
    return dataUrlToBlob(dataUrl);
  },

  async exportPDF(chartInstance: ECharts, options: ExportOptions): Promise<Blob> {
    const dataUrl = chartInstance.getDataURL({
      type: 'png',
      pixelRatio: options.scale ?? 2,
      backgroundColor: options.backgroundColor ?? '#ffffff',
    });
    return dataUrlToBlob(dataUrl);
  },

  generateFilename(baseName: string, format: ExportFormat) {
    return `${baseName}-${Date.now()}.${format}`;
  },

  downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
};
