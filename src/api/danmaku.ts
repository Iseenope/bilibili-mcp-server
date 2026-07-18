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

export interface ParseResult {
  items: DanmakuElem[];
  diagnostics: {
    foundElems: number;
    foundContentTags: number;
    foundProgressTags: number;
    bufferSize: number;
    parseErrors: number;
    success: boolean;
  };
}

/** 读取 varint，返回 [value, 消耗的字节数] */
function readVarint(bytes: Uint8Array, start: number): [number, number] {
  let value = 0;
  let shift = 0;
  let i = start;
  while (i < bytes.length) {
    value |= (bytes[i] & 0x7f) << shift;
    shift += 7;
    if (!(bytes[i] & 0x80)) {
      i++;
      break;
    }
    i++;
    if (shift > 28) return [0, 0]; // overflow
  }
  return [value >>> 0, i - start];
}

/**
 * 解析 B 站弹幕 Protobuf 二进制数据
 * 返回弹幕列表和诊断信息
 */
export function parseDanmakuBuffer(buf: ArrayBuffer): ParseResult {
  const result: DanmakuElem[] = [];
  const diagnostics = {
    foundElems: 0,
    foundContentTags: 0,
    foundProgressTags: 0,
    bufferSize: buf.byteLength,
    parseErrors: 0,
    success: false,
  };

  if (buf.byteLength === 0) {
    return { items: result, diagnostics };
  }

  try {
    const bytes = new Uint8Array(buf);
    let i = 0;

    // 外层循环：外层消息是 DmSegMobileReply，field 1 = repeated DanmakuElem
    while (i < bytes.length) {
      const tag = bytes[i];
      i++;
      const field = tag >> 3;
      const wireType = tag & 0x07;

      if (field === 1 && wireType === 2) {
        // DanmakuElem 消息（嵌套）
        const [len, consumed] = readVarint(bytes, i);
        if (consumed === 0) {
          diagnostics.parseErrors++;
          break;
        }
        i += consumed;

        // 解析这个 DanmakuElem
        const elemBuf = bytes.slice(i, i + len);
        const elem = parseDanmakuElem(elemBuf);
        diagnostics.foundProgressTags += elem.progress > 0 ? 1 : 0;
        if (elem.content) {
          diagnostics.foundContentTags++;
          result.push(elem);
          diagnostics.foundElems++;
        }
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
  } catch (err) {
    diagnostics.parseErrors++;
    console.error('[danmaku] 解析错误:', err);
  }

  diagnostics.success = result.length > 0;
  return { items: result, diagnostics };
}

/** 解析单个 DanmakuElem 嵌套消息 */
function parseDanmakuElem(bytes: Uint8Array): DanmakuElem {
  const result: DanmakuElem = {
    content: '',
    color: 0xffffff,
    progress: 0,
  };

  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i];
    i++;
    const field = tag >> 3;
    const wireType = tag & 0x07;

    if (wireType === 2) {
      // length-delimited (string)
      const [len, consumed] = readVarint(bytes, i);
      if (consumed === 0) break;
      i += consumed;
      if (field === 7) {
        // content
        result.content = new TextDecoder('utf-8', { fatal: false }).decode(
          bytes.slice(i, i + len)
        );
      }
      // field 6 (midHash) 跳过
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
      // field 3, 4, 9 等跳过
    } else {
      break;
    }
  }

  return result;
}
