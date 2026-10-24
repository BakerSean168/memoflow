/**
 * HTTP 传输器
 * 用于将日志发送到远程服务器
 */

import type { LogTransport, LogEntry, LogLevel } from '../types';

export interface HttpTransportOptions {
  /** 最小日志级别 */
  level?: LogLevel;
  /** 远程 API 地址 */
  url: string;
  /** 批量发送阈值 (默认: 10) */
  batchSize?: number;
  /** 发送间隔 (ms) (默认: 5000) */
  flushInterval?: number;
  /** 自定义请求头 */
  headers?: Record<string, string>;
}

export class HttpTransport implements LogTransport {
  name = 'http';
  level: LogLevel;
  private url: string;
  private batchSize: number;
  private flushInterval: number;
  private headers: Record<string, string>;

  private buffer: LogEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: HttpTransportOptions) {
    this.level = options.level ?? 3; // INFO
    this.url = options.url;
    this.batchSize = options.batchSize ?? 10;
    this.flushInterval = options.flushInterval ?? 5000;
    this.headers = options.headers ?? {
      'Content-Type': 'application/json',
    };
  }

  log(entry: LogEntry): void {
    this.buffer.push(entry);

    if (this.buffer.length >= this.batchSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.flushInterval);
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const logsToSend = [...this.buffer];
    this.buffer = [];

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    try {
      // 使用 fetch API 发送日志
      // 注意：这里假设运行环境支持 fetch (现代浏览器和 Node 18+)
      if (typeof fetch !== 'undefined') {
        await fetch(this.url, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify({ logs: logsToSend }),
          keepalive: true, // 确保页面关闭时也能发送
        });
      }
    } catch (err) {
      // 防止无限循环：不要在 HttpTransport 错误处理中调用 logger.error
      console.error('[HttpTransport] Failed to send logs:', err);

      // 可选：如果发送失败，可以将日志放回缓冲区（需谨慎处理以防内存泄漏）
      // this.buffer = [...logsToSend, ...this.buffer];
    }
  }

  async close(): Promise<void> {
    await this.flush();
  }
}
