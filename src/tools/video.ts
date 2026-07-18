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

        const formatNum = (n: unknown): string => {
          const v = Number(n) || 0;
          if (v >= 10000) return (v / 10000).toFixed(1) + '万';
          return String(v);
        };

        const formatPub = (ts: unknown): string => {
          const t = Number(ts) || 0;
          if (t === 0) return '';
          const d = new Date(t * 1000);
          const now = Date.now();
          const days = Math.floor((now - t * 1000) / 86400000);
          if (days < 1) return '今天';
          if (days < 7) return `${days}天前`;
          return d.toLocaleDateString('zh-CN');
        };

        const results = (data.result || []) as Array<Record<string, unknown>>;
        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `未找到与"${params.keyword}"相关的视频` }],
          };
        }

        const lines = results.map((v: Record<string, unknown>, i: number) => {
          const title = (v.title as string || '').replace(/<[^>]+>/g, '');
          const author = v.author || '?';
          const mid = v.mid || '?';
          const typename = v.typename || v.cate_name || '';
          const duration = v.duration || '';
          const play = formatNum(v.play);
          const danmaku = formatNum(v.danmaku || v.video_review);
          const favorite = formatNum(v.favorites);
          const like = formatNum(v.like);
          const pub = formatPub(v.pubdate);
          const tag = v.tag || '';
          const isPay = v.is_pay === 1 || v.is_charge_video === 1 ? ' [付费]' : '';
          const isLive = v.is_live_room_inline === 1 ? ' [直播]' : '';

          const authorLine = `   UP主: ${author} (uid:${mid})`;
          const stat = `▶${play}  💬${danmaku}  👍${like}  ⭐${favorite}`;
          const meta = `   ${typename} · ${duration} · ${pub}${isPay}${isLive}`;

          return `${i + 1}. ${title}${isPay}${isLive}\n${authorLine}\n${meta}\n   ${stat}${tag ? '\n   标签: ' + tag : ''}`;
        });

        const header = `🔍 搜索"${params.keyword}"结果（共 ${data.numResults} 条，第 ${params.page ?? 1}/${data.numPages} 页）\n${'─'.repeat(40)}`;

        return {
          content: [
            {
              type: 'text',
              text: `${header}\n${lines.join('\n\n')}`,
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
        const rights = (data.rights as Record<string, unknown>) || {};
        const dimension = (data.dimension as Record<string, unknown>) || {};
        const honorReply = (data.honor_reply as Record<string, unknown>) || {};
        const honorList = (honorReply.honor as Array<Record<string, unknown>>) || [];

        const duration = (data.duration as number) || 0;
        const formatDur = (s: number) => {
          const h = Math.floor(s / 3600);
          const m = Math.floor((s % 3600) / 60);
          const sec = s % 60;
          return h > 0
            ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
            : `${m}:${String(sec).padStart(2, '0')}`;
        };

        const copyrightMap: Record<number, string> = { 1: '自制', 2: '转载' };
        const copyrightText = copyrightMap[data.copyright as number] ||
                              (data.copyright === 3 ? '不识别' : '未知');

        const formatNum = (n: unknown) => {
          const v = Number(n) || 0;
          if (v >= 10000) return (v / 10000).toFixed(1) + '万';
          return String(v);
        };

        const pubdateTs = (data.pubdate as number) * 1000;
        const ctimeTs = (data.ctime as number) * 1000;

        const rightsFlags: string[] = [];
        if (rights.no_reprint === 1) rightsFlags.push('禁止转载');
        if (rights.is_cooperation === 1) rightsFlags.push('联合创作');
        if (rights.ugc_pay === 1 || rights.arc_pay === 1) rightsFlags.push('付费');
        if (rights.download === 1) rightsFlags.push('可下载');
        if (rights.hd5 === 1) rightsFlags.push('高清');

        const lines: string[] = [
          `${data.title || '?'}`,
          `────────────────`,
          `UP主: ${owner.name || '?'} (uid: ${owner.mid || '?'})`,
          `分区: ${data.tname_v2 || data.tname || '?'}`,
          `类型: ${copyrightText}` + (rightsFlags.length ? `  标签: ${rightsFlags.join('、')}` : ''),
          `时长: ${formatDur(duration)}` +
            (dimension.width ? `  分辨率: ${dimension.width}×${dimension.height}` : ''),
          `分P数: ${data.videos || 1}`,
          `发布时间: ${new Date(pubdateTs).toLocaleString('zh-CN')}`,
          `创建时间: ${new Date(ctimeTs).toLocaleString('zh-CN')}`,
          `状态: ${data.state === 0 ? '正常' : data.state === -4 ? '审核中' : `状态码${data.state}`}`,
          ``,
          `数据统计:`,
          `  播放: ${formatNum(stat.view)}  弹幕: ${formatNum(stat.danmaku)}  评论: ${formatNum(stat.reply)}`,
          `  点赞: ${formatNum(stat.like)}  投币: ${formatNum(stat.coin)}  收藏: ${formatNum(stat.favorite)}  分享: ${formatNum(stat.share)}`,
        ];

        if (typeof stat.now_rank === 'number' && stat.now_rank > 0) {
          lines.push(`  当前全站排名: ${stat.now_rank}`);
        }
        if (typeof stat.his_rank === 'number' && stat.his_rank > 0) {
          lines.push(`  历史最高排名: ${stat.his_rank}`);
        }

        if (honorList.length > 0) {
          const honors = honorList
            .map(h => h.desc)
            .filter(Boolean)
            .join('、');
          if (honors) lines.push(`荣誉: ${honors}`);
        }

        if (data.pic) lines.push(``, `封面: ${data.pic}`);
        if (data.desc) {
          const desc = (data.desc as string).trim();
          if (desc) lines.push(``, `简介: ${desc}`);
        }

        lines.push(``, `BV号: ${data.bvid || '?'}  aid: ${data.aid || '?'}`);

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `获取视频详情失败: ${(err as Error).message}` },
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
          let hint: string;
          if (diagnostics.warning) {
            // 有明确告警（schema 变更等）
            hint = `⚠️ ${diagnostics.warning}`;
          } else if (diagnostics.withContent === 0) {
            hint =
              diagnostics.bufferSize < 10
                ? '（该分段可能没有弹幕）'
                : `⚠️ 未识别到弹幕数据。buffer=${diagnostics.bufferSize} 字节，` +
                  `外层 Elems=${diagnostics.outerElemsFound}`;
          } else {
            hint = `⚠️ 解析异常: ${diagnostics.outerElemsFound} 个 elem 中找到 ${diagnostics.withContent} 个内容但结果为空`;
          }
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

        const f = (n: unknown) => {
          const v = Number(n) || 0;
          if (v >= 10000) return (v / 10000).toFixed(1) + '万';
          return String(v);
        };

        const lines = list.map((v: Record<string, unknown>, i: number) => {
          const owner = (v.owner as Record<string, unknown>) || {};
          const stat = (v.stat as Record<string, unknown>) || {};
          const duration = (v.duration as number) || 0;
          const dur = duration > 0
            ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
            : '?';
          const isPay = (v.ugc_pay === 1 || v.arc_pay === 1) ? ' [付费]' : '';
          return [
            `${i + 1}. ${v.title || '?'}${isPay}`,
            `   UP主: ${owner.name || '?'} (uid:${owner.mid || '?'})`,
            `   分区: ${v.tname || '?'}  时长: ${dur}`,
            `   ▶${f(stat.view)}  💬${f(stat.danmaku)}  👍${f(stat.like)}  ⭐${f(stat.favorite)}  🪙${f(stat.coin)}  🔁${f(stat.share)}`,
            typeof stat.his_rank === 'number' && stat.his_rank > 0 ? `   历史最高排名: ${stat.his_rank}` : '',
          ].filter(Boolean).join('\n');
        });

        return {
          content: [
            {
              type: 'text',
              text: `🔥 B站热门视频（第${params.page ?? 1}页）:\n${'─'.repeat(40)}\n${lines.join('\n\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `获取热门视频失败: ${(err as Error).message}` },
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
        const data = biliApi.searchHot() as unknown as { trending?: { title?: string; list?: Array<Record<string, unknown>> } };
        // 实际结构是 data.trending.list
        const trending = data.trending || {};
        const list = trending.list || [];

        if (list.length === 0) {
          return {
            content: [{ type: 'text', text: '暂无热搜数据' }],
          };
        }

        const f = (n: unknown) => {
          const v = Number(n) || 0;
          if (v >= 10000) return (v / 10000).toFixed(1) + '万';
          return String(v);
        };

        const lines = list.map((item: Record<string, unknown>, i: number) => {
          const heat = item.heat_score ? `  热度 ${f(item.heat_score)}` : '';
          return `${i + 1}. ${item.show_name || item.keyword || '?'}${heat}`;
        });

        const header = trending.title ? `【${trending.title}】\n` : '';
        return {
          content: [
            { type: 'text', text: `🔥 B站热搜\n${header}${lines.join('\n')}` },
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
