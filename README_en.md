# Bilibili MCP Server

[English](./README_en.md) | [中文](./README.md)

Model Context Protocol server for Bilibili. Provides video search, comments, danmaku, subtitles, user info, articles, QR login, live screenshot with vision analysis, and more. 31 tools total.

## Tools

| Category | Tools | Count |
|----------|-------|:-----:|
| Comments | `bilibili_reply`, `bilibili_delete_comment`, `bilibili_like_comment` | 3 |
| Search | `bilibili_search`, `bilibili_search_hot` | 2 |
| Video | `bilibili_video_info`, `bilibili_video_comments`, `bilibili_video_subtitle`, `bilibili_video_danmaku`, `bilibili_hot` | 5 |
| User | `bilibili_user_info`, `bilibili_user_videos`, `bilibili_user_favorites`, `bilibili_user_follow`, `bilibili_user_unfollow`, `bilibili_user_followings`, `bilibili_user_followers` | 7 |
| Content | `bilibili_user_dynamics`, `bilibili_article_info`, `bilibili_user_articles` | 3 |
| Message | `bilibili_detect_replies`, `bilibili_notifications` | 2 |
| Live | `bilibili_live_info`, `bilibili_live_screenshot` | 2 |
| Login | `bilibili_login`, `bilibili_login_check` | 2 |
| System | `bilibili_refresh_cookie` | 1 |
| Download | `bilibili_video_download`, `bilibili_article_download`, `bilibili_download_list` | 3 |
| Danmaku | `bilibili_send_danmaku` | 1 |

## Quick Start

### Requirements

- Node.js 22+
- A Bilibili account (for authenticated operations)
- ffmpeg (**only** for video download tool; macOS: `brew install ffmpeg`, Windows: `choco install ffmpeg`, Linux: `apt install ffmpeg`)

### Installation

```bash
# Run directly
npx bilibili-mcp-server

# Or install globally
npm install -g bilibili-mcp-server
bilibili-mcp-server
```

### Configuration

Configure via environment variables or a `.env` file:

```bash
# Required
export BILIBILI_SESSDATA=your_sessdata
export BILIBILI_BILI_JCT=your_bili_jct
export BILIBILI_DEDE_USER_ID=your_uid

# Optional - Cookie auto-refresh
# bilibili.com → F12 → Console:
#   console.log(localStorage.getItem('ac_time_value'))
export BILIBILI_REFRESH_TOKEN=your_refresh_token

# Optional - Full cookie string (for trending searches)
# export BILIBILI_FULL_COOKIE="buvid3=xxx; buvid4=xxx; _uuid=xxx; ..."

# Optional
export BILIBILI_AUTO_REFRESH=true
export BILIBILI_COOKIE_FILE=/path/to/cookie.json
export BILIBILI_DETECT_FILE=/path/to/detect.json
```

### MCP Client Configuration

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

### QR Login

1. Call `bilibili_login` to get a QR code
2. Scan with Bilibili mobile app
3. Call `bilibili_login_check` to poll status
4. Cookies are saved automatically on success

## Tool Reference

### Login & Authentication

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_login` | Generate QR code for login | - |
| `bilibili_login_check` | Poll QR login status | `loginKey`, `maxRetries?` |
| `bilibili_refresh_cookie` | Manually refresh cookies | - |

### Comment Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_reply` | Post a comment or reply | `videoId`, `message`, `parentRpid?` |
| `bilibili_delete_comment` | Delete your comment | `videoId`, `rpid` |
| `bilibili_like_comment` | Like/unlike a comment | `videoId`, `rpid`, `action` |

### Video & Search

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_search` | Search videos | `keyword`, `order?`, `page?`, `duration?` |
| `bilibili_video_info` | Get video details | `videoId` |
| `bilibili_video_comments` | Get video comments | `videoId`, `max?` |
| `bilibili_video_subtitle` | Get subtitles | `videoId`, `lang?` |
| `bilibili_video_danmaku` | Get danmaku | `videoId`, `segment?` |
| `bilibili_hot` | Trending videos | `page?`, `max?` |
| `bilibili_search_hot` | Trending search keywords | - |

### User

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_user_info` | Get user profile | `uid` |
| `bilibili_user_videos` | Get user's video list | `uid`, `max?` |
| `bilibili_user_favorites` | Get favorites/folders | `uid`, `folderId?`, `max?` |

### Content (Dynamics & Articles)

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_user_dynamics` | Get user's dynamic feed | `uid`, `max?` |
| `bilibili_article_info` | Get article details | `cvid` |
| `bilibili_user_articles` | Get user's article list | `uid`, `max?` |

### Notifications

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_detect_replies` | Detect new replies | `max?` |
| `bilibili_notifications` | View unread notifications | - |

### Follow Management

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_user_follow` | Follow a user | `uid` |
| `bilibili_user_unfollow` | Unfollow a user | `uid` |
| `bilibili_user_followings` | List followed users | `uid`, `page?`, `pageSize?` |
| `bilibili_user_followers` | List followers | `uid`, `page?`, `pageSize?` |

> Follow/unfollow operations are subject to B 站 risk control. Avoid bulk operations in short periods.

### Danmaku

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_send_danmaku` | Send a danmaku | `videoId`, `cid`, `progress`, `message`, `color?`, `mode?` |

> Danmaku sending is high-risk for account ban. Limit to ≤ 5 per day.

### Download

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_video_download` | Download video (requires ffmpeg) | `videoId`, `cid?`, `quality?`, `outputDir?` |
| `bilibili_article_download` | Download article as Markdown | `cvid`, `outputDir?`, `downloadImages?` |
| `bilibili_download_list` | List downloaded files | `outputDir?` |

> Video download auto-merges DASH video+audio into mp4 via ffmpeg. Default output: `./bilibili-downloads/`.

### Live Streaming

| Tool | Description | Parameters |
|------|-------------|------------|
| `bilibili_live_info` | Query live room info | `uid` |
| `bilibili_live_screenshot` | Capture current live frame (vision analysis) | `uid` |

> `bilibili_live_screenshot` returns the current keyframe as an image so vision-capable models can analyze the live content. Models without vision will only see text metadata.

## Architecture

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

## Development

```bash
npm install
npm run dev
npm run build
npm test
```

## License

MIT
