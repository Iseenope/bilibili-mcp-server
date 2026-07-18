/**
 * 通用格式化工具
 */

/** 数字格式化（>10000 显示为 X.X万，>1000 显示为 X.X千） */
export function formatNum(n: unknown): string {
  const v = Number(n) || 0;
  if (v >= 10000) return (v / 10000).toFixed(1) + '万';
  if (v >= 1000) return (v / 1000).toFixed(1) + '千';
  return String(v);
}

/** 时间戳格式化（秒 → 本地化字符串，0 返回 ?） */
export function formatTime(ts: unknown): string {
  const v = Number(ts) || 0;
  if (v === 0) return '?';
  return new Date(v * 1000).toLocaleString('zh-CN');
}

/** 时长格式化（秒 → X:XX 或 H:XX:XX） */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 文件大小格式化（字节 → X.XKB / MB / GB） */
export function formatBytes(bytes: number): string {
  const v = Math.max(0, bytes);
  if (v >= 1024 ** 3) return (v / 1024 ** 3).toFixed(1) + 'GB';
  if (v >= 1024 ** 2) return (v / 1024 ** 2).toFixed(1) + 'MB';
  if (v >= 1024) return (v / 1024).toFixed(1) + 'KB';
  return v + 'B';
}
