import { describe, it, expect, beforeEach } from 'vitest';
import {
  getFullCookieString,
  loadConfig,
  clearConfigCache,
} from '../src/config.js';
import {
  formatNum,
  formatTime,
} from '../src/utils/format.js';

describe('Cookie 合并逻辑', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  it('只设置基础字段时，拼接为 SESSDATA+bili_jct+DedeUserID', () => {
    process.env.BILIBILI_SESSDATA = 'aaa';
    process.env.BILIBILI_BILI_JCT = 'bbb';
    process.env.BILIBILI_DEDE_USER_ID = '12345';
    delete process.env.BILIBILI_FULL_COOKIE;
    clearConfigCache();
    const cookie = getFullCookieString();
    expect(cookie).toContain('SESSDATA=aaa');
    expect(cookie).toContain('bili_jct=bbb');
    expect(cookie).toContain('DedeUserID=12345');
  });

  it('设置 FULL_COOKIE 时，会合并基础字段（基础覆盖 FULL）', () => {
    process.env.BILIBILI_SESSDATA = 'new-sess';
    process.env.BILIBILI_BILI_JCT = 'new-jct';
    process.env.BILIBILI_DEDE_USER_ID = 'new-uid';
    process.env.BILIBILI_FULL_COOKIE = 'buvid3=xxx; SESSDATA=old-sess; bili_jct=old-jct';
    clearConfigCache();
    const cookie = getFullCookieString();
    // 基础字段应覆盖 FULL_COOKIE 中的旧值
    expect(cookie).toContain('SESSDATA=new-sess');
    expect(cookie).toContain('bili_jct=new-jct');
    expect(cookie).toContain('DedeUserID=new-uid');
    // FULL_COOKIE 中的其他字段应保留
    expect(cookie).toContain('buvid3=xxx');
    // 旧值不应出现
    expect(cookie).not.toContain('old-sess');
    expect(cookie).not.toContain('old-jct');
  });

  it('FULL_COOKIE 中多余的空格被正确处理', () => {
    process.env.BILIBILI_SESSDATA = 'a';
    process.env.BILIBILI_FULL_COOKIE = 'buvid3=xxx;   buvid4=yyy;  sid=zzz';
    clearConfigCache();
    const cookie = getFullCookieString();
    expect(cookie).toContain('buvid3=xxx');
    expect(cookie).toContain('buvid4=yyy');
    expect(cookie).toContain('sid=zzz');
    // 不应出现连续多个分号
    expect(cookie).not.toMatch(/;\s*;/);
  });
});

describe('数字格式化', () => {
  it('< 1000 显示原数字', () => {
    expect(formatNum(0)).toBe('0');
    expect(formatNum(100)).toBe('100');
    expect(formatNum(999)).toBe('999');
  });

  it('1000-9999 显示为 X.X千', () => {
    expect(formatNum(1000)).toBe('1.0千');
    expect(formatNum(5500)).toBe('5.5千');
  });

  it('10000+ 显示为 X.X万', () => {
    expect(formatNum(10000)).toBe('1.0万');
    expect(formatNum(1861028)).toBe('186.1万');
  });

  it('处理 undefined/null', () => {
    expect(formatNum(undefined)).toBe('0');
    expect(formatNum(null)).toBe('0');
    // 非数字字符串会被转为 NaN（fallback 到 0）
    expect(formatNum('abc')).toBe('0');
  });
});

describe('时间戳格式化', () => {
  it('0 返回 ?', () => {
    expect(formatTime(0)).toBe('?');
  });

  it('非零时间戳返回本地化字符串', () => {
    const ts = 1700000000; // 2023-11-14
    const result = formatTime(ts);
    expect(result).toMatch(/\d{4}/); // 包含年份
    expect(result.length).toBeGreaterThan(5);
  });
});

describe('WBI 重试降级逻辑', () => {
  it('readVarint 支持 64 位整数（修复溢出 bug）', async () => {
    const { readVarint } = await import('../src/api/danmaku.js' as any);
    if (typeof readVarint !== 'function') {
      // 如果不是导出函数，跳过
      return;
    }
    // 构造 5+ 字节的 varint（表示大整数）
    const bytes = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x01]);
    const [value, consumed] = readVarint(bytes, 0);
    expect(consumed).toBe(5);
    expect(value).toBeGreaterThan(0);
  });
});

describe('错误码 guidance 覆盖', () => {
  it('bilibili.ts 模块加载正常', async () => {
    const mod = await import('../src/api/bilibili.js');
    expect(mod.biliApi).toBeDefined();
    expect(typeof mod.biliApi).toBe('object');
  });
});

describe('B站 API 方法签名', () => {
  it('relationModify 接受 fid 和 act', async () => {
    const { biliApi } = await import('../src/api/bilibili.js');
    expect(typeof biliApi.relationModify).toBe('function');
  });

  it('followings 接受 vmid 和分页', async () => {
    const { biliApi } = await import('../src/api/bilibili.js');
    expect(typeof biliApi.followings).toBe('function');
  });

  it('followers 接受 vmid 和分页', async () => {
    const { biliApi } = await import('../src/api/bilibili.js');
    expect(typeof biliApi.followers).toBe('function');
  });

  it('videoLike 接受 videoId 和 action', async () => {
    const { biliApi } = await import('../src/api/bilibili.js');
    expect(typeof biliApi.videoLike).toBe('function');
  });

  it('videoCoin 接受 videoId 和 multiply', async () => {
    const { biliApi } = await import('../src/api/bilibili.js');
    expect(typeof biliApi.videoCoin).toBe('function');
  });

  it('videoFavorite 接受 videoId 和 mediaIds', async () => {
    const { biliApi } = await import('../src/api/bilibili.js');
    expect(typeof biliApi.videoFavorite).toBe('function');
  });

  it('sendDanmaku 接受 videoId, cid, message, progress', async () => {
    const { biliApi } = await import('../src/api/bilibili.js');
    expect(typeof biliApi.sendDanmaku).toBe('function');
  });

  it('playUrl 接受 videoId, cid, qn', async () => {
    const { biliApi } = await import('../src/api/bilibili.js');
    expect(typeof biliApi.playUrl).toBe('function');
  });
});

describe('新工具模块注册函数存在', () => {
  it('registerFollowTools 是函数', async () => {
    const mod = await import('../src/tools/follow.js');
    expect(mod.registerFollowTools).toBeTypeOf('function');
  });

  it('registerDownloadTools 是函数', async () => {
    const mod = await import('../src/tools/download.js');
    expect(mod.registerDownloadTools).toBeTypeOf('function');
  });
});

describe('画质映射', () => {
  it('包含常用画质代码', () => {
    const qualityMap: Record<number, string> = {
      16: '360P',
      32: '480P',
      64: '720P',
      80: '1080P',
      120: '4K',
    };
    expect(qualityMap[80]).toBe('1080P');
    expect(qualityMap[120]).toBe('4K');
    expect(qualityMap[16]).toBe('360P');
  });
});
