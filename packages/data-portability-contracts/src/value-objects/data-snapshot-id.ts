/**
 * Data Snapshot ID Value Object
 * 数据快照 ID 强类型
 *
 * 快照为导入导出产物，归属 data-portability 域（Issue #630 §2.3）。
 */
export type DataSnapshotId = string & { readonly __brand: 'DataSnapshotId' };
