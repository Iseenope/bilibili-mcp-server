import { updateCookie } from '../config.js';
import { noProxyFetch } from './http.js';

// ─── 常量 ─────────────────────────────────────────────────

const API_BASE = 'https://passport.bilibili.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const POLL_RETRY = 30; // 最多轮询 30 次（60 秒）

// ─── 请求辅助 ────────────────────────────────────────────

async function apiGet(url: string): Promise<Record<string, unknown>> {
  const res = await noProxyFetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://www.bilibili.com',
    },
    signal: AbortSignal.timeout(10_000),
  });
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── 类型 ─────────────────────────────────────────────────

export interface QrCodeResult {
  url: string;
  qrcode_key: string;
}

export interface LoginCheckResult {
  /** 登录状态: 'pending' | 'scanned' | 'confirmed' | 'expired' */
  status: 'pending' | 'scanned' | 'confirmed' | 'expired';
  message: string;
  /** 登录成功时的 Cookie 信息 */
  cookie?: { sessdata: string; bili_jct: string; dede_user_id: string };
  refresh_token?: string;
}

// ─── 1. 生成二维码 ──────────────────────────────────────

/**
 * 获取登录二维码信息
 * 返回二维码 URL 和 Key
 */
export async function generateQrCode(): Promise<QrCodeResult> {
  const json = (await apiGet(
    `${API_BASE}/x/passport-login/web/qrcode/generate`
  )) as {
    code: number;
    data?: { url: string; qrcode_key: string };
  };

  if (json.code !== 0 || !json.data) {
    if ((json.data as Record<string, unknown>)?.is_new) {
      // 可能已经登录
    }
    throw new Error(`获取二维码失败: code=${json.code}`);
  }

  return {
    url: json.data.url,
    qrcode_key: json.data.qrcode_key,
  };
}

// ─── 2. 轮询扫码状态 ────────────────────────────────────

/**
 * 轮询二维码扫码状态
 * 返回当前登录状态
 */
export async function pollQrCode(
  qrcode_key: string,
  maxRetries: number = POLL_RETRY
): Promise<LoginCheckResult> {
  for (let i = 0; i < maxRetries; i++) {
    const json = (await apiGet(
      `${API_BASE}/x/passport-login/web/qrcode/poll?qrcode_key=${qrcode_key}`
    )) as {
      code: number;
      data?: {
        code: number;
        message: string;
        url?: string;
        refresh_token?: string;
        cookie_info?: {
          cookies: Array<{
            name: string;
            value: string;
            http_only: boolean;
            expires: number;
          }>;
        };
      };
    };

    const data = json.data;
    if (!data) {
      return { status: 'pending', message: '无效响应' };
    }

    // 扫码状态码:
    // 0 = 确认登录成功 (confirmed)
    // 86101 = 未扫码 (pending)
    // 86090 = 已扫码待确认 (scanned)
    // 86038 = 二维码已过期 (expired)
    switch (data.code) {
      case 0: {
        // 登录成功！提取 Cookie
        const cookieInfo = data.cookie_info;
        if (!cookieInfo) {
          return { status: 'confirmed', message: '登录成功，但未获取到 Cookie 信息' };
        }

        const cookies = cookieInfo.cookies;
        const getCookie = (name: string): string =>
          cookies.find((c) => c.name === name)?.value || '';

        const sessdata = getCookie('SESSDATA');
        const bili_jct = getCookie('bili_jct');
        const dede_user_id = getCookie('DedeUserID');

        if (!sessdata) {
          return { status: 'confirmed', message: '登录成功，但未获取到 SESSDATA' };
        }

        // 保存到配置
        updateCookie({
          sessdata,
          bili_jct,
          dede_user_id,
          lastRefresh: Date.now(),
        });

        const result: LoginCheckResult = {
          status: 'confirmed',
          message: `✅ 扫码登录成功！用户: ${getCookie('DedeUserID') || dede_user_id || '?'}`,
          cookie: { sessdata, bili_jct, dede_user_id },
          refresh_token: data.refresh_token,
        };

        // 如果返回了 refresh_token，提示已保存
        if (data.refresh_token) {
          result.message += `\n💡 扫码登录成功，refresh_token 已保存。Cookie 自动刷新功能已就绪`;
        }

        return result;
      }

      case 86101:
        // 未扫码，继续轮询
        if (i < 3 || i % 5 === 0) {
          // 前几次和每 5 次输出一次状态
          // 静默等待
        }
        await sleep(2000);
        continue;

      case 86090:
        // 已扫码待确认
        await sleep(1000);
        continue;

      case 86038:
        return { status: 'expired', message: '二维码已过期，请重新生成' };

      default:
        return {
          status: 'pending',
          message: `未知状态: code=${data.code} ${data.message || ''}`,
        };
    }
  }

  return {
    status: 'pending',
    message: `轮询超时（已等待 ${(maxRetries * 2)} 秒）`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
