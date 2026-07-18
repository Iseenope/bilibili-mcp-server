import { describe, it, expect } from 'vitest';
import { parseDanmakuBuffer } from '../src/api/danmaku.js';

// 辅助：编码 varint
function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return bytes;
}

// 辅助：编码 length-delimited
function encodeString(field: number, str: string): number[] {
  const text = new TextEncoder().encode(str);
  const fieldTag = (field << 3) | 2;
  return [...encodeVarint(fieldTag), ...encodeVarint(text.length), ...text];
}

// 辅助：编码 varint 字段
function encodeVarintField(field: number, value: number): number[] {
  return [...encodeVarint((field << 3)), ...encodeVarint(value)];
}

// 辅助：编码嵌套消息
function encodeElem(elem: { id?: number; progress: number; color: number; content: string }): number[] {
  const parts: number[] = [];
  if (elem.id !== undefined) parts.push(...encodeVarintField(1, elem.id));
  parts.push(...encodeVarintField(2, elem.progress));
  parts.push(...encodeVarintField(5, elem.color));
  parts.push(...encodeString(7, elem.content));
  return parts;
}

// 辅助：包装为 DmSegMobileReply
function wrap(elems: number[][]): Uint8Array {
  const parts: number[] = [];
  for (const elem of elems) {
    // field 1, length-delimited
    parts.push((1 << 3) | 2, ...encodeVarint(elem.length), ...elem);
  }
  return new Uint8Array(parts);
}

describe('弹幕 Protobuf 解析器', () => {
  it('应能解析单条弹幕 (content + progress + color)', () => {
    const inner = encodeElem({ progress: 5000, color: 0xffffff, content: 'hello' });
    const buf = wrap([inner]).buffer;

    const result = parseDanmakuBuffer(buf);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].content).toBe('hello');
    expect(result.items[0].progress).toBe(5000);
    expect(result.items[0].color).toBe(0xffffff);
    // 新诊断字段
    expect(result.diagnostics.withContent).toBe(1);
    expect(result.diagnostics.withProgress).toBe(1);
    expect(result.diagnostics.outerElemsFound).toBe(1);
    expect(result.diagnostics.totalOuterTags).toBe(1);
    expect(result.diagnostics.success).toBe(true);
  });

  it('空 buffer 应返回空数组', () => {
    const result = parseDanmakuBuffer(new ArrayBuffer(0));
    expect(result.items).toHaveLength(0);
    expect(result.diagnostics.success).toBe(false);
  });

  it('应处理多条弹幕', () => {
    const e1 = encodeElem({ progress: 100, color: 0xff0000, content: 'A' });
    const e2 = encodeElem({ progress: 200, color: 0x00ff00, content: 'B' });
    const buf = wrap([e1, e2]).buffer;

    const result = parseDanmakuBuffer(buf);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].content).toBe('A');
    expect(result.items[0].progress).toBe(100);
    expect(result.items[1].content).toBe('B');
    expect(result.items[1].progress).toBe(200);
    expect(result.diagnostics.withContent).toBe(2);
    expect(result.diagnostics.outerElemsFound).toBe(2);
  });

  it('应跳过外层的非嵌套字段', () => {
    // 外层有 field 2 (varint) + field 1 (nested)
    const e1 = encodeElem({ progress: 100, color: 0xffffff, content: 'foo' });
    const parts: number[] = [];
    parts.push(...encodeVarintField(2, 42)); // 随便一个外层 varint 字段
    parts.push((1 << 3) | 2, ...encodeVarint(e1.length), ...e1);
    const buf = new Uint8Array(parts).buffer;

    const result = parseDanmakuBuffer(buf);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].content).toBe('foo');
    expect(result.items[0].progress).toBe(100);
    expect(result.diagnostics.outerUnknownTags).toBeGreaterThan(0);
  });

  it('解码失败应返回诊断信息', () => {
    const buf = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF]).buffer;
    const result = parseDanmakuBuffer(buf);
    expect(result.diagnostics.bufferSize).toBe(5);
  });

  it('诊断信息应包含 bufferSize', () => {
    const buf = new Uint8Array(50).buffer;
    const result = parseDanmakuBuffer(buf);
    expect(result.diagnostics.bufferSize).toBe(50);
  });

  it('应处理中文弹幕', () => {
    const inner = encodeElem({ progress: 1000, color: 0xffffff, content: '你真秀' });
    const buf = wrap([inner]).buffer;

    const result = parseDanmakuBuffer(buf);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].content).toBe('你真秀');
    expect(result.items[0].progress).toBe(1000);
  });

  it('应正确解析大文件（模拟真实 716KB 弹幕）', () => {
    // 模拟 2000 条弹幕
    const elems: number[][] = [];
    for (let i = 0; i < 2000; i++) {
      elems.push(
        encodeElem({
          progress: i * 1000,
          color: 0xffffff,
          content: `弹幕 ${i}`,
        })
      );
    }
    const buf = wrap(elems).buffer;
    const result = parseDanmakuBuffer(buf);

    expect(result.items).toHaveLength(2000);
    expect(result.items[0].content).toBe('弹幕 0');
    expect(result.items[1999].content).toBe('弹幕 1999');
    expect(result.items[1500].progress).toBe(1500000);
    expect(result.diagnostics.success).toBe(true);
    expect(result.diagnostics.withContent).toBe(2000);
    expect(result.diagnostics.outerElemsFound).toBe(2000);
  });

  it('未知字段编号应触发告警', () => {
    // 模拟 schema 变更：在 DanmakuElem 中用 field 77 (varint) + field 88 (string)
    const parts: number[] = [];
    parts.push(...encodeVarintField(77, 999));
    parts.push(...encodeString(88, 'unknown'));
    // 再加上正常的字段确保解析器仍能工作
    parts.push(...encodeVarintField(2, 5000));
    parts.push(...encodeVarintField(5, 0xffffff));
    parts.push(...encodeString(7, 'still works'));
    const buf = wrap([parts]).buffer;

    const result = parseDanmakuBuffer(buf);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].content).toBe('still works');
    expect(result.diagnostics.unknownFieldNumbers).toContain(77);
    expect(result.diagnostics.unknownFieldNumbers).toContain(88);
    expect(result.diagnostics.warning).toBeDefined();
    expect(result.diagnostics.warning).toContain('77');
  });

  it('外层无 field 1 时给出 schema 变更警告', () => {
    // 只有外层 field 99 (varint)，没有任何弹幕嵌套消息
    const parts = encodeVarintField(99, 12345);
    const buf = new Uint8Array(parts).buffer;

    const result = parseDanmakuBuffer(buf);
    expect(result.items).toHaveLength(0);
    expect(result.diagnostics.outerElemsFound).toBe(0);
    expect(result.diagnostics.totalOuterTags).toBe(1);
    expect(result.diagnostics.warning).toBeDefined();
    expect(result.diagnostics.warning).toContain('schema');
  });
});
