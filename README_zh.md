# Bilibili MCP Server

[![CI](https://github.com/Iseenope/bilibili-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Iseenope/bilibili-mcp-server/actions/workflows/ci.yml)

[中文](./README_zh.md) | [English](./README.md)

一个基于 Model Context Protocol (MCP) 的 B站 服务封装，让 AI 助手能够直接操作 B站 的评论管理、视频搜索、弹幕字幕获取、用户信息查询、动态专栏、二维码登录等核心功能。

## 功能特色

**✓ 22 个工具** 覆盖 B站 完整交互链路：

| 类别 | 工具 | 数量 |
|:----:|------|:----:|
| 💬 评论 | `bilibili_reply` 发评论、`bilibili_delete_comment` 删评论、`bilibili_like_comment` 点赞/取消赞 | 3 |
| 🔍 搜索 | `bilibili_search` 视频搜索、`bilibili_search_hot` 热搜 | 2 |
| 📺 视频 | `bilibili_video_info` 视频详情、`bilibili_video_comments` 评论列表、`bilibili_video_subtitle` 字幕、`bilibili_video_danmaku` 弹幕、`bilibili_hot` 热门 | 5 |
| 👤 用户 | `bilibili_user_info` 用户信息、`bilibili_user_videos` UP主视频、`bilibili_user_favorites` 收藏夹 | 3 |
| 📰 内容 | `bilibili_user_dynamics` UP主动态、`bilibili_article_info` 专栏详情、`bilibili_user_articles` UP主专栏 | 3 |
| 🔔 消息 | `bilibili_detect_replies` 检测新回复、`bilibili_notifications` 消息通知 | 2 |
| 🎥 直播 | `bilibili_live_info` 直播信息查询（状态/标题/在线人数） | 1 |
| 🔑 登录 | `bilibili_login` 生成登录二维码、`bilibili_login_check` 轮询扫码状态 | 2 |
| 🔄 系统 | `bilibili_refresh_cookie` Cookie 刷新 | 1 |

**✓ 核心差异化优势：**
- **Cookie 自动刷新** — 完整 6 步流程（检查→RSA→取csrf→刷新→确认→SSO），竞品全都不支持
- **完整 WBI 签名** — 按官方规范实现，不依赖第三方库
- **二维码扫码登录** — 无需手动从浏览器复制 Cookie
- **自适应限流** — 遇到 -509 自动降速
- **智能重试** — 只重试网络错误，不掩盖编程 bug
- **检测回复** — 状态持久化，重启后继续

## 快速开始

### 环境要求

- Node.js 18+
- B站 账号（用于需要登录的操作）

### 安装

```bash
# 直接运行（无需安装）
npx bilibili-mcp-server

# 或全局安装
npm install -g bilibili-mcp-server
bilibili-mcp-server
```

### 配置

支持两种方式：**环境变量** 或 **项目目录下的 `.env` 文件**

```bash
# 必填 - 从浏览器开发者工具 → Application → Cookies → bilibili.com 获取
export BILIBILI_SESSDATA=你的sessdata
export BILIBILI_BILI_JCT=你的bili_jct
export BILIBILI_DEDE_USER_ID=你的uid

# 可选 - Cookie 自动刷新（推荐）
# 获取方式: bilibili.com → F12 → Console → 输入:
#   console.log(localStorage.getItem('ac_time_value'))
export BILIBILI_REFRESH_TOKEN=你的refresh_token

# 可选 - 完整 Cookie（让热搜等功能更稳定）
# 把浏览器中 bilibili.com 域下的所有 Cookie 合并为一行设置
# export BILIBILI_FULL_COOKIE="buvid3=xxx; buvid4=xxx; _uuid=xxx; ..."

# 可选 - 其他
export BILIBILI_AUTO_REFRESH=true         # 自动刷新 Cookie（默认开启）
export BILIBILI_COOKIE_FILE=/path/to/cookie.json  # Cookie 持久化文件
export BILIBILI_DETECT_FILE=/path/to/detect.json  # 检测回复状态文件
```

### MCP 客户端配置

在 MCP 客户端（Claude Desktop、Cursor、CodeBuddy 等）配置文件中添加：

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

### 不用手动配 Cookie？试试扫码登录

如果不想从浏览器复制 Cookie，可以调用扫码登录工具：

```
1. AI 调用 bilibili_login
2. 返回 B站 二维码 URL
3. 用户用手机 B站 App 扫描
4. AI 调用的 bilibili_login_check 检测登录状态
5. 登录成功后 Cookie 自动保存
```

## 工具参考

### 登录与认证

| 工具 | 功能 | 主要参数 |
|------|------|----------|
| `bilibili_login` | 生成扫码登录二维码 | (无) |
| `bilibili_login_check` | 轮询扫码状态，登录成功自动保存 | `loginKey`, `maxRetries?` |
| `bilibili_refresh_cookie` | 手动触发 Cookie 刷新 | (无) |

### 评论管理

| 工具 | 功能 | 主要参数 |
|------|------|----------|
| `bilibili_reply` | 发布评论或回复 | `videoId`, `message`, `parentRpid?` |
| `bilibili_delete_comment` | 删除自己的评论 | `videoId`, `rpid` |
| `bilibili_like_comment` | 点赞/取消赞 | `videoId`, `rpid`, `action`(1=赞/0=取消) |

### 视频与搜索

| 工具 | 功能 | 主要参数 |
|------|------|----------|
| `bilibili_search` | 搜索视频 | `keyword`, `order?`, `page?`, `duration?` |
| `bilibili_video_info` | 视频详情 | `videoId` (BV/AV号) |
| `bilibili_video_comments` | 获取评论列表 | `videoId`, `max?` |
| `bilibili_video_subtitle` | 获取字幕 | `videoId`, `lang?` |
| `bilibili_video_danmaku` | 获取弹幕 | `videoId`, `segment?` |
| `bilibili_hot` | 热门视频 | `page?`, `max?` |
| `bilibili_search_hot` | 热搜关键词 | (无) |

### 用户

| 工具 | 功能 | 主要参数 |
|------|------|----------|
| `bilibili_user_info` | 用户信息 | `uid` |
| `bilibili_user_videos` | UP主视频列表 | `uid`, `max?` |
| `bilibili_user_favorites` | 收藏夹 | `uid`, `folderId?`, `max?` |

### 动态与专栏

| 工具 | 功能 | 主要参数 |
|------|------|----------|
| `bilibili_user_dynamics` | UP主最新动态 | `uid`, `max?` |
| `bilibili_article_info` | 专栏文章详情 | `cvid` |
| `bilibili_user_articles` | UP主专栏列表 | `uid`, `max?` |

### 消息通知

| 工具 | 功能 | 主要参数 |
|------|------|----------|
| `bilibili_detect_replies` | 检测新回复 | `max?` |
| `bilibili_notifications` | 查看未读通知 | (无) |

### 直播

| 工具 | 功能 | 主要参数 |
|------|------|----------|
| `bilibili_live_info` | 查询直播间信息（状态/标题/在线人数/分类） | `uid` |

## 项目架构

```
src/
├── index.ts           # MCP Server 入口
├── env.ts             # .env 自动加载
├── config.ts          # 环境变量配置管理
├── api/
│   ├── http.ts        # 共享 HTTP 工具（noProxyFetch、isRetryableError）
│   ├── bilibili.ts    # B站 HTTP 客户端（自适应限流、智能重试）
│   ├── wbi.ts         # WBI 签名模块（含缓存、代理绕过）
│   ├── cookie.ts      # Cookie 刷新（6步完整流程）
│   └── login.ts       # 二维码扫码登录
├── tools/
│   ├── comment.ts     # 评论工具 (3)
│   ├── video.ts       # 视频/搜索工具 (7)
│   ├── user.ts        # 用户/收藏夹工具 (3)
│   ├── content.ts     # 动态/专栏工具 (3)
│   ├── message.ts     # 消息/通知工具 (3)
│   ├── login.ts       # 登录工具 (2)
│   └── live.ts        # 直播工具 (1)
└── types/
    └── index.ts       # TypeScript 类型定义
```

## 开发

```bash
# 克隆并安装
git clone https://github.com/你的用户名/bilibili-mcp-server
cd bilibili-mcp-server
npm install

# 开发模式运行
npm run dev

# 构建
npm run build

# 运行测试
npm test

# Docker 部署
docker build -t bilibili-mcp-server .
docker run --env-file .env bilibili-mcp-server
```

## 为什么选择这个服务？

| 特性 | 本项目 | 竞品 |
|------|--------|------|
| Cookie 自动刷新 | ✅ 6 步完整流程 | ❌ 全部不支持 |
| WBI 签名 | ✅ 手动实现，规范 | ⚠️ 依赖 SDK 或缺失 |
| 二维码扫码登录 | ✅ 支持 | ❌ 仅手动复制 |
| 检测回复 | ✅ 状态持久化 | ❌ |
| 自适应限流 | ✅ 遇 -509 自动降速 | ❌ |
| 智能重试 | ✅ 仅网络错误 | ⚠️ 所有异常 |
| 工具数量 | 22 个 | 4-27 个 |
| 开发语言 | TypeScript (ESM) | 大部分是 Python |
| 平台支持 | 所有 MCP 客户端 | 相同 |

## 许可证

MIT

## 相关链接

- [国家超算互联网](https://www.scnet.cn)
- [MCP 协议](https://modelcontextprotocol.io)
