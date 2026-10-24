import { describe, expect, it, vi } from 'vitest';
import { createCloudAuthEmailDelivery, createCloudAuthEmailLinkCapture } from './email-delivery.js';

describe('cloud auth email delivery', () => {
  it('keeps console delivery free of plaintext email addresses and links', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const delivery = createCloudAuthEmailDelivery({ env: { EMAIL_PROVIDER: 'console' } });

    await delivery.send({
      kind: 'email-verification',
      email: 'alice@example.com',
      url: 'https://example.com/secret-token',
    });

    const logged = String(info.mock.calls[0]?.[0]);
    expect(logged).toContain('al***@example.com');
    expect(logged).not.toContain('alice@example.com');
    expect(logged).not.toContain('secret-token');
    info.mockRestore();
  });

  it('sends the Better Auth link through SMTP', async () => {
    const sendMail = vi.fn().mockResolvedValue(undefined);
    const delivery = createCloudAuthEmailDelivery({
      env: {
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'user',
        SMTP_PASS: 'pass',
        SMTP_FROM: 'MemoFlow <auth@example.com>',
      },
      smtpTransport: { sendMail },
    });

    await delivery.send({
      kind: 'password-reset',
      email: 'Alice@Example.com',
      url: 'https://app.example.com/reset?token=abc',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alice@example.com',
        subject: 'MemoFlow 重置密码',
        text: expect.stringContaining('https://app.example.com/reset?token=abc'),
      }),
    );
  });

  it('fails when Resend rejects a message', async () => {
    const delivery = createCloudAuthEmailDelivery({
      env: {
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 'secret',
        RESEND_FROM: 'auth@example.com',
      },
      fetch: vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    });

    await expect(
      delivery.send({
        kind: 'email-verification',
        email: 'alice@example.com',
        url: 'https://app.example.com/verify',
      }),
    ).rejects.toThrow('503');
  });

  it('captures the latest Better Auth link only after delivery succeeds', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const capture = createCloudAuthEmailLinkCapture({ send });

    await capture.delivery.send({
      kind: 'email-verification',
      email: 'Alice@Example.com',
      url: 'https://api.example.com/api/auth/verify-email?token=secret',
    });

    expect(capture.findLatest('alice@example.com', 'email-verification')).toEqual(
      expect.objectContaining({
        email: 'alice@example.com',
        url: 'https://api.example.com/api/auth/verify-email?token=secret',
      }),
    );

    send.mockRejectedValueOnce(new Error('delivery failed'));
    await expect(
      capture.delivery.send({
        kind: 'password-reset',
        email: 'alice@example.com',
        url: 'https://api.example.com/api/auth/reset-password/token',
      }),
    ).rejects.toThrow('delivery failed');
    expect(capture.findLatest('alice@example.com', 'password-reset')).toBeNull();
  });
});
