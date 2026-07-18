import { describe, it, expect, beforeEach } from 'vitest';

describe('配置管理', () => {
  beforeEach(async () => {
    // 清除配置缓存
    const { clearConfigCache } = await import('../src/config.js');
    clearConfigCache();
    // 清空 B站相关环境变量
    delete process.env.BILIBILI_SESSDATA;
    delete process.env.BILIBILI_BILI_JCT;
    delete process.env.BILIBILI_DEDE_USER_ID;
    delete process.env.BILIBILI_AUTO_REFRESH;
    delete process.env.BILIBILI_REFRESH_TOKEN;
  });

  it('环境变量缺失时应有默认值', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.sessdata).toBe('');
    expect(config.bili_jct).toBe('');
    expect(config.dede_user_id).toBe('');
    expect(config.autoRefresh).toBe(true);
  });

  it('应正确读取环境变量', async () => {
    process.env.BILIBILI_SESSDATA = 'test_sessdata';
    process.env.BILIBILI_BILI_JCT = 'test_jct';
    process.env.BILIBILI_DEDE_USER_ID = '12345';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.sessdata).toBe('test_sessdata');
    expect(config.bili_jct).toBe('test_jct');
    expect(config.dede_user_id).toBe('12345');
  });

  it('BILIBILI_AUTO_REFRESH=false 应关闭自动刷新', async () => {
    process.env.BILIBILI_AUTO_REFRESH = 'false';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.autoRefresh).toBe(false);
  });

  it('应正确读取 refresh_token', async () => {
    process.env.BILIBILI_REFRESH_TOKEN = 'test_refresh_token';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();
    expect(config.refreshToken).toBe('test_refresh_token');
  });
});

describe('getCookie', () => {
  beforeEach(async () => {
    const { clearConfigCache } = await import('../src/config.js');
    clearConfigCache();
  });

  it('应返回包含必要字段的 Cookie 对象', async () => {
    process.env.BILIBILI_SESSDATA = 'sess';
    process.env.BILIBILI_BILI_JCT = 'jct';
    process.env.BILIBILI_DEDE_USER_ID = 'uid';

    const { getCookie } = await import('../src/config.js');
    const cookie = getCookie();
    expect(cookie).toHaveProperty('sessdata');
    expect(cookie).toHaveProperty('bili_jct');
    expect(cookie).toHaveProperty('dede_user_id');
  });
});
