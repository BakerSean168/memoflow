/**
 * MSW Handlers - Account Module
 *
 * Intercepts HTTP requests to the Account API and returns mock data.
 * Active only in development when MSW is enabled.
 */

import { http, HttpResponse } from 'msw';
import { createMockAccount } from '@memoflow/contracts/mocks';

// 1. 读取环境变量中的基础路径 (与你的 http client 保持一致)
// 如果获取不到，默认回退到 '/api/v1' 以防万一
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// 2. 动态拼接当前模块的路径
// 结果类似于: '/api/v1/account'
const BASE = `${API_BASE}/account`;

// Shared mock account (persists updates within a browser session)
let mockAccount = createMockAccount();

export const accountHandlers = [
  // GET /api/v1/account — get current account
  http.get(BASE, () => {
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Success',
      data: mockAccount,
      timestamp: Date.now(),
    });
  }),

  // PATCH /api/v1/account — update account profile
  http.patch(BASE, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    mockAccount = {
      ...mockAccount,
      profile: {
        ...mockAccount.profile,
        ...(body as object),
      },
      updatedAt: Date.now(),
    };
    return HttpResponse.json({
      ok: true,
      code: 200,
      message: 'Updated',
      data: mockAccount,
      timestamp: Date.now(),
    });
  }),
];
