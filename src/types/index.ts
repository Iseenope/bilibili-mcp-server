// ============================================================
// Bilibili MCP Server — 类型定义
// ============================================================

// ─── B站 API 通用类型 ───────────────────────────────────────

/** B站 API 统一响应包装 */
export interface BilibiliResponse<T = unknown> {
  code: number;
  message: string;
  ttl?: number;
  data?: T;
}

/** 分页信息 */
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}

// ─── Cookie / 凭证 ──────────────────────────────────────────

/** Cookie 数据结构 */
export interface CookieData {
  sessdata: string;
  bili_jct: string;
  dede_user_id: string;
  lastRefresh?: number;
}

/** 应用配置 */
export interface Config {
  sessdata: string;
  bili_jct: string;
  dede_user_id: string;
  cookieFile?: string;
  autoRefresh: boolean;
  refreshToken?: string;
  fullCookie?: string; // 完整 Cookie 字符串（包含 buvid3/buvid4 等额外字段）
}

// ─── WBI 签名 ───────────────────────────────────────────────

/** WBI 密钥 */
export interface WbiKey {
  imgKey: string;
  subKey: string;
  mixinKey: string;
  expiresAt: number; // 过期时间戳
}

// ─── 视频相关 ───────────────────────────────────────────────

/** 视频基本信息 */
export interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  desc: string;
  pic: string;
  duration: number;
  pubdate: number;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
  stat: VideoStat;
  cid: number;
  pages: VideoPage[];
  subtitle?: SubtitleContainer;
  tname: string;
  tid: number;
  videos: number;
  copyright: number;
}

/** 视频统计数据 */
export interface VideoStat {
  view: number;
  danmaku: number;
  reply: number;
  favorite: number;
  coin: number;
  share: number;
  like: number;
}

/** 视频分P */
export interface VideoPage {
  cid: number;
  page: number;
  part: string;
  duration: number;
}

/** 搜索结果中的视频条目 */
export interface SearchVideoItem {
  aid: number;
  bvid: string;
  title: string;
  author: string;
  mid: number;
  pic: string;
  play: number;
  video_review: number;
  favorites: number;
  review: number;
  pubdate: number;
  duration: string;
  description: string;
  tag: string;
  rank_score: number;
}

/** UP主视频列表中的条目 */
export interface UserVideoItem {
  bvid: string;
  aid: number;
  title: string;
  description: string;
  pic: string;
  play: number;
  video_review: number;
  length: string;
  created: number;
  mid: number;
  author: string;
}

// ─── 弹幕相关 ───────────────────────────────────────────────

/** 弹幕元素 */
export interface DanmakuElem {
  id: number;
  idStr: string;
  midHash: string;
  progress: number;    // 出现时间(毫秒)
  mode: number;        // 1=滚动 4=底部 5=顶部 6=逆向
  fontsize: number;    // 18=小 25=标准 36=大
  color: number;       // 十进制RGB888
  content: string;
  ctime: number;       // 发送时间戳
  weight: number;      // 权重0-10
  pool: number;        // 0=普通 1=字幕 2=特殊
  attr: number;
}

// ─── 字幕相关 ───────────────────────────────────────────────

/** 字幕容器 */
export interface SubtitleContainer {
  allow_submit: boolean;
  lan: string;
  lan_doc: string;
  subtitles: SubtitleItem[];
}

/** 字幕条目 */
export interface SubtitleItem {
  id: number;
  lan: string;
  lan_doc: string;
  subtitle_url: string;
  type: number;
  ai_type?: number;
  ai_status?: number;
}

/** 字幕内容（从 subtitle_url 获取） */
export interface SubtitleContent {
  body: SubtitleBodyItem[];
  font_size?: number;
  font_color?: string;
}

/** 字幕片段 */
export interface SubtitleBodyItem {
  from: number;
  to: number;
  content: string;
  location?: number;
}

// ─── 评论相关 ───────────────────────────────────────────────

/** 评论条目 */
export interface ReplyItem {
  rpid: number;
  oid: number;
  type: number;
  mid: number;
  root: number;
  parent: number;
  count: number;
  rcount: number;
  like: number;
  ctime: number;
  content: ReplyContent;
  member: ReplyMember;
  replies?: ReplyItem[]; // 楼中楼
}

/** 评论内容 */
export interface ReplyContent {
  message: string;
  members?: string[];
  emote?: Record<string, unknown>;
}

/** 评论作者 */
export interface ReplyMember {
  mid: string;
  uname: string;
  avatar: string;
  level_info: {
    current_level: number;
  };
}

// ─── 用户相关 ───────────────────────────────────────────────

/** 用户空间信息 */
export interface UserInfo {
  mid: number;
  name: string;
  sex: string;
  face: string;
  sign: string;
  level: number;
  coins: number;
  birthday: string;
  moral: number;
  silence: number;
  official: {
    role: number;
    title: string;
    desc: string;
    type: number;
  };
  vip: {
    type: number;
    status: number;
    due_date: number;
    label: {
      text: string;
    };
  };
  is_followed: boolean;
  top_photo: string;
  live_room?: {
    roomStatus: number;
    liveStatus: number;
    url: string;
    title: string;
    roomid: number;
  };
}

// ─── 收藏夹相关 ─────────────────────────────────────────────

/** 收藏夹信息 */
export interface FavoriteFolder {
  id: number;
  mid: number;
  title: string;
  cover: string;
  media_count: number;
  intro: string;
  fav_state: number;
  is_like: boolean;
}

/** 收藏夹内容条目 */
export interface FavoriteItem {
  id: number;
  type: number;
  title: string;
  cover: string;
  intro: string;
  page: number;
  duration: number;
  upper: {
    mid: number;
    name: string;
    face: string;
  };
  attr: number;
  cnt_info: {
    collect: number;
    play: number;
    danmaku: number;
  };
  link: string;
  ctime: number;
  pubtime: number;
  fav_time: number;
}

// ─── 检测回复相关 ───────────────────────────────────────────

/** 回复消息条目 */
export interface ReplyMessage {
  id: number;
  type: number;
  reply_time: number;
  item: {
    source_content: string;
    target_content: string;
    root_reply_content?: string;
    uri: string;
  };
  user: {
    nickname: string;
    avatar: string;
  };
}

// ─── 热门/排行榜相关 ────────────────────────────────────────

/** 热门视频条目 */
export interface HotVideoItem {
  aid: number;
  bvid: string;
  title: string;
  pic: string;
  owner: {
    mid: number;
    name: string;
    face: string;
  };
  stat: VideoStat;
  pubdate: number;
  duration: number;
  rcmd_reason: string;
}

/** 热搜词 */
export interface HotSearchItem {
  keyword: string;
  icon: string;
  position: number;
  word_type: number;
  goto_type: string;
}

// ─── MCP 工具参数类型 ──────────────────────────────────────

/** 搜索视频参数 */
export interface SearchVideoParams {
  keyword: string;
  page?: number;
  order?: 'totalrank' | 'click' | 'pubdate' | 'dm' | 'stow' | 'scores';
  duration?: 0 | 1 | 2 | 3 | 4;
}

/** 视频详情参数 */
export interface VideoInfoParams {
  videoId: string; // BV号或av号
}

/** 字幕参数 */
export interface SubtitleParams {
  videoId: string;
  lang?: string;
}

/** 弹幕参数 */
export interface DanmakuParams {
  videoId: string;
  segment?: number;
}

/** 用户信息参数 */
export interface UserInfoParams {
  uid: number;
}

/** UP主视频列表参数 */
export interface UserVideosParams {
  uid: number;
  max?: number;
}

/** 评论列表参数 */
export interface VideoCommentsParams {
  videoId: string;
  max?: number;
  withPinned?: boolean;
}

/** 发送评论参数 */
export interface ReplyParams {
  videoId: string;
  message: string;
  parentRpid?: string;
  rootRpid?: string;
  type?: number;
}

/** 删除评论参数 */
export interface DeleteCommentParams {
  videoId: string;
  rpid: string;
  type?: number;
}

/** 点赞评论参数 */
export interface LikeCommentParams {
  videoId: string;
  rpid: string;
  action?: 0 | 1;
  type?: number;
}

/** 检测回复参数 */
export interface DetectRepliesParams {
  videoId?: string;
  max?: number;
}

/** 收藏夹内容参数 */
export interface FavoritesParams {
  uid: number;
  folderId?: number;
  max?: number;
}

// ─── 错误码映射 ─────────────────────────────────────────────

/** B站 API 错误码含义 */
export const BILI_ERROR_MAP: Record<number, string> = {
  [-101]: '未登录 / Cookie 过期',
  [-111]: 'CSRF 校验失败',
  [-352]: '风控拦截（WBI 签名失败）',
  [-400]: '请求错误',
  [-403]: '权限不足 / 非法访问',
  [-404]: '资源不存在',
  [-412]: '请求被拦截（Cookie 校验不足）',
  [-509]: '请求过于频繁，请稍后重试',
  [-1200]: '搜索类型不存在',
  62002: '稿件不可见',
  62004: '稿件审核中',
  62012: '仅 UP 主自己可见',
  86095: 'refresh_csrf 错误或 token 不匹配',
};

/** 工具错误码分类 */
export enum ErrorCategory {
  Validation = 'validation',
  Credentials = 'credentials',
  Network = 'network',
  Content = 'content',
  Access = 'access',
  RateLimit = 'rate_limit',
  Api = 'api',
  Unknown = 'unknown',
}

/** 结构化错误信息 */
export interface AppError {
  error: true;
  code: string;
  category: ErrorCategory;
  message: string;
  retryable: boolean;
  userActionRequired: boolean;
  nextSteps: string;
}
