# 老根茶村 · Web 管理后台

Vue 3 + TypeScript + Vite，通过 CloudBase HTTP 访问 `adminApi` 云函数。

## 功能

- 作品审核（通过 / 驳回 / 隐藏 / 删除）
- 用户列表
- 意见反馈与内容举报处理

## 本地开发

```bash
cd web
npm install
npm run dev
```

默认端口 `5174`。浏览器访问控制台输出的本地地址，使用管理员账号登录。

## 环境变量

在 `web/.env` 配置（勿提交 Git）：

| 变量 | 说明 |
|------|------|
| `VITE_CLOUDBASE_HTTP_BASE` | CloudBase 默认 HTTP 域名 |
| `VITE_ADMIN_API_PATH` | adminApi 路由路径，默认 `/adminApi` |
| `VITE_ADMIN_API_URL` | 前端请求地址，默认 `/api/admin`（由 Vite 代理） |

本地代理规则见 `vite.config.ts`：`/api/admin` → CloudBase HTTP 路由。

## 生产部署

1. 云函数 `adminApi` 配置环境变量：`ADMIN_TOKEN_SECRET`、`ADMIN_CORS_ORIGINS`
2. CloudBase 控制台配置 HTTP 访问服务路由 `/adminApi`
3. `npm run build` 构建 `dist/`，部署到静态托管或自有服务器
4. 构建产物请求的 API 地址需与 `VITE_ADMIN_API_URL` 一致

## 目录

```
web/src/
├── api/           # invokeAdminApi、adminApi 封装
├── components/    # PostDetailModal、Dashboard 各 Tab 面板
├── constants/     # 作品状态等
└── views/         # Dashboard、Login
```

小程序端说明见仓库 `miniprogram/README.md`。
