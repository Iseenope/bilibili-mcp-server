import { getCookie, getFullCookieString } from '../config.js';
import { signWbi, clearWbiCache } from './wbi.js';
import { noProxyFetch, isRetryableError } from './http.js';
import { BilibiliResponse, BILI_ERROR_MAP } from '../types/index.js';

// ─── 常量 ─────────────────────────────────────────────────

const API_BASE = 'https://api.bilibili.com';
const LIVE_API_BASE = 'https://api.live.bilibili.com';
const REQUEST_TIMEOUT = 15_000;
const REQUEST_INTERVAL_MS = 500; // 基础请求间隔限流
const MAX_RETRIES = 2;           // 最大重试次数（不含首次）

// ─── 自适应限流 ─────────────────────────────────────────

let lastRequestTime = 0;
let currentInterval = REQUEST_INTERVAL_MS;
let consecutiveRateLimit = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < currentInterval) {
    await new Promise((r) => setTimeout(r, currentInterval - elapsed));
  }
  lastRequestTime = Date.now();
}

/** 遇到频率限制时增加间隔 */
function increaseInterval(): void {
  consecutiveRateLimit++;
  currentInterval = Math.min(currentInterval * 2, 8000); // 最大 8 秒
  console.error(`[rate-limit] ⚠️ 检测到频率限制，降速至 ${currentInterval}ms (第${consecutiveRateLimit}次)`);
}

/** 正常响应时逐渐恢复间隔（需要连续多次成功才完全恢复） */
const SUCCESS_RECOVERY_RATIO = 3; // 连续 3 次成功才降一档
let consecutiveSuccess = 0;

function decreaseInterval(): void {
  if (consecutiveRateLimit === 0) {
    consecutiveSuccess = 0;
    return;
  }

  consecutiveSuccess++;
  if (consecutiveSuccess >= SUCCESS_RECOVERY_RATIO) {
    consecutiveSuccess = 0;
    consecutiveRateLimit = Math.max(0, consecutiveRateLimit - 1);
    currentInterval = Math.max(REQUEST_INTERVAL_MS, currentInterval / 2);
  }
}

// ─── 网络层 ───────────────────────────────────────────────

/** 构造默认请求头 */
function getHeaders(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.bilibili.com',
    Cookie: getFullCookieString(),
  };
}

// ─── 公共请求方法 ─────────────────────────────────────────

/** 发起 API 请求 */
async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    params?: Record<string, string>;
    body?: Record<string, string>;
    useWbi?: boolean;
    noCookie?: boolean;
    baseUrl?: string;
  } = {}
): Promise<T> {
  await throttle();

  const { method = 'GET', params = {}, body, useWbi = false, noCookie = false, baseUrl = API_BASE } = options;
  let queryParams = { ...params };
  let retries = 0;
  let wbiDisabled = false; // 一旦降级到底，标记不再使用 WBI

  while (true) {
    try {
      // WBI 签名
      let queryString = '';
      const effectiveUseWbi = useWbi && !wbiDisabled;
      if (effectiveUseWbi) {
        queryParams = await signWbi(queryParams);
      } else if (useWbi && wbiDisabled) {
        // 降级后去掉已添加的 w_rid/wts
        const { w_rid: _r, wts: _t, ...rest } = queryParams;
        queryParams = rest;
      }

      const qKeys = Object.keys(queryParams);
      if (qKeys.length > 0) {
        queryString = qKeys
          .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
          .join('&');
      }

      // 降级时自动去掉路径中的 wbi
      const effectivePath = wbiDisabled ? path.replace(/\/wbi\//g, '/') : path;

      const url = `${baseUrl}${effectivePath}${queryString ? '?' + queryString : ''}`;
      const headers = noCookie
        ? {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: 'https://www.bilibili.com',
          }
        : getHeaders();

      const fetchOpts: RequestInit = {
        method,
        headers: {
          ...headers,
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      };

      if (body) {
        const formBody = new URLSearchParams();
        for (const [k, v] of Object.entries(body)) {
          if (v !== undefined && v !== null) formBody.append(k, v);
        }
        fetchOpts.body = formBody.toString();
      }

      const res = await noProxyFetch(url, fetchOpts);
      const text = await res.text();

      if (res.status !== 200) {
        throw new Error(`HTTP ${res.status}（请检查参数或资源是否存在）`);
      }

      const json = JSON.parse(text) as BilibiliResponse<T>;

      // 处理 WBI 签名失败，先清缓存重试一次，仍失败则永久降级到非 WBI 接口
      if (json.code === -352 && retries < MAX_RETRIES) {
        retries++;
        if (retries === 1) {
          // 第 1 次重试：清缓存重新获取 wbi 密钥
          clearWbiCache();
        } else {
          // 第 2 次重试：降级到底，去掉 WBI 签名
          wbiDisabled = true;
          console.error(`[wbi] 连续 ${retries} 次 -352，已降级到非 WBI 接口`);
        }
        continue;
      }

      // 处理未登录，尝试续期 Cookie
      if (json.code === -101) {
        const { refreshCookie } = await import('./cookie.js');
        const result = await refreshCookie();
        if (result.success && retries < MAX_RETRIES) {
          retries++;
          continue;
        }
        throw new Error('Cookie 已过期，自动续期失败: ' + result.message);
      }

      if (json.code !== 0) {
        // 频率限制 - 自适应降速
        if (json.code === -509) {
          increaseInterval();
          if (retries < MAX_RETRIES) {
            retries++;
            continue;
          }
        }
        const errMsg = BILI_ERROR_MAP[json.code] || json.message || '未知错误';
        // 为常见错误提供更具体的引导
        const guidance: Record<number, string> = {
          [-101]: '请检查 BILIBILI_SESSDATA 是否有效或已过期',
          [-111]: '请检查 BILIBILI_BILI_JCT 是否有效',
          [-352]: 'B 站风控拦截。可能是账号近期操作频繁（评论/点赞/投稿），建议等待 5-10 分钟后再试。自动已重试 2 次后降级到非 WBI 接口。',
          [-400]: '请求参数错误，请检查视频 ID 格式是否正确或资源是否存在',
          [-403]: '权限不足，可能需要登录，或该内容需要大会员',
          [-404]: '请求的资源不存在',
          [-412]: '请求被拦截，请补充 Cookie 字段（buvid3 等）或检查 User-Agent',
          [-509]: '请求过于频繁，请稍后重试',
          [22115]: '该用户已设置隐私，无法查看其关注/粉丝列表',
        };
        const hint = guidance[json.code] ? `\n💡 ${guidance[json.code]}` : '';
        throw new Error(`[${json.code}] ${errMsg}${hint}`);
      }

      decreaseInterval(); // 正常响应，恢复限流间隔
      // B站部分 API 在 code=0 时 data 可能为 null，统一返回空对象避免下游崩溃
      return (json.data ?? {}) as T;
    } catch (err) {
      // 只对网络/HTTP 错误进行重试，编程错误直接抛出
      const isNetworkErr = isRetryableError(err);
      const errMessage = err instanceof Error ? err.message : String(err);

      console.error(
        `[request] ${path} 失败 (第${retries + 1}次): ${errMessage} (重试: ${isNetworkErr ? '是' : '否'})`
      );

      // 编程错误或重试次数已满，直接抛出
      if (!isNetworkErr || retries >= MAX_RETRIES) {
        throw err;
      }

      retries++;
      await new Promise((r) => setTimeout(r, 1000 * retries)); // 指数退避
    }
  }
}

// ─── 导出 API 方法 ────────────────────────────────────────

/** B站 API 客户端 */
export const biliApi = {
  // ─── 搜索 ─────────────────────────────────────────────
  async search(params: {
    keyword: string;
    search_type?: string;
    page?: number;
    order?: string;
    duration?: number;
  }): Promise<{
    result: Array<Record<string, unknown>>;
    page: number;
    pagesize: number;
    numResults: number;
    numPages: number;
  }> {
    return request('/x/web-interface/wbi/search/type', {
      params: {
        search_type: params.search_type || 'video',
        keyword: params.keyword,
        page: String(params.page || 1),
        order: params.order || 'totalrank',
        ...(params.duration ? { duration: String(params.duration) } : {}),
      },
      useWbi: true,
    });
  },

  // ─── 视频详情 ───────────────────────────────────────────
  async videoInfo(videoId: string): Promise<Record<string, unknown>> {
    const params: Record<string, string> = {};
    if (/^BV/gi.test(videoId)) {
      params.bvid = videoId;
    } else {
      params.aid = videoId;
    }
    return request('/x/web-interface/wbi/view', { params, useWbi: true });
  },

  // ─── 字幕 ───────────────────────────────────────────────
  async subtitle(
    videoId: string,
    cid: number
  ): Promise<Record<string, unknown>> {
    const params: Record<string, string> = { cid: String(cid) };
    if (/^BV/gi.test(videoId)) {
      params.bvid = videoId;
    } else {
      params.aid = videoId;
    }
    return request('/x/player/wbi/v2', { params, useWbi: true });
  },

  // ─── 弹幕 ───────────────────────────────────────────────
  async danmaku(
    oid: number,
    segmentIndex: number = 1
  ): Promise<ArrayBuffer> {
    await throttle();
    const params = new URLSearchParams({
      type: '1',
      oid: String(oid),
      segment_index: String(segmentIndex),
    });
    const url = `${API_BASE}/x/v2/dm/web/seg.so?${params}`;
    const res = await noProxyFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://www.bilibili.com',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    return res.arrayBuffer();
  },

  // ─── 评论列表 ───────────────────────────────────────────
  async videoComments(
    videoId: string,
    max: number = 10,
    next: number = 0
  ): Promise<{
    replies?: Array<Record<string, unknown>>;
    upper?: Record<string, unknown>;
    cursor?: Record<string, unknown>;
  }> {
    const params: Record<string, string> = {
      oid: videoId,
      type: '1',
      ps: String(max),
      next: String(next),
    };
    return request('/x/v2/reply/main', { params });
  },

  // ─── 发布评论 ───────────────────────────────────────────
  async reply(body: {
    type: number;
    oid: string;
    message: string;
    root?: string;
    parent?: string;
    plat?: string;
  }): Promise<Record<string, unknown>> {
    const cookie = getCookie();
    return request('/x/v2/reply/add', {
      method: 'POST',
      body: {
        type: String(body.type),
        oid: body.oid,
        message: body.message,
        plat: body.plat || '1',
        ...(body.root ? { root: body.root } : {}),
        ...(body.parent ? { parent: body.parent } : {}),
        csrf: cookie.bili_jct,
      },
    });
  },

  // ─── 删除评论 ───────────────────────────────────────────
  async deleteComment(body: {
    type: number;
    oid: string;
    rpid: string;
  }): Promise<Record<string, unknown>> {
    const cookie = getCookie();
    return request('/x/v2/reply/del', {
      method: 'POST',
      body: {
        type: String(body.type),
        oid: body.oid,
        rpid: body.rpid,
        csrf: cookie.bili_jct,
      },
    });
  },

  // ─── 点赞评论 ───────────────────────────────────────────
  async likeComment(body: {
    type: number;
    oid: string;
    rpid: string;
    action: number;
  }): Promise<Record<string, unknown>> {
    const cookie = getCookie();
    return request('/x/v2/reply/action', {
      method: 'POST',
      body: {
        type: String(body.type),
        oid: body.oid,
        rpid: body.rpid,
        action: String(body.action),
        csrf: cookie.bili_jct,
      },
    });
  },

  // ─── UP主视频列表 ──────────────────────────────────────
  async userVideos(params: {
    mid: string;
    ps: string;
    pn: string;
    order: string;
  }): Promise<Record<string, unknown>> {
    return request('/x/space/wbi/arc/search', {
      params,
      useWbi: true,
    });
  },

  // ─── 检测新回复 ─────────────────────────────────────────
  async detectReplies(): Promise<{
    items?: Array<Record<string, unknown>>;
    cursor?: Record<string, unknown>;
  }> {
    return request('/x/msgfeed/reply', {
      params: { build: '0', mobi_app: 'web' },
    });
  },

  // ─── 用户信息 ───────────────────────────────────────────
  async userInfo(mid: number): Promise<Record<string, unknown>> {
    return request('/x/space/wbi/acc/info', {
      params: { mid: String(mid) },
      useWbi: true,
    });
  },

  // ─── 热门视频 ───────────────────────────────────────────
  async hotVideos(
    pn: number = 1,
    ps: number = 10
  ): Promise<{
    list: Array<Record<string, unknown>>;
    page: Record<string, unknown>;
  }> {
    return request('/x/web-interface/popular', {
      params: { pn: String(pn), ps: String(ps) },
    });
  },

  // ─── 热搜 ───────────────────────────────────────────────
  async searchHot(): Promise<{
    list: Array<Record<string, unknown>>;
  }> {
    return request('/x/web-interface/search/square', {
      params: { limit: '10' },
    });
  },

  // ─── 收藏夹列表 ─────────────────────────────────────────
  async favoriteFolders(
    upMid: number
  ): Promise<{ list?: Array<Record<string, unknown>> }> {
    return request('/x/v3/fav/folder/created/list-all', {
      params: { up_mid: String(upMid), type: '0' },
    });
  },

  // ─── 收藏夹内容 ─────────────────────────────────────────
  async favoriteResources(params: {
    media_id: number;
    pn?: number;
    ps?: number;
    order?: string;
  }): Promise<{
    medias?: Array<Record<string, unknown>>;
    page?: Record<string, unknown>;
  }> {
    return request('/x/v3/fav/resource/list', {
      params: {
        media_id: String(params.media_id),
        pn: String(params.pn || 1),
        ps: String(params.ps || 20),
        order: params.order || 'mtime',
      },
    });
  },

  // ─── 关注/取关 ─────────────────────────────────────────
  async relationModify(params: {
    fid: number;
    act: 1 | 2; // 1=关注, 2=取关
    re_src?: number;
  }): Promise<Record<string, unknown>> {
    const cookie = getCookie();
    return request('/x/relation/modify', {
      method: 'POST',
      body: {
        fid: String(params.fid),
        act: String(params.act),
        re_src: String(params.re_src || 14),
        csrf: cookie.bili_jct,
      },
    });
  },

  // ─── 关注列表 ─────────────────────────────────────────
  async followings(params: {
    vmid: number;
    pn?: number;
    ps?: number;
    order?: 'desc' | 'asc';
  }): Promise<{
    list?: Array<Record<string, unknown>>;
    total?: number;
  }> {
    return request('/x/relation/followings', {
      params: {
        vmid: String(params.vmid),
        pn: String(params.pn || 1),
        ps: String(params.ps || 20),
        order: params.order || 'desc',
      },
    });
  },

  // ─── 粉丝列表 ─────────────────────────────────────────
  async followers(params: {
    vmid: number;
    pn?: number;
    ps?: number;
    order?: 'desc' | 'asc';
  }): Promise<{
    list?: Array<Record<string, unknown>>;
    total?: number;
  }> {
    return request('/x/relation/followers', {
      params: {
        vmid: String(params.vmid),
        pn: String(params.pn || 1),
        ps: String(params.ps || 20),
        order: params.order || 'desc',
      },
    });
  },

  // ─── 视频播放地址（DASH/MP4） ─────────────────────────
  async playUrl(params: {
    videoId: string;
    cid: number;
    qn?: number; // 画质代码：80=1080P, 64=720P, 32=480P, 16=360P
    fnval?: number; // 1=MP4, 16=DASH
    fourk?: boolean;
  }): Promise<Record<string, unknown>> {
    const body: Record<string, string> = {
      cid: String(params.cid),
      qn: String(params.qn || 80),
      fnval: String(params.fnval || 16),
      fourk: params.fourk ? '1' : '0',
      platform: 'html5',
      high_quality: '1',
    };
    if (/^BV/gi.test(params.videoId)) {
      body.bvid = params.videoId;
    } else {
      body.aid = params.videoId;
    }
    return request('/x/player/playurl', { body, useWbi: true });
  },

  // ─── 发送弹幕 ─────────────────────────────────────────
  async sendDanmaku(params: {
    videoId: string;
    cid: number;
    progress: number; // 毫秒，弹幕出现时间点
    message: string;
    color?: number; // 默认 16777215（白色）
    fontsize?: number; // 默认 25
    mode?: 1 | 4 | 5 | 7 | 8; // 1=滚动, 4=底部, 5=顶部, 7=高级, 8=代码
  }): Promise<Record<string, unknown>> {
    const cookie = getCookie();
    const body: Record<string, string> = {
      type: '1',
      oid: String(params.cid),
      msg: params.message,
      bvid: /^BV/gi.test(params.videoId) ? params.videoId : '',
      aid: /^BV/gi.test(params.videoId) ? '' : params.videoId,
      progress: String(Math.max(0, Math.floor(params.progress))),
      color: String(params.color ?? 16777215),
      fontsize: String(params.fontsize ?? 25),
      mode: String(params.mode ?? 1),
      pool: '0',
      plat: '1',
      from_scene: '5',
      csrf: cookie.bili_jct,
    };
    return request('/x/v2/dm/post', { method: 'POST', body });
  },

  // ─── 视频互动 ─────────────────────────────────────────
  async videoLike(params: {
    videoId: string;
    action: 1 | 2; // 1=点赞, 2=取消
  }): Promise<Record<string, unknown>> {
    const cookie = getCookie();
    const body: Record<string, string> = {
      thumbs_up: String(params.action),
      csrf: cookie.bili_jct,
    };
    if (/^BV/gi.test(params.videoId)) {
      body.bvid = params.videoId;
    } else {
      body.aid = params.videoId;
    }
    return request('/x/v2/view/like', { method: 'POST', body });
  },

  async videoCoin(params: {
    videoId: string;
    multiply: 1 | 2; // 投币数量（1 或 2）
  }): Promise<Record<string, unknown>> {
    const cookie = getCookie();
    const body: Record<string, string> = {
      multiply: String(params.multiply),
      select_like: '0',
      csrf: cookie.bili_jct,
    };
    if (/^BV/gi.test(params.videoId)) {
      body.bvid = params.videoId;
    } else {
      body.aid = params.videoId;
    }
    return request('/x/v2/view/coin', { method: 'POST', body });
  },

  async videoFavorite(params: {
    videoId: string;
    mediaIds: number[]; // 收藏夹 ID 列表
    add: boolean; // true=添加, false=取消
  }): Promise<Record<string, unknown>> {
    const cookie = getCookie();
    const body: Record<string, string> = {
      csrf: cookie.bili_jct,
    };
    if (params.add) {
      body.add_media_ids = params.mediaIds.join(',');
    } else {
      body.del_media_ids = params.mediaIds.join(',');
    }
    if (/^BV/gi.test(params.videoId)) {
      body.bvid = params.videoId;
    } else {
      body.aid = params.videoId;
    }
    return request('/x/v2/view/favorite', { method: 'POST', body });
  },

  // ─── @和点赞通知 ────────────────────────────────────────
  async atMessages(): Promise<{
    items?: Array<Record<string, unknown>>;
    cursor?: Record<string, unknown>;
  }> {
    return request('/x/msgfeed/at', {
      params: { build: '0', mobi_app: 'web' },
    });
  },

  // ─── UP主动态 ─────────────────────────────────────────
  async userDynamics(params: {
    host_mid: string;
    offset?: string;
  }): Promise<{
    items?: Array<Record<string, unknown>>;
    offset?: string;
    has_more?: boolean;
  }> {
    return request('/x/polymer/web-dynamic/v1/feed/space', {
      params: {
        host_mid: params.host_mid,
        offset: params.offset || '',
      },
    });
  },

  // ─── 专栏文章详情 ─────────────────────────────────────
  async articleInfo(
    cvid: number
  ): Promise<Record<string, unknown>> {
    return request('/x/article/view', {
      params: { id: String(cvid) },
    });
  },

  // ─── UP主专栏列表 ─────────────────────────────────────
  async userArticles(params: {
    mid: string;
    pn?: string;
    ps?: string;
  }): Promise<{
    articles?: Array<Record<string, unknown>>;
    page?: Record<string, unknown>;
  }> {
    return request('/x/space/article', {
      params: {
        mid: params.mid,
        pn: params.pn || '1',
        ps: params.ps || '10',
        sort: 'publish_time',
      },
    });
  },

  // ─── 直播信息 ─────────────────────────────────────────
  /**
   * 获取用户直播间 ID（从 uid 映射到 room_id）
   */
  async liveRoomInit(uid: number): Promise<{
    room_id: number;
    uid: number;
    live_status: number;
    [key: string]: unknown;
  }> {
    return request('/room/v1/Room/room_init', {
      params: { id: String(uid) },
      baseUrl: LIVE_API_BASE,
    });
  },

  /**
   * 获取直播间详细信息
   */
  async liveRoomInfo(roomId: number): Promise<Record<string, unknown>> {
    return request('/room/v1/Room/get_info', {
      params: { room_id: String(roomId) },
      baseUrl: LIVE_API_BASE,
    });
  },
};

// ─── 工具函数 ──────────────────────────────────────────────

/** 将 BV/AV 统一转为辅助参数 */
export function parseVideoId(id: string): Record<string, string> {
  if (/^BV/gi.test(id)) {
    return { bvid: id };
  }
  // 支持纯数字 avid 或 "av12345" 格式
  const cleaned = id.replace(/^av/i, '');
  return { aid: cleaned };
}

/** 从视频 ID 获取 avid（数字） */
export function extractAid(videoId: string): string {
  if (/^BV/gi.test(videoId)) return videoId;
  return videoId.replace(/^av/i, '');
}
