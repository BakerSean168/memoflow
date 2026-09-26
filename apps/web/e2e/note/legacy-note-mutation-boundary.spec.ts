import { expect, test } from '@playwright/test';
import { API_CONFIG } from '../config';
import { registerAndLogin } from '../helpers/testHelpers';

const testPassword = 'Test123456!';

test.describe('Legacy database note mutation boundary', () => {
  test('[P0] does not mount generic Repository/Resource or Editor mutation endpoints', async ({
    page,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await registerAndLogin(page, {
      email: `e2e-note-boundary-${suffix}@test.com`,
      password: testPassword,
      landingPath: '/repository',
    });

    const request = page.request;

    await expectNotMounted(
      request.get(`${API_CONFIG.FULL_URL}/repositories/current`, {
      }),
    );
    await expectNotMounted(
      request.post(`${API_CONFIG.FULL_URL}/repositories/legacy-repository/resources`, {
        data: { name: 'legacy.md', type: 'File', content: '# legacy' },
      }),
    );
    await expectNotMounted(
      request.post(`${API_CONFIG.FULL_URL}/repositories/legacy-repository/folders`, {
        data: { name: 'legacy-folder' },
      }),
    );
    await expectNotMounted(
      request.put(`${API_CONFIG.FULL_URL}/resources/legacy-resource`, {
        data: { content: '# overwritten' },
      }),
    );
    await expectNotMounted(
      request.put(`${API_CONFIG.FULL_URL}/editor/content/legacy-resource`, {
        data: { content: '# overwritten' },
      }),
    );
  });
});

async function expectNotMounted(
  responsePromise: Promise<{ status(): number }>,
): Promise<void> {
  const response = await responsePromise;
  expect(response.status()).toBe(404);
}
