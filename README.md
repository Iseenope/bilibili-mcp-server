# Bilibili MCP Server

[![CI](https://github.com/Iseenope/bilibili-mcp-server/actions/workflows/ci.yml/badge.svg)](https://github.com/Iseenope/bilibili-mcp-server/actions/workflows/ci.yml)

[中文](./README_zh.md) | [English](./README.md)

A Model Context Protocol (MCP) server for Bilibili (B站), enabling AI assistants to interact with Bilibili's content management ecosystem — comments, search, video info, subtitles, danmaku, user data, dynamic feed, articles, and more.

## Features

**✓ 22 Tools** covering the full Bilibili interaction lifecycle:

| Category | Tools | Count |
|----------|-------|:-----:|
| 💬 Comments | `bilibili_reply`, `bilibili_delete_comment`, `bilibili_like_comment` | 3 |
| 🔍 Search | `bilibili_search`, `bilibili_search_hot` | 2 |
| 📺 Video | `bilibili_video_info`, `bilibili_video_comments`, `bilibili_video_subtitle`, `bilibili_video_danmaku`, `bilibili_hot` | 5 |
| 👤 User | `bilibili_user_info`, `bilibili_user_videos`, `bilibili_user_favorites` | 3 |
| 📰 Content | `bilibili_user_dynamics`, `bilibili_article_info`, `bilibili_user_articles` | 3 |
| 🔔 Message | `bilibili_detect_replies`, `bilibili_notifications` | 2 |
| 🎥 Live | `bilibili_live_info` live streaming info (status/title/viewers) | 1 |
| 🔑 Login | `bilibili_login`, `bilibili_login_check` | 2 |
| 🔄 System | `bilibili_refresh_cookie` | 1 |

**✓ Unique Differentiators:**
- **Cookie Auto-Refresh** — Complete 6-step refresh flow (vs. competitors' manual refresh).
- **Complete WBI Signature** — Handles Bilibili's anti-scraping mechanism with proper encoding.
- **QR Code Login** — Two-step scan-and-confirm login flow.
- **Adaptive Rate Limiting** — Auto-throttles on -509 (rate limit) errors.
- **Smart Retry** — Only retries on network errors, never on programming bugs.
- **Reply Detection** — Persistent state across restarts.

## Quick Start

### Requirements

- Node.js 18+
- A Bilibili account (for authenticated operations)

### Installation

```bash
# Run directly (no install needed)
npx bilibili-mcp-server

# Or install globally
npm install -g bilibili-mcp-server
bilibili-mcp-server
```

### Configuration

You can configure via environment variables OR by placing a `.env` file in the project directory.

```bash
# Required - Get from browser DevTools → Application → Cookies → bilibili.com
export BILIBILI_SESSDATA=your_sessdata
export BILIBILI_BILI_JCT=your_bili_jct
export BILIBILI_DEDE_USER_ID=your_uid

# Optional - Cookie auto-refresh (recommended)
# Get it: bilibili.com → F12 → Console → run:
#   console.log(localStorage.getItem('ac_time_value'))
export BILIBILI_REFRESH_TOKEN=your_refresh_token

# Optional - Full cookie string (for features like trending searches)
# Merge all cookies from bilibili.com domain into one line
# export BILIBILI_FULL_COOKIE="buvid3=xxx; buvid4=xxx; _uuid=xxx; ..."

# Optional - Other
export BILIBILI_AUTO_REFRESH=true        # Auto-refresh cookies (default: true)
export BILIBILI_COOKIE_FILE=/path/to/cookie.json  # Cookie persistence file
export BILIBILI_DETECT_FILE=/path/to/detect.json   # Reply detection state file
```

### MCP Client Configuration

Add to your MCP client config (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "bilibili": {
      "command": "npx",
      "args": ["-y", "bilibili-mcp-server"],
      "env": {
        "BILIBILI_SESSDATA": "your_sessdata",
        "BILIBILI_BILI_JCT": "your_bili_jct",
        "BILIBILI_DEDE_USER_ID": "your_uid"
      }
    }
  }
}
```

### No Cookies? Try QR Scan-to-Login

If you don't want to manually copy cookies from the browser, use the built-in QR login flow:

```
1. AI calls bilibili_login → returns QR code URL
2. User scans the QR code with mobile Bilibili App
3. AI calls bilibili_login_check to poll login status
4. On success, cookies are automatically saved
```

## Tool Reference

### Login & Authentication

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `bilibili_login` | Generate QR code for scan-to-login | (none) |
| `bilibili_login_check` | Poll QR login status, auto-save Cookie | `loginKey`, `maxRetries?` |
| `bilibili_refresh_cookie` | Manually trigger cookie refresh | (none) |

### Comment Management

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `bilibili_reply` | Post a comment or reply | `videoId`, `message`, `parentRpid?` |
| `bilibili_delete_comment` | Delete your comment | `videoId`, `rpid` |
| `bilibili_like_comment` | Like/unlike a comment | `videoId`, `rpid`, `action`(1=like/0=unlike) |

### Video & Search

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `bilibili_search` | Search videos | `keyword`, `order?`, `page?`, `duration?` |
| `bilibili_video_info` | Get video details | `videoId` (BV/AV) |
| `bilibili_video_comments` | Get video comments | `videoId`, `max?` |
| `bilibili_video_subtitle` | Get video subtitles | `videoId`, `lang?` |
| `bilibili_video_danmaku` | Get danmaku (bullet comments) | `videoId`, `segment?` |
| `bilibili_hot` | Trending videos | `page?`, `max?` |
| `bilibili_search_hot` | Trending search keywords | (none) |

### User

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `bilibili_user_info` | Get user profile | `uid` |
| `bilibili_user_videos` | Get user's video list | `uid`, `max?` |
| `bilibili_user_favorites` | Get favorites/folders | `uid`, `folderId?`, `max?` |

### Content (Dynamic & Articles)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `bilibili_user_dynamics` | Get user's dynamic feed | `uid`, `max?` |
| `bilibili_article_info` | Get article details | `cvid` |
| `bilibili_user_articles` | Get user's article list | `uid`, `max?` |

### Notifications

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `bilibili_detect_replies` | Detect new replies (persistent) | `max?` |
| `bilibili_notifications` | View unread notifications overview | (none) |

### Live Streaming

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `bilibili_live_info` | Query live room info (status/title/viewers/category) | `uid` |

## Architecture

```
src/
├── index.ts           # MCP Server entry point
├── env.ts             # .env auto-loader
├── config.ts          # Environment config management
├── api/
│   ├── http.ts        # Shared HTTP utilities (noProxyFetch, isRetryableError)
│   ├── bilibili.ts    # B站 API client (rate-limited, smart-retry)
│   ├── wbi.ts         # WBI signature (cached, noProxyFetch)
│   ├── cookie.ts      # Cookie refresh (6-step flow, noProxyFetch)
│   ├── login.ts       # QR code login (noProxyFetch)
├── tools/
│   ├── comment.ts     # Comment tools (3)
│   ├── video.ts       # Video/search tools (5+2)
│   ├── user.ts        # User/favorites tools (3)
│   ├── content.ts     # Dynamic/article tools (3)
│   ├── message.ts     # Message/notification tools (3)
│   ├── login.ts       # Login tools (2)
│   └── live.ts        # Live streaming tools (1)
└── types/
    └── index.ts       # TypeScript type definitions
```

## Development

```bash
# Clone & install
git clone https://github.com/yourusername/bilibili-mcp-server
cd bilibili-mcp-server
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## Why This Server?

| Feature | Us | Competitors |
|---------|----|-------------|
| Cookie Auto-Refresh | ✅ Complete 6-step | ❌ None |
| WBI Signature | ✅ Manual, no SDK | ⚠️ Via SDK or absent |
| QR Code Login | ✅ Scan-to-login | ❌ Cookie copy only |
| Reply Detection | ✅ Persistent state | ❌ |
| Rate Limiting | ✅ Adaptive (auto-throttle) | ❌ |
| Smart Retry | ✅ Network errors only | ⚠️ All errors |
| Tool Count | 22 | 4-27 |
| Language | TypeScript (ESM) | Mostly Python |
| Platform Support | All MCP clients | Same |

## License

MIT

## Links

- [National Supercomputing Internet (超算互联网)](https://www.scnet.cn)
- [MCP Protocol](https://modelcontextprotocol.io)
