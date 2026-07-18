import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { generateQrCode, pollQrCode } from '../api/login.js';

/** 注册登录相关工具 */
export function registerLoginTools(server: McpServer): void {
  // ─── 生成登录二维码 ───────────────────────────────────
  server.registerTool(
    'bilibili_login',
    {
      description: '生成 B站 扫码登录二维码。返回二维码图片（Base64）和 login_key，将 login_key 传给 bilibili_login_check 检查登录状态',
      inputSchema: {},
    },
    async () => {
      try {
        const qr = await generateQrCode();
        return {
          content: [
            {
              type: 'text',
              text: [
                '📱 B站 扫码登录',
                '',
                '请用手机 B站 App 扫描以下二维码：',
                qr.url,
                '',
                '扫码后，请调用 bilibili_login_check 检查登录状态',
                '参数: { "loginKey": "' + qr.qrcode_key + '" }',
              ].join('\n'),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            { type: 'text', text: `生成二维码失败: ${(err as Error).message}` },
          ],
          isError: true,
        };
      }
    }
  );

  // ─── 检查扫码状态 ─────────────────────────────────────
  server.registerTool(
    'bilibili_login_check',
    {
      description: '检查 B站 扫码登录状态。调用 bilibili_login 获取二维码后，传入返回的 loginKey 进行轮询检查。扫码成功后自动保存 Cookie',
      inputSchema: {
        loginKey: z.string().describe('bilibili_login 返回的 loginKey'),
        maxRetries: z
          .number()
          .optional()
          .default(30)
          .describe('最多轮询次数（每次间隔 2 秒），默认 30 次约 60 秒'),
      },
    },
    async (params) => {
      try {
        const result = await pollQrCode(params.loginKey, params.maxRetries ?? 30);

        if (result.status === 'confirmed') {
          return {
            content: [{ type: 'text', text: result.message }],
          };
        }

        if (result.status === 'expired') {
          return {
            content: [
              {
                type: 'text',
                text: '二维码已过期，请重新调用 bilibili_login 生成新的二维码',
              },
            ],
            isError: true,
          };
        }

        if (result.status === 'pending') {
          return {
            content: [
              {
                type: 'text',
                text: result.message.includes('超时')
                  ? `⏰ 扫码超时，请重新调用 bilibili_login 生成新的二维码`
                  : `⏳ 等待扫码中...（${result.message}）\n请用手机 B站 App 扫描二维码\n扫码后再次调用此工具检查状态`,
              },
            ],
          };
        }

        return {
          content: [{ type: 'text', text: result.message }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `检查登录状态失败: ${(err as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
