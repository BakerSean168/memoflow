import { beforeEach, describe, expect, it } from 'vitest';
import { createTestPinia } from '@memoflow/test-utils';
import { useAuthenticationStore } from './authentication-store';

describe('useAuthenticationStore', () => {
  beforeEach(() => createTestPinia());

  it('stores only cloud account and session summaries', () => {
    const store = useAuthenticationStore();
    store.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-1',
        email: 'person@example.com',
        name: 'Person',
        emailVerified: true,
      },
      session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      requiresEmailVerification: false,
    });

    expect(store.isAuthenticated).toBe(true);
    expect(store.getIdentityId).toBe('cloud-user-1');
    expect(store.getActiveSessionCount).toBe(1);
    expect('accessToken' in store.$state).toBe(false);
    expect('refreshToken' in store.$state).toBe(false);
    expect('authMode' in store.$state).toBe(false);
  });

  it('keeps an unverified registration disconnected until a session exists', () => {
    const store = useAuthenticationStore();
    store.handleCloudAuthResponse({
      account: {
        id: 'cloud-user-2',
        email: 'new@example.com',
        name: 'New User',
        emailVerified: false,
      },
      session: null,
      requiresEmailVerification: true,
    });

    expect(store.isAuthenticated).toBe(false);
    expect(store.currentSession).toBeNull();
  });
});
