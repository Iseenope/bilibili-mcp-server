/**
 * pi-bilibili-cookie — B站 Cookie 自动刷新
 *
 * 使用 REFRESH_TOKEN 自动续期 SESSDATA，避免过期。
 * 配合 bilibili-api 使用。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as crypto from "node:crypto";

// ─── 配置 ──────────────────────────────────────────

var COOKIE_FILE = "/path/to/your/bilibili-cookie.json"; // 请修改为实际路径

var BILI_RSA_PK = [
  "-----BEGIN PUBLIC KEY-----",
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg",
  "Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71",
  "nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40",
  "JNrRuoEUXpabUzGB8QIDAQAB",
  "-----END PUBLIC KEY-----",
].join("\n");

const REFRESH_TOKEN = "YOUR_REFRESH_TOKEN"; // 请从 localStorage.ac_time_value 获取

// ─── Cookie 存储 ──────────────────────────────────

interface CookieData {
  sessdata: string;
  bili_jct: string;
  dede_user_id: string;
  lastRefresh: number;
}

function ensureDir(): void {
  var dir = COOKIE_FILE.substring(0, COOKIE_FILE.lastIndexOf("/"));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadCookie(): CookieData {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      return JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8")) as CookieData;
    }
  } catch { /* ignore */ }
  return {
    sessdata: "YOUR_SESSDATA",
    bili_jct: "YOUR_BILI_JCT",
    dede_user_id: "YOUR_UID",
    lastRefresh: 0,
  };
}

function saveCookie(data: CookieData): void {
  ensureDir();
  fs.writeFileSync(COOKIE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ─── RSA 加密 ─────────────────────────────────────

function generateCorrespondPath(timestampMs: number): string {
  var pkey = crypto.createPublicKey(BILI_RSA_PK);
  var plaintext = Buffer.from("refresh_" + timestampMs, "utf-8");
  var encrypted = crypto.publicEncrypt(
    {
      key: pkey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    plaintext,
  );
  return encrypted.toString("hex");
}

// ─── HTTP 请求 ─────────────────────────────────────

function noProxyFetch(url: string, opts: Record<string, unknown>): Promise<Response> {
  var hp = String(process.env.HTTPS_PROXY || "");
  var hsp = String(process.env.https_proxy || "");
  var httpp = String(process.env.HTTP_PROXY || "");
  var htp = String(process.env.http_proxy || "");
  process.env.HTTPS_PROXY = "";
  process.env.https_proxy = "";
  process.env.HTTP_PROXY = "";
  process.env.http_proxy = "";
  var p = fetch(url, opts);
  process.env.HTTPS_PROXY = hp;
  process.env.https_proxy = hsp;
  process.env.HTTP_PROXY = httpp;
  process.env.http_proxy = htp;
  return p;
}

async function httpGet(url: string, cookie?: string): Promise<{ code: number; data: Record<string, unknown>; raw: Record<string, unknown> }> {
  var h: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (cookie) h["Cookie"] = cookie;
  var res = await noProxyFetch(url, { method: "GET", headers: h, signal: AbortSignal.timeout(15000) });
  var json = await res.json() as Record<string, unknown>;
  return {
    code: (json.code != null ? Number(json.code) : -1),
    data: json.data as Record<string, unknown> || {},
    raw: json,
  };
}

async function httpPost(url: string, body: Record<string, string>, cookie?: string): Promise<{ code: number; data: Record<string, unknown>; raw: Record<string, unknown> }> {
  var params = new URLSearchParams();
  var keys = Object.keys(body);
  for (var i = 0; i < keys.length; i++) params.append(keys[i], body[keys[i]]);
  var h: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (cookie) h["Cookie"] = cookie;
  var res = await noProxyFetch(url, { method: "POST", headers: h, body: params.toString(), signal: AbortSignal.timeout(15000) });
  var json = await res.json() as Record<string, unknown>;
  return {
    code: (json.code != null ? Number(json.code) : -1),
    data: json.data as Record<string, unknown> || {},
    raw: json,
  };
}

// ─── Extension ──────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "bilibili_refresh_cookie",
    label: "B站 Cookie 刷新",
    description: "检查并刷新 B站 Cookie（SESSDATA 3-5天过期）。自动 RSA 加密续期",
    promptSnippet: "刷新B站Cookie",
    promptGuidelines: [
      "用 bilibili_refresh_cookie 刷新 B站 Cookie，避免过期",
      "每 3-5 天运行一次，或者在评论失败时触发",
    ],
    parameters: Type.Object({}),
    async execute() {
      var log: string[] = [];
      var cookieData = loadCookie();
      var sessdata = cookieData.sessdata;
      var jct = cookieData.bili_jct;

      // Step 1: 检查 Cookie 状态
      var navRes = await httpGet("https://api.bilibili.com/x/web-interface/nav", "SESSDATA=" + sessdata + "; bili_jct=" + jct);
      if (navRes.code === 0) {
        var uname = ((navRes.data || {}).uname as string) || "未知";
        log.push("✅ Cookie 有效\n  用户: " + uname);
        return { content: [{ type: "text", text: log.join("\n") }], details: { valid: true } };
      }

      // Step 2: 检查是否需要刷新
      var infoRes = await httpGet("https://passport.bilibili.com/x/passport-login/web/cookie/info?csrf=" + jct, "SESSDATA=" + sessdata + "; bili_jct=" + jct);
      if (infoRes.code !== 0) {
        log.push("❌ 检查刷新状态失败: " + (infoRes.raw as Record<string, unknown>).message);
        return { content: [{ type: "text", text: log.join("\n") }], details: {} };
      }

      var infoData = infoRes.data;
      var needRefresh = infoData.refresh === true;
      if (!needRefresh) {
        log.push("✅ Cookie 仍有效，无需刷新");
        cookieData.lastRefresh = Date.now();
        saveCookie(cookieData);
        return { content: [{ type: "text", text: log.join("\n") }], details: { refreshed: false } };
      }

      log.push("🔄 Cookie 需要刷新，开始流程...");

      // Step 3: RSA 加密生成 correspondPath
      var timestampMs = Date.now();
      var correspondPath = generateCorrespondPath(timestampMs);
      log.push("   ✓ 已生成 correspondPath");

      // Step 4: 获取 refresh_csrf
      var tsStr = String(timestampMs);
      var csrfRes = await httpPost(
        "https://passport.bilibili.com/x/passport-login/web/sso/refresh",
        { "refresh_token": REFRESH_TOKEN, "correspondPath": correspondPath, "source": "main_mini", "build": "0", "version": "1", "platform": "web", "ts": tsStr },
        "SESSDATA=" + sessdata + "; bili_jct=" + jct,
      );
      if (csrfRes.code !== 0) {
        log.push("❌ 获取 refresh_csrf 失败: " + (csrfRes.raw as Record<string, unknown>).message);
        return { content: [{ type: "text", text: log.join("\n") }], details: {} };
      }

      var csrfData = csrfRes.data || {};
      var refreshCsrf = String(csrfData.refresh_csrf || "");
      log.push("   ✓ 已获取 refresh_csrf");

      // Step 5: 执行刷新
      var refreshRes = await httpPost(
        "https://passport.bilibili.com/x/passport-login/web/cookie/refresh",
        { "refresh_csrf": refreshCsrf, "source": "main_mini", "refresh_token": REFRESH_TOKEN, "correspondPath": correspondPath, "build": "0", "version": "1", "platform": "web" },
        "SESSDATA=" + sessdata + "; bili_jct=" + jct,
      );
      if (refreshRes.code !== 0) {
        log.push("❌ Cookie 刷新失败: " + (refreshRes.raw as Record<string, unknown>).message);
        return { content: [{ type: "text", text: log.join("\n") }], details: {} };
      }

      // Step 6: 从响应头中提取新 Cookie
      // 实际上 refresh 接口返回新的 SESSDATA 在响应体 data 中
      var refreshData = refreshRes.data || {};
      var newSessdata = String(refreshData.sessdata || "");
      var newJct = String(refreshData.bili_jct || "");

      if (newSessdata) {
        cookieData.sessdata = newSessdata;
        log.push("   ✓ SESSDATA 已更新");
      }
      if (newJct) {
        cookieData.bili_jct = newJct;
        log.push("   ✓ bili_jct 已更新");
      }
      cookieData.lastRefresh = Date.now();

      // Step 7: 确认新 Cookie 可用
      var confirmRes = await httpGet("https://api.bilibili.com/x/web-interface/nav", "SESSDATA=" + cookieData.sessdata + "; bili_jct=" + cookieData.bili_jct);
      if (confirmRes.code === 0) {
        var newUname = String(((confirmRes.data || {}).uname as string) || "未知");
        log.push("✅ Cookie 刷新成功！用户: " + newUname);
        saveCookie(cookieData);
        // 也同步更新 bilibili-api.ts 中的硬编码（通过更新配置文件）
        ensureDir();
        fs.writeFileSync(
          COOKIE_FILE,
          JSON.stringify(cookieData, null, 2),
          "utf-8",
        );
        return { content: [{ type: "text", text: log.join("\n") }], details: { refreshed: true, uname: newUname } };
      } else {
        log.push("❌ 新 Cookie 验证失败");
        return { content: [{ type: "text", text: log.join("\n") }], details: {} };
      }
    },
  });
}
