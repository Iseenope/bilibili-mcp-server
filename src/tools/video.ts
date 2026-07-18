import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi, extractAid } from '../api/bilibili.js';
import { noProxyFetch } from '../api/http.js';
import { parseDanmakuBuffer } from '../api/danmaku.js';

/** 注册视频相关工具 */
export function registerVideoTools(server: McpServer): void {
  // ─── 视频评论列表 ─────────────────────────────────────
  server.registerTool(
    'bilibili_video_comments',
    {
      description: '获取 B站视频的评论列表，包含评论内容、作者信息、点赞数等',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        max: z
          .number()
          .optional()
          .default(10)
          .describe('最多返回几条评论（默认 10）'),
      },
    },
    async (params) => {
      try {
        const oid = extractAid(params.videoId);
        const data = await biliApi.videoComments(oid, params.max ?? 10);
        const replies = (data.replies || []) as Array<Record<string, unknown>>;

        if (replies.length === 0) {
          return {
            content: [{ type: 'text', text: '暂无评论' }],
          };
        }

        const lines = replies.map((r: Record<string, unknown>, i: number) => {
          const member = (r.member as Record<string, unknown>) || {};
          const content = (r.content as Record<string, unknown>) || {};
          const msg = String(content.message || '').substring(0, 100);
          const like = r.like ? ` 👍${r.like}` : '';
          return `${i + 1}. ${member.uname || '?'}: ${msg} [rpid:${r.rpid}]${like}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `📋 共 ${replies.length} 条评论：\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 获取评论失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 搜索视频 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_search',
    {
      description: '搜索 B站视频。⚠️ 注意：B站 totalrank 算法不按时间排，系列剧集最新一集可能不在第 1 页。如要查某 UP 主最新视频，建议先用搜索找到 UP主 uid，再调用 bilibili_user_videos 工具',
      inputSchema: {
        keyword: z.string().describe('搜索关键词'),
        page: z.number().optional().default(1).describe('页码，默认 1'),
        order: z
          .enum(['totalrank', 'click', 'pubdate', 'dm', 'stow', 'scores'])
          .optional()
          .default('totalrank')
          .describe('排序：totalrank=综合(默认，按热度), click=最多播放, pubdate=最新发布, dm=最多弹幕, stow=最多收藏, scores=最多评论'),
        duration: z
          .number()
          .optional()
          .describe('时长筛选：0=全部(默认), 1=<10分钟, 2=10-30分钟, 3=30-60分钟, 4=>60分钟'),
      },
    },
    async (params) => {
      try {
        const data = await biliApi.search({
          keyword: params.keyword,
          page: params.page ?? 1,
          order: params.order ?? 'totalrank',
          duration: params.duration,
        });

        const results = (data.result || []) as Array<Record<string, unknown>>;
        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `未找到与"${params.keyword}"相关的视频` }],
          };
        }

        const lines = results.map((v: Record<string, unknown>, i: number) => {
          const duration = v.duration || '';
          const play = v.play ? ` ${v.play}播放` : '';
          return `${i + 1}. [${v.bvid}] ${v.title || '?'}${play} ${duration}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `🔍 搜索"${params.keyword}"结果（第${params.page ?? 1}页）:\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 搜索失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 视频详情 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_video_info',
    {
      description: '获取 B站视频的详细信息，包含标题、简介、播放量、弹幕数、评论数、点赞数、投币数、收藏数、分享数等',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
      },
    },
    async (params) => {
      try {
        const data = await biliApi.videoInfo(params.videoId);
        const stat = (data.stat as Record<string, unknown>) || {};
        const owner = (data.owner as Record<string, unknown>) || {};

        const lines = [
          `📺 ${data.title || '?'}`,
          `UP主: ${owner.name || '?'} (uid:${owner.mid || '?'})`,
          `简介: ${(data.desc as string) || '(无)'}`,
          '',
          `📊 数据统计:`,
          `  播放: ${stat.view || 0}`,
          `  弹幕: ${stat.danmaku || 0}`,
          `  评论: ${stat.reply || 0}`,
          `  点赞: ${stat.like || 0}`,
          `  投币: ${stat.coin || 0}`,
          `  收藏: ${stat.favorite || 0}`,
          `  分享: ${stat.share || 0}`,
          '',
          `🆔 ${data.bvid || '?'}`,
          `⏱ ${Math.floor((data.duration as number) / 60)}:${String((data.duration as number) % 60).padStart(2, '0')}`,
          `📅 ${new Date((data.pubdate as number) * 1000).toLocaleDateString('zh-CN')}`,
        ];

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 获取视频详情失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 字幕 ─────────────────────────────────────────────
  server.registerTool(
    'bilibili_video_subtitle',
    {
      description: '获取 B站视频的字幕文本（AI 语音转文字），返回带时间轴的字幕内容',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        lang: z
          .string()
          .optional()
          .default('zh-CN')
          .describe('字幕语言代码，如 zh-CN, en'),
      },
    },
    async (params) => {
      try {
        // 先获取视频详情得到 cid
        const info = await biliApi.videoInfo(params.videoId);
        const cid = (info.cid as number) || 0;

        if (!cid) {
          return {
            content: [{ type: 'text', text: '❌ 无法获取视频 cid' }],
            isError: true,
          };
        }

        const playerData = await biliApi.subtitle(params.videoId, cid);
        const subtitleData = (playerData?.subtitle as Record<string, unknown>) || {};
        const subtitles = (subtitleData.subtitles as Array<Record<string, unknown>>) || [];

        if (subtitles.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: '该视频没有可用字幕（可能需要登录后查看）',
              },
            ],
          };
        }

        // 查找指定语言的字幕，或使用第一个
        const target = subtitles.find(
          (s: Record<string, unknown>) => s.lan === params.lang
        ) || subtitles[0];

        const subtitleUrl = `https:${target.subtitle_url}`;

        // 获取字幕 JSON
        const subResp = await noProxyFetch(subtitleUrl, {
          signal: AbortSignal.timeout(10_000),
        });
        const subJson = (await subResp.json()) as {
          body?: Array<{ from: number; to: number; content: string }>;
        };

        const body = subJson.body || [];
        if (body.length === 0) {
          return {
            content: [{ type: 'text', text: '字幕内容为空' }],
          };
        }

        const lines = body.map((item) => {
          const start = formatTime(item.from);
          return `[${start}] ${item.content}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `📝 字幕 (${target.lan_doc || params.lang}):\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 获取字幕失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 弹幕 ─────────────────────────────────────────────
  server.registerTool(
    'bilibili_video_danmaku',
    {
      description: '获取 B站视频的弹幕列表，包含弹幕内容、出现时间、类型、颜色等',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        segment: z
          .number()
          .optional()
          .default(1)
          .describe('弹幕分段索引（每 6 分钟一段），默认 1'),
      },
    },
    async (params) => {
      try {
        // 先获取视频详情得到 cid
        const info = await biliApi.videoInfo(params.videoId);
        const cid = (info.cid as number) || 0;

        if (!cid) {
          return {
            content: [{ type: 'text', text: '❌ 无法获取视频 cid' }],
            isError: true,
          };
        }

        // 获取弹幕 Protobuf 二进制数据
        const buf = await biliApi.danmaku(cid, params.segment ?? 1);

        // 解析 Protobuf
        const { items: danmakuTexts, diagnostics } = parseDanmakuBuffer(buf);

        if (danmakuTexts.length === 0) {
          // 区分是"真无弹幕"还是"解析失败"
          const hint =
            diagnostics.foundContentTags === 0
              ? diagnostics.bufferSize < 10
                ? '（该分段可能没有弹幕）'
                : `⚠️ 未识别到弹幕数据。buffer=${diagnostics.bufferSize} 字节`
              : `⚠️ 解析异常: 找到 ${diagnostics.foundContentTags} 个内容标签但都解析失败`;
          return {
            content: [{ type: 'text', text: `该分段没有弹幕 ${hint}` }],
          };
        }

        const lines = danmakuTexts.map((d, i) => {
          const t = formatTime(d.progress / 1000);
          return `${i + 1}. [${t}] ${d.content}`;
        });

        // 只返回前 100 条防止太长
        const display = lines.slice(0, 100);
        const summary =
          lines.length > 100 ? `\n... 及另外 ${lines.length - 100} 条弹幕` : '';

        return {
          content: [
            {
              type: 'text',
              text: `💬 弹幕 (分段 ${params.segment ?? 1}):\n${display.join('\n')}${summary}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 获取弹幕失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 热门视频 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_hot',
    {
      description: '获取 B站当前热门视频列表，包含播放量、弹幕数、点赞数等数据',
      inputSchema: {
        page: z.number().optional().default(1).describe('页码，默认 1'),
        max: z.number().optional().default(10).describe('每页数量，默认 10'),
      },
    },
    async (params) => {
      try {
        const data = await biliApi.hotVideos(params.page ?? 1, params.max ?? 10);
        const list = (data.list || []) as Array<Record<string, unknown>>;

        if (list.length === 0) {
          return {
            content: [{ type: 'text', text: '暂无热门视频数据' }],
          };
        }

        const lines = list.map((v: Record<string, unknown>, i: number) => {
          const owner = (v.owner as Record<string, unknown>) || {};
          const stat = (v.stat as Record<string, unknown>) || {};
          return (
            `${i + 1}. ${v.title || '?'}\n` +
            `   UP主: ${owner.name || '?'} | 播放: ${stat.view || 0} 👍${stat.like || 0}`
          );
        });

        return {
          content: [
            {
              type: 'text',
              text: `🔥 B站热门视频（第${params.page ?? 1}页）:\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 获取热门视频失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 热搜 ─────────────────────────────────────────────
  server.registerTool(
    'bilibili_search_hot',
    {
      description: '获取 B站热搜关键词列表',
      inputSchema: {},
    },
    async () => {
      try {
        const data = await biliApi.searchHot();
        const list = (data.list || []) as Array<Record<string, unknown>>;

        if (list.length === 0) {
          return {
            content: [{ type: 'text', text: '暂无热搜数据' }],
          };
        }

        const lines = list.map(
          (item: Record<string, unknown>, i: number) =>
            `${i + 1}. ${item.keyword || '?'}`
        );

        return {
          content: [
            { type: 'text', text: `🔥 B站热搜:\n${lines.join('\n')}` },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `❌ 获取热搜失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );
}

// ─── 辅助：格式化时间 ────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
