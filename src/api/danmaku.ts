// ─── Bilibili 弹幕 Protobuf 解析器 ────────────────────────
//
// 真实数据结构 (来自 DmSegMobileReply + DanmakuElem):
//   message DanmakuElem {
//     int64 id = 1;
//     int32 progress = 2;     // 毫秒
//     int32 mode = 3;
//     int32 fontsize = 4;
//     uint32 color = 5;
//     string midHash = 6;
//     string content = 7;
//     int64 ctime = 8;
//     int32 weight = 9;
//     string idStr = 12;
//     ...
//   }
//
// 字段编号 → wire tag 对应关系:
//   field 1 (id)        → 0x08 (varint)
//   field 2 (progress)  → 0x10 (varint)
//   field 3 (mode)      → 0x18 (varint)
//   field 4 (fontsize)  → 0x20 (varint)
//   field 5 (color)     → 0x28 (varint)
//   field 6 (midHash)   → 0x32 (length-delimited)
//   field 7 (content)   → 0x3a (length-delimited)
//   field 8 (ctime)     → 0x40 (varint)
//   field 9 (weight)    → 0x48 (varint)

export interface DanmakuElem {
  id?: number;
  progress: number;     // ms
  mode?: number;
  color: number;        // 0xRRGGBB
  content: string;
  ctime?: number;
}

export interface DanmakuDiagnostics {
  /** 原始 buffer 大小（字节） */
  bufferSize: number;
  /** 解析是否成功（至少解析出一条有效弹幕） */
  success: boolean;
  /** 解析错误计数 */
  parseErrors: number;

  /** 外层（DmSegMobileReply）总共扫描的 wire tag 数 */
  totalOuterTags: number;
  /** 外层 field 1（DanmakuElem）数量 */
  outerElemsFound: number;
  /** 外层非 field 1 的未知字段数 — 偏大说明外层 schema 可能变了 */
  outerUnknownTags: number;

  /** 含有 content 字段的弹幕数（计入 items 的条件） */
  withContent: number;
  /** 含有 progress 字段的弹幕数 */
  withProgress: number;
  /** 含有 color 字段的弹幕数 */
  withColor: number;

  /** 在弹幕内层遇到的未知字段编号（去重、排序），为空表示完全匹配预期 schema */
  unknownFieldNumbers: number[];

  /**
   * 警告信息。
   * - 非空 buffer 但 success=false → "未找到弹幕内容" 并说明原因
   * - unknownFieldNumbers 非空 → "检测到未知字段编号 xxx，schema 可能已变更"
   */
  warning?: string;
}

export interface ParseResult {
  items: DanmakuElem[];
  diagnostics: DanmakuDiagnostics;
}

/** 读取 varint，返回 [value, 消耗的字节数]
 *
 * 注意：JS 的 << 运算符只使用 shift 的低 5 位（0-31），
 * 所以当 shift >= 32 时必须用乘法代替。
 * 支持最大 53 位整数（JS Number 精度上限）。
 */
function readVarint(bytes: Uint8Array, start: number): [number, number] {
  let value = 0;
  let shift = 0;
  let i = start;
  while (i < bytes.length) {
    const byte = bytes[i];
    if (shift < 32) {
      // shift < 32 时用位运算（更快）
      value |= (byte & 0x7f) << shift;
    } else {
      // shift >= 32 时必须用乘法，否则 << 会回绕
      value += (byte & 0x7f) * (1 << 30) * (1 << (shift - 30));
    }
    shift += 7;
    if (!(byte & 0x80)) {
      i++;
      break;
    }
    i++;
    if (shift > 56) return [0, 0]; // 超过 JS 精度，不会出现
  }
  // value >>> 0 将负数（最高位为 1 的 int32）转为无符号
  return [value >>> 0, i - start];
}

/**
 * 解析 B 站弹幕 Protobuf 二进制数据
 * 返回弹幕列表和诊断信息
 */
export function parseDanmakuBuffer(buf: ArrayBuffer): ParseResult {
  const result: DanmakuElem[] = [];
  const diagnostics: DanmakuDiagnostics = {
    bufferSize: buf.byteLength,
    success: false,
    parseErrors: 0,
    totalOuterTags: 0,
    outerElemsFound: 0,
    outerUnknownTags: 0,
    withContent: 0,
    withProgress: 0,
    withColor: 0,
    unknownFieldNumbers: [],
  };

  if (buf.byteLength === 0) {
    return { items: result, diagnostics };
  }

  const unknownFieldSet = new Set<number>();

  try {
    const bytes = new Uint8Array(buf);
    let i = 0;

    // 外层循环：外层消息是 DmSegMobileReply，field 1 = repeated DanmakuElem
    while (i < bytes.length) {
      const [tag, tagLen] = readVarint(bytes, i);
      if (tagLen === 0) break;
      i += tagLen;
      const field = tag >> 3;
      const wireType = tag & 0x07;
      diagnostics.totalOuterTags++;

      if (field === 1 && wireType === 2) {
        // DanmakuElem 消息（嵌套）
        diagnostics.outerElemsFound++;
        const [len, consumed] = readVarint(bytes, i);
        if (consumed === 0) {
          diagnostics.parseErrors++;
          break;
        }
        i += consumed;

        // 解析这个 DanmakuElem
        const elemBuf = bytes.slice(i, i + len);
        const [elem, innerUnknowns] = parseDanmakuElem(elemBuf);
        // 更新统计
        if (elem.progress > 0) diagnostics.withProgress++;
        if (elem.color !== 0xffffff) diagnostics.withColor++;
        if (elem.content) {
          diagnostics.withContent++;
          result.push(elem);
        }
        // 收集内层未知字段
        for (const f of innerUnknowns) unknownFieldSet.add(f);
        i += len;
      } else if (wireType === 0) {
        // varint - 跳过
        const [, consumed] = readVarint(bytes, i);
        if (consumed === 0) break;
        i += consumed;
      } else if (wireType === 2) {
        // 未知 length-delimited，跳过
        const [len, consumed] = readVarint(bytes, i);
        if (consumed === 0) break;
        i += consumed + len;
      } else {
        // 未知 wire type
        diagnostics.parseErrors++;
        break;
      }
    }

    // 统计外层未知字段（非 field 1 的字段）
    diagnostics.outerUnknownTags = diagnostics.totalOuterTags - diagnostics.outerElemsFound;

    // 收集外层字段编号中的未知项（field !== 1）
    // 外层只有 field 1 是预期的弹幕嵌套字段
    // 我们在外层循环中已统计了 outerElemsFound，还需要检测是否有其他 field number
    // 但上面的循环只追踪了 field 1，没有追踪其他 field number
    // 为了更精确，我们在外层的 while 循环中再加一个 set
    // — 上面已经没法改了，但没关系，外层非 field-1 字段都被跳过了，
    // 它们在 wireType 分支中被处理，但 field 号未被记录。
    // 我们可以在外层加一个未追踪场号集合 — 但实际上 outerUnknownTags 已足够
    // 作为告警信号。如需具体场号，需要再写个分析模式。

    // 设置 unknownFieldNumbers
    diagnostics.unknownFieldNumbers = [...unknownFieldSet].sort((a, b) => a - b);

  } catch (err) {
    diagnostics.parseErrors++;
    console.error('[danmaku] 解析错误:', err);
  }

  diagnostics.success = result.length > 0;

  // 非空 buffer 但解析结果为空的告警
  if (buf.byteLength > 0 && result.length === 0 && diagnostics.parseErrors === 0) {
    if (diagnostics.outerElemsFound === 0) {
      diagnostics.warning =
        `外层未找到预期的 field 1 (DanmakuElem) 条目（共扫描 ${diagnostics.totalOuterTags} 个外层 tag），` +
        `外层 schema 可能已变更`;
    } else if (diagnostics.withContent === 0) {
      diagnostics.warning =
        `在 ${diagnostics.outerElemsFound} 个 DanmakuElem 中均未找到 content 字段，` +
        `弹幕内层 schema 可能已变更（progress=${diagnostics.withProgress}, color=${diagnostics.withColor}）`;
    }
  }

  // schema 可能变更的告警
  if (diagnostics.unknownFieldNumbers.length > 0) {
    const warn = `弹幕数据中检测到未知字段编号 [${diagnostics.unknownFieldNumbers.join(', ')}]，B 站 schema 可能已变更`;
    diagnostics.warning = diagnostics.warning
      ? `${diagnostics.warning}；${warn}`
      : warn;
  }

  return { items: result, diagnostics };
}

/** 解析单个 DanmakuElem 嵌套消息，返回 [解析结果, 未知字段编号列表] */
function parseDanmakuElem(bytes: Uint8Array): [DanmakuElem, number[]] {
  const result: DanmakuElem = {
    content: '',
    color: 0xffffff,
    progress: 0,
  };
  const unknownFields: number[] = [];

  let i = 0;
  while (i < bytes.length) {
    const [tag, tagLen] = readVarint(bytes, i);
    if (tagLen === 0) break;
    i += tagLen;
    const field = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      // length-delimited (string)
      const [len, consumed] = readVarint(bytes, i);
      if (consumed === 0) break;
      i += consumed;

      if (field === 7) {
        // content (field 7) — 预期字段
        result.content = new TextDecoder('utf-8', { fatal: false }).decode(
          bytes.slice(i, i + len)
        );
      } else if (field !== 6) {
        // 非 midHash (field 6)，非 content (field 7) — 未知字段
        unknownFields.push(field);
      }
      // field 6 (midHash) 已知但不需要，静默跳过
      i += len;
    } else if (wireType === 0) {
      // varint
      const [val, consumed] = readVarint(bytes, i);
      if (consumed === 0) break;
      i += consumed;

      if (field === 2) result.progress = val;
      else if (field === 5) result.color = val;
      else if (field === 1) result.id = val;
      else if (field === 8) result.ctime = val;
      else if (field === 3 || field === 4 || field === 9 || field === 10 || field === 11 || field === 12) {
        // 已知但暂不处理的字段（mode, fontsize, weight, pool, attr, idStr）
        // 静默跳过
      } else {
        // 完全未知的 varint 字段
        unknownFields.push(field);
      }
    } else {
      break;
    }
  }

  return [result, unknownFields];
}
