# Bilibili MCP Server
#
# 构建:
#   docker build -t bilibili-mcp-server .
#
# 运行:
#   docker run -e BILIBILI_SESSDATA=xxx \
#              -e BILIBILI_BILI_JCT=xxx \
#              -e BILIBILI_DEDE_USER_ID=xxx \
#              bilibili-mcp-server
#
# 或使用文件传入环境变量:
#   docker run --env-file .env bilibili-mcp-server

FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src/ ./src/
RUN npm ci && npm run build && npm prune --production

FROM node:22-alpine AS runner

WORKDIR /app

# 创建非 root 用户
RUN addgroup -S app && adduser -S -G app app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json README.md README_zh.md LICENSE ./

USER app

ENV NODE_ENV=production

# MCP 服务通过 stdio 与客户端通信，不暴露任何端口
# (无需 EXPOSE 指令)

ENTRYPOINT ["node", "dist/index.js"]
