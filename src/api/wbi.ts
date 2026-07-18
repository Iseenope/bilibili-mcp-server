import crypto from 'node:crypto';
import { WbiKey } from '../types/index.js';
import { getCookie } from '../config.js';
import { noProxyFetch } from './http.js';

// ─── 混淆表（固定，自 2023 年 3 月以来未变更） ────────────────

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

// ─── 缓存 ─────────────────────────────────────────────────

let cachedKey: WbiKey | null = null;

// ─── 核心函数 ───────────────────────────────────────────────

/** 从 img_key 和 sub_key 生成 mixin_key */
function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  let mixed = '';
  for (let i = 0; i < 32; i++) {
    mixed += raw[MIXIN_KEY_ENC_TAB[i]];
  }
  return mixed;
}

/** 获取 WBI 密钥（缓存 1 小时） */
export async function getWbiKeys(): Promise<WbiKey> {
  if (cachedKey && Date.now() < cachedKey.expiresAt) {
    return cachedKey;
  }

  const cookie = getCookie();
  const resp = await noProxyFetch('https://api.bilibili.com/x/web-interface/nav', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://www.bilibili.com',
      Cookie: `SESSDATA=${cookie.sessdata}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  const json = (await resp.json()) as {
    code: number;
    data?: { wbi_img?: { img_url: string; sub_url: string } };
  };

  if (json.code !== 0 || !json.data?.wbi_img) {
    throw new Error(`获取 WBI 密钥失败: code=${json.code}`);
  }

  const { img_url, sub_url } = json.data.wbi_img;
  const imgKey = (img_url.split('/').pop() || '').replace('.png', '');
  const subKey = (sub_url.split('/').pop() || '').replace('.png', '');
  const mixinKey = getMixinKey(imgKey, subKey);

  cachedKey = {
    imgKey,
    subKey,
    mixinKey,
    expiresAt: Date.now() + 3_600_000, // 1 小时缓存
  };

  return cachedKey;
}

/**
 * 对参数进行 URL 编码（符合 WBI 规范）
 * - encodeURIComponent 已经会大写十六进制编码
 * - 空格会被编码为 %20
 * - 过滤掉 !'()* 五个字符
 */
function encodeWbiParam(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, '');
}

/** 对参数进行 WBI 签名，返回带 w_rid 和 wts 的参数对象 */
export async function signWbi(
  params: Record<string, string>
): Promise<Record<string, string>> {
  const { mixinKey } = await getWbiKeys();
  const result: Record<string, string> = { ...params };

  // 添加时间戳
  const wts = Math.floor(Date.now() / 1000);
  result.wts = String(wts);

  // 按 key 排序
  const keys = Object.keys(result).sort();

  // 构建 query string
  const query = keys
    .map((key) => `${encodeWbiParam(key)}=${encodeWbiParam(result[key])}`)
    .join('&');

  // 计算签名
  const signStr = query + mixinKey;
  result.w_rid = crypto.createHash('md5').update(signStr, 'utf-8').digest('hex');

  return result;
}

/** 清除 WBI 密钥缓存（例如在遇到 -352 错误时强制刷新） */
export function clearWbiCache(): void {
  cachedKey = null;
}
