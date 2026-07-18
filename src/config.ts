import { Config, CookieData } from './types/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── 默认配置 ─────────────────────────────────────────────

const DEFAULT_CONFIG: Config = {
  sessdata: '',
  bili_jct: '',
  dede_user_id: '',
  autoRefresh: true,
};

// ─── 配置管理 ─────────────────────────────────────────────

let cachedConfig: Config | null = null;

/** 加载配置（环境变量优先，文件兜底） */
export function loadConfig(): Config {
  if (cachedConfig) return cachedConfig;

  const config: Config = { ...DEFAULT_CONFIG };

  // 环境变量
  config.sessdata = process.env.BILIBILI_SESSDATA || '';
  config.bili_jct = process.env.BILIBILI_BILI_JCT || '';
  config.dede_user_id = process.env.BILIBILI_DEDE_USER_ID || '';
  config.cookieFile = process.env.BILIBILI_COOKIE_FILE;
  config.autoRefresh = process.env.BILIBILI_AUTO_REFRESH !== 'false';
  config.refreshToken = process.env.BILIBILI_REFRESH_TOKEN;
  config.fullCookie = process.env.BILIBILI_FULL_COOKIE;

  // 如果有文件路径且环境变量为空，尝试从文件读取
  if (config.cookieFile && (!config.sessdata || !config.bili_jct)) {
    try {
      const fileData = JSON.parse(
        fs.readFileSync(config.cookieFile, 'utf-8')
      ) as CookieData;
      config.sessdata ||= fileData.sessdata;
      config.bili_jct ||= fileData.bili_jct;
      config.dede_user_id ||= fileData.dede_user_id;
    } catch {
      // 文件不存在或格式错误，忽略
    }
  }

  // 验证必要配置
  if (!config.sessdata) {
    console.error('[config] 警告: BILIBILI_SESSDATA 未设置，部分功能不可用');
  }
  if (!config.bili_jct) {
    console.error('[config] 警告: BILIBILI_BILI_JCT 未设置，CSRF 操作不可用');
  }

  cachedConfig = config;
  return config;
}

/** 保存 Cookie 到文件 */
export function saveCookieToFile(data: CookieData): void {
  const config = loadConfig();
  if (!config.cookieFile) return;

  try {
    const dir = path.dirname(config.cookieFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(config.cookieFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[config] Cookie 保存失败:', err);
  }
}

/** 获取当前 Cookie */
export function getCookie(): CookieData {
  const config = loadConfig();
  return {
    sessdata: config.sessdata,
    bili_jct: config.bili_jct,
    dede_user_id: config.dede_user_id,
  };
}

/** 更新 Cookie（运行时） */
export function updateCookie(data: Partial<CookieData>): void {
  const config = loadConfig();
  if (data.sessdata) config.sessdata = data.sessdata;
  if (data.bili_jct) config.bili_jct = data.bili_jct;
  if (data.dede_user_id) config.dede_user_id = data.dede_user_id;
  // 重置缓存
  cachedConfig = config;

  // 同步到文件
  saveCookieToFile({
    sessdata: config.sessdata,
    bili_jct: config.bili_jct,
    dede_user_id: config.dede_user_id,
    lastRefresh: data.lastRefresh || Date.now(),
  });
}

/** 获取刷新 Token */
export function getRefreshToken(): string | undefined {
  return loadConfig().refreshToken;
}

/** 获取完整 Cookie 字符串（含额外字段），用于需要完整浏览器 Cookie 的接口 */
export function getFullCookieString(): string {
  const config = loadConfig();
  if (config.fullCookie) return config.fullCookie;
  // 拼接基础 Cookie
  return `SESSDATA=${config.sessdata}; bili_jct=${config.bili_jct}; DedeUserID=${config.dede_user_id}`;
}

/** 清除配置缓存（用于测试） */
export function clearConfigCache(): void {
  cachedConfig = null;
}
