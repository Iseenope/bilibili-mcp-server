import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';

/** 注册视频互动工具（点赞/投币/收藏） */
export function registerInteractionTools(server: McpServer): void {
  // ─── 点赞/取消点赞 ─────────────────────────────────────
  server.registerTool(
    'bilibili_video_like',
    {
      description: '对视频点赞或取消点赞。注意：B 站对此操作有较严格的风控，频繁操作可能触发验证码或封号。建议每天不超过 10 次。',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        action: z
          .enum(['like', 'unlike'])
          .describe('like=点赞, unlike=取消点赞'),
      },
    },
    async (params) => {
      try {
        await biliApi.videoLike({ videoId: params.videoId, action: params.action === 'like' ? 1 : 2 });
        return {
          content: [
            {
              type: 'text',
              text: params.action === 'like'
                ? `已点赞视频 ${params.videoId}`
                : `已取消点赞 ${params.videoId}`,
            },
          ],
        };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('-352') || msg.includes('风控')) {
          return {
            content: [
              {
                type: 'text',
                text: `操作失败：账号被 B 站风控拦截。建议等待几小时后再试。\n错误：${msg}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: `${params.action === 'like' ? '点赞' : '取消点赞'}失败: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ─── 投币 ─────────────────────────────────────────────
  server.registerTool(
    'bilibili_video_coin',
    {
      description: '给视频投 1 或 2 个硬币。需登录态，每天最多投币 5 次（单视频）。注意：风控较严，谨慎使用。',
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
    async (params) => {
      try {
        await biliApi.videoCoin({
          videoId: params.videoId,
          multiply: params.multiply as 1 | 2,
        });
        return {
          content: [
            { type: 'text', text: `已向视频 ${params.videoId} 投 ${params.multiply} 个硬币` },
          ],
        };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('-352') || msg.includes('风控')) {
          return {
            content: [
              {
                type: 'text',
                text: `投币失败：账号被 B 站风控拦截。建议等待几小时后再试。\n错误：${msg}`,
              },
            ],
            isError: true,
          };
        }
        if (msg.includes('每日') || msg.includes('-110')) {
          return {
            content: [
              { type: 'text', text: `投币失败：今日投币次数已达上限（5 个）。请明天再试。` },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: `投币失败: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ─── 收藏/取消收藏 ─────────────────────────────────────
  server.registerTool(
    'bilibili_video_favorite',
    {
      description: '收藏视频到默认收藏夹，或取消收藏。可指定多个收藏夹 ID（用逗号分隔）。注意：风控较严，谨慎使用。',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        add: z
          .boolean()
          .default(true)
          .describe('true=添加收藏, false=取消收藏'),
        mediaIds: z
          .string()
          .optional()
          .describe('收藏夹 ID 列表（逗号分隔），默认使用默认收藏夹。可以通过 bilibili_user_favorites 工具查询'),
      },
    },
    async (params) => {
      try {
        // 如果没有指定 mediaIds，用默认收藏夹（先查）
        let mediaIds = params.mediaIds
          ? params.mediaIds.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
          : [];

        if (mediaIds.length === 0) {
          // 尝试获取用户自己的默认收藏夹
          const cookie = (await import('../config.js')).getCookie();
          const folders = await biliApi.favoriteFolders(parseInt(cookie.dede_user_id, 10) || 0);
          const defaultFolder = (folders.list || []).find(f => f.attr === 0) || (folders.list || [])[0];
          if (!defaultFolder || !defaultFolder.id) {
            return {
              content: [
                { type: 'text', text: `收藏失败：未找到默认收藏夹，请先通过 bilibili_user_favorites 创建收藏夹或手动指定 mediaIds` },
              ],
              isError: true,
            };
          }
          mediaIds = [defaultFolder.id as number];
        }

        await biliApi.videoFavorite({
          videoId: params.videoId,
          mediaIds,
          add: params.add,
        });
        return {
          content: [
            {
              type: 'text',
              text: params.add
                ? `已收藏视频 ${params.videoId} 到收藏夹 [${mediaIds.join(', ')}]`
                : `已取消收藏 ${params.videoId}`,
            },
          ],
        };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('-352') || msg.includes('风控')) {
          return {
            content: [
              {
                type: 'text',
                text: `操作失败：账号被 B 站风控拦截。建议等待几小时后再试。\n错误：${msg}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: `${params.add ? '收藏' : '取消收藏'}失败: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
