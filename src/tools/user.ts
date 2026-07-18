import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';

/** 注册用户相关工具 */
export function registerUserTools(server: McpServer): void {
  // ─── UP主视频列表 ─────────────────────────────────────
  server.registerTool(
    'bilibili_user_videos',
    {
      description: '获取指定 UP 主的视频列表，按发布时间排序',
      inputSchema: {
        uid: z.number().describe('UP主 UID'),
        max: z
          .number()
          .optional()
          .default(10)
          .describe('最多返回几条视频（默认 10）'),
      },
    },
    async (params) => {
      try {
        const data = await biliApi.userVideos({
          mid: String(params.uid),
          ps: String(params.max ?? 10),
          pn: '1',
          order: 'pubdate',
        });

        const vlist =
          ((data as Record<string, unknown>).list as Record<string, unknown>) || {};
        const videos =
          (vlist.vlist as Array<Record<string, unknown>>) || [];

        if (videos.length === 0) {
          return {
            content: [
              { type: 'text', text: `未找到 UP主 uid:${params.uid} 的视频` },
            ],
          };
        }

        const lines = videos.map((v: Record<string, unknown>, i: number) => {
          return `${i + 1}. [${v.bvid}] ${v.title || '?'} (${v.play || '?'}播放)`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `📺 UP主 uid:${params.uid} 的视频:\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 获取视频列表失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 用户信息 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_user_info',
    {
      description: '获取 B站用户信息，包含昵称、签名、等级、粉丝数、关注数、直播间信息等',
      inputSchema: {
        uid: z.number().describe('用户 UID'),
      },
    },
    async (params) => {
      try {
        const rawData = await biliApi.userInfo(params.uid);
        if (!rawData) {
          return {
            content: [
              { type: 'text', text: `❌ 用户 uid:${params.uid} 不存在或不可访问` },
            ],
            isError: true,
          };
        }
        const d = rawData as Record<string, unknown>;
        const vip = (d.vip as Record<string, unknown>) || {};
        const official = (d.official as Record<string, unknown>) || {};
        const liveRoom = (d.live_room as Record<string, unknown>) || {};

        const lines = [
          `👤 ${d.name || '?'}`,
          `UID: ${d.mid || params.uid}`,
          `等级: Lv${d.level || 0}`,
          `签名: ${d.sign || '(无)'}`,
          `性别: ${d.sex || '保密'}`,
          `大会员: ${vip.status === 1 ? '✅ 是' : '❌ 否'}`,
          `认证: ${official.title || '无'}`,
          liveRoom?.roomStatus === 1
            ? `直播: ${liveRoom.title || '?'} (${liveRoom.liveStatus === 1 ? '直播中' : '未开播'})`
            : '',
        ].filter(Boolean);

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 获取用户信息失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 收藏夹列表 ───────────────────────────────────────
  server.registerTool(
    'bilibili_user_favorites',
    {
      description: '获取用户的收藏夹列表及内容',
      inputSchema: {
        uid: z.number().describe('用户 UID'),
        folderId: z
          .number()
          .optional()
          .describe('收藏夹 ID（如不指定则返回收藏夹列表）'),
        max: z
          .number()
          .optional()
          .default(10)
          .describe('最多返回几条（默认 10）'),
      },
    },
    async (params) => {
      try {
        if (params.folderId) {
          // 获取收藏夹内容
          const data = await biliApi.favoriteResources({
            media_id: params.folderId,
            pn: 1,
            ps: params.max ?? 10,
          });
          // 处理 data 可能为 null 的情况
          const medias =
            (data?.medias as Array<Record<string, unknown>>) || [];

          if (medias.length === 0) {
            return {
              content: [
                { type: 'text', text: '该收藏夹为空' },
              ],
            };
          }

          const lines = medias.map(
            (m: Record<string, unknown>, i: number) =>
              `${i + 1}. ${m.title || '?'} (${m.link || ''})`
          );

          return {
            content: [
              {
                type: 'text',
                text: `📁 收藏夹内容:\n${lines.join('\n')}`,
              },
            ],
          };
        } else {
          // 获取收藏夹列表
          const data = await biliApi.favoriteFolders(params.uid);
          // 处理 data 可能为 null 的情况
          const list = (data?.list as Array<Record<string, unknown>>) || [];

          if (list.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `用户 uid:${params.uid} 暂无公开收藏夹`,
                },
              ],
            };
          }

          const lines = list.map(
            (f: Record<string, unknown>, i: number) =>
              `${i + 1}. ${f.title || '?'} (${f.media_count || 0}个内容) [id:${f.id}]`
          );

          return {
            content: [
              {
                type: 'text',
                text: `📁 收藏夹列表:\n${lines.join('\n')}`,
              },
            ],
          };
        }
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 获取收藏夹失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
