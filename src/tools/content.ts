import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';

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
        const lines = display.map((item: Record<string, unknown>, i: number) => {
          const modules = (item.modules || {}) as Record<string, unknown>;
          const dynamic = (item.type || '') as string;
          const desc = (modules.module_dynamic || {}) as Record<string, unknown>;
          const major = (desc.major || {}) as Record<string, unknown>;
          const archive = (major.archive || {}) as Record<string, unknown>;

          // 尝试从多个可能的位置提取描述
          let descText = (desc.desc || '') as string;
          if (!descText && archive.title) {
            descText = String(archive.title);
          }
          // 如果还没有，尝试从 module_author 取 pub_ts 或 name
          if (!descText) {
            const author = (modules.module_author || {}) as Record<string, unknown>;
            descText = String(author.pub_ts || author.name || '');
          }

          const typeMap: Record<string, string> = {
            'DYNAMIC_TYPE_VIDEO': '🎬 视频',
            'DYNAMIC_TYPE_AV': '🎬 视频',
            'DYNAMIC_TYPE_DRAW': '🖼️ 图文',
            'DYNAMIC_TYPE_WORD': '📝 文字',
            'DYNAMIC_TYPE_FORWARD': '🔄 转发',
            'DYNAMIC_TYPE_ARTICLE': '📰 专栏',
            'DYNAMIC_TYPE_MUSIC': '🎵 音乐',
          };

          const typeLabel = typeMap[dynamic] || '📌 动态';
          return `${i + 1}. ${typeLabel}: ${descText.substring(0, 100)}`;
        });

        const hasMore = items.length > (params.max ?? 10);
        return {
          content: [
            {
              type: 'text',
              text: `📱 UP主 uid:${params.uid} 的动态:\n${lines.join('\n')}${hasMore ? '\n...' : ''}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 获取动态失败: ${(err as Error).message}`,
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
      description: '获取 B站 专栏文章的详细内容，包含标题、正文、发布时间等',
      inputSchema: {
        cvid: z.number().describe('专栏文章 ID（CV 号，如 123456）'),
      },
    },
    async (params) => {
      try {
        const data = (await biliApi.articleInfo(params.cvid)) as Record<string, unknown>;

        // 检查 data 是否有效
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
        const content = (data.content as string) || '';
        const publishTime = (data.publish_time as number) || 0;
        const author = (data.author as Record<string, unknown>) || {};
        const stats = (data.stats as Record<string, unknown>) || {};

        // 去除 HTML 标签
        const plainText = content.replace(/<[^>]*>/g, '');
        const excerpt = plainText.substring(0, 500);

        const lines = [
          `📰 ${title}`,
          `作者: ${author.name || '?'}`,
          `时间: ${publishTime ? new Date(publishTime * 1000).toLocaleDateString('zh-CN') : '?'}`,
          `字数: ${plainText.length}`,
          `阅读: ${stats.view || 0} 点赞: ${stats.like || 0}`,
          '',
          `📖 内容预览:`,
          excerpt,
          plainText.length > 500 ? '\n...（内容过长已截断）' : '',
        ];

        return {
          content: [{ type: 'text', text: lines.filter(Boolean).join('\n') }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 获取专栏失败: ${(err as Error).message}`,
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
      description: '获取指定 UP 主发布的专栏文章列表',
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
          const view = (a.stats as Record<string, unknown>)?.view || 0;
          return `${i + 1}. ${title} (cv:${cvid} | ${view}阅读)`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `📰 UP主 uid:${params.uid} 的专栏:\n${lines.join('\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ 获取专栏列表失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
