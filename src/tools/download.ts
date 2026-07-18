import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { biliApi } from '../api/bilibili.js';
import { getFullCookieString } from '../config.js';
import { noProxyFetch } from '../api/http.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

// ─── 画质映射 ───────────────────────────────────────────
const QUALITY_MAP: Record<number, string> = {
  16: '360P',
  32: '480P',
  64: '720P',
  80: '1080P',
  112: '1080P+',
  116: '1080P60',
  120: '4K',
  125: 'HDR',
  126: '杜比视界',
  127: '8K',
};

const DEFAULT_DOWNLOAD_DIR = './bilibili-downloads';

// ─── 工具函数 ───────────────────────────────────────────

/** 确保目录存在 */
async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** 获取 B 站头部（带完整 Cookie） */
function getBilibiliHeaders(): Record<string, string> {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Referer: 'https://www.bilibili.com',
    Cookie: getFullCookieString(),
  };
}

/** 下载单个文件到磁盘 */
async function downloadToFile(url: string, dest: string): Promise<number> {
  const res = await noProxyFetch(url, { headers: getBilibiliHeaders() });
  if (!res.ok) {
    throw new Error(`下载失败: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(dest, buf);
  return buf.length;
}

/** 拼接分段 URL（DASH 分片是相对路径时） */
function resolveSegmentUrl(baseUrl: string, segmentUrl: string): string {
  if (segmentUrl.startsWith('http')) return segmentUrl;
  if (segmentUrl.startsWith('/')) {
    const u = new URL(baseUrl);
    return `${u.protocol}//${u.host}${segmentUrl}`;
  }
  return baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1) + segmentUrl;
}

/** 解析 DASH 流的分片 URL 列表 */
function extractSegmentUrls(
  baseUrl: string,
  segmentBase: Record<string, unknown> | undefined
): string[] {
  if (!segmentBase) return [baseUrl];
  const urls: string[] = [];
  // SegmentBase: 单个 Initialization + 整个文件
  if (Array.isArray(segmentBase.SegmentURL)) {
    for (const s of segmentBase.SegmentURL) {
      const u = (s as Record<string, unknown>).Url;
      if (typeof u === 'string') urls.push(resolveSegmentUrl(baseUrl, u));
    }
  }
  // 兜底：baseUrl 本身是一个完整资源
  if (urls.length === 0) urls.push(baseUrl);
  return urls;
}

/** 合并音视频（用 ffmpeg） */
function mergeWithFfmpeg(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['-y', '-i', videoPath, '-i', audioPath, '-c', 'copy', outputPath];
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', err => {
      // ffmpeg 不存在时的特殊处理
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('系统未找到 ffmpeg。请先安装 ffmpeg 并加入 PATH（macOS: brew install ffmpeg，Windows: choco install ffmpeg，Linux: apt install ffmpeg）'));
      } else {
        reject(err);
      }
    });
  });
}

// ─── 工具注册 ───────────────────────────────────────────

/** 注册下载工具 */
export function registerDownloadTools(server: McpServer): void {
  // ─── 视频下载 ───────────────────────────────────────
  server.registerTool(
    'bilibili_video_download',
    {
      description: '下载 B 站视频到本地。自动下载视频+音频并用 ffmpeg 合并为 MP4。要求系统已安装 ffmpeg。⚠️ 仅供个人备份使用，请勿传播。',
      inputSchema: {
        videoId: z.string().describe('视频 BV 号或 avid'),
        cid: z.number().optional().describe('分 P 的 cid（不指定则取第一 P）'),
        quality: z
          .enum(['1080P', '720P', '480P', '360P', '4K'])
          .optional()
          .default('1080P')
          .describe('画质，默认 1080P（大会员才能看 4K/1080P+）'),
        outputDir: z
          .string()
          .optional()
          .default(DEFAULT_DOWNLOAD_DIR)
          .describe(`输出目录，默认 ${DEFAULT_DOWNLOAD_DIR}`),
      },
    },
    async (params) => {
      try {
        // 1. 获取视频信息（标题、cid）
        const info = (await biliApi.videoInfo(params.videoId)) as Record<string, unknown>;
        const title = String(info.title || params.videoId).replace(/[\\/:*?"<>|]/g, '_');
        const pages = (info.pages as Array<{ cid: number; part?: string }>) || [];
        const cid = params.cid || (pages[0] && pages[0].cid);
        if (!cid) {
          return { content: [{ type: 'text', text: '下载失败：无法获取 cid' }], isError: true };
        }

        // 2. 获取播放地址
        const qualityCode = { '4K': 120, '1080P': 80, '720P': 64, '480P': 32, '360P': 16 }[params.quality] || 80;
        const playData = (await biliApi.playUrl({
          videoId: params.videoId,
          cid,
          qn: qualityCode,
          fnval: 16, // DASH
        })) as Record<string, unknown>;
        const dash = playData.dash as Record<string, unknown> | undefined;
        if (!dash) {
          return {
            content: [{ type: 'text', text: '下载失败：该视频无法获取 DASH 流（可能需要大会员或地区限制）' }],
            isError: true,
          };
        }

        const videos = (dash.video as Array<Record<string, unknown>>) || [];
        const audios = (dash.audio as Array<Record<string, unknown>>) || [];
        if (videos.length === 0 || audios.length === 0) {
          return { content: [{ type: 'text', text: '下载失败：未找到视频或音频流' }], isError: true };
        }

        // 选最佳画质（第一个就是最匹配的）
        const videoStream = videos[0];
        const audioStream = audios[0];
        const videoBaseUrl = videoStream.baseUrl as string;
        const audioBaseUrl = audioStream.baseUrl as string;
        const actualQuality = (videoStream.id as number) || qualityCode;

        // 3. 准备目录
        const targetDir = path.join(params.outputDir, title);
        await ensureDir(targetDir);

        // 4. 下载视频
        const videoSegmentUrls = extractSegmentUrls(videoBaseUrl, videoStream.SegmentBase as Record<string, unknown> | undefined);
        const audioSegmentUrls = extractSegmentUrls(audioBaseUrl, audioStream.SegmentBase as Record<string, unknown> | undefined);

        const downloadLog: string[] = [];
        let videoSize = 0;
        let audioSize = 0;

        // 简单实现：下载第一个分片（baseUrl 通常是完整可访问的 M4S）
        // 如果有多个分片则逐个下载并合并
        const videoTemp = path.join(targetDir, '.video.m4s');
        const audioTemp = path.join(targetDir, '.audio.m4s');

        if (videoSegmentUrls.length === 1) {
          videoSize = await downloadToFile(videoSegmentUrls[0], videoTemp);
        } else {
          const parts: Buffer[] = [];
          for (let i = 0; i < videoSegmentUrls.length; i++) {
            const u = videoSegmentUrls[i];
            const p = path.join(targetDir, `.video.${i}.m4s`);
            const size = await downloadToFile(u, p);
            parts.push(await fs.readFile(p));
            downloadLog.push(`视频分片 ${i + 1}/${videoSegmentUrls.length}: ${(size / 1024).toFixed(1)}KB`);
          }
          await fs.writeFile(videoTemp, Buffer.concat(parts));
          // 清理分片
          for (let i = 0; i < videoSegmentUrls.length; i++) {
            await fs.unlink(path.join(targetDir, `.video.${i}.m4s`)).catch(() => {});
          }
          videoSize = parts.reduce((s, b) => s + b.length, 0);
        }

        if (audioSegmentUrls.length === 1) {
          audioSize = await downloadToFile(audioSegmentUrls[0], audioTemp);
        } else {
          const parts: Buffer[] = [];
          for (let i = 0; i < audioSegmentUrls.length; i++) {
            const u = audioSegmentUrls[i];
            const p = path.join(targetDir, `.audio.${i}.m4s`);
            const size = await downloadToFile(u, p);
            parts.push(await fs.readFile(p));
            downloadLog.push(`音频分片 ${i + 1}/${audioSegmentUrls.length}: ${(size / 1024).toFixed(1)}KB`);
          }
          await fs.writeFile(audioTemp, Buffer.concat(parts));
          for (let i = 0; i < audioSegmentUrls.length; i++) {
            await fs.unlink(path.join(targetDir, `.audio.${i}.m4s`)).catch(() => {});
          }
          audioSize = parts.reduce((s, b) => s + b.length, 0);
        }

        // 5. 用 ffmpeg 合并
        const outputPath = path.join(targetDir, `${title}.mp4`);
        try {
          await mergeWithFfmpeg(videoTemp, audioTemp, outputPath);
        } finally {
          // 清理临时文件
          await fs.unlink(videoTemp).catch(() => {});
          await fs.unlink(audioTemp).catch(() => {});
        }

        const totalSize = videoSize + audioSize;
        const sizeMB = (totalSize / 1024 / 1024).toFixed(1);

        return {
          content: [
            {
              type: 'text',
              text: [
                `视频下载完成`,
                `${'─'.repeat(40)}`,
                `标题: ${title}`,
                `画质: ${QUALITY_MAP[actualQuality] || actualQuality}`,
                `视频大小: ${(videoSize / 1024 / 1024).toFixed(1)}MB`,
                `音频大小: ${(audioSize / 1024 / 1024).toFixed(1)}MB`,
                `总计: ${sizeMB}MB`,
                `保存路径: ${outputPath}`,
                ...(downloadLog.length > 0 ? [``, `分片下载:`, ...downloadLog] : []),
                ``,
                `⚠️ 仅供个人备份，请勿传播。`,
              ].join('\n'),
            },
          ],
        };
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('ffmpeg')) {
          return {
            content: [
              {
                type: 'text',
                text: `下载失败：${msg}\n\nffmpeg 安装方法：\n- macOS: brew install ffmpeg\n- Windows: choco install ffmpeg 或 scoop install ffmpeg\n- Linux: apt install ffmpeg / yum install ffmpeg`,
              },
            ],
            isError: true,
          };
        }
        if (msg.includes('-352') || msg.includes('风控')) {
          return {
            content: [
              {
                type: 'text',
                text: `下载失败：B 站风控拦截。\n建议：\n1. 在浏览器中打开视频播放一次获取最新 cookie\n2. 检查账号是否被风控\n3. 换一个时间段再试\n\n错误：${msg}`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: `下载失败: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ─── 专栏下载 ───────────────────────────────────────
  server.registerTool(
    'bilibili_article_download',
    {
      description: '下载 B 站专栏为 Markdown 文件（可选择是否下载图片）。',
      inputSchema: {
        cvid: z.number().describe('专栏文章 ID（CV 号）'),
        outputDir: z
          .string()
          .optional()
          .default(DEFAULT_DOWNLOAD_DIR)
          .describe(`输出目录，默认 ${DEFAULT_DOWNLOAD_DIR}`),
        downloadImages: z
          .boolean()
          .optional()
          .default(true)
          .describe('是否下载文章中的图片到本地（默认 true）'),
      },
    },
    async (params) => {
      try {
        const data = (await biliApi.articleInfo(params.cvid)) as Record<string, unknown>;
        if (!data || !data.title) {
          return { content: [{ type: 'text', text: '下载失败：未找到该专栏' }], isError: true };
        }

        const title = String(data.title).replace(/[\\/:*?"<>|]/g, '_');
        const author = ((data.author as Record<string, unknown>)?.name as string) || '未知';
        const summary = (data.summary as string) || '';
        const content = (data.content as string) || '';
        const publishTime = (data.publish_time as number) || 0;
        const stats = (data.stats as Record<string, unknown>) || {};
        const words = (data.words as number) || 0;
        const keywords = (data.keywords as string) || '';
        const pubDate = publishTime ? new Date(publishTime * 1000).toLocaleString('zh-CN') : '';

        // 准备目录
        const targetDir = path.join(params.outputDir, 'articles', `${params.cvid}_${title}`);
        await ensureDir(targetDir);
        const imagesDir = path.join(targetDir, 'images');
        if (params.downloadImages) await ensureDir(imagesDir);

        // 提取图片 URL（用于下载）
        const imgUrlRegex = /<img[^>]*src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/g;
        const imageMatches: { url: string; alt: string }[] = [];
        let m;
        while ((m = imgUrlRegex.exec(content)) !== null) {
          // 跳过 B 站的表情、图标
          if (!/emoji|bili-ticket|icon/i.test(m[1])) {
            imageMatches.push({ url: m[1], alt: m[2] || '' });
          }
        }

        // 下载图片
        const imgDownloads: string[] = [];
        if (params.downloadImages && imageMatches.length > 0) {
          for (let i = 0; i < imageMatches.length; i++) {
            const img = imageMatches[i];
            const ext = (img.url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)?.[1]) || 'png';
            const imgName = `image_${String(i + 1).padStart(3, '0')}.${ext}`;
            const imgPath = path.join(imagesDir, imgName);
            try {
              // 处理协议相对 URL
              let fullUrl = img.url;
              if (fullUrl.startsWith('//')) fullUrl = 'https:' + fullUrl;
              await downloadToFile(fullUrl, imgPath);
              imgDownloads.push(`- [${img.alt || imgName}](./images/${imgName})`);
            } catch {
              // 单张图片下载失败不中断整个流程
              imgDownloads.push(`- [${img.alt || imgName}](${img.url}) [下载失败]`);
            }
          }
        }

        // HTML → Markdown（简化转换）
        let markdown = content
          // 标题
          .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
          .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
          .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
          .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n')
          // 段落
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
          // 粗体/斜体
          .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
          .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
          // 代码块
          .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
          .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
          // 引用
          .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n')
          // 链接
          .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
          // 列表
          .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
          .replace(/<\/?(ul|ol)[^>]*>/gi, '\n')
          // 图片（如果下载了图片则用本地路径，否则用远程 URL）
          .replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, (_, url, alt) => {
            if (params.downloadImages) {
              const idx = imageMatches.findIndex(im => im.url === url);
              if (idx >= 0) {
                const ext = (url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)?.[1]) || 'png';
                return `![${alt}](./images/image_${String(idx + 1).padStart(3, '0')}.${ext})`;
              }
            }
            // 处理协议相对 URL
            const fullUrl = url.startsWith('//') ? 'https:' + url : url;
            return `![${alt}](${fullUrl})`;
          })
          .replace(/<img[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, (_, url) => {
            if (params.downloadImages) {
              const idx = imageMatches.findIndex(im => im.url === url);
              if (idx >= 0) {
                const ext = (url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)?.[1]) || 'png';
                return `![](./images/image_${String(idx + 1).padStart(3, '0')}.${ext})`;
              }
            }
            const fullUrl = url.startsWith('//') ? 'https:' + url : url;
            return `![](${fullUrl})`;
          })
          // 换行
          .replace(/<br\s*\/?>/gi, '\n')
          // 剩余标签去除
          .replace(/<[^>]+>/g, '')
          // HTML 实体
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ');

        // 整理空行
        markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

        // 构建完整 Markdown 文件
        const fullMd = [
          `# ${title}`,
          ``,
          `> 作者: ${author}`,
          `> 发布时间: ${pubDate}`,
          `> 字数: ${words}`,
          `> 阅读: ${stats.view || 0}  点赞: ${stats.like || 0}  评论: ${stats.reply || 0}`,
          keywords ? `> 关键词: ${keywords}` : '',
          ``,
          `## 简介`,
          summary,
          ``,
          `---`,
          ``,
          markdown,
        ]
          .filter(line => line !== null && line !== undefined)
          .join('\n');

        // 写入文件
        const mdPath = path.join(targetDir, 'README.md');
        await fs.writeFile(mdPath, fullMd, 'utf-8');

        return {
          content: [
            {
              type: 'text',
              text: [
                `专栏下载完成`,
                `${'─'.repeat(40)}`,
                `标题: ${title}`,
                `作者: ${author}`,
                `字数: ${words}`,
                `图片: ${imgDownloads.length > 0 ? `${imgDownloads.filter(d => !d.includes('下载失败')).length}/${imageMatches.length} 张下载成功` : '0 张'}`,
                `保存路径: ${mdPath}`,
                ``,
                `包含本地图片的相对路径：`,
                ...(imgDownloads.length > 0 ? imgDownloads.slice(0, 5) : ['(无图片)']),
                ...(imgDownloads.length > 5 ? [`... 还有 ${imgDownloads.length - 5} 张`] : []),
              ].join('\n'),
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `下载失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── 下载列表 ───────────────────────────────────────
  server.registerTool(
    'bilibili_download_list',
    {
      description: '查看已下载的文件列表（按时间倒序）',
      inputSchema: {
        outputDir: z
          .string()
          .optional()
          .default(DEFAULT_DOWNLOAD_DIR)
          .describe(`下载目录，默认 ${DEFAULT_DOWNLOAD_DIR}`),
      },
    },
    async (params) => {
      try {
        const dir = params.outputDir;
        try {
          await fs.access(dir);
        } catch {
          return {
            content: [{ type: 'text', text: `下载目录 ${dir} 不存在或为空` }],
          };
        }

        const entries = await fs.readdir(dir, { withFileTypes: true });
        const items: { name: string; type: string; size: number; mtime: string }[] = [];

        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          try {
            const stat = await fs.stat(full);
            items.push({
              name: entry.name,
              type: entry.isDirectory() ? '目录' : '文件',
              size: stat.size,
              mtime: stat.mtime.toISOString().slice(0, 19).replace('T', ' '),
            });
          } catch {
            // 忽略
          }
        }

        // 排序：按修改时间倒序
        items.sort((a, b) => b.mtime.localeCompare(a.mtime));

        if (items.length === 0) {
          return { content: [{ type: 'text', text: `${dir} 为空` }] };
        }

        const lines = items.map((it, i) => {
          const size = it.type === '文件'
            ? it.size > 1024 * 1024
              ? `(${(it.size / 1024 / 1024).toFixed(1)}MB)`
              : `(${(it.size / 1024).toFixed(1)}KB)`
            : '';
          return `${i + 1}. [${it.type}] ${it.name} ${size}\n   修改时间: ${it.mtime}`;
        });

        return {
          content: [
            {
              type: 'text',
              text: `下载目录列表（${dir}）\n${'─'.repeat(40)}\n${lines.join('\n\n')}`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `查看失败: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );
}
