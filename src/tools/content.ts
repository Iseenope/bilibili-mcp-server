import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';

/** 数字格式化 */
function formatNum(n: unknown): string {
  const v = Number(n) || 0;
  if (v >= 10000) return (v / 10000).toFixed(1) + '万';
  return String(v);
}

/** 注册动态和专栏相关工具 */
export function registerContentTools(server: McpServer): void {
  // ─── UP主动态 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_user_dynamics',
    {
      description: '获取指定 UP 主的最新动态（包括视频投稿、转发、图文等）',
      inputSchema: {
        uid: z.number().describe('UP主 UID'),
        max: z
          .number()
          .optional()
          .default(10)
          .describe('最多返回几条动态（默认 10）'),
      },
    },
    async (params) => {
      try {
        const data = await biliApi.userDynamics({
          host_mid: String(params.uid),
        });
        const items = (data.items || []) as Array<Record<string, unknown>>;

        if (items.length === 0) {
          return {
            content: [
              { type: 'text', text: `UP主 uid:${params.uid} 暂无最新动态` },
            ],
          };
        }

        const display = items.slice(0, params.max ?? 10);

        const typeMap: Record<string, string> = {
          DYNAMIC_TYPE_VIDEO: '视频',
          DYNAMIC_TYPE_AV: '视频',
          DYNAMIC_TYPE_DRAW: '图文',
          DYNAMIC_TYPE_WORD: '文字',
          DYNAMIC_TYPE_FORWARD: '转发',
          DYNAMIC_TYPE_ARTICLE: '专栏',
          DYNAMIC_TYPE_MUSIC: '音乐',
          DYNAMIC_TYPE_LIVE_RCMD: '直播',
          DYNAMIC_TYPE_LIVE: '直播开播',
          DYNAMIC_TYPE_PGC: '剧集',
          DYNAMIC_TYPE_TV: '番剧',
        };

        const lines = display.map((item: Record<string, unknown>, i: number) => {
          const modules = (item.modules || {}) as Record<string, unknown>;
          const author = (modules.module_author as Record<string, unknown>) || {};
          const dynamic = (modules.module_dynamic as Record<string, unknown>) || {};
          const desc = (dynamic.desc as Record<string, unknown>) || {};
          const major = (dynamic.major as Record<string, unknown>) || {};
          const archive = (major.archive as Record<string, unknown>) || {};

          const dynamicType = (item.type as string) || '';
          const typeLabel = typeMap[dynamicType] || dynamicType.replace('DYNAMIC_TYPE_', '');

          const text = (desc.text as string) || '';
          const archiveTitle = (archive.title as string) || '';
          const articleTitle = ((major.article as Record<string, unknown>)?.title as string) || '';
          const pubTs = (author.pub_ts as number) || 0;
          const pubTime = pubTs ? new Date(pubTs * 1000).toLocaleString('zh-CN') : '?';
          const archiveStat = (archive.stat as Record<string, unknown>) || {};

          const displayText = text || archiveTitle || articleTitle || '(无内容)';
          const statStr = archiveStat.view
            ? ` ▶${formatNum(archiveStat.view)}  💬${formatNum(archiveStat.danmaku)}  👍${formatNum(archiveStat.like)}`
            : '';

          return `${i + 1}. [${typeLabel}] ${displayText}\n   作者: ${author.name || '?'} (uid: ${author.mid || '?'})\n   时间: ${pubTime}${statStr}`;
        });

        const total = (data as { total?: number }).total || items.length;
        const hasMore = items.length > (params.max ?? 10);
        return {
          content: [
            {
              type: 'text',
              text: `UP主 uid:${params.uid} 的动态（共 ${total} 条）:\n${'─'.repeat(40)}\n${lines.join('\n\n')}${hasMore ? '\n...' : ''}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `获取动态失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 专栏内容 ─────────────────────────────────────────
  server.registerTool(
    'bilibili_article_info',
    {
      description: '获取 B站 专栏文章的详细内容，包含标题、正文、发布时间、作者、数据统计等',
      inputSchema: {
        cvid: z.number().describe('专栏文章 ID（CV 号，如 123456）'),
      },
    },
    async (params) => {
      try {
        const data = (await biliApi.articleInfo(params.cvid)) as Record<string, unknown>;

        if (!data || Object.keys(data).length === 0 || !data.title) {
          return {
            content: [
              {
                type: 'text',
                text: `未找到专栏文章 cv:${params.cvid}`,
              },
            ],
          };
        }

        const title = (data.title as string) || '?';
        const summary = (data.summary as string) || '';
        const content = (data.content as string) || '';
        const publishTime = (data.publish_time as number) || 0;
        const mtime = (data.mtime as number) || 0;
        const author = (data.author as Record<string, unknown>) || {};
        const stats = (data.stats as Record<string, unknown>) || {};
        const category = (data.category as Record<string, unknown>) || {};
        const keywords = (data.keywords as string) || '';
        const isOriginal = data.original === 1;
        const canReprint = data.reprint === 1;
        const state = data.state;

        const plainText = content.replace(/<[^>]*>/g, '');
        const wordCount = plainText.length;
        const excerpt = plainText.substring(0, 500);

        const lines: string[] = [
          `${title}`,
          `${'─'.repeat(40)}`,
          `作者: ${author.name || '?'} (uid: ${author.mid || '?'})`,
          `分类: ${category.name || '?'}`,
          `类型: ${isOriginal ? '原创' : '非原创'}` +
            (canReprint ? '  允许转载' : '  禁止转载'),
          `字数: ${wordCount}` + (data.words ? `  (后端报告: ${data.words})` : ''),
          `状态: ${state === 0 ? '正常' : state === 2 ? '已删除' : '状态码' + state}`,
          `发布时间: ${publishTime ? new Date(publishTime * 1000).toLocaleString('zh-CN') : '?'}`,
          `最后修改: ${mtime ? new Date(mtime * 1000).toLocaleString('zh-CN') : '?'}`,
          ``,
          `数据统计:`,
          `  阅读: ${formatNum(stats.view)}  点赞: ${formatNum(stats.like)}  投币: ${formatNum(stats.coin)}  收藏: ${formatNum(stats.favorite)}`,
          `  评论: ${formatNum(stats.reply)}  分享: ${formatNum(stats.share)}`,
        ];
        if (keywords) lines.push(`关键词: ${keywords}`);
        if (summary) lines.push(``, `简介: ${summary.slice(0, 200)}`);
        lines.push(``, `内容预览（前 500 字）:`, excerpt);
        if (wordCount > 500) {
          lines.push(`...（共 ${wordCount} 字，已截断）`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `获取专栏失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── UP主专栏列表 ─────────────────────────────────────
  server.registerTool(
    'bilibili_user_articles',
    {
      description: '获取指定 UP 主发布的专栏文章列表，包含阅读数、发布时间等',
      inputSchema: {
        uid: z.number().describe('UP主 UID'),
        max: z
          .number()
          .optional()
          .default(10)
          .describe('最多返回几条专栏（默认 10）'),
      },
    },
    async (params) => {
      try {
        const data = await biliApi.userArticles({
          mid: String(params.uid),
          ps: String(params.max ?? 10),
        });
        const articles = (data.articles || []) as Array<Record<string, unknown>>;

        if (articles.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `UP主 uid:${params.uid} 暂无专栏文章`,
              },
            ],
          };
        }

        const lines = articles.map((a: Record<string, unknown>, i: number) => {
          const title = (a.title as string) || '?';
          const cvid = (a.id as number) || 0;
          const stats = (a.stats as Record<string, unknown>) || {};
          const pubTime = (a.publish_time as number) || 0;
          const dateStr = pubTime ? new Date(pubTime * 1000).toLocaleDateString('zh-CN') : '?';
          const isOriginal = a.original === 1 ? '原创' : '转载';
          return `${i + 1}. ${title}\n   cv:${cvid}  ${dateStr}  ${isOriginal}\n   阅读: ${formatNum(stats.view)}  点赞: ${formatNum(stats.like)}  评论: ${formatNum(stats.reply)}`;
        });

        const total = (data as { total?: number }).total;
        const header = total ? `UP主 uid:${params.uid} 的专栏（总共 ${total} 篇）:\n` :
                              `UP主 uid:${params.uid} 的专栏:\n`;
        return {
          content: [
            {
              type: 'text',
              text: `${header}${'─'.repeat(40)}\n${lines.join('\n\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `获取专栏列表失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
