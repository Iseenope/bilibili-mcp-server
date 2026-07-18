# Bilibili MCP Server 开发计划

## 📍 项目位置

```
C:\Working\bilibili-mcp-server\
```

## 🎯 项目目标

将现有的 Pi Agent B站扩展改造为独立的 MCP 服务，发布到国家超算互联网平台。

## 📊 当前状态

### ✅ 已完成
- [x] 原始源码已复制到 `src/api/*.original.ts`
- [x] 分析文档已整理到 `docs/`
- [x] 架构说明文档 (`ARCHITECTURE.md`)
- [x] 项目说明文档 (`README.md`)
- [x] 超算互联网账号已注册

### ⬜ 待开发
- [ ] 项目初始化（package.json, tsconfig.json）
- [ ] MCP Server 基础框架
- [ ] 迁移现有工具代码
- [ ] 补充新功能（搜索、视频详情、字幕等）
- [ ] 编写文档和示例
- [ ] 测试和优化
- [ ] 发布到 npm 和超算互联网

## 🏗️ 开发阶段

### 阶段一：项目初始化（0.5天）
```bash
# 创建 package.json
npm init -y

# 安装依赖
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node vitest

# 初始化 TypeScript
npx tsc --init
```

**产出**：
- [ ] package.json
- [ ] tsconfig.json
- [ ] .gitignore
- [ ] .env.example

### 阶段二：核心框架（1天）
**目标**：搭建 MCP Server 基础结构，迁移现有工具。

**文件结构**：
```
src/
├── index.ts           # 入口：创建 McpServer，注册所有工具
├── config.ts          # 配置管理（环境变量）
├── api/
│   ├── bilibili.ts    # B站 API 封装（从 original 迁移）
│   ├── wbi.ts         # WBI 签名
│   └── cookie.ts      # Cookie 管理 + 自动刷新
└── tools/
    ├── comment.ts     # 评论相关（reply/delete/like）
    ├── video.ts       # 视频相关（info/search/subtitle）
    ├── user.ts        # 用户相关（info/videos）
    └── message.ts     # 消息相关（detect_replies）
```

**任务**：
- [ ] 创建 `src/config.ts` — 环境变量配置
- [ ] 创建 `src/api/bilibili.ts` — 迁移 API 封装
- [ ] 创建 `src/api/wbi.ts` — 迁移 WBI 签名
- [ ] 创建 `src/api/cookie.ts` — 迁移 Cookie 管理
- [ ] 创建 `src/tools/comment.ts` — 迁移评论工具
- [ ] 创建 `src/tools/video.ts` — 迁移视频工具
- [ ] 创建 `src/tools/user.ts` — 迁移用户工具
- [ ] 创建 `src/tools/message.ts` — 迁移消息工具
- [ ] 创建 `src/index.ts` — 组装 MCP Server

### 阶段三：功能补充（2天）
**目标**：补充竞品有的核心功能。

- [ ] `bilibili_search` — 搜索视频（WBI签名）
- [ ] `bilibili_video_info` — 获取视频详情
- [ ] `bilibili_video_subtitle` — 获取字幕
- [ ] `bilibili_video_danmaku` — 获取弹幕
- [ ] `bilibili_user_info` — 获取用户信息

### 阶段四：完善优化（1天）
- [ ] 错误处理完善
- [ ] 日志记录（stderr，不影响 stdio）
- [ ] 参数校验
- [ ] 单元测试

### 阶段五：文档发布（1.5天）
- [ ] README.md（中英文双语）
- [ ] 使用示例
- [ ] 配置说明
- [ ] 发布到 npm
- [ ] 提交超算互联网审核

**总计：约 6 天**

## 🔧 技术栈

- **Runtime**: Node.js 18+
- **Language**: TypeScript 5.x
- **MCP SDK**: @modelcontextprotocol/sdk
- **Schema**: zod
- **Transport**: stdio
- **Test**: vitest

## 📝 工具清单

### 已有（迁移）
| 工具 | 功能 | 文件 |
|------|------|------|
| `bilibili_reply` | 发评论/回复 | tools/comment.ts |
| `bilibili_delete_comment` | 删除评论 | tools/comment.ts |
| `bilibili_like_comment` | 点赞/取消赞 | tools/comment.ts |
| `bilibili_user_videos` | UP主视频列表 | tools/user.ts |
| `bilibili_video_comments` | 获取评论列表 | tools/video.ts |
| `bilibili_detect_replies` | 检测新回复 | tools/message.ts |
| `bilibili_refresh_cookie` | Cookie刷新 | (内部自动) |

### 新增
| 工具 | 功能 | 优先级 |
|------|------|:------:|
| `bilibili_search` | 搜索视频 | ⭐⭐⭐⭐⭐ |
| `bilibili_video_info` | 视频详情 | ⭐⭐⭐⭐⭐ |
| `bilibili_video_subtitle` | 获取字幕 | ⭐⭐⭐⭐ |
| `bilibili_video_danmaku` | 获取弹幕 | ⭐⭐⭐ |
| `bilibili_user_info` | 用户信息 | ⭐⭐⭐ |

## 🚀 发布计划

### npm
- 包名：`bilibili-mcp-server`
- 协议：MIT
- 安装：`npx bilibili-mcp-server`

### 超算互联网
- 类别：MCP 服务
- 身份：智能体开发伙伴
- 链接：https://www.scnet.cn/ui/aihub/mcp/create

## 📞 协作说明

### 给其他 agent 的指引

1. **阅读文档**：
   - `README.md` — 项目总览
   - `ARCHITECTURE.md` — 架构说明和迁移指南
   - `docs/` — 分析文档

2. **参考代码**：
   - `src/api/*.original.ts` — 原始实现（只读参考）

3. **开发规范**：
   - TypeScript strict mode
   - zod 做参数校验
   - 所有 API 请求绕过代理（noProxyFetch）
   - 错误处理完善，返回友好信息

4. **测试**：
   - 修改后运行 `npm test`
   - 确保 MCP 工具列表正确
   - 验证各工具功能

## 📋 下一步

**立即可做**：
1. 初始化项目（package.json, tsconfig.json）
2. 创建基础框架（config.ts, api/bilibili.ts）
3. 迁移第一个工具（如 bilibili_reply）

**验证点**：
- MCP Server 能启动
- 工具列表正确
- 单个工具能调用成功

---

*创建时间：2026-07-18*
*负责人：小月 + 协作 agents*
