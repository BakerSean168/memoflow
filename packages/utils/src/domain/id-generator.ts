// libs/domain-shared/src/utils/IdGenerator.ts
import { v4 as uuidv4 } from 'uuid';
// import { customAlphabet } from 'nanoid';

// 集中管理：如果以后想把 UUID 换成 NanoID，只改这一行代码！
export const IdGenerator = {
  // 生成标准 UUID
  id(): string {
    return uuidv4();
  },

  // 生成短 ID (例如给对外的分享链接用)
  //   nano(length = 21): string {
  //     const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', length);
  //     return nanoid();
  //   }
};
