import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * 注册视频互动工具（点赞/投币/收藏）
 *
 * ⚠️ 注意：B 站在 2025 年下半年废弃了 /x/v2/view/like 等传统互动 API，
 * 新的 API endpoint 暂未公开。本工具目前会返回 API 不可用错误。
 * 关注/取关功能在 /x/relation/modify 中仍然可用。
 */
export function registerInteractionTools(server: McpServer): void {
  const deprecatedMessage =
    'B 站已废弃传统视频互动 API（/x/v2/view/like 等）。' +
    '目前没有公开的新 endpoint。如需点赞/投币/收藏，请在浏览器中手动操作。' +
    '关注、取关功能（bilibili_user_follow / unfollow）仍可正常使用。';

  // ─── 点赞/取消点赞 ─────────────────────────────────────
  server.registerTool(
    'bilibili_video_like',
    {
      description: '对视频点赞或取消点赞。⚠️ 暂不可用：B 站已废弃此 API。' + deprecatedMessage,
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        action: z
          .enum(['like', 'unlike'])
          .describe('like=点赞, unlike=取消点赞'),
      },
    },
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: `点赞功能暂不可用。\n\n原因：${deprecatedMessage}\n\n请在 B 站网页/App 中手动操作。`,
          },
        ],
        isError: true,
      };
    }
  );

  // ─── 投币 ─────────────────────────────────────────────
  server.registerTool(
    'bilibili_video_coin',
    {
      description: '给视频投硬币。⚠️ 暂不可用：B 站已废弃此 API。' + deprecatedMessage,
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        multiply: z
          .number()
          .int()
          .min(1)
          .max(2)
          .default(1)
          .describe('投币数量：1 或 2，默认 1'),
      },
    },
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: `投币功能暂不可用。\n\n原因：${deprecatedMessage}\n\n请在 B 站网页/App 中手动操作。`,
          },
        ],
        isError: true,
      };
    }
  );

  // ─── 收藏/取消收藏 ─────────────────────────────────────
  server.registerTool(
    'bilibili_video_favorite',
    {
      description: '收藏视频。⚠️ 暂不可用：B 站已废弃此 API。' + deprecatedMessage,
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        add: z
          .boolean()
          .default(true)
          .describe('true=添加收藏, false=取消收藏'),
        mediaIds: z
          .string()
          .optional()
          .describe('收藏夹 ID 列表（逗号分隔），默认使用默认收藏夹'),
      },
    },
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: `收藏功能暂不可用。\n\n原因：${deprecatedMessage}\n\n请在 B 站网页/App 中手动操作。`,
          },
        ],
        isError: true,
      };
    }
  );
}
