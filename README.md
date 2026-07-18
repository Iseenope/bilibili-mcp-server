# Bilibili MCP Server

[English](./README_en.md) | [中文](./README.md)

B 站的 MCP 服务。提供视频搜索、评论管理、弹幕字幕、用户信息、动态专栏、扫码登录、直播截图视觉分析等功能，共 31 个工具。

## 工具列表

| 类别 | 工具 | 数量 |
|:----:|------|:----:|
| 评论 | `bilibili_reply`、`bilibili_delete_comment`、`bilibili_like_comment` | 3 |
| 搜索 | `bilibili_search`、`bilibili_search_hot` | 2 |
| 视频 | `bilibili_video_info`、`bilibili_video_comments`、`bilibili_video_subtitle`、`bilibili_video_danmaku`、`bilibili_hot` | 5 |
| 用户 | `bilibili_user_info`、`bilibili_user_videos`、`bilibili_user_favorites`、`bilibili_user_follow`、`bilibili_user_unfollow`、`bilibili_user_followings`、`bilibili_user_followers` | 7 |
| 内容 | `bilibili_user_dynamics`、`bilibili_article_info`、`bilibili_user_articles` | 3 |
| 消息 | `bilibili_detect_replies`、`bilibili_notifications` | 2 |
| 直播 | `bilibili_live_info`、`bilibili_live_screenshot` | 2 |
| 登录 | `bilibili_login`、`bilibili_login_check` | 2 |
| 系统 | `bilibili_refresh_cookie` | 1 |
| 下载 | `bilibili_video_download`、`bilibili_article_download`、`bilibili_download_list` | 3 |
| 弹幕 | `bilibili_send_danmaku` | 1 |

## 快速开始

### 环境要求

- Node.js 22+
- B 站账号（用于需要登录的操作）
- ffmpeg（**仅**视频下载工具需要；macOS: `brew install ffmpeg`，Windows: `choco install ffmpeg`，Linux: `apt install ffmpeg`）

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

### 关注管理

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_user_follow` | 关注 UP 主 | `uid` |
| `bilibili_user_unfollow` | 取消关注 | `uid` |
| `bilibili_user_followings` | 关注列表 | `uid`, `page?`, `pageSize?` |
| `bilibili_user_followers` | 粉丝列表 | `uid`, `page?`, `pageSize?` |

> 关注/取关操作会被 B 站风控监控，不建议短时间内大量操作。

### 弹幕

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_send_danmaku` | 发送弹幕 | `videoId`, `cid`, `progress`, `message`, `color?`, `mode?` |

> 弹幕发送是高风控操作，建议每天不超过 5 条。

### 下载

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_video_download` | 下载视频（需 ffmpeg） | `videoId`, `cid?`, `quality?`, `outputDir?` |
| `bilibili_article_download` | 下载专栏为 Markdown | `cvid`, `outputDir?`, `downloadImages?` |
| `bilibili_download_list` | 查看已下载列表 | `outputDir?` |

> 视频下载会自动下载 DASH 音视频并用 ffmpeg 合并为 mp4。默认保存到 `./bilibili-downloads/`。

### 消息通知

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_detect_replies` | 检测新回复 | `max?` |
| `bilibili_notifications` | 查看未读通知 | - |

### 直播

| 工具 | 功能 | 参数 |
|------|------|------|
| `bilibili_live_info` | 查询直播间信息 | `uid` |
| `bilibili_live_screenshot` | 截取直播间当前画面（视觉分析） | `uid` |

> `bilibili_live_screenshot` 会把关键帧截图作为图片返回给模型，让具备视觉能力的 AI 分析直播内容。如模型无视觉能力，仅返回文字元数据。

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
