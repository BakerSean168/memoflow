/**
 * E2E 测试配置
 * 
 * 这个文件定义了 E2E 测试的所有环境配置
 * 包括 API URL、端口、超时等
 */

/**
 * API 配置
 */
export const API_CONFIG = {
  /**
   * API 基础 URL
   * 默认: http://localhost:3000
   */
  BASE_URL: process.env.E2E_API_BASE_URL || 'http://localhost:3000',
  
  /**
   * API 版本前缀
   * 默认: /api/v1
   */
  API_PREFIX: '/api/v1',
  
  /**
   * 完整 API URL
   */
  get FULL_URL() {
    return `${this.BASE_URL}${this.API_PREFIX}`;
  },

  /** Better Auth is intentionally mounted outside the versioned business API. */
  get AUTH_URL() {
    return `${this.BASE_URL}/api/auth`;
  },
  
  /**
   * 健康检查端点
   */
  HEALTH_ENDPOINT: '/healthz',
} as const;

/**
 * Web 应用配置
 */
export const WEB_CONFIG = {
  /**
   * Web 应用基础 URL
   * 默认: http://127.0.0.1:5173
   */
  BASE_URL: process.env.E2E_WEB_BASE_URL || 'http://127.0.0.1:5173',
  
  /**
   * 登录页面路径
   */
  LOGIN_PATH: '/auth',
  
  /**
   * 首页路径
   */
  HOME_PATH: '/',

  /**
   * Settings 页面路径
   */
  SETTINGS_PATH: '/settings',

  /**
   * Tasks 页面路径
   */
  TASKS_PATH: '/tasks',
  
  /**
   * Goals 页面路径
   */
  GOALS_PATH: '/goals',
  
  /**
   * 获取完整 URL
   */
  getFullUrl(path: string): string {
    return `${this.BASE_URL}${path}`;
  },
} as const;

/**
 * 超时配置（毫秒）
 */
export const TIMEOUT_CONFIG = {
  /**
   * 页面导航超时
   */
  NAVIGATION: 30000,
  
  /**
   * 元素等待超时
   */
  ELEMENT_WAIT: 10000,
  
  /**
   * API 请求超时
   */
  API_REQUEST: 10000,
  
  /**
   * 登录操作超时
   */
  LOGIN: 15000,
  
  /**
   * 短暂等待（用于 UI 动画等）
   */
  SHORT_WAIT: 500,
  
  /**
   * 中等等待
   */
  MEDIUM_WAIT: 1000,
  
  /**
   * 长时间等待
   */
  LONG_WAIT: 3000,
} as const;

/**
 * 测试用户配置
 */
export const TEST_USERS = {
  /**
   * 主要测试用户
   */
  MAIN: {
    username: 'testuser',
    password: 'Test123456!',
    email: 'testuser@example.com',
  },
  
  /**
   * 第二个测试用户
   */
  SECONDARY: {
    username: 'testuser2',
    password: 'Test123456!',
    email: 'testuser2@example.com',
  },
  
  /**
   * 管理员测试用户
   */
  ADMIN: {
    username: 'admintest',
    password: 'Admin123456!',
    email: 'admintest@example.com',
  },
} as const;

/**
 * 调试配置
 */
export const DEBUG_CONFIG = {
  /**
   * 是否启用详细日志
   */
  VERBOSE: process.env.E2E_VERBOSE === 'true',
  
  /**
   * 是否在失败时截图
   */
  SCREENSHOT_ON_FAILURE: process.env.E2E_SCREENSHOT !== 'false',
  
  /**
   * 是否录制视频
   */
  VIDEO: process.env.E2E_VIDEO === 'true',
} as const;

/**
 * 打印配置（用于调试）
 */
export function printConfig() {
  console.log('='.repeat(60));
  console.log('E2E 测试配置');
  console.log('='.repeat(60));
  console.log('API:');
  console.log(`  - 基础 URL: ${API_CONFIG.BASE_URL}`);
  console.log(`  - API 前缀: ${API_CONFIG.API_PREFIX}`);
  console.log(`  - 完整 URL: ${API_CONFIG.FULL_URL}`);
  console.log('');
  console.log('Web:');
  console.log(`  - 基础 URL: ${WEB_CONFIG.BASE_URL}`);
  console.log(`  - 登录路径: ${WEB_CONFIG.LOGIN_PATH}`);
  console.log('');
  console.log('测试用户:');
  console.log(`  - 主用户: ${TEST_USERS.MAIN.username}`);
  console.log(`  - 次用户: ${TEST_USERS.SECONDARY.username}`);
  console.log(`  - 管理员: ${TEST_USERS.ADMIN.username}`);
  console.log('='.repeat(60));
}
