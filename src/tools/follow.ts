import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';

/** 格式化数字（>10000 显示为万） */
function formatNum(n: unknown): string {
  const v = Number(n) || 0;
  if (v >= 10000) return (v / 10000).toFixed(1) + '万';
  return String(v);
}

/** 格式化时间戳 */
function formatTime(ts: unknown): string {
  const v = Number(ts) || 0;
  if (v === 0) return '?';
  return new Date(v * 1000).toLocaleString('zh-CN');
}

/** 注册关注/粉丝管理工具 */
export function registerFollowTools(server: McpServer): void {
  // ─── 关注用户 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_user_follow',
    {
      description: '关注指定 UP 主。需登录态，行为会被 B 站风控监控，不建议短时间内大量关注',
      inputSchema: {
        uid: z.number().int().positive().describe('目标用户 UID'),
      },
    },
    async (params) => {
      try {
        await biliApi.relationModify({ fid: params.uid, act: 1 });
        return {
          content: [
            { type: 'text', text: `已关注用户 uid:${params.uid}` },
          ],
        };
      } catch (err) {
        const msg = (err as Error).message;
        // B 站风控时返回 -352 也可能表示触发关注限制
        if (msg.includes('-352') || msg.includes('风控')) {
          return {
            content: [
              {
                type: 'text',
                text: `关注失败：账号可能被 B 站风控拦截。建议等待几小时后再试，或先检查账号状态。\n错误：${msg}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: `关注失败: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ─── 取关用户 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_user_unfollow',
    {
      description: '取消关注指定 UP 主',
      inputSchema: {
        uid: z.number().int().positive().describe('目标用户 UID'),
      },
    },
    async (params) => {
      try {
        await biliApi.relationModify({ fid: params.uid, act: 2 });
        return {
          content: [
            { type: 'text', text: `已取消关注用户 uid:${params.uid}` },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `取关失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── 关注列表 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_user_followings',
    {
      description: '查询指定用户的关注列表（TA 关注了谁）',
      inputSchema: {
        uid: z.number().int().positive().describe('用户 UID'),
        page: z.number().optional().default(1).describe('页码，默认 1'),
        pageSize: z.number().optional().default(20).describe('每页数量，默认 20'),
      },
    },
    async (params) => {
      try {
        const data = await biliApi.followings({
          vmid: params.uid,
          pn: params.page,
          ps: params.pageSize,
        });
        const list = (data.list || []) as Array<Record<string, unknown>>;
        if (list.length === 0) {
          return {
            content: [
              { type: 'text', text: `用户 uid:${params.uid} 未关注任何人` },
            ],
          };
        }

        const lines = list.map((u, i) => {
          const mid = u.mid || '?';
          const uname = u.uname || '?';
          const sign = (u.sign || '').toString().slice(0, 50);
          const fans = formatNum(u.fans);
          const videos = formatNum(u.videos);
          const mtime = formatTime(u.mtime);
          return `${i + 1}. ${uname} (uid:${mid})\n   粉丝: ${fans}  视频: ${videos}  关注时间: ${mtime}${sign ? '\n   简介: ' + sign : ''}`;
        });

        const total = data.total || list.length;
        return {
          content: [
            {
              type: 'text',
              text: `用户 uid:${params.uid} 的关注列表（总共 ${total} 人）\n${'─'.repeat(40)}\n${lines.join('\n\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `查询关注列表失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── 粉丝列表 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_user_followers',
    {
      description: '查询指定用户的粉丝列表（谁关注了 TA）',
      inputSchema: {
        uid: z.number().int().positive().describe('用户 UID'),
        page: z.number().optional().default(1).describe('页码，默认 1'),
        pageSize: z.number().optional().default(20).describe('每页数量，默认 20'),
      },
    },
    async (params) => {
      try {
        const data = await biliApi.followers({
          vmid: params.uid,
          pn: params.page,
          ps: params.pageSize,
        });
        const list = (data.list || []) as Array<Record<string, unknown>>;
        if (list.length === 0) {
          return {
            content: [
              { type: 'text', text: `用户 uid:${params.uid} 没有粉丝` },
            ],
          };
        }

        const lines = list.map((u, i) => {
          const mid = u.mid || '?';
          const uname = u.uname || '?';
          const sign = (u.sign || '').toString().slice(0, 50);
          const fans = formatNum(u.fans);
          const videos = formatNum(u.videos);
          const mtime = formatTime(u.mtime);
          return `${i + 1}. ${uname} (uid:${mid})\n   粉丝: ${fans}  视频: ${videos}  关注时间: ${mtime}${sign ? '\n   简介: ' + sign : ''}`;
        });

        const total = data.total || list.length;
        return {
          content: [
            {
              type: 'text',
              text: `用户 uid:${params.uid} 的粉丝列表（总共 ${total} 人）\n${'─'.repeat(40)}\n${lines.join('\n\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `查询粉丝列表失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
