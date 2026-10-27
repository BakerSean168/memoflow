/**
 * @file clientInfoExtractor.ts
 * @description 客户端信息提取工具，用于解析 Request 对象中的设备和网络信息。
 * @date 2025-01-22
 */

import type { Request } from 'express';
import type { ClientInfo } from '@memoflow/transport-contracts';
import crypto from 'crypto';

/**
 * 从HTTP请求中提取客户端信息。
 *
 * @remarks
 * 解析 IP 地址、User-Agent，并尝试生成或获取设备 ID。
 *
 * @param req - Express Request 对象
 * @returns {ClientInfo} 客户端信息对象
 */
export function extractClientInfo(req: Request): ClientInfo {
  // 1. 获取IP地址
  const ipAddress =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown';

  // 2. 获取User-Agent
  const userAgent = req.headers['user-agent'] || 'unknown';

  // 3. 获取或生成设备ID
  let deviceId = req.body.deviceId || (req.headers['x-device-id'] as string);
  if (!deviceId) {
    // 基于用户代理和IP生成简单的设备ID
    const fingerprint = `${userAgent}-${ipAddress}`;
    deviceId = crypto.createHash('sha256').update(fingerprint).digest('hex').substring(0, 16);
  }

  // 4. 获取设备名称
  let deviceName = req.body.deviceName || 'Unknown Device';

  // 尝试从User-Agent中解析设备信息
  if (userAgent && userAgent !== 'unknown') {
    if (userAgent.includes('Mobile')) {
      deviceName = 'Mobile Device';
    } else if (userAgent.includes('Tablet')) {
      deviceName = 'Tablet Device';
    } else if (userAgent.includes('Electron')) {
      deviceName = 'Desktop App';
    } else if (userAgent.includes('Chrome')) {
      deviceName = 'Chrome Browser';
    } else if (userAgent.includes('Firefox')) {
      deviceName = 'Firefox Browser';
    } else if (userAgent.includes('Safari')) {
      deviceName = 'Safari Browser';
    } else if (userAgent.includes('Edge')) {
      deviceName = 'Edge Browser';
    } else {
      deviceName = 'Web Browser';
    }
  }

  return {
    deviceId,
    deviceName,
    userAgent,
    ipAddress,
  };
}

/**
 * 生成设备指纹用于记住我令牌。
 *
 * @param clientInfo - 客户端信息
 * @returns {string} 设备指纹字符串
 */
export function generateDeviceFingerprint(clientInfo: ClientInfo): string {
  const { deviceId, userAgent, ipAddress } = clientInfo;
  const fingerprint = `${deviceId}-${userAgent}-${ipAddress}`;
  return crypto.createHash('md5').update(fingerprint).digest('hex').substring(0, 32);
}

/**
 * 解析 User-Agent 获取详细的设备信息。
 *
 * @param userAgent - User-Agent 字符串
 * @returns {object} 解析后的设备信息（浏览器、OS、设备类型）
 */
export function parseUserAgent(userAgent: string): {
  browser: string;
  browserVersion: string;
  os: string;
  device: string;
} {
  const result = {
    browser: 'Unknown',
    browserVersion: 'Unknown',
    os: 'Unknown',
    device: 'Unknown',
  };

  if (!userAgent) return result;

  // 浏览器检测
  if (userAgent.includes('Chrome/')) {
    result.browser = 'Chrome';
    const match = userAgent.match(/Chrome\/([0-9.]+)/);
    if (match) result.browserVersion = match[1];
  } else if (userAgent.includes('Firefox/')) {
    result.browser = 'Firefox';
    const match = userAgent.match(/Firefox\/([0-9.]+)/);
    if (match) result.browserVersion = match[1];
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome')) {
    result.browser = 'Safari';
    const match = userAgent.match(/Version\/([0-9.]+)/);
    if (match) result.browserVersion = match[1];
  } else if (userAgent.includes('Edge/')) {
    result.browser = 'Edge';
    const match = userAgent.match(/Edge\/([0-9.]+)/);
    if (match) result.browserVersion = match[1];
  } else if (userAgent.includes('Electron/')) {
    result.browser = 'Electron';
    const match = userAgent.match(/Electron\/([0-9.]+)/);
    if (match) result.browserVersion = match[1];
  }

  // 操作系统检测
  if (userAgent.includes('Windows NT')) {
    result.os = 'Windows';
    const match = userAgent.match(/Windows NT ([0-9.]+)/);
    if (match) {
      const version = match[1];
      if (version === '10.0') result.os = 'Windows 10/11';
      else if (version === '6.3') result.os = 'Windows 8.1';
      else if (version === '6.2') result.os = 'Windows 8';
      else if (version === '6.1') result.os = 'Windows 7';
      else result.os = `Windows NT ${version}`;
    }
  } else if (userAgent.includes('Mac OS X')) {
    result.os = 'macOS';
    const match = userAgent.match(/Mac OS X ([0-9_]+)/);
    if (match) result.os = `macOS ${match[1].replace(/_/g, '.')}`;
  } else if (userAgent.includes('Linux')) {
    result.os = 'Linux';
  } else if (userAgent.includes('Android')) {
    result.os = 'Android';
    const match = userAgent.match(/Android ([0-9.]+)/);
    if (match) result.os = `Android ${match[1]}`;
  } else if (
    userAgent.includes('iOS') ||
    userAgent.includes('iPhone') ||
    userAgent.includes('iPad')
  ) {
    result.os = 'iOS';
    const match = userAgent.match(/OS ([0-9_]+)/);
    if (match) result.os = `iOS ${match[1].replace(/_/g, '.')}`;
  }

  // 设备类型检测
  if (userAgent.includes('Mobile')) {
    result.device = 'Mobile';
  } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
    result.device = 'Tablet';
  } else if (userAgent.includes('Electron')) {
    result.device = 'Desktop App';
  } else {
    result.device = 'Desktop';
  }

  return result;
}
