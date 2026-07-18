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
        '查询 B站 UP 主的直播间信息。输入 uid（用户 ID），返回直播状态（是否开播）、直播间标题、人气值（热度）、关注数、直播分类、弹幕热词等。注意：人气值是热度指标，非真实观看人数',
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
        let roomId: number;
        let liveStatus: number;

        try {
          const initData = await biliApi.liveRoomInit(uid);
          roomId = initData.room_id as number;
          liveStatus = initData.live_status as number;
        } catch {
          // room_init 失败，尝试直接用 uid 当做 room_id 查（部分用户 uid=room_id）
          const fallback = await biliApi.liveRoomInfo(uid);
          roomId = uid;
          liveStatus = fallback.live_status as number;
        }

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
        const popularity = (roomInfo.online as number) || 0;
        const attention = (roomInfo.attention as number) || 0;
        const description = (roomInfo.description as string) || '';
        const tags = (roomInfo.tags as string) || '';
        const areaName = (roomInfo.area_name as string) || '';
        const parentAreaName = (roomInfo.parent_area_name as string) || '';
        const liveTime = (roomInfo.live_time as string) || '';
        const coverUrl = (roomInfo.user_cover as string) || (roomInfo.cover as string) || '';
        const keyframeUrl = (roomInfo.keyframe as string) || '';
        const shortId = (roomInfo.short_id as number) || 0;
        const hotWords = (roomInfo.hot_words as string[]) || [];

        const statusMap: Record<number, string> = {
          0: '未开播',
          1: '直播中',
          2: '轮播中',
        };
        const statusText = statusMap[liveStatus] || `未知状态(${liveStatus})`;

        const lines: string[] = [
          `直播间信息 (uid: ${uid})`,
          `────────────────`,
          `状态: ${statusText}`,
          `标题: ${title}`,
          `房间 ID: ${roomId}` + (shortId ? ` (短号: ${shortId})` : ''),
          `分类: ${parentAreaName} / ${areaName}`,
          `人气值: ${formatCount(popularity)}`,
          `关注数: ${formatCount(attention)}`,
        ];

        if (liveTime && liveStatus !== 0) {
          lines.push(`开播时间: ${liveTime}`);
        }
        if (hotWords.length > 0) {
          lines.push(`弹幕热词: ${hotWords.slice(0, 10).join(', ')}`);
        }
        if (tags) {
          lines.push(`标签: ${tags}`);
        }
        if (description) {
          lines.push(`简介: ${description.slice(0, 200)}`);
        }
        if (keyframeUrl && liveStatus !== 0) {
          lines.push(`关键帧: ${keyframeUrl}`);
        }
        if (coverUrl) {
          lines.push(`封面: ${coverUrl}`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('-400') || message.includes('-404') || message.includes('60004') || message.includes('未找到该房间')) {
          return {
            content: [
              {
                type: 'text',
                text: `未找到该用户的直播间（uid: ${uid}）。部分 UP 主的 room_id 与 uid 不同，` +
                      `请先用 bilibili_search 搜索该 UP 主获取正确的房间号，` +
                      `或直接使用房间号查询。`,
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
