#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadEnvFile } from './env.js';
import { loadConfig } from './config.js';
import { noProxyFetch } from './api/http.js';
import { registerCommentTools } from './tools/comment.js';
import { registerVideoTools } from './tools/video.js';
import { registerUserTools } from './tools/user.js';
import { registerMessageTools } from './tools/message.js';
import { registerLoginTools } from './tools/login.js';
import { registerContentTools } from './tools/content.js';
import { registerLiveTools } from './tools/live.js';
import { registerFollowTools } from './tools/follow.js';
import { registerInteractionTools } from './tools/interaction.js';
import { registerDownloadTools } from './tools/download.js';

// ─── 启动前加载 .env ─────────────────────────────────────

loadEnvFile();

// ─── 启动信息 ─────────────────────────────────────────────

const pkg = {
  name: 'bilibili-mcp-server',
  version: '1.0.0',
};

console.error(`[bilibili-mcp] Starting ${pkg.name} v${pkg.version}...`);

// ─── Cookie 有效性启动检查 ──────────────────────────────

async function checkCookieValidity(): Promise<void> {
  const config = loadConfig();
  if (!config.sessdata) {
    console.error('[bilibili-mcp] ⚠️ 未设置 BILIBILI_SESSDATA，部分功能不可用');
    return;
  }

  try {
    const resp = await noProxyFetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://www.bilibili.com',
        Cookie: `SESSDATA=${config.sessdata}; bili_jct=${config.bili_jct}`,
      },
      signal: AbortSignal.timeout(5_000),
    });
    const json = (await resp.json()) as { code: number; data?: { uname?: string } };
    if (json.code === 0) {
      console.error(`[bilibili-mcp] ✅ Cookie 有效，用户: ${json.data?.uname || '?'}`);
    } else if (json.code === -101) {
      console.error('[bilibili-mcp] ⚠️ Cookie 已过期，请更新或刷新后重试');
      if (config.refreshToken) {
        console.error('[bilibili-mcp]   已设置 REFRESH_TOKEN，可调用 bilibili_refresh_cookie 尝试自动刷新');
      } else {
        console.error('[bilibili-mcp]   未设置 REFRESH_TOKEN，自动刷新不可用');
        console.error('[bilibili-mcp]   选项 1: 浏览器 F12 → Console → localStorage.getItem(\'ac_time_value\') → 设置 BILIBILI_REFRESH_TOKEN');
        console.error('[bilibili-mcp]   选项 2: 调用 bilibili_login + bilibili_login_check 扫码重新登录（更简单）');
      }
    } else {
      console.error(`[bilibili-mcp] ⚠️ Cookie 验证异常: code=${json.code}`);
    }
  } catch {
    console.error('[bilibili-mcp] ⚠️ 无法验证 Cookie（网络问题），启动后重试');
  }
}

// ─── 创建 MCP Server ─────────────────────────────────────

const server = new McpServer(
  {
    name: pkg.name,
    version: pkg.version,
  },
  {
    capabilities: {
      logging: {},
    },
  }
);

// ─── 注册所有工具 ─────────────────────────────────────────

registerCommentTools(server);
registerVideoTools(server);
registerUserTools(server);
registerMessageTools(server);
registerLoginTools(server);
registerContentTools(server);
registerLiveTools(server);
registerFollowTools(server);
registerInteractionTools(server);
registerDownloadTools(server);

// ─── 启动 ─────────────────────────────────────────────────

async function main(): Promise<void> {
  // 加载配置 + 检查 Cookie
  loadConfig();
  await checkCookieValidity();

  // 启动 stdio 传输
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const toolCount = 22; // 目前 22 个工具
  console.error(`[bilibili-mcp] ✅ Server running on stdio`);
  console.error(`[bilibili-mcp] 📋 Tools registered: ${toolCount} 个工具`);
  console.error(`[bilibili-mcp] 🔄 Cookie auto-refresh: ${process.env.BILIBILI_AUTO_REFRESH !== 'false' ? 'enabled' : 'disabled'}`);
  console.error(`[bilibili-mcp] 💡 如需帮助请访问 README.md`);
}

main().catch((err) => {
  console.error(`[bilibili-mcp] ❌ Fatal error:`, err);
  process.exit(1);
});
