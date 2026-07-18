// ─── 共享 HTTP 工具 ──────────────────────────────────────

/**
 * 代理 env 操作的互斥锁
 *
 * noProxyFetch 需要临时清除 process.env.HTTP_PROXY 等全局变量，
 * 如果多个调用并发执行，一个调用的清除可能会干扰另一个调用的保存/恢复，
 * 导致代理 env 最终状态不一致（代理丢失）。
 *
 * 方案：用 promise 链将所有操作串行化。
 * 关键：在第一个 await 之前就设置 proxyLock = next，确保后续调用拿到的
 * 是最新的锁，避免 TOCTOU 竞态。
 */
let proxyLock: Promise<void> = Promise.resolve();

/**
 * 绕过代理发起请求
 * B站 API 必须直连，不能走系统代理
 */
export async function noProxyFetch(
  url: string,
  opts: RequestInit = {}
): Promise<Response> {
  let release: () => void;

  // 在第一个 await 之前链入新锁，确保不会有两个调用同时读取旧的 proxyLock
  const prev = proxyLock;
  proxyLock = new Promise<void>((resolve) => {
    release = resolve;
  });

  // 等待前面的调用完成代理 env 操作
  await prev;

  // 保存并清除代理环境变量
  const saved: Record<string, string | undefined> = {
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    http_proxy: process.env.http_proxy,
    https_proxy: process.env.https_proxy,
  };
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;

  try {
    return await fetch(url, opts);
  } finally {
    // 恢复代理
    for (const [key, val] of Object.entries(saved)) {
      if (val !== undefined) process.env[key] = val;
    }
    // 释放锁，允许下一个调用继续
    release!();
  }
}

/** 网络/HTTP 错误（需要重试） */
export class RetryableError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RetryableError';
  }
}

/** 判断是否是网络/超时错误（需要重试） */
export function isRetryableError(err: unknown): boolean {
  if (!err) return false;
  const error = err as { name?: string; code?: string; message?: string };

  // 超时
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') return true;

  // 网络不可达
  if (error.code === 'ENOTFOUND' || error.code === 'ENETUNREACH') return true;

  // DNS 错误
  if (error.code === 'EAI_AGAIN') return true;

  // HTTP 5xx 错误（已通过其他途径包装为 Error 的）
  if (error.message) {
    const m = error.message;
    if (/^HTTP 5\d{2}/.test(m)) return true;
    if (m.includes('fetch failed')) return true;
  }

  return false;
}

/**
 * 提取所有 Set-Cookie 头（兼容 Node 18）
 * Node 20+ 内置 Headers.getSetCookie()，但 Node 18 只能通过 get('set-cookie') 拿到合并后的字符串
 *
 * 多个 Set-Cookie 在合并字符串中用 `,` 分隔，但 Expires 字段本身可能含逗号（如 RFC 1123 日期）
 * 因此需要用正则在 `, name=` 这种"逗号后跟新 cookie 名字"的位置分割
 */
export function getAllSetCookies(headers: Headers): string[] {
  // 优先使用 Node 20+ 内置 API
  const modern = (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof modern === 'function') {
    try {
      return modern.call(headers);
    } catch {
      // fall through to manual parsing
    }
  }

  // 兼容 Node 18: 手动分割
  const raw = headers.get('set-cookie');
  if (!raw) return [];

  // 在 ",\s*name=" 位置分割（name 是新的 cookie 名字）
  // 这避免了在 Expires=Wed, 21 Oct ... 中的逗号误分
  return raw
    .split(/,\s*(?=[A-Za-z0-9_-]+\s*=)/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}
