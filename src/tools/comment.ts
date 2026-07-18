import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi, extractAid } from '../api/bilibili.js';

/** 注册评论相关工具 */
export function registerCommentTools(server: McpServer): void {
  // ─── 发评论 ───────────────────────────────────────────
  server.registerTool(
    'bilibili_reply',
    {
      description: '在 B站视频下发布评论或回复他人评论',
      inputSchema: {
        videoId: z
          .string()
          .describe('视频 BV 号（如 BV1xx）或 avid（数字）'),
        message: z
          .string()
          .max(1000)
          .describe('评论内容，最大 1000 字符'),
        parentRpid: z
          .string()
          .optional()
          .describe('要回复的评论 rpid（楼中楼回复时使用）'),
        rootRpid: z
          .string()
          .optional()
          .describe('根评论 rpid（二级以上回复时使用）'),
        type: z
          .number()
          .optional()
          .default(1)
          .describe('评论区类型：1=视频(默认)，12=专栏，17=动态'),
      },
    },
    async (params) => {
      try {
        const oid = extractAid(params.videoId);
        const body: {
          type: number;
          oid: string;
          message: string;
          root?: string;
          parent?: string;
          plat?: string;
        } = {
          oid,
          message: params.message,
          type: params.type ?? 1,
        };
        if (params.rootRpid) body.root = params.rootRpid;
        if (params.parentRpid) body.parent = params.parentRpid;

        const result = await biliApi.reply(body);
        const rpid = result?.rpid ?? '?';

        return {
          content: [
            {
              type: 'text',
              text: `✅ 评论已发布\nrpid: ${rpid}\n内容: ${params.message.substring(0, 100)}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `❌ 评论失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── 删评论 ───────────────────────────────────────────
  server.registerTool(
    'bilibili_delete_comment',
    {
      description: '删除自己在 B站的评论',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        rpid: z.string().describe('要删除的评论 rpid'),
        type: z
          .number()
          .optional()
          .default(1)
          .describe('评论区类型：1=视频(默认)'),
      },
    },
    async (params) => {
      try {
        const oid = extractAid(params.videoId);
        await biliApi.deleteComment({
          oid,
          rpid: params.rpid,
          type: params.type ?? 1,
        });
        return {
          content: [{ type: 'text', text: `✅ 已删除评论 rpid: ${params.rpid}` }],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 删除失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 点赞评论 ──────────────────────────────────────────
  server.registerTool(
    'bilibili_like_comment',
    {
      description: '给 B站评论点赞或取消点赞',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        rpid: z.string().describe('评论 rpid'),
        action: z
          .number()
          .optional()
          .default(1)
          .describe('操作：1=点赞(默认)，0=取消赞'),
        type: z
          .number()
          .optional()
          .default(1)
          .describe('评论区类型：1=视频(默认)'),
      },
    },
    async (params) => {
      try {
        const oid = extractAid(params.videoId);
        await biliApi.likeComment({
          oid,
          rpid: params.rpid,
          action: params.action ?? 1,
          type: params.type ?? 1,
        });
        const label = (params.action ?? 1) === 1 ? '已点赞' : '已取消赞';
        return {
          content: [
            { type: 'text', text: `✅ ${label} rpid: ${params.rpid}` },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 操作失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
