// ─── 直播工具 ──────────────────────────────────────────────

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';

/** 格式化数字（观看人数等） */
function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  if (n >= 1000) return (n / 1000).toFixed(1) + '千';
  return String(n);
}

/** 注册直播相关工具 */
export function registerLiveTools(server: McpServer): void {
  server.registerTool(
    'bilibili_live_info',
    {
      description:
        '查询 B站 UP 主的直播间信息。输入 uid（用户 ID），返回直播状态（是否开播）、直播间标题、在线人数、关注数等。如果用户正在直播，还会返回开播时间和关键帧截图地址',
      inputSchema: {
        uid: z
          .number()
          .int()
          .positive()
          .describe('UP 主的用户 uid（可通过 bilibili_search 搜索获取）'),
      },
    },
    async (params) => {
      const { uid } = params;
      try {
        // 第一步：通过 uid 获取 room_id 和直播状态
        const initData = await biliApi.liveRoomInit(uid);
        const roomId = initData.room_id as number;
        const liveStatus = initData.live_status as number; // 0=未开播, 1=直播中, 2=轮播中

        if (!roomId || roomId === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `该用户（uid: ${uid}）未开通直播间`,
              },
            ],
          };
        }

        // 第二步：获取直播间详细信息
        const roomInfo = await biliApi.liveRoomInfo(roomId);

        const title = (roomInfo.title as string) || '未设置标题';
        const online = (roomInfo.online as number) || 0;
        const attention = (roomInfo.attention as number) || 0;
        const description = (roomInfo.description as string) || '';
        const tags = (roomInfo.tags as string) || '';
        const areaName = (roomInfo.area_name as string) || '';
        const parentAreaName = (roomInfo.parent_area_name as string) || '';
        const liveTime = (roomInfo.live_time as string) || '';
        const coverUrl = (roomInfo.user_cover as string) || (roomInfo.cover as string) || '';
        const keyframeUrl = (roomInfo.keyframe as string) || '';

        const statusMap: Record<number, string> = {
          0: '未开播',
          1: '🟢 直播中',
          2: '🔄 轮播中',
        };
        const statusText = statusMap[liveStatus] || `未知状态(${liveStatus})`;

        const lines: string[] = [
          `📺 直播间信息 (uid: ${uid})`,
          `────────────────────────`,
          `状态: ${statusText}`,
          `标题: ${title}`,
          `房间 ID: ${roomId}`,
          `分类: ${parentAreaName} / ${areaName}`,
          `在线人数: ${formatCount(online)}`,
          `关注数: ${formatCount(attention)}`,
        ];

        if (liveTime && liveStatus !== 0) {
          lines.push(`开播时间: ${liveTime}`);
        }
        if (description) {
          lines.push(`简介: ${description.slice(0, 200)}`);
        }
        if (tags) {
          lines.push(`标签: ${tags}`);
        }
        if (coverUrl) {
          lines.push(`封面: ${coverUrl}`);
        }
        if (keyframeUrl && liveStatus !== 0) {
          lines.push(`关键帧: ${keyframeUrl}`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // B 站返回 -400 / -404 / 60004 表示用户不存在或无直播间
        if (message.includes('-400') || message.includes('-404') || message.includes('60004')) {
          return {
            content: [
              {
                type: 'text',
                text: `该用户（uid: ${uid}）未开通直播间`,
              },
            ],
          };
        }
        return {
          content: [{ type: 'text', text: `查询直播信息失败: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
