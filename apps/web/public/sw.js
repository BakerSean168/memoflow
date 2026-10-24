/**
 * Service Worker - 静态资源缓存
 * 实现策略：
 * 1. JS/CSS chunks: Cache First (优先缓存，加速二次访问)
 * 2. 字体/图片: Cache First with Network Fallback
 * 3. API 请求: Network First (保证数据新鲜)
 * 4. HTML: Network First (确保获取最新版本)
 */

const CACHE_NAME = 'memoflow-cache-v2';
const STATIC_CACHE_NAME = 'memoflow-static-v2';
const DYNAMIC_CACHE_NAME = 'memoflow-dynamic-v2';

// 需要预缓存的核心资源（应用外壳）
const PRECACHE_URLS = ['/', '/index.html'];

// 静态资源匹配模式（Cache First 策略）
const STATIC_PATTERNS = [
  /\.js$/,
  /\.css$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/,
  /\.svg$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.gif$/,
  /\.webp$/,
  /\.ico$/,
];

// 不缓存的 URL 模式
const NO_CACHE_PATTERNS = [
  /\/api\//, // API 请求
  /\/sse\//, // SSE 连接
  /hot-update/, // HMR 更新
  /__vite/, // Vite 开发服务器
  /node_modules/, // Node modules
  /\.map$/, // Source maps
];

/**
 * 安装事件 - 预缓存核心资源
 */
self.addEventListener('install', (event) => {
  console.log('🔧 [SW] Installing Service Worker...');

  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('📦 [SW] Pre-caching core assets');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('✅ [SW] Pre-caching complete');
        // 立即激活，不等待旧 SW 终止
        return self.skipWaiting();
      })
      .catch((err) => {
        console.error('❌ [SW] Pre-caching failed:', err);
      }),
  );
});

/**
 * 激活事件 - 清理旧缓存
 */
self.addEventListener('activate', (event) => {
  console.log('🚀 [SW] Activating Service Worker...');

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // 删除旧版本缓存
              return (
                name !== CACHE_NAME && name !== STATIC_CACHE_NAME && name !== DYNAMIC_CACHE_NAME
              );
            })
            .map((name) => {
              console.log('🗑️ [SW] Deleting old cache:', name);
              return caches.delete(name);
            }),
        );
      })
      .then(() => {
        console.log('✅ [SW] Activation complete');
        // 立即控制所有客户端
        return self.clients.claim();
      }),
  );
});

/**
 * 检查是否应该缓存该请求
 */
function shouldCache(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  // 检查是否在不缓存列表中
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(url))) {
    return false;
  }

  // 检查是否是静态资源
  return STATIC_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * 检查是否是导航请求
 */
function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'))
  );
}

/**
 * Cache First 策略 - 静态资源
 */
async function cacheFirst(request) {
  const url = request.url;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return fetch(request);
  }

  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    // 后台更新缓存（Stale While Revalidate 变体）
    fetch(request)
      .then((response) => {
        if (response.ok) {
          caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(request, response));
        }
      })
      .catch(() => {
        /* 忽略后台更新失败 */
      });

    return cachedResponse;
  }

  // 缓存未命中，从网络获取并缓存
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('❌ [SW] Fetch failed:', request.url, error);
    throw error;
  }
}

/**
 * Network First 策略 - HTML 和 API
 */
async function networkFirst(request) {
  const url = request.url;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return fetch(request);
  }

  try {
    const networkResponse = await fetch(request);

    // 缓存成功的 HTML 响应
    if (networkResponse.ok && isNavigationRequest(request)) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    // 网络失败，尝试从缓存获取
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      console.log('📦 [SW] Serving from cache (offline):', request.url);
      return cachedResponse;
    }

    throw error;
  }
}

/**
 * Fetch 事件 - 拦截网络请求
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = request.url;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return;
  }

  // 跳过非 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  // 跳过不缓存的请求
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(url))) {
    return;
  }

  // 导航请求使用 Network First
  if (isNavigationRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // 静态资源使用 Cache First
  if (shouldCache(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

/**
 * 消息事件 - 接收来自主线程的消息
 */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))),
    );
  }

  if (event.data?.type === 'GET_CACHE_INFO') {
    caches.keys().then((names) => {
      Promise.all(
        names.map(async (name) => {
          const cache = await caches.open(name);
          const keys = await cache.keys();
          return { name, count: keys.length };
        }),
      ).then((info) => {
        event.ports[0]?.postMessage({ type: 'CACHE_INFO', data: info });
      });
    });
  }
});
