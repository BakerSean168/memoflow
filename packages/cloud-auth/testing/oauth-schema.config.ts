import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';
import { deviceAuthorization } from 'better-auth/plugins/device-authorization';
import { createExternalAgentProvider } from '../src/server/external-agent-provider';

// Used only by `pnpm dlx auth@1.7.6 generate --adapter prisma --dialect postgresql`.
// No database, credentials, or network calls are needed to generate this schema.
export const auth = betterAuth({
  baseURL: 'https://schema.example/api/auth',
  secret: 'schema-generation-only-not-a-runtime-secret',
  user: { modelName: 'cloudAuthUser' },
  session: { modelName: 'cloudAuthSession' },
  account: { modelName: 'cloudAuthProviderAccount' },
  verification: { modelName: 'cloudAuthVerification' },
  plugins: [
    bearer(),
    deviceAuthorization({ schema: { deviceCode: { modelName: 'cloudAuthDeviceCode' } } }),
    ...createExternalAgentProvider({
      resource: 'https://schema.example/mcp',
      webOrigin: 'https://schema.example',
      allowedClientIds: [],
      accountIsActive: async () => false,
    }),
  ],
});
