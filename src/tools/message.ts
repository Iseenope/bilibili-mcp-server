import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── 持久化文件路径 ──────────────────────────────────────

function getDetectFilePath(): string {
  return process.env.BILIBILI_DETECT_FILE || '';
}

function loadState(): Record<string, number> {
  const filePath = getDetectFilePath();
  if (!filePath) return {};
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {};
}

function saveState(state: Record<string, number>): void {
  const filePath = getDetectFilePath();
  if (!filePath) return;
  try {
    // 使用 path.dirname 正确处理 Windows / Unix 路径
    const dir = path.dirname(filePath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

/** 注册消息/检测相关工具 */
export function registerMessageTools(server: McpServer): void {
  // ─── 检测新回复 ───────────────────────────────────────
  server.registerTool(
    'bilibili_detect_replies',
    {
      description: '检测 B站视频/评论下的新回复，列出上次检查之后的新内容。不自动回复，需要人工确认后操作。',
      inputSchema: {
        videoId: z
          .string()
          .optional()
          .describe('可选：指定视频 BV 号（如 BV1xx）过滤该视频的回复，不指定则查所有回复通知'),
        max: z
          .number()
          .optional()
          .default(20)
          .describe('最多检查几条（默认 20）'),
      },
    },
    async (params) => {
      try {
        const state = loadState();
        const lastKey = 'videoId' in params && params.videoId
          ? `last_check:${params.videoId}`
          : 'last_check';
        const lastCheck = state[lastKey] || 0;
        const now = Date.now();

        const data = await biliApi.detectReplies();
        let items = (data.items || []) as Array<Record<string, unknown>>;

        if (items.length === 0) {
          state[lastKey] = now;
          saveState(state);
          return {
            content: [{ type: 'text', text: '📭 暂无回复消息' }],
          };
        }

        // 按 videoId 过滤
        if (params.videoId) {
          const targetBvid = params.videoId.toUpperCase();
          items = items.filter((item) => {
            const uri = String(
              (item.item as Record<string, unknown>)?.uri || ''
            );
            return uri.toUpperCase().includes(targetBvid);
          });
          if (items.length === 0) {
            state[lastKey] = now;
            saveState(state);
            return {
              content: [
                {
                  type: 'text',
                  text: `📭 视频 ${params.videoId} 没有回复消息`,
                },
              ],
            };
          }
        }

        // 过滤新回复
        const newReplies: string[] = [];
        for (const item of items) {
          const replyTime = Number(item.reply_time || 0) * 1000;
          if (replyTime > lastCheck) {
            const user = (item.user as Record<string, unknown>) || {};
            const itemData = (item.item as Record<string, unknown>) || {};
            const nickname = String(user.nickname || '匿名');
            const source = String(itemData.source_content || '');
            const uri = String(itemData.uri || '');
            const line =
              `**${nickname}**: ${source.substring(0, 150)}` +
              (uri ? `\n  🔗 ${uri}` : '');
            newReplies.push(line);
          }
        }

        // 保存时间戳
        state[lastKey] = now;
        saveState(state);

        if (newReplies.length === 0) {
          const scope = params.videoId ? `视频 ${params.videoId}` : '所有视频';
          return {
            content: [
              {
                type: 'text',
                text: `📭 ${scope} 上次检查后没有新回复`,
              },
            ],
          };
        }

        const lines = [
          `🆕 检测到 ${newReplies.length} 条${params.videoId ? `视频 ${params.videoId} 的` : ''}新回复：`,
          ...newReplies.map((r, i) => `${i + 1}. ${r}`),
          '',
          '💡 需要回复请使用 bilibili_reply 工具',
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `检测回复失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── Cookie 刷新 ─────────────────────────────────────
  server.registerTool(
    'bilibili_refresh_cookie',
    {
      description: '手动触发 B站 Cookie 刷新。检查当前 Cookie 状态，如需要则执行完整的 6 步刷新流程（含 RSA 加密、refresh_csrf 获取、刷新、确认更新）',
      inputSchema: {},
    },
    async () => {
      try {
        const { refreshCookie } = await import('../api/cookie.js');
        const result = await refreshCookie();
        return {
          content: [{ type: 'text', text: result.message }],
          isError: !result.success,
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Cookie 刷新失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 消息通知 ────────────────────────────────────────
  server.registerTool(
    'bilibili_notifications',
    {
      description: '查看 B站未读消息概览，包含回复、@提及、点赞等通知',
      inputSchema: {},
    },
    async () => {
      try {
        const [replyData, atData] = await Promise.allSettled([
          biliApi.detectReplies(),
          biliApi.atMessages(),
        ]);

        const lines: string[] = [];

        if (replyData.status === 'fulfilled') {
          const items = (replyData.value.items || []) as Array<Record<string, unknown>>;
          lines.push(`💬 回复通知: ${items.length} 条`);
          for (const item of items.slice(0, 5)) {
            const user = (item.user as Record<string, unknown>) || {};
            const itemData = (item.item as Record<string, unknown>) || {};
            lines.push(
              `  ${user.nickname || '?'}: ${String(itemData.source_content || '').substring(0, 60)}`
            );
          }
        }

        if (atData.status === 'fulfilled') {
          const items = (atData.value.items || []) as Array<Record<string, unknown>>;
          lines.push(`📢 @提及: ${items.length} 条`);
          for (const item of items.slice(0, 5)) {
            const user = (item.user as Record<string, unknown>) || {};
            const itemData = (item.item as Record<string, unknown>) || {};
            lines.push(
              `  ${user.nickname || '?'}: ${String(itemData.source_content || '').substring(0, 60)}`
            );
          }
        }

        if (lines.length === 0) {
          return {
            content: [{ type: 'text', text: '暂无消息通知' }],
          };
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `获取通知失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
