import {
  ContentType as ContentTypeContract,
  type ContentType as IContentType,
} from '@memoflow/contracts/notification';

/**
 * 📝 内容类型 - 通知内容的类型
 *
 * Branded Type：运行时为 string，编译时具有类型安全性
 * 零序列化成本，内存开销极小
 */
export type ContentType = IContentType & { readonly __brand: unique symbol };

/**
 * 合法值集合 - Single Source of Truth
 * 用于校验和遍历
 */
// Derive the valid-value set from the contracts source of truth so a new status
// only ever has to be added in one place (@memoflow/contracts).
const VALUES: IContentType[] = Object.values(ContentTypeContract);

/**
 * 伴生对象 - 提供静态方法和行为逻辑
 */
export const ContentType = {
  // ================= 常量定义 =================

  Article: 'Article' as ContentType,
  Video: 'Video' as ContentType,
  Image: 'Image' as ContentType,
  Resource: 'Resource' as ContentType,
  Other: 'Other' as ContentType,

  // ================= 工厂方法 =================

  of(value: string): ContentType {
    if (!this.isValid(value)) {
      throw new Error(`Invalid ContentType: ${value}`);
    }
    return value as ContentType;
  },

  // ================= 类型守卫 =================

  isValid(value: string): value is ContentType {
    return VALUES.includes(value as IContentType);
  },

  // ================= 遍历方法 =================

  getAll(): ContentType[] {
    return VALUES as ContentType[];
  },

  // ================= 工具方法 =================

  /**
   * 判断是否为媒体内容（视频或图像）
   */
  isMedia(value: ContentType): boolean {
    return value === 'Video' || value === 'Image';
  },

  /**
   * 判断是否为文稿类内容
   */
  isDocumentation(value: ContentType): boolean {
    return value === 'Article' || value === 'Resource';
  },
};
