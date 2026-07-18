import crypto from 'node:crypto';
import { getCookie, updateCookie, getRefreshToken } from '../config.js';
import { CookieData } from '../types/index.js';
import { noProxyFetch, getAllSetCookies } from './http.js';

// ─── 常量 ─────────────────────────────────────────────────

const BILI_RSA_PK = [
  '-----BEGIN PUBLIC KEY-----',
  'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg',
  'Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71',
  'nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40',
  'JNrRuoEUXpabUzGB8QIDAQAB',
  '-----END PUBLIC KEY-----',
].join('\n');

// ─── RSA 加密 ─────────────────────────────────────────────

/** 生成 CorrespondPath（RSA-OAEP 加密） */
function generateCorrespondPath(timestampMs: number): string {
  const pubKey = crypto.createPublicKey(BILI_RSA_PK);
  const plaintext = Buffer.from(`refresh_${timestampMs}`, 'utf-8');
  const encrypted = crypto.publicEncrypt(
    {
      key: pubKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    plaintext,
  );
  return encrypted.toString('hex');
}

// ─── HTTP 辅助 ────────────────────────────────────────────

/** 构造默认请求头 */
function defaultHeaders(cookie?: string): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    Referer: 'https://www.bilibili.com',
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

// ─── Cookie 刷新六步流程 ────────────────────────────────

/**
 * 执行 Cookie 刷新
 * 返回 true 表示刷新成功，false 表示无需刷新
 */
export async function refreshCookie(): Promise<{
  success: boolean;
  message: string;
}> {
  const log: string[] = [];
  const cookie = getCookie();
  const cookieStr = `SESSDATA=${cookie.sessdata}; bili_jct=${cookie.bili_jct}`;

  // Step 1: 检查是否需要刷新
  // -------------------------------------------------------
  log.push('[cookie] Step 1: 检查 Cookie 状态');
  const infoUrl = `https://passport.bilibili.com/x/passport-login/web/cookie/info?csrf=${cookie.bili_jct}`;
  const infoRes = await noProxyFetch(infoUrl, {
    headers: defaultHeaders(cookieStr),
    signal: AbortSignal.timeout(15_000),
  });
  const infoJson = (await infoRes.json()) as {
    code: number;
    message: string;
    data?: { refresh: boolean; timestamp: number };
  };

  if (infoJson.code !== 0) {
    return { success: false, message: `检查刷新状态失败: ${infoJson.message}` };
  }

  if (!infoJson.data?.refresh) {
    return { success: true, message: 'Cookie 仍有效，无需刷新' };
  }

  const timestamp = infoJson.data.timestamp;
  log.push('[cookie] Step 1: 需要刷新');

  // Step 2: 生成 CorrespondPath（RSA 加密）
  // -------------------------------------------------------
  log.push('[cookie] Step 2: RSA 加密生成 correspondPath');
  const correspondPath = generateCorrespondPath(timestamp);

  // Step 3: 获取 refresh_csrf（从 HTML 页面提取）
  // -------------------------------------------------------
  log.push('[cookie] Step 3: 获取 refresh_csrf');
  const csrfUrl = `https://www.bilibili.com/correspond/1/${correspondPath}`;
  const csrfRes = await noProxyFetch(csrfUrl, {
    headers: defaultHeaders(cookieStr),
    signal: AbortSignal.timeout(15_000),
  });
  const csrfHtml = await csrfRes.text();

  // 从 HTML 中提取 refresh_csrf
  const csrfMatch = csrfHtml.match(/<div\s+id="1-name">([^<]+)<\/div>/);
  if (!csrfMatch) {
    return { success: false, message: '获取 refresh_csrf 失败: 无法从 HTML 解析' };
  }
  const refreshCsrf = csrfMatch[1].trim();

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return {
      success: false,
      message: [
        '未设置 BILIBILI_REFRESH_TOKEN，无法自动刷新 Cookie。',
        '',
        '获取方法（任选其一）：',
        '',
        '方法 1 - 浏览器获取：',
        '  1. 打开 https://www.bilibili.com 并登录',
        '  2. F12 打开开发者工具 → Console 标签',
        "  3. 输入: console.log(localStorage.getItem('ac_time_value'))",
        '  4. 复制输出值，设为 BILIBILI_REFRESH_TOKEN 环境变量',
        '',
        '方法 2 - 扫码登录（推荐，无需手动操作）：',
        '  1. 调 AI 调用 bilibili_login 生成二维码',
        '  2. 用手机 B 站 App 扫描',
        '  3. 调 AI 调用 bilibili_login_check 完成登录',
        '  4. 登录成功后 refresh_token 会自动保存到 Cookie 文件',
      ].join('\n'),
    };
  }

  // Step 4: 刷新 Cookie
  // -------------------------------------------------------
  log.push('[cookie] Step 4: 执行 Cookie 刷新');
  const refreshBody = new URLSearchParams({
    csrf: cookie.bili_jct,
    refresh_csrf: refreshCsrf,
    source: 'main_web',
    refresh_token: refreshToken,
    build: '0',
    version: '1',
    platform: 'web',
  });

  const refreshRes = await noProxyFetch(
    'https://passport.bilibili.com/x/passport-login/web/cookie/refresh',
    {
      method: 'POST',
      headers: {
        ...defaultHeaders(cookieStr),
        Origin: 'https://www.bilibili.com',
      },
      body: refreshBody.toString(),
      signal: AbortSignal.timeout(15_000),
    }
  );

  const refreshJson = (await refreshRes.json()) as {
    code: number;
    message: string;
    data?: { status: number; message: string; refresh_token: string };
  };

  if (refreshJson.code !== 0) {
    return { success: false, message: `Cookie 刷新失败: ${refreshJson.message}` };
  }

  // 从 Set-Cookie 提取新 Cookie（兼容 Node 18+）
  const setCookieHeaders = getAllSetCookies(refreshRes.headers);
  let newSessdata = '';
  let newJct = '';
  let newDedeUserId = '';

  for (const header of setCookieHeaders) {
    const sMatch = header.match(/SESSDATA=([^;]+)/);
    if (sMatch) newSessdata = sMatch[1];

    const jMatch = header.match(/bili_jct=([^;]+)/);
    if (jMatch) newJct = jMatch[1];

    const dMatch = header.match(/DedeUserID=([^;]+)/);
    if (dMatch) newDedeUserId = dMatch[1];
  }

  // 如果响应头中没有 Set-Cookie，尝试从响应体获取
  if (!newSessdata && refreshJson.data) {
    newSessdata = String((refreshJson.data as Record<string, unknown>).sessdata || '');
    newJct = String((refreshJson.data as Record<string, unknown>).bili_jct || '');
  }

  const newRefreshToken = refreshJson.data?.refresh_token || '';

  if (newSessdata) {
    log.push('[cookie] Step 4: SESSDATA 已更新');
  }
  if (newJct) {
    log.push('[cookie] Step 4: bili_jct 已更新');
  }

  // Step 5: 确认更新（使用旧 refresh_token）
  // -------------------------------------------------------
  log.push('[cookie] Step 5: 确认更新');
  const confirmBody = new URLSearchParams({
    csrf: newJct || cookie.bili_jct,
    refresh_token: refreshToken, // 使用旧的 refresh_token
  });

  const confirmRes = await noProxyFetch(
    'https://passport.bilibili.com/x/passport-login/web/confirm/refresh',
    {
      method: 'POST',
      headers: {
        ...defaultHeaders(
          `SESSDATA=${newSessdata || cookie.sessdata}; bili_jct=${newJct || cookie.bili_jct}`
        ),
        Origin: 'https://www.bilibili.com',
      },
      body: confirmBody.toString(),
      signal: AbortSignal.timeout(15_000),
    }
  );

  const confirmJson = (await confirmRes.json()) as { code: number; message: string };
  if (confirmJson.code !== 0) {
    log.push(`[cookie] Step 5: 确认更新返回非零: ${confirmJson.message}`);
  } else {
    log.push('[cookie] Step 5: 确认更新成功');
  }

  // Step 6: 更新本地 Cookie
  // -------------------------------------------------------
  const updatedData: Partial<CookieData> = {
    lastRefresh: Date.now(),
  };
  if (newSessdata) updatedData.sessdata = newSessdata;
  if (newJct) updatedData.bili_jct = newJct;
  if (newDedeUserId) updatedData.dede_user_id = newDedeUserId;

  updateCookie(updatedData);

  // 保存新的 refresh_token
  if (newRefreshToken) {
    log.push('[cookie] ✅ 新的 refresh_token 已生成并自动保存到 Cookie 文件');
  }

  // 验证新 Cookie
  const verifyRes = await noProxyFetch(
    'https://api.bilibili.com/x/web-interface/nav',
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Cookie: `SESSDATA=${newSessdata || cookie.sessdata}; bili_jct=${newJct || cookie.bili_jct}`,
      },
      signal: AbortSignal.timeout(5_000),
    }
  );
  const verifyJson = (await verifyRes.json()) as {
    code: number;
    data?: { uname?: string };
  };

  if (verifyJson.code === 0) {
    log.push(`[cookie] ✅ Cookie 刷新成功！用户: ${verifyJson.data?.uname || '?'}`);
    return { success: true, message: log.join('\n') };
  } else {
    log.push('[cookie] ❌ 新 Cookie 验证失败');
    return { success: false, message: log.join('\n') };
  }
}
