import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 简易 .env 文件加载器
 * 从当前工作目录或项目根目录加载 .env 文件
 */
export function loadEnvFile(): void {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const searchPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(currentDir, '..', '.env'),
    path.resolve(currentDir, '.env'),
  ];

  for (const envPath of searchPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        parseAndSetEnv(content);
        console.error(`[env] 已加载 ${envPath}`);
        return;
      } catch {
        // 忽略读取错误
      }
    }
  }
}

function parseAndSetEnv(content: string): void {
  const lines = content.split('\n');
  for (const line of lines) {
    // 跳过注释和空行
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // 解析 key=value
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // 移除引号
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.substring(1, value.length - 1);
    }

    // 只有在环境变量未设置时才设置（环境变量优先级高于 .env 文件）
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
