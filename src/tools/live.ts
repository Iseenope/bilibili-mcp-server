// ─── 直播工具 ──────────────────────────────────────────────

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';
import { noProxyFetch } from '../api/http.js';

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

  // ─── 直播截图（视觉分析） ─────────────────────────────
  server.registerTool(
    'bilibili_live_screenshot',
    {
      description:
        '获取直播间的当前画面截图，返回给具备视觉能力的模型分析。返回内容包括：1) 直播间元数据（标题/人气/UP主等）；2) 关键帧截图（keyframe）。如模型无视觉能力，仅文字信息可用，AI 应提示"无法查看图像"。',
      inputSchema: {
        uid: z
          .number()
          .int()
          .positive()
          .describe('UP 主的用户 uid。可通过 bilibili_search 搜索获取'),
      },
    },
    async (params) => {
      const { uid } = params;
      try {
        // 第一步：获取 room_id（同 live_info 逻辑）
        let roomId: number;
        let liveStatus: number;

        try {
          const initData = await biliApi.liveRoomInit(uid);
          roomId = initData.room_id as number;
          liveStatus = initData.live_status as number;
        } catch {
          const fallback = await biliApi.liveRoomInfo(uid);
          roomId = uid;
          liveStatus = fallback.live_status as number;
        }

        if (!roomId || roomId === 0) {
          return {
            content: [
              { type: 'text', text: `该用户（uid: ${uid}）未开通直播间` },
            ],
          };
        }

        // 第二步：获取房间详细信息（含 keyframe 截图 URL）
        const roomInfo = await biliApi.liveRoomInfo(roomId);
        const keyframeUrl = (roomInfo.keyframe as string) || '';
        const title = (roomInfo.title as string) || '未设置标题';
        const liveTime = (roomInfo.live_time as string) || '';
        const areaName = (roomInfo.area_name as string) || '';
        const parentAreaName = (roomInfo.parent_area_name as string) || '';
        const hotWords = (roomInfo.hot_words as string[]) || [];

        const statusMap: Record<number, string> = {
          0: '未开播',
          1: '直播中',
          2: '轮播中',
        };
        const statusText = statusMap[liveStatus] || `未知状态(${liveStatus})`;

        // 文字信息部分（无论如何都返回）
        const textLines: string[] = [
          `直播间截图（uid: ${uid}）`,
          `────────────────`,
          `状态: ${statusText}`,
          `标题: ${title}`,
          `房间 ID: ${roomId}`,
          `分类: ${parentAreaName} / ${areaName}`,
        ];
        if (liveTime && liveStatus !== 0) {
          textLines.push(`开播时间: ${liveTime}`);
        }
        if (hotWords.length > 0) {
          textLines.push(`弹幕热词: ${hotWords.slice(0, 8).join(', ')}`);
        }

        // 如果没有截图 URL（未开播时无 keyframe），只返回文字
        if (!keyframeUrl) {
          textLines.push(``, `当前直播间无关键帧截图（可能未开播）`);
          return {
            content: [
              {
                type: 'text',
                text: textLines.join('\n'),
              },
            ],
          };
        }

        // 第三步：下载截图
        let imageBuffer: ArrayBuffer;
        try {
          const res = await noProxyFetch(keyframeUrl);
          if (!res.ok) {
            textLines.push(``, `截图下载失败: HTTP ${res.status}（但文字信息已返回）`);
            return {
              content: [{ type: 'text', text: textLines.join('\n') }],
            };
          }
          imageBuffer = await res.arrayBuffer();
        } catch (dlErr) {
          textLines.push(
            ``,
            `截图下载失败: ${(dlErr as Error).message}（但文字信息已返回）`
          );
          return {
            content: [{ type: 'text', text: textLines.join('\n') }],
          };
        }

        // 第四步：构造 MCP image content
        // MCP image content 要求 base64 编码 + mimeType
        const base64 = Buffer.from(imageBuffer).toString('base64');
        const mimeType = keyframeUrl.toLowerCase().includes('.png')
          ? 'image/png'
          : 'image/jpeg';

        textLines.push(``, `截图大小: ${(imageBuffer.byteLength / 1024).toFixed(1)}KB`);
        textLines.push(`图片已附在下方，请用你的视觉能力分析直播间当前在做什么。`);

        return {
          content: [
            { type: 'text', text: textLines.join('\n') },
            {
              type: 'image',
              data: base64,
              mimeType,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes('-400') ||
          message.includes('-404') ||
          message.includes('60004') ||
          message.includes('未找到该房间')
        ) {
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
          content: [{ type: 'text', text: `获取直播截图失败: ${message}` }],
          isError: true,
        };
      }
    }
  );
}
