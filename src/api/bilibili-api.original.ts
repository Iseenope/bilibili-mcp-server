/**
 * pi-bilibili-api — B站后台操作工具
 * 通过 B站 API 直接发评论、回复、删除、点赞。纯后端 HTTP，不依赖 WebBridge。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createHash } from "node:crypto";
import * as fs from "node:fs";

var COOKIE_FILE = "/path/to/your/bilibili-cookie.json"; // 请修改为实际路径

function getCookie(): { sessdata: string; bili_jct: string; dede_user_id: string } {
  try {
    if (fs.existsSync(COOKIE_FILE)) {
      var d = JSON.parse(fs.readFileSync(COOKIE_FILE, "utf-8"));
      if (d.sessdata) return d;
    }
  } catch { /* ignore */ }
  // 默认硬编码值（仅供开发参考，请通过环境变量配置真实值）
  return {
    sessdata: "YOUR_SESSDATA",
    bili_jct: "YOUR_BILI_JCT",
    dede_user_id: "YOUR_UID",
  };
}

const API_BASE = "https://api.bilibili.com";
const REQUEST_TIMEOUT = 15_000;

// 绕过代理直连 B站 API
var _noProxyFetch = function(url: string, opts: Record<string, unknown>): Promise<Response> {
  var init = Object.assign({}, opts);
  init.headers = Object.assign({}, (init.headers || {}) as Record<string, string>);
  return fetch(url, init);
};

// 启动时清除代理
(function() {
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;
})();

// ─── wbi 签名 ─────────────────────────────────────

var mixinKeyEncTab = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
var wbiKey = "";
var wbiKeyExpire = 0;

function getMixinKey(imgKey: string, subKey: string): string {
  var raw = imgKey + subKey;
  var result = "";
  for (var i = 0; i < 32; i++) result += raw.charAt(mixinKeyEncTab[i]);
  return result;
}

async function getWbiMixin(): Promise<string> {
  if (wbiKey && Date.now() < wbiKeyExpire) return wbiKey;
  var res = await _noProxyFetch(API_BASE + "/x/web-interface/nav", {
    headers: { "User-Agent": "Mozilla/5.0", "Cookie": "SESSDATA=" + getCookie().sessdata },
    signal: AbortSignal.timeout(5000),
  });
  var json = await res.json();
  var wbi = (json.data || {}).wbi_img || {};
  var imgUrl = String(wbi.img_url || "");
  var subUrl = String(wbi.sub_url || "");
  var ik = imgUrl.split("/").pop() || ""; ik = ik.split(".")[0] || "";
  var sk = subUrl.split("/").pop() || ""; sk = sk.split(".")[0] || "";
  wbiKey = getMixinKey(ik, sk);
  wbiKeyExpire = Date.now() + 3600000;
  return wbiKey;
}

function signWbi(params: Record<string, string>, key: string): string {
  var keys = Object.keys(params).sort();
  var query = "";
  for (var i = 0; i < keys.length; i++) {
    if (i > 0) query += "&";
    var v = params[keys[i]];
    var filtered = "";
    for (var j = 0; j < v.length; j++) {
      if ("!'()*".indexOf(v.charAt(j)) === -1) filtered += v.charAt(j);
    }
    query += keys[i] + "=" + encodeURIComponent(filtered);
  }
  return createHash("md5").update(query + key).digest("hex");
}

async function wbiGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  var key = await getWbiMixin();
  params.wts = String(Math.floor(Date.now() / 1000));
  params.w_rid = signWbi(params, key);
  var qs = "";
  var keys = Object.keys(params).sort();
  for (var i = 0; i < keys.length; i++) {
    if (i > 0) qs += "&";
    var v = params[keys[i]];
    var filtered = "";
    for (var j = 0; j < v.length; j++) {
      if ("!'()*".indexOf(v.charAt(j)) === -1) filtered += v.charAt(j);
    }
    qs += keys[i] + "=" + encodeURIComponent(filtered);
  }
  var res = await _noProxyFetch(API_BASE + path + "?" + qs, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Referer": "https://www.bilibili.com", "Cookie": "SESSDATA=" + getCookie().sessdata },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    // 绕过代理直连
    dispatcher: undefined,
  });

  var text = await res.text();
  if (res.status !== 200) {
    var preview = text.substring(0, 100);
    return { code: -500, message: "HTTP " + res.status + ": " + preview };
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { code: -500, message: "非JSON响应: " + text.substring(0, 100) };
  }
}

function getHeaders(referer: string): Record<string, string> {
  return {
    "Cookie": "SESSDATA=" + getCookie().sessdata + "; bili_jct=" + getCookie().bili_jct,
    "Referer": referer || "https://www.bilibili.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function apiPost(path: string, body: Record<string, string>, referer?: string): Promise<{ code: number; message: string; data?: Record<string, unknown> }> {
  var params = new URLSearchParams();
  var keys = Object.keys(body);
  for (var i = 0; i < keys.length; i++) {
    var v = body[keys[i]];
    if (v !== undefined && v !== null) params.append(keys[i], String(v));
  }
  if (!params.has("csrf")) params.append("csrf", getCookie().bili_jct);

  var res = await _noProxyFetch(API_BASE + path, {
    method: "POST",
    headers: getHeaders(referer || ""),
    body: params.toString(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  });

  var json = await res.json() as { code: number; message: string; data?: Record<string, unknown> };

  // Cookie 过期时自动续期一次
  if (json.code === -101) {
    try {
      var navRes = await _noProxyFetch(API_BASE + "/x/web-interface/nav", {
        headers: { "User-Agent": "Mozilla/5.0", "Cookie": "SESSDATA=" + getCookie().sessdata + "; bili_jct=" + getCookie().bili_jct },
        signal: AbortSignal.timeout(5000),
      });
      var navJson = await navRes.json() as Record<string, unknown>;
      if (Number(navJson.code) !== 0) {
        // Cookie 确实过期了，执行续期
        var rtUrl = "https://passport.bilibili.com/x/passport-login/web/sso/refresh";
        var rtBody = new URLSearchParams({ refresh_token: "YOUR_REFRESH_TOKEN", source: "main_mini" });
        await _noProxyFetch(rtUrl, {
          method: "POST",
          headers: {
            "User-Agent": "Mozilla/5.0", "Cookie": "SESSDATA=" + getCookie().sessdata + "; bili_jct=" + getCookie().bili_jct,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: rtBody.toString(),
          signal: AbortSignal.timeout(10000),
        });
      }
    } catch { /* 续期失败不影响主流程 */ }
  }

  return json;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "bilibili_reply",
    label: "B站发评论",
    description: "在 B站视频/动态/专栏下发评论或回复",
    promptSnippet: "B站发评论/回复",
    promptGuidelines: ["使用 bilibili_reply 发评论，需提供 videoId（BV号或a号）和 message", "回复某人时加 parentRpid 参数"],
    parameters: Type.Object({
      videoId: Type.String({ description: "视频 BV 号或 avid" }),
      message: Type.String({ description: "评论内容（最大 1000 字符）" }),
      parentRpid: Type.Optional(Type.String({ description: "要回复的评论 rpid" })),
      rootRpid: Type.Optional(Type.String({ description: "根评论 rpid（二级以上使用）" })),
      type: Type.Optional(Type.Number({ description: "评论区类型：1=视频(默认), 12=专栏, 17=动态" })),
    }),
    async execute(_id, params) {
      try {
        var type = params.type != null ? params.type : 1;
        var body: Record<string, string> = { type: String(type), oid: params.videoId, message: params.message, plat: "1" };
        if (params.rootRpid) body.root = params.rootRpid;
        if (params.parentRpid) body.parent = params.parentRpid;

        var result = await apiPost("/x/v2/reply/add", body, "https://www.bilibili.com/video/" + params.videoId + "/");

        if (result.code === 0) {
          var rpid = result.data ? String(result.data.rpid || "?") : "?";
          return { content: [{ type: "text", text: "✅ 评论已发布\nrpid: " + rpid + "\n内容: " + params.message.substring(0, 100) }], details: { rpid: result.data ? result.data.rpid : undefined, code: 0 } };
        }

        var errMap: Record<string, string> = { "-101": "未登录", "-111": "csrf 校验失败", "-509": "请求频繁", "12002": "评论区关闭", "12016": "含敏感词" };
        var errMsg = errMap[String(result.code)] || result.message || "未知错误";
        return { content: [{ type: "text", text: "❌ 评论失败 [" + result.code + "]: " + errMsg }], details: { code: result.code } };
      } catch (err: unknown) {
        return { content: [{ type: "text", text: "❌ " + (err instanceof Error ? err.message : String(err)) }], details: {} };
      }
    },
  });

  pi.registerTool({
    name: "bilibili_delete_comment",
    label: "B站删评论",
    description: "删除自己在 B站的评论",
    promptSnippet: "B站删除评论",
    parameters: Type.Object({
      videoId: Type.String({ description: "视频 BV 号或 avid" }),
      rpid: Type.String({ description: "要删除的评论 rpid" }),
      type: Type.Optional(Type.Number({ description: "评论区类型：1=视频(默认)" })),
    }),
    async execute(_id, params) {
      try {
        var type = params.type != null ? params.type : 1;
        var result = await apiPost("/x/v2/reply/del", { type: String(type), oid: params.videoId, rpid: params.rpid });
        return { content: [{ type: "text", text: result.code === 0 ? "✅ 已删除 rpid:" + params.rpid : "❌ 删除失败 [" + result.code + "]: " + result.message }], details: {} };
      } catch (err: unknown) {
        return { content: [{ type: "text", text: "❌ " + (err instanceof Error ? err.message : String(err)) }], details: {} };
      }
    },
  });

  pi.registerTool({
    name: "bilibili_like_comment",
    label: "B站点赞评论",
    description: "给 B站评论点赞或取消赞",
    promptSnippet: "B站点赞评论",
    parameters: Type.Object({
      videoId: Type.String({ description: "视频 BV 号或 avid" }),
      rpid: Type.String({ description: "评论 rpid" }),
      action: Type.Optional(Type.Number({ description: "0=取消, 1=点赞(默认)" })),
      type: Type.Optional(Type.Number({ description: "评论区类型：1=视频(默认)" })),
    }),
    async execute(_id, params) {
      try {
        var act = params.action != null ? params.action : 1;
        var type = params.type != null ? params.type : 1;
        var result = await apiPost("/x/v2/reply/action", { type: String(type), oid: params.videoId, rpid: params.rpid, action: String(act) });
        var label = act === 1 ? "已点赞" : "已取消赞";
        return { content: [{ type: "text", text: result.code === 0 ? "✅ " + label + " rpid:" + params.rpid : "❌ [" + result.code + "]: " + result.message }], details: {} };
      } catch (err: unknown) {
        return { content: [{ type: "text", text: "❌ " + (err instanceof Error ? err.message : String(err)) }], details: {} };
      }
    },
  });

  // ── 视频列表 ──

  pi.registerTool({
    name: "bilibili_user_videos",
    label: "B站用户视频",
    description: "获取指定 B站 UP 主的视频列表（按发布时间排序）",
    promptSnippet: "获取UP主视频列表",
    parameters: Type.Object({
      uid: Type.Number({ description: "UP主 UID" }),
      max: Type.Optional(Type.Number({ description: "最多返回几条（默认 10）" })),
    }),
    async execute(_id, params) {
      try {
        var max = params.max || 10;
        var data = await wbiGet("/x/space/wbi/arc/search", {
          mid: String(params.uid), ps: String(max), pn: "1", order: "pubdate",
        });
        var vlist = (data.data as Record<string, unknown> || {}).list as Record<string, unknown> || {};
        var videos = (vlist.vlist as Array<Record<string, unknown>>) || [];
        if (videos.length === 0) {
          return { content: [{ type: "text", text: "未找到视频，code: " + data.code }], details: {} };
        }
        var lines = videos.map(function(v, i) {
          return (i + 1) + ". [" + v.bvid + "] " + (v.title || "?") + " (" + (v.play || "?") + "播放)";
        });
        return { content: [{ type: "text", text: "📺 UP主 uid:" + params.uid + " 的视频:\n" + lines.join("\n") }], details: { count: videos.length } };
      } catch (err) {
        return { content: [{ type: "text", text: "❌ " + (err instanceof Error ? err.message : String(err)) }], details: {} };
      }
    },
  });

  // ── 评论列表 ──

  async function apiGet(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    var qs = "";
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      if (i > 0) qs += "&";
      qs += keys[i] + "=" + encodeURIComponent(params[keys[i]]);
    }
    var res = await _noProxyFetch(API_BASE + path + (qs ? "?" + qs : ""), {
      method: "GET",
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com", "Cookie": "SESSDATA=" + getCookie().sessdata },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    var text = await res.text();
    try { return JSON.parse(text) as Record<string, unknown>; }
    catch { return { code: -500, message: text.substring(0, 100) }; }
  }

  pi.registerTool({
    name: "bilibili_video_comments",
    label: "B站评论列表",
    description: "获取指定视频的评论列表",
    promptSnippet: "获取视频评论",
    parameters: Type.Object({
      videoId: Type.String({ description: "视频 BV 号或 avid" }),
      max: Type.Optional(Type.Number({ description: "最多几条（默认 10）" })),
    }),
    async execute(_id, params) {
      try {
        var max = params.max || 10;
        var data = await apiGet("/x/v2/reply/main", { oid: params.videoId, type: "1", ps: String(max), next: "0" });
        var replies = ((data.data as Record<string, unknown> || {}).replies as Array<Record<string, unknown>>) || [];
        if (replies.length === 0) {
          return { content: [{ type: "text", text: "暂无评论，或接口需要 wbi 签名" }], details: {} };
        }
        var lines = replies.map(function(r: Record<string, unknown>, i: number) {
          var member = r.member as Record<string, unknown> || {};
          var content = r.content as Record<string, unknown> || {};
          return (i + 1) + ". " + (member.uname || "?") + ": " + String(content.message || "").substring(0, 80) + " [rpid:" + r.rpid + "]";
        });
        return { content: [{ type: "text", text: "📋 评论列表:\n" + lines.join("\n") }], details: { count: replies.length } };
      } catch (err) {
        return { content: [{ type: "text", text: "❌ " + (err instanceof Error ? err.message : String(err)) }], details: {} };
      }
    },
  });

  // ── 新回复检测 ──

  var DETECT_FILE = "/path/to/your/bilibili-detect.json"; // 请修改为实际路径

  function loadState(): Record<string, number> {
    try { return JSON.parse(fs.readFileSync(DETECT_FILE, "utf-8")) as Record<string, number>; }
    catch { return {}; }
  }
  function saveState(s: Record<string, number>): void {
    try { fs.writeFileSync(DETECT_FILE, JSON.stringify(s, null, 2), "utf-8"); } catch {}
  }

  pi.registerTool({
    name: "bilibili_detect_replies",
    label: "B站检测新回复",
    description: "检查视频/评论下的新回复，列出上次检查之后的新内容，不自动回复",
    promptSnippet: "检测B站新回复",
    promptGuidelines: [
      "用 bilibili_detect_replies 检查视频下有没有新评论/回复",
      "会将上次检查结果保存，下次只显示新的",
      "发现需要怼的评论可以调 bilibili_reply 回复",
    ],
    parameters: Type.Object({
      videoId: Type.Optional(Type.String({ description: "可选：指定视频 BV 号，不指定则查所有回复通知" })),
      max: Type.Optional(Type.Number({ description: "最多检查几条（默认 20）" })),
    }),
    async execute(_id, params) {
      try {
        var max = params.max || 20;
        var maxStr = String(max);
        var state = loadState();
        var lastKey = "last_check";
        var lastCheck = state[lastKey] || 0;
        var now = Date.now();

        // 调回复通知 API
        var url = "https://api.bilibili.com/x/msgfeed/reply?build=0&mobi_app=web";
        var res = await _noProxyFetch(url, {
          method: "GET",
          headers: {
            "Cookie": "SESSDATA=" + getCookie().sessdata + "; bili_jct=" + getCookie().bili_jct,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://message.bilibili.com",
          },
          signal: AbortSignal.timeout(15000),
        });
        var json = await res.json() as Record<string, unknown>;

        if (Number(json.code) !== 0) {
          return { content: [{ type: "text", text: "❌ 获取回复失败: code=" + json.code }], details: {} };
        }

        var items = ((json.data as Record<string, unknown> || {}).items as Array<Record<string, unknown>>) || [];
        var uid = getCookie().dede_user_id || "";

        var newReplies: string[] = [];
        var totalCount = items.length;
        var newCount = 0;

        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          var itemData = item.item as Record<string, unknown> || {};
          var user = item.user as Record<string, unknown> || {};
          var replyTime = Number(item.reply_time || 0) * 1000;
          var id = String(item.id || "");

          var nickname = String(user.nickname || "匿名");
          var sourceContent = String(itemData.source_content || "");
          var targetContent = String(itemData.target_content || "");
          var rootContent = String(itemData.root_reply_content || "");
          var uri = String(itemData.uri || "");
          var isNew = replyTime > lastCheck;

          if (isNew) {
            newCount++;
            var excerpt = sourceContent.substring(0, 150) || "(无内容)";
            var line = "**" + nickname + "**: " + excerpt;
            if (uri) line += "\n  🔗 " + uri;
            newReplies.push((newCount) + ". " + line);
          }
        }

        // 保存时间戳
        state[lastKey] = now;
        saveState(state);

        var lines: string[] = [];
        if (newCount > 0) {
          lines.push("🆕 **检测到 " + newCount + " 条新回复**");
          newReplies.forEach(function(l) { lines.push(l); });
          lines.push("");
          lines.push("💡 需要回怼用 bilibili_reply");
        } else {
          lines.push("📭 上次检查后没有新回复");
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { newCount: newCount, totalChecked: totalCount },
        };
      } catch (err) {
        return { content: [{ type: "text", text: "❌ " + (err instanceof Error ? err.message : String(err)) }], details: {} };
      }
    },
  });
}
