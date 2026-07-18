import { describe, it, expect } from 'vitest';

describe('项目结构完整性', () => {
  it('所有测试文件应存在', async () => {
    const fs = await import('node:fs');
    const files = [
      'tests/wbi.test.ts',
      'tests/config.test.ts',
      'tests/structure.test.ts',
      'tests/danmaku.test.ts',
    ];
    for (const file of files) {
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it('所有源码文件应存在', async () => {
    const fs = await import('node:fs');
    const files = [
      'src/index.ts',
      'src/env.ts',
      'src/config.ts',
      'src/api/bilibili.ts',
      'src/api/wbi.ts',
      'src/api/cookie.ts',
      'src/api/http.ts',
      'src/api/login.ts',
      'src/api/danmaku.ts',
      'src/types/index.ts',
      'src/tools/comment.ts',
      'src/tools/video.ts',
      'src/tools/user.ts',
      'src/tools/message.ts',
      'src/tools/login.ts',
      'src/tools/content.ts',
      'src/tools/live.ts',
      'src/tools/follow.ts',
      'src/tools/interaction.ts',
      'src/tools/download.ts',
    ];
    for (const file of files) {
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it('构建输出文件应存在', async () => {
    const fs = await import('node:fs');
    const files = [
      'dist/index.js',
      'dist/config.js',
      'dist/env.js',
      'dist/api/bilibili.js',
      'dist/api/wbi.js',
      'dist/api/cookie.js',
      'dist/api/http.js',
      'dist/api/login.js',
      'dist/api/danmaku.js',
      'dist/types/index.js',
      'dist/tools/comment.js',
      'dist/tools/video.js',
      'dist/tools/user.js',
      'dist/tools/message.js',
      'dist/tools/login.js',
      'dist/tools/content.js',
      'dist/tools/live.js',
      'dist/tools/follow.js',
      'dist/tools/interaction.js',
      'dist/tools/download.js',
    ];
    for (const file of files) {
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it('package.json 应包含必要字段', async () => {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    expect(pkg.default.name).toBe('bilibili-mcp-server');
    expect(pkg.default.type).toBe('module');
    expect(pkg.default.bin).toHaveProperty('bilibili-mcp-server');
    expect(pkg.default.dependencies).toHaveProperty('@modelcontextprotocol/sdk');
    expect(pkg.default.dependencies).toHaveProperty('zod');
    // Node 版本约束 - 必须包含 >= 22
    expect(pkg.default.engines.node).toMatch(/>=22/);
  });

  it('tsconfig.json 应启用 strict 模式', async () => {
    const tsconfig = await import('../tsconfig.json', { with: { type: 'json' } });
    expect(tsconfig.default.compilerOptions.strict).toBe(true);
    expect(tsconfig.default.compilerOptions.module).toBe('NodeNext');
  });

  it('.env.example 和 .npmignore 应存在', async () => {
    const fs = await import('node:fs');
    expect(fs.existsSync('.env.example')).toBe(true);
    expect(fs.existsSync('.npmignore')).toBe(true);
  });
});

describe('工具注册完整性', () => {
  it('所有工具模块应导出注册函数', async () => {
    const comment = await import('../src/tools/comment.js');
    const video = await import('../src/tools/video.js');
    const user = await import('../src/tools/user.js');
    const message = await import('../src/tools/message.js');
    const login = await import('../src/tools/login.js');
    const content = await import('../src/tools/content.js');
    const live = await import('../src/tools/live.js');
    const follow = await import('../src/tools/follow.js');
    const interaction = await import('../src/tools/interaction.js');
    const download = await import('../src/tools/download.js');

    expect(comment.registerCommentTools).toBeTypeOf('function');
    expect(video.registerVideoTools).toBeTypeOf('function');
    expect(user.registerUserTools).toBeTypeOf('function');
    expect(message.registerMessageTools).toBeTypeOf('function');
    expect(login.registerLoginTools).toBeTypeOf('function');
    expect(content.registerContentTools).toBeTypeOf('function');
    expect(live.registerLiveTools).toBeTypeOf('function');
    expect(follow.registerFollowTools).toBeTypeOf('function');
    expect(interaction.registerInteractionTools).toBeTypeOf('function');
    expect(download.registerDownloadTools).toBeTypeOf('function');
  });

  it('API 模块应导出必要函数', async () => {
    const biliApi = await import('../src/api/bilibili.js');
    expect(biliApi.biliApi).toBeTypeOf('object');
    expect(biliApi.parseVideoId).toBeTypeOf('function');
    expect(biliApi.extractAid).toBeTypeOf('function');
  });

  it('WBI 模块应导出核心函数', async () => {
    const wbi = await import('../src/api/wbi.js');
    expect(wbi.getWbiKeys).toBeTypeOf('function');
    expect(wbi.signWbi).toBeTypeOf('function');
    expect(wbi.clearWbiCache).toBeTypeOf('function');
  });

  it('HTTP 模块应导出共享函数', async () => {
    const http = await import('../src/api/http.js');
    expect(http.noProxyFetch).toBeTypeOf('function');
    expect(http.isRetryableError).toBeTypeOf('function');
    expect(http.getAllSetCookies).toBeTypeOf('function');
  });

  it('Login 模块应导出登录函数', async () => {
    const login = await import('../src/api/login.js');
    expect(login.generateQrCode).toBeTypeOf('function');
    expect(login.pollQrCode).toBeTypeOf('function');
  });

  it('Danmaku 模块应导出解析函数', async () => {
    const danmaku = await import('../src/api/danmaku.js');
    expect(danmaku.parseDanmakuBuffer).toBeTypeOf('function');
  });

  it('env 模块应导出 .env 加载函数', async () => {
    const env = await import('../src/env.js');
    expect(env.loadEnvFile).toBeTypeOf('function');
  });
});

describe('getAllSetCookies 兼容性', () => {
  it('应能正确解析 Set-Cookie 头（Node 18 兼容）', async () => {
    const { getAllSetCookies } = await import('../src/api/http.js');

    // 模拟 Node 18 环境下 get('set-cookie') 返回的合并字符串
    const mockHeaders = {
      get: (name: string) => {
        if (name === 'set-cookie') {
          return 'SESSDATA=abc123; Path=/; HttpOnly, bili_jct=def456; Path=/, DedeUserID=789; Path=/';
        }
        return null;
      },
    } as unknown as Headers;

    const cookies = getAllSetCookies(mockHeaders);
    expect(cookies).toHaveLength(3);
    expect(cookies[0]).toContain('SESSDATA=abc123');
    expect(cookies[1]).toContain('bili_jct=def456');
    expect(cookies[2]).toContain('DedeUserID=789');
  });

  it('应避免在 Expires 字段中的逗号处误分', async () => {
    const { getAllSetCookies } = await import('../src/api/http.js');

    const mockHeaders = {
      get: (name: string) => {
        if (name === 'set-cookie') {
          return 'SESSDATA=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/, bili_jct=def; Path=/';
        }
        return null;
      },
    } as unknown as Headers;

    const cookies = getAllSetCookies(mockHeaders);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('Expires=Wed, 21 Oct 2026 07:28:00 GMT');
    expect(cookies[1]).toContain('bili_jct=def');
  });

  it('空 headers 时返回空数组', async () => {
    const { getAllSetCookies } = await import('../src/api/http.js');
    const mockHeaders = {
      get: () => null,
    } as unknown as Headers;
    expect(getAllSetCookies(mockHeaders)).toEqual([]);
  });
});
