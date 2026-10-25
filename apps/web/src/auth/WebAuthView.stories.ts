import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { provide } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CloudAuthWebClientPort } from '@memoflow/contracts';
import { AUTH_SERVICE_KEY } from '@memoflow/app-vue/di';
import { AUTH_WEB_SERVICE_KEY } from './service';
import { enUSAuthMessages, zhCNAuthMessages } from './messages';
import WebAuthView from './WebAuthView.vue';

const password = 'Test123456!';
const signUp = fn(async () => ({ ok: true, data: { session: null } }));
const signIn = fn(async () => ({
  ok: false,
  error: { code: 'UNAUTHORIZED', message: 'Stable server error' },
}));

const meta = {
  title: 'Web/Authentication/PageContract',
  component: WebAuthView,
  tags: ['ci-interaction'],
  parameters: { layout: 'fullscreen' },
  beforeEach: () => {
    const fetch = globalThis.fetch;
    const preference = localStorage.getItem('presentation-preference');
    const className = document.documentElement.className;
    const theme = document.documentElement.getAttribute('data-theme');
    const lang = document.documentElement.lang;
    localStorage.setItem(
      'presentation-preference',
      JSON.stringify({ locale: 'en-US', theme: 'light' }),
    );
    signUp.mockClear();
    signIn.mockClear();
    // Only the external capability response is replaced. Production view,
    // composables, validation, inputs, translations and browser DOM all run.
    globalThis.fetch = async (input, init) => {
      if (String(input) === '/api/auth/capabilities') {
        return Response.json({ providers: { github: false } });
      }
      return fetch(input, init);
    };
    return () => {
      globalThis.fetch = fetch;
      if (preference === null) localStorage.removeItem('presentation-preference');
      else localStorage.setItem('presentation-preference', preference);
      document.documentElement.className = className;
      if (theme === null) document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.lang = lang;
    };
  },
  render: () => ({
    components: { WebAuthView },
    setup() {
      const i18n = useI18n();
      i18n.mergeLocaleMessage('en-US', enUSAuthMessages);
      i18n.mergeLocaleMessage('zh-CN', zhCNAuthMessages);
      const service = { signIn, signUp } as unknown as CloudAuthWebClientPort;
      provide(AUTH_WEB_SERVICE_KEY, service);
      provide(AUTH_SERVICE_KEY, service);
    },
    template: '<WebAuthView />',
  }),
} satisfies Meta<typeof WebAuthView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SemanticsAndBrand: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(document.documentElement).toHaveClass('dark');
    await expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    await expect(JSON.parse(localStorage.getItem('presentation-preference') ?? '{}')).toMatchObject(
      { theme: 'light' },
    );
    await expect(canvas.getAllByRole('main')).toHaveLength(1);
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expect(canvas.getByTestId('login-form')).toBeVisible();
    await expect(canvas.getByTestId('login-submit-button')).toHaveAttribute('type', 'submit');
    await expect(canvas.getByTestId('auth-language-selector')).toHaveAttribute(
      'aria-label',
      'Interface language',
    );
    for (const id of [
      'guest-mode-button',
      'login-phone-input',
      'send-sms-code-button',
      'login-phone-button',
    ]) {
      await expect(canvas.queryByTestId(id)).not.toBeInTheDocument();
    }
    for (const id of [
      'login-password-input',
      'login-forgot-link',
      'auth-legal-footer',
      'auth-terms-link',
      'auth-privacy-link',
    ]) {
      await expect(canvas.getByTestId(id)).toBeVisible();
    }
    for (const id of ['auth-terms-link', 'auth-privacy-link']) {
      await expect(canvas.getByTestId(id)).toHaveAttribute('target', '_blank');
    }
    await userEvent.click(canvas.getByRole('button', { name: /sign up|立即注册|注册/i }));
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(
      /create your .* account/i,
    );
    await expect(canvas.getByTestId('register-form')).toBeVisible();
    await expect(canvas.getByTestId('register-submit-button')).toHaveAttribute('type', 'submit');
    await userEvent.click(canvas.getByRole('button', { name: /back to sign in|返回登录/i }));
    await expect(canvas.getByTestId('login-form')).toBeVisible();
    await expect(canvasElement.querySelector('#email')).toBeVisible();
  },
};

export const RegistrationValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /sign up|立即注册|注册/i }));
    const email = canvasElement.querySelector<HTMLInputElement>('#reg-email')!;
    const input = canvasElement.querySelector<HTMLInputElement>('#reg-password')!;
    const confirm = canvasElement.querySelector<HTMLInputElement>('#confirm-password')!;
    const submit = canvas.getByTestId('register-submit-button');
    await userEvent.click(submit);
    for (const id of [
      'register-email-error',
      'register-password-error',
      'register-confirm-password-error',
    ]) {
      await expect(canvas.getByTestId(id)).toBeVisible();
    }
    await expect(email).toHaveFocus();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(email, 'invalid-email');
    await userEvent.type(input, 'short');
    await userEvent.type(confirm, 'different');
    await userEvent.click(submit);
    await expect(canvas.getByTestId('register-email-error')).toHaveTextContent(/valid email/i);
    await expect(canvas.getByTestId('register-password-error')).toHaveTextContent(/8 characters/i);
    await expect(canvas.getByTestId('register-confirm-password-error')).toHaveTextContent(
      /do not match/i,
    );
    const overLimit = `A1${'a'.repeat(99)}`;
    await userEvent.clear(input);
    await userEvent.type(input, overLimit);
    await userEvent.clear(confirm);
    await userEvent.type(confirm, overLimit);
    await userEvent.click(submit);
    await expect(canvas.getByTestId('register-password-error')).toHaveTextContent(
      /100 characters/i,
    );
    await expect(signUp).not.toHaveBeenCalled();
    await userEvent.clear(email);
    await userEvent.type(email, 'contract@example.com');
    await expect(canvas.queryByTestId('register-email-error')).not.toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, password);
    await expect(canvas.queryByTestId('register-password-error')).not.toBeInTheDocument();
    await userEvent.clear(confirm);
    await userEvent.type(confirm, password);
    await expect(canvas.queryByTestId('register-confirm-password-error')).not.toBeInTheDocument();
    await userEvent.type(confirm, '{Enter}');
    await expect(await canvas.findByTestId('verify-email-form')).toBeVisible();
    await expect(signUp).toHaveBeenCalledOnce();
  },
};

export const ErrorRetranslation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('auth-locale-zh-CN'));
    const email = canvasElement.querySelector<HTMLInputElement>('#email')!;
    await userEvent.type(email, 'missing@example.com');
    await userEvent.type(canvasElement.querySelector('#password')!, password);
    await userEvent.click(canvas.getByTestId('login-submit-button'));
    await expect(await canvas.findByTestId('auth-error-banner')).toHaveTextContent(
      '邮箱或密码错误',
    );
    await userEvent.click(canvas.getByTestId('auth-locale-en-US'));
    await expect(canvas.getByTestId('auth-error-banner')).toHaveTextContent(
      'Incorrect email or password',
    );
    await expect(signIn).toHaveBeenCalledOnce();
    await userEvent.type(email, 'corrected');
    await expect(canvas.queryByTestId('auth-error-banner')).not.toBeInTheDocument();
  },
};

export const LoginFocusAndValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId('login-submit-button'));
    await expect(canvas.getByTestId('login-email-error')).toBeVisible();
    await expect(canvas.getByTestId('login-password-error')).toBeVisible();
    const email = canvasElement.querySelector<HTMLInputElement>('#email')!;
    await expect(email).toHaveFocus();
    await userEvent.type(email, 'person@example.com');
    await expect(canvas.queryByTestId('login-email-error')).not.toBeInTheDocument();
    await userEvent.click(canvas.getByTestId('login-submit-button'));
    await expect(canvasElement.querySelector('#password')).toHaveFocus();
    await expect(signIn).not.toHaveBeenCalled();
  },
};

export const SmallViewport: Story = {
  parameters: {
    viewport: {
      defaultViewport: 'authSmall',
      options: { authSmall: { name: 'Auth 360', styles: { width: '360px', height: '640px' } } },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /sign up|立即注册|注册/i }));
    await userEvent.click(canvas.getByTestId('register-submit-button'));
    await expect(canvas.getByTestId('register-confirm-password-error')).toBeVisible();
    const submit = canvas.getByTestId('register-submit-button');
    submit.scrollIntoView();
    await expect(submit).toBeVisible();
    const page = canvas.getByTestId('web-auth-page');
    await expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth + 1);
    await expect(page.scrollHeight).toBeGreaterThan(640);
  },
};
