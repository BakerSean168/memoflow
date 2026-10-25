import { Platform } from 'react-native';

const explicitApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export const MOBILE_API_BASE_URL =
  explicitApiBaseUrl && explicitApiBaseUrl.length > 0
    ? explicitApiBaseUrl.replace(/\/$/, '')
    : (Platform.select({
        android: 'http://10.0.2.2:3000/api/v1',
        ios: 'http://127.0.0.1:3000/api/v1',
        default: '/api/v1',
      }) ?? '/api/v1');

export const MOBILE_API_BASE_URL_HINT =
  'Set EXPO_PUBLIC_API_BASE_URL when running on a physical device or a non-default backend host.';
