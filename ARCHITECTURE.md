# 架构说明 & 迁移指南

> 本文档供协作 agent 参考，理解现有代码结构和迁移方向。

---

## 1. 现有代码概览

### 1.1 bilibili-api.original.ts (447行)

**功能**：B站后台操作工具集，通过 B站 API 直接执行操作。

**核心模块**：

```
┌─────────────────────────────────────────────────────────┐
│ bilibili-api.ts                                         │
├─────────────────────────────────────────────────────────┤
│ 配置层                                                   │
│  - COOKIE_FILE: Cookie 文件路径                          │
│  - API_BASE: https://api.bilibili.com                   │
│  - REQUEST_TIMEOUT: 15秒                                │
├─────────────────────────────────────────────────────────┤
│ Cookie 管理                                              │
│  - getCookie(): 从文件读取或返回硬编码默认值              │
├─────────────────────────────────────────────────────────┤
│ 网络层                                                   │
│  - _noProxyFetch(): 绕过代理直连（启动时清除代理环境变量）│
│  - getHeaders(): 构造请求头（Cookie + Referer + UA）     │
│  - apiPost(): POST 请求，含 Cookie 过期自动续期逻辑      │
├─────────────────────────────────────────────────────────┤
│ WBI 签名（反爬）                                         │
│  - mixinKeyEncTab: 64位混淆表                            │
│  - getMixinKey(): 从 img_key + sub_key 生成 mixin_key   │
│  - getWbiMixin(): 获取并缓存 WBI 密钥（1小时）           │
│  - signWbi(): 对参数签名，返回 w_rid                     │
│  - wbiGet(): 带签名的 GET 请求                           │
├─────────────────────────────────────────────────────────┤
│ 工具注册（Pi Agent 格式）                                │
│  - bilibili_reply: 发评论/回复                           │
│  - bilibili_delete_comment: 删除评论                     │
│  - bilibili_like_comment: 点赞/取消赞                    │
│  - bilibili_user_videos: 获取UP主视频列表（WBI签名）     │
│  - bilibili_video_comments: 获取视频评论列表             │
│  - bilibili_detect_replies: 检测新回复（状态持久化）     │
└─────────────────────────────────────────────────────────┘
```

**关键 API 端点**：

| 端点 | 方法 | 用途 |
|------|:----:|------|
| `/x/v2/reply/add` | POST | 发评论 |
| `/x/v2/reply/del` | POST | 删评论 |
| `/x/v2/reply/action` | POST | 点赞/取消赞 |
| `/x/v2/reply/main` | GET | 获取评论列表 |
| `/x/space/wbi/arc/search` | GET(WBI) | 获取UP主视频列表 |
| `/x/web-interface/nav` | GET | 检查登录状态 / 获取WBI密钥 |
| `/x/msgfeed/reply` | GET | 获取回复消息 |
| `/x/msgfeed/at` | GET | 获取@消息 |

**Cookie 过期处理**（apiPost 内）：
```
收到 code=-101（未登录）→ 
  尝试 /x/passport-login/web/sso/refresh → 
  用 refresh_token 续期 → 
  重试原请求
```

### 1.2 bilibili-cookie.original.ts (242行)

**功能**：Cookie 自动刷新独立工具。

**刷新流程**：
```
1. 检查 Cookie 状态 → /x/web-interface/nav
   ├─ code=0 → 有效，返回
   └─ code≠0 → 继续
   
2. 检查是否需要刷新 → /x/passport-login/web/cookie/info
   ├─ refresh=false → 仍有效，返回
   └─ refresh=true → 继续
   
3. RSA 加密生成 correspondPath
   - 公钥: BILI_RSA_PK（固定）
   - 明文: "refresh_" + timestamp
   - 算法: RSA-OAEP + SHA256
   
4. 获取 refresh_csrf → POST /x/passport-login/web/sso/refresh
   - 参数: refresh_token + correspondPath
   
5. 执行刷新 → POST /x/passport-login/web/cookie/refresh
   - 参数: refresh_csrf + correspondPath
   
6. 提取新 Cookie（sessdata, bili_jct）

7. 验证新 Cookie → /x/web-interface/nav

8. 保存到文件
```

**关键常量**：
- `REFRESH_TOKEN`: "9a8e112df878e64250b621da60705d51"（硬编码）
- `BILI_RSA_PK`: B站 RSA 公钥（固定，用于加密 correspondPath）
- `COOKIE_FILE`: "/f/Working/websearch/data/bilibili-cookie.json"

---

## 2. 迁移目标：MCP 标准格式

### 2.1 从 Pi Agent 到 MCP 的转换

**Pi Agent 格式**（当前）：
```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "bilibili_reply",
    parameters: Type.Object({ ... }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: "..." }] };
    },
  });
}
```

**MCP 标准格式**（目标）：
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const server = new McpServer({ name: "bilibili-mcp-server", version: "1.0.0" });

server.tool(
  "bilibili_reply",
  "在 B站视频/动态/专栏下发评论或回复",
  {
    videoId: z.string().describe("视频 BV 号或 avid"),
    message: z.string().max(1000).describe("评论内容"),
    parentRpid: z.string().optional().describe("要回复的评论 rpid"),
    // ...
  },
  async (params) => {
    // ... 业务逻辑
    return { content: [{ type: "text", text: "..." }] };
  }
);
```

### 2.2 关键差异

| 维度 | Pi Agent | MCP 标准 |
|------|----------|----------|
| Schema 库 | typebox (Type.Object) | zod (z.object) |
| 注册方式 | pi.registerTool() | server.tool() |
| 入口 | export default function | new McpServer() + stdio |
| 参数描述 | Type.String({description}) | z.string().describe() |
| 返回值 | { content, details } | { content } |
| 配置 | 硬编码/文件 | 环境变量 |

### 2.3 配置方式改造

**当前**：硬编码 Cookie 或从文件读取
```typescript
var COOKIE_FILE = "/f/Working/websearch/data/bilibili-cookie.json";
```

**目标**：环境变量 + 可选文件
```typescript
interface Config {
  sessdata?: string;        // env: BILIBILI_SESSDATA
  bili_jct?: string;        // env: BILIBILI_BILI_JCT
  dede_user_id?: string;    // env: BILIBILI_DEDE_USER_ID
  cookie_file?: string;     // env: BILIBILI_COOKIE_FILE
  refresh_token?: string;   // env: BILIBILI_REFRESH_TOKEN
  auto_refresh?: boolean;   // env: BILIBILI_AUTO_REFRESH (default: true)
}
```

---

## 3. 新增功能的 API 参考

### 3.1 搜索视频
```
GET https://api.bilibili.com/x/web-interface/wbi/search/type
参数: search_type=video, keyword, page, page_size, order (综合/最新/播放/弹幕)
需要 WBI 签名
```

### 3.2 获取视频详情
```
GET https://api.bilibili.com/x/web-interface/view
参数: bvid=xxx 或 aid=xxx
返回: title, desc, stat(view/danmaku/reply/favorite/coin/share/like)
```

### 3.3 获取视频字幕
```
GET https://api.bilibili.com/x/player/wbi/v2
参数: bvid, cid
返回: subtitle.subtitles[].subtitle_url (JSON 格式字幕)
```

### 3.4 获取弹幕
```
GET https://api.bilibili.com/x/v1/dm/list.so
参数: oid (cid)
返回: XML 格式弹幕列表
```

### 3.5 获取用户信息
```
GET https://api.bilibili.com/x/space/wbi/acc/info
参数: mid (UID)
需要 WBI 签名
返回: name, sign, level, follower, following
```

---

## 4. 开发规范

### 4.1 代码风格
- TypeScript strict mode
- 使用 `var` 或 `const`，保持一致（原代码用 `var`）
- 错误处理：所有 API 调用 try-catch，返回友好错误信息
- 日志：console.error 用于调试，不影响 stdout（MCP 用 stdio 通信）

### 4.2 网络请求
- **必须绕过代理**：B站 API 直连，不走 HTTP_PROXY
- **超时**：15秒
- **User-Agent**：模拟浏览器
- **Referer**：https://www.bilibili.com

### 4.3 错误码映射
```typescript
const ERROR_MAP: Record<number, string> = {
  "-101": "未登录/Cookie过期",
  "-111": "CSRF校验失败",
  "-509": "请求过于频繁",
  "12002": "评论区已关闭",
  "12016": "包含敏感词",
};
```

---

## 5. 测试策略

### 5.1 单元测试
- Mock fetch 响应
- 测试 WBI 签名逻辑
- 测试 Cookie 刷新流程

### 5.2 集成测试
- 使用真实 Cookie（环境变量传入）
- 测试各 API 端点
- 验证错误处理

### 5.3 MCP 兼容性测试
- Claude Desktop 连接测试
- Cursor 连接测试
- 验证 tool 列表和调用

---

## 6. 发布清单

- [ ] npm 包发布（`bilibili-mcp-server`）
- [ ] GitHub 仓库（开源，MIT 协议）
- [ ] README.md（中英文）
- [ ] 使用示例
- [ ] 超算互联网上架申请
- [ ] 演示视频/截图

---

*最后更新: 2026-07-18*
