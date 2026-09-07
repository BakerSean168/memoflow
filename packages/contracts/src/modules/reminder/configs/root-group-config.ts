/**
 * Reminder Module Constants
 * 提醒模块常量定义
 */

/**
 * 根分组（桌面）配置
 * Root Group (Desktop) Configuration
 * 
 * 设计理念：
 * - 所有模板必须属于某个分组，根分组是默认分组
 * - 根分组代表"桌面"，是一个特殊的分组
 * - 通过根分组可以实现全局控制（一键停止所有提醒）
 */
export const RootGroupConfig = {
  /** 根分组的固定 ID */
  Id: '00000000-0000-0000-0000-000000000000',
  
  /** 根分组的显示名称 */
  Name: '桌面',
  
  /** 根分组的描述 */
  Description: '默认分组，所有未分组的提醒都在这里',
  
  /** 根分组的图标 */
  Icon: 'mdi-apps',
  
  /** 根分组的颜色 */
  Color: '#2196F3',
  
  /** 根分组的排序顺序（总是在最前面） */
  Order: -1,
  
  CanDelete: false,
  
  /** 根分组是否可以重命名 */
  CanRename: false,
} as const;

