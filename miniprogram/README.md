# 老根茶村 / 故乡照片墙 - 微信小程序

云开发版家乡照片分享小程序。

## 项目结构

```
miniprogram/
├── app.js / app.json / app.wxss
├── cloudfunctions/
│   ├── common/          # 公共模块真源（identity、postStatus 等）
│   ├── auth/            # 登录、资料、注销
│   ├── posts/           # 帖子、评论、点赞
│   ├── feedback/        # 意见反馈与内容举报
│   ├── stats/           # 数据统计
│   ├── signin/          # 每日签到
│   └── adminApi/        # Web 管理后台 HTTP API
├── pages/
│   ├── index/           # 首页瀑布流 + 详情浮层
│   ├── upload/          # 发布作品
│   └── profile/         # 我的、编辑资料、设置、签到、统计、反馈
├── components/
│   ├── login-modal/     # 登录弹窗
│   └── post-detail-overlay/  # 帖子详情浮层
├── custom-tab-bar/      # 自定义底栏
└── utils/
    ├── api.js           # 云函数 invokeCloud 封装
    ├── util.js          # 通用工具（loading、数字格式化等）
    ├── postStatus.js    # 作品状态常量
    ├── postLike.js      # 点赞逻辑
    ├── constants.js     # 举报原因等跨端常量
    ├── session.js       # 登录态
    ├── privacy.js       # 隐私授权
    └── mediaPicker.js   # 相册/相机选图
```

## 云开发配置

1. 微信开发者工具中创建云环境，记录环境 ID
2. 在 `app.js` 中配置 `wx.cloud.init({ env: '...' })`
3. 部署云函数：右键各云函数目录 →「上传并部署：云端安装依赖」
   - 需部署：`auth`、`posts`、`feedback`、`stats`、`signin`、`adminApi`
   - 各函数通过 `./common/` 子目录引用公共代码；修改 `cloudfunctions/common/` 后须同步到各函数的 `common/` 再部署

## 数据库集合

| 集合 | 说明 |
|------|------|
| `users` | 用户信息 |
| `posts` | 帖子（含 photos 数组、审核状态） |
| `post_comments` | 评论 |
| `feedbacks` | 意见反馈与举报（需在云开发控制台创建） |

## 主要功能

- 首页瀑布流浏览、筛选、详情浮层（Hero 动画）
- 发布多图作品（内容安全审核、待审/驳回状态）
- 点赞、评论、楼中楼回复
- 作品/评论举报、设置页意见反馈
- 我的作品 / 赞过 / 隐藏作品
- 每日签到、数据统计
- 微信登录、编辑资料、注销账号

## 隐私合规

- `app.json` 已开启 `__usePrivacyCheck__: true`
- 须在 **微信公众平台 → 用户隐私保护指引** 勾选与代码一致的权限（相册、相机、保存到相册、用户内容等），详见 `LAUNCH-CHECKLIST.txt`
- 未同意隐私时，选图/保存/登录会引导用户授权

## Web 管理后台

仓库 `web/` 目录，通过 `adminApi` 云函数 HTTP 访问：

- 作品审核（通过/驳回/隐藏）、用户列表、意见反馈与举报处理
- 本地开发：`cd web && npm install && npm run dev`（默认端口 5174）
- 环境变量：在 `web/.env` 配置 `VITE_CLOUDBASE_HTTP_BASE`、`VITE_ADMIN_API_PATH` 等（见 `vite.config.ts`）
- 生产部署 `adminApi` 时配置云函数环境变量：`ADMIN_TOKEN_SECRET`、`ADMIN_CORS_ORIGINS`

## TabBar 图标

`assets/icons/` 中需保留：

- `home.png` / `home-active.png`
- `profile.png` / `profile-active.png`

## 注意事项

1. 个人主体 UGC 能力受限，发帖评论需企业主体
2. 上线前对照 `LAUNCH-CHECKLIST.txt` 完成公众平台配置与真机自测
3. 修改云函数后须重新「上传并部署：云端安装依赖」，并确认 `common/` 子目录一并上传
