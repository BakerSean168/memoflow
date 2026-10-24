import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type CloudAuthEmailKind = 'email-verification' | 'password-reset';

export interface CloudAuthEmailDelivery {
  send(input: {
    readonly kind: CloudAuthEmailKind;
    readonly email: string;
    readonly url: string;
  }): Promise<void>;
}

export interface CapturedCloudAuthEmailLink {
  readonly kind: CloudAuthEmailKind;
  readonly email: string;
  readonly url: string;
  readonly capturedAt: string;
}

export interface CloudAuthEmailLinkCapture {
  readonly delivery: CloudAuthEmailDelivery;
  findLatest(email: string, kind: CloudAuthEmailKind): CapturedCloudAuthEmailLink | null;
}

export type CloudAuthEmailEnv = {
  EMAIL_PROVIDER?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string | number;
  SMTP_SECURE?: string | boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  SMTP_REPLY_TO?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
};

type MailTransport = {
  sendMail(input: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    replyTo?: string;
  }): Promise<unknown>;
};

export interface CreateCloudAuthEmailDeliveryOptions {
  readonly env?: CloudAuthEmailEnv;
  readonly smtpTransport?: MailTransport;
  readonly fetch?: typeof globalThis.fetch;
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().toLowerCase().split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

function template(
  kind: CloudAuthEmailKind,
  url: string,
): {
  subject: string;
  text: string;
  html: string;
} {
  const action = kind === 'email-verification' ? '验证邮箱' : '重置密码';
  return {
    subject: `MemoFlow ${action}`,
    text: `请打开以下链接${action}：\n${url}\n\n如果不是你本人操作，请忽略此邮件。`,
    html: `<p>请点击下面的链接${action}：</p><p><a href="${url}">${action}</a></p><p>如果不是你本人操作，请忽略此邮件。</p>`,
  };
}

function required(env: CloudAuthEmailEnv, key: keyof CloudAuthEmailEnv): string {
  const value = String(env[key] ?? '').trim();
  if (!value) throw new Error(`EMAIL_PROVIDER requires ${key}`);
  return value;
}

class ConsoleEmailDelivery implements CloudAuthEmailDelivery {
  async send(input: {
    readonly kind: CloudAuthEmailKind;
    readonly email: string;
    readonly url: string;
  }): Promise<void> {
    console.info(`[CloudAuthEmail] ${input.kind} link issued for ${maskEmail(input.email)}`);
  }
}

class SmtpEmailDelivery implements CloudAuthEmailDelivery {
  constructor(
    private readonly transport: MailTransport,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  async send(input: {
    readonly kind: CloudAuthEmailKind;
    readonly email: string;
    readonly url: string;
  }): Promise<void> {
    const content = template(input.kind, input.url);
    await this.transport.sendMail({
      from: this.from,
      to: input.email.trim().toLowerCase(),
      ...content,
      ...(this.replyTo ? { replyTo: this.replyTo } : {}),
    });
  }
}

class ResendEmailDelivery implements CloudAuthEmailDelivery {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof globalThis.fetch,
    private readonly replyTo?: string,
  ) {}

  async send(input: {
    readonly kind: CloudAuthEmailKind;
    readonly email: string;
    readonly url: string;
  }): Promise<void> {
    const content = template(input.kind, input.url);
    const response = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.email.trim().toLowerCase()],
        subject: content.subject,
        text: content.text,
        html: content.html,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`Resend API failed with status ${response.status}`);
    }
  }
}

export function createCloudAuthEmailDelivery(
  options: CreateCloudAuthEmailDeliveryOptions = {},
): CloudAuthEmailDelivery {
  const env = options.env ?? process.env;
  const provider = (env.EMAIL_PROVIDER ?? 'console').trim().toLowerCase();
  const replyTo = String(env.SMTP_REPLY_TO ?? '').trim() || undefined;

  if (provider === 'smtp') {
    const port = Number(env.SMTP_PORT ?? 587);
    const transport =
      options.smtpTransport ??
      (nodemailer.createTransport({
        host: required(env, 'SMTP_HOST'),
        port,
        secure: env.SMTP_SECURE === true || env.SMTP_SECURE === 'true' || port === 465,
        auth: {
          user: required(env, 'SMTP_USER'),
          pass: required(env, 'SMTP_PASS'),
        },
      }) as Transporter as MailTransport);
    return new SmtpEmailDelivery(transport, required(env, 'SMTP_FROM'), replyTo);
  }

  if (provider === 'resend') {
    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error('Resend email delivery requires fetch');
    return new ResendEmailDelivery(
      required(env, 'RESEND_API_KEY'),
      required(env, 'RESEND_FROM'),
      fetchImpl,
      replyTo,
    );
  }

  return new ConsoleEmailDelivery();
}

/** Test-runtime decorator. The caller must keep its query surface disabled in production. */
export function createCloudAuthEmailLinkCapture(
  delegate: CloudAuthEmailDelivery,
): CloudAuthEmailLinkCapture {
  const links = new Map<string, CapturedCloudAuthEmailLink>();
  const key = (email: string, kind: CloudAuthEmailKind) => `${kind}:${email.trim().toLowerCase()}`;

  return {
    delivery: {
      async send(input) {
        await delegate.send(input);
        links.set(key(input.email, input.kind), {
          kind: input.kind,
          email: input.email.trim().toLowerCase(),
          url: input.url,
          capturedAt: new Date().toISOString(),
        });
      },
    },
    findLatest(email, kind) {
      return links.get(key(email, kind)) ?? null;
    },
  };
}
