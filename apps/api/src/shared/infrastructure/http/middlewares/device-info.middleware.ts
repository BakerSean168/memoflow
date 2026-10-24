/**
 * @file device-info.middleware.ts
 * @description 设备信息提取中间件，自动解析 User-Agent 和 IP 地址。
 * @date 2025-01-22
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * 自动提取设备信息和 IP 地址的中间件。
 *
 * @remarks
 * 用于登录、注册等需要记录设备信息的场景。
 * 如果请求体中未提供 deviceInfo 和 ipAddress，则尝试自动从请求头中解析并注入。
 *
 * @param req - Express 请求对象
 * @param _res - Express 响应对象
 * @param next - 下一个中间件函数
 */
export function deviceInfoMiddleware(req: Request, _res: Response, next: NextFunction): void {
  // 如果请求体中已经有 deviceInfo 和 ipAddress，跳过自动填充
  if (req.body.deviceInfo && req.body.ipAddress) {
    return next();
  }

  // 自动提取 IP 地址
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  // 自动提取设备信息
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const platform = extractPlatform(userAgent);
  const browser = extractBrowser(userAgent);

  const deviceInfo = {
    deviceId: generateDeviceId(userAgent, ipAddress),
    deviceName: `${platform} - ${browser}`,
    deviceType: extractDeviceType(userAgent),
    platform,
    browser,
    userAgent,
  };

  // 注入到请求体
  req.body.deviceInfo = req.body.deviceInfo || deviceInfo;
  req.body.ipAddress = req.body.ipAddress || ipAddress;

  next();
}

/**
 * 从 User-Agent 提取平台信息。
 *
 * @param userAgent - User-Agent 字符串
 * @returns {string} 平台名称 (Windows, macOS, Linux, Android, iOS, Unknown)
 */
function extractPlatform(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
  return 'Unknown';
}

/**
 * 从 User-Agent 提取浏览器信息。
 *
 * @param userAgent - User-Agent 字符串
 * @returns {string} 浏览器名称 (Edge, Chrome, Firefox, Safari, curl, Postman, Unknown)
 */
function extractBrowser(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome/')) return 'Chrome';
  if (ua.includes('firefox/')) return 'Firefox';
  if (ua.includes('safari/') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('curl')) return 'curl';
  if (ua.includes('postman')) return 'Postman';
  return 'Unknown';
}

/**
 * 从 User-Agent 提取设备类型。
 *
 * @param userAgent - User-Agent 字符串
 * @returns {'WEB' | 'MOBILE' | 'DESKTOP' | 'TABLET' | 'OTHER'} 设备类型
 */
function extractDeviceType(userAgent: string): 'WEB' | 'MOBILE' | 'DESKTOP' | 'TABLET' | 'OTHER' {
  const ua = userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    return 'MOBILE';
  }
  if (ua.includes('tablet') || ua.includes('ipad')) {
    return 'TABLET';
  }
  // 默认返回 WEB (用于浏览器访问)
  return 'WEB';
}

/**
 * 生成设备唯一标识。
 *
 * @remarks
 * 基于 User-Agent 和 IP 地址的简单哈希。
 *
 * @param userAgent - User-Agent 字符串
 * @param ipAddress - IP 地址
 * @returns {string} SHA-256 哈希值的前 32 位
 */
function generateDeviceId(userAgent: string, ipAddress: string): string {
  const hash = crypto.createHash('sha256').update(`${userAgent}:${ipAddress}`).digest('hex');
  return hash.substring(0, 32);
}
