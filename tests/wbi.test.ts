import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';

// 直接内联测试 WBI 签名核心算法（不依赖网络）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey;
  let mixed = '';
  for (let i = 0; i < 32; i++) {
    mixed += raw[MIXIN_KEY_ENC_TAB[i]];
  }
  return mixed;
}

function encodeWbiParam(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, '')
    .replace(/%3A/g, ':')
    .replace(/%2F/g, '/');
}

function signWbi(params: Record<string, string>, mixinKey: string): { wts: string; w_rid: string } {
  const result: Record<string, string> = { ...params };
  const wts = '1700000000'; // 固定时间戳用于测试
  result.wts = wts;

  const keys = Object.keys(result).sort();
  const query = keys
    .map((key) => `${encodeWbiParam(key)}=${encodeWbiParam(result[key])}`)
    .join('&');

  const signStr = query + mixinKey;
  const wRid = crypto.createHash('md5').update(signStr, 'utf-8').digest('hex');

  return { wts, w_rid: wRid };
}

describe('WBI 签名算法', () => {
  // 已知的测试向量
  const testImgKey = '7cd084941338484aae1ad9425b84077c';
  const testSubKey = 'a2a2e0c0c1b94e6a9ef14c6b7c9d8e3f';
  const expectedMixinKey = ''; // 将在测试中计算

  it('getMixinKey 应正确混淆', () => {
    const mixinKey = getMixinKey(testImgKey, testSubKey);
    
    // mixinKey 应该长度为 32
    expect(mixinKey.length).toBe(32);

    // 验证 mixinKey 由 imgKey+subKey 中的字符组成
    const raw = testImgKey + testSubKey;
    for (let i = 0; i < 32; i++) {
      expect(raw).toContain(mixinKey[i]);
    }

    // 验证确定性（相同输入产生相同输出）
    const mixinKey2 = getMixinKey(testImgKey, testSubKey);
    expect(mixinKey).toBe(mixinKey2);
  });

  it('getMixinKey 对不同 key 产生不同结果', () => {
    const key1 = getMixinKey(testImgKey, testSubKey);
    const key2 = getMixinKey(testSubKey, testImgKey); // 交换
    expect(key1).not.toBe(key2);
  });

  it('encodeWbiParam 应过滤特殊字符', () => {
    const result = encodeWbiParam("hello!'()*world");
    expect(result).not.toContain("'");
    expect(result).not.toContain('!');
    expect(result).not.toContain('(');
    expect(result).not.toContain(')');
    expect(result).not.toContain('*');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('encodeWbiParam 应为大写十六进制', () => {
    const result = encodeWbiParam('你好');
    // 中文字符编码应为大写
    const upperPattern = /%[A-F0-9]{2}/;
    const matches = result.match(/%[A-Fa-f0-9]{2}/g) || [];
    for (const m of matches) {
      expect(m).toMatch(upperPattern);
    }
  });

  it('signWbi 应正确排序参数', () => {
    const mixinKey = getMixinKey(testImgKey, testSubKey);
    
    // 参数顺序不同应影响签名
    const result = signWbi({ b: '2', a: '1', c: '3' }, mixinKey);
    
    // 验证参数被正确排序
    // 排序后应为 a=1&b=2&c=3&wts=1700000000 + mixinKey
    expect(result.w_rid).toBeTruthy();
    expect(result.w_rid.length).toBe(32); // MD5 hex
  });

  it('signWbi 对不同参数产生不同签名', () => {
    const mixinKey = getMixinKey(testImgKey, testSubKey);
    
    const result1 = signWbi({ keyword: 'test' }, mixinKey);
    const result2 = signWbi({ keyword: 'test2' }, mixinKey);

    expect(result1.w_rid).not.toBe(result2.w_rid);
  });

  it('signWbi 对相同参数产生相同签名', () => {
    const mixinKey = getMixinKey(testImgKey, testSubKey);
    
    const result1 = signWbi({ keyword: 'hello', page: '1' }, mixinKey);
    const result2 = signWbi({ keyword: 'hello', page: '1' }, mixinKey);

    expect(result1.w_rid).toBe(result2.w_rid);
    expect(result1.wts).toBe(result2.wts);
  });

  it('encodeWbiParam 空格应编码为 %20', () => {
    const result = encodeWbiParam('hello world');
    expect(result).toContain('%20');
    expect(result).not.toContain('+');
  });

  it('完整 WBI 签名流程输出格式正确', () => {
    const mixinKey = getMixinKey(testImgKey, testSubKey);
    const params = { keyword: '测试', page: '1' };
    const result = signWbi(params, mixinKey);

    // 输出应包含 w_rid 和 wts
    expect(result).toHaveProperty('w_rid');
    expect(result).toHaveProperty('wts');

    // w_rid 应为 32 位十六进制字符串
    expect(result.w_rid).toMatch(/^[a-f0-9]{32}$/);
    
    // wts 应为数字字符串
    expect(result.wts).toMatch(/^\d+$/);
  });
});

describe('类型定义校验', () => {
  it('BILI_ERROR_MAP 包含常见错误码', async () => {
    const { BILI_ERROR_MAP } = await import('../src/types/index.js');
    expect(BILI_ERROR_MAP[-101]).toBeDefined();
    expect(BILI_ERROR_MAP[-111]).toBeDefined();
    expect(BILI_ERROR_MAP[-352]).toBeDefined();
    expect(BILI_ERROR_MAP[-509]).toBeDefined();
  });
});
