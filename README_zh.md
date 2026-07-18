# Bilibili MCP Server

B 站的 MCP 服务。提供视频搜索、评论管理、弹幕字幕、用户信息、动态专栏、扫码登录等功能，共 22 个工具。

## 工具列表

| 类别 | 工具 | 数量 |
|:----:|------|:----:|
| 评论 | `bilibili_reply`、`bilibili_delete_comment`、`bilibili_like_comment` | 3 |
| 搜索 | `bilibili_search`、`bilibili_search_hot` | 2 |
| 视频 | `bilibili_video_info`、`bilibili_video_comments`、`bilibili_video_subtitle`、`bilibili_video_danmaku`、`bilibili_hot` | 5 |
| 用户 | `bilibili_user_info`、`bilibili_user_videos`、`bilibili_user_favorites` | 3 |
| 内容 | `bilibili_user_dynamics`、`bilibili_article_info`、`bilibili_user_articles` | 3 |
| 消息 | `bilibili_detect_replies`、`bilibili_notifications` | 2 |
| 直播 | `bilibili_live_info` | 1 |
| 登录 | `bilibili_login`、`bilibili_login_check` | 2 |
| 系统 | `bilibili_refresh_cookie` | 1 |

## 快速开始

### 环境要求

- Node.js 18+
- B 站账号（用于需要登录的操作）

### 安装

```bash
# 直接运行
npx bilibili-mcp-server

# 或全局安装
npm install -g bilibili-mcp-server
bilibili-mcp-server
```

### 配置

支持环境变量或项目目录下的 `.env` 文件：

```bash
# 必填 - 从浏览器开发者工具 → Application → Cookies → bilibili.com 获取
export BILIBILI_SESSDATA=你的sessdata
export BILIBILI_BILI_JCT=你的bili_jct
export BILIBILI_DEDE_USER_ID=你的uid

# 可选 - Cookie 自动刷新
# 获取方式: bilibili.com → F12 → Console → 输入:
#   console.log(localStorage.getItem('ac_time_value'))
export BILIBILI_REFRESH_TOKEN=你的refresh_token

# 可选 - 完整 Cookie（热搜等功能需要）
# export BILIBILI_FULL_COOKIE="buvid3=xxx; buvid4=xxx; _uuid=xxx; ..."

# 可选
export BILIBILI_AUTO_REFRESH=true
export BILIBILI_COOKIE_FILE=/path/to/cookie.json
export BILIBILI_DETECT_FILE=/path/to/detect.json
```

### MCP 客户端配置

```json
{
  "mcpServers": {
    "bilibili": {
      "command": "npx",
      "args": ["-y", "bilibili-mcp-server"],
      "env": {
        "BILIBILI_SESSDATA": "你的sessdata",
        "BILIBILI_BILI_JCT": "你的bili_jct",
        "BILIBILI_DEDE_USER_ID": "你的uid"
      }
    }
  }
}
```

### 扫码登录

不想手动复制 Cookie 的话，可以调扫码登录：

1. 调 `bilibili_login` 获取二维码
2. 手机 B 站 App 扫码
3. 调 `bilibili_login_check` 检测登录状态
4. 登录成功自动保存 Cookie

## 工具说明

### 登录与认证

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_login` | 生成扫码登录二维码 | - |
| `bilibili_login_check` | 轮询扫码状态，登录成功自动保存 | `loginKey`, `maxRetries?` |
| `bilibili_refresh_cookie` | 手动触发 Cookie 刷新 | - |

### 评论管理

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_reply` | 发布评论或回复 | `videoId`, `message`, `parentRpid?` |
| `bilibili_delete_comment` | 删除自己的评论 | `videoId`, `rpid` |
| `bilibili_like_comment` | 点赞/取消赞 | `videoId`, `rpid`, `action` |

### 视频与搜索

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_search` | 搜索视频 | `keyword`, `order?`, `page?`, `duration?` |
| `bilibili_video_info` | 视频详情 | `videoId` |
| `bilibili_video_comments` | 获取评论列表 | `videoId`, `max?` |
| `bilibili_video_subtitle` | 获取字幕 | `videoId`, `lang?` |
| `bilibili_video_danmaku` | 获取弹幕 | `videoId`, `segment?` |
| `bilibili_hot` | 热门视频 | `page?`, `max?` |
| `bilibili_search_hot` | 热搜关键词 | - |

### 用户

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_user_info` | 用户信息 | `uid` |
| `bilibili_user_videos` | UP 主视频列表 | `uid`, `max?` |
| `bilibili_user_favorites` | 收藏夹 | `uid`, `folderId?`, `max?` |

### 动态与专栏

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_user_dynamics` | UP 主最新动态 | `uid`, `max?` |
| `bilibili_article_info` | 专栏文章详情 | `cvid` |
| `bilibili_user_articles` | UP 主专栏列表 | `uid`, `max?` |

### 消息通知

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_detect_replies` | 检测新回复 | `max?` |
| `bilibili_notifications` | 查看未读通知 | - |

### 直播

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_live_info` | 查询直播间信息 | `uid` |

## 项目结构

```
src/
├── index.ts
├── env.ts
├── config.ts
├── api/
│   ├── http.ts
│   ├── bilibili.ts
│   ├── wbi.ts
│   ├── cookie.ts
│   ├── login.ts
│   └── danmaku.ts
├── tools/
│   ├── comment.ts
│   ├── video.ts
│   ├── user.ts
│   ├── content.ts
│   ├── message.ts
│   ├── login.ts
│   └── live.ts
└── types/
    └── index.ts
```

## 开发

```bash
npm install
npm run dev    # 开发模式
npm run build  # 构建
npm test       # 测试
```

## 许可证

MIT
