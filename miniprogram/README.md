# 老根茶村 / 故乡照片墙 - 微信小程序

云开发版家乡照片分享小程序。

## 项目结构

```
miniprogram/
├── app.js / app.json / app.wxss
├── cloudfunctions/
│   ├── common/          # 云函数公共模块（identity 等）
│   ├── auth/            # 登录与用户资料
│   ├── posts/           # 帖子、评论、点赞
│   ├── stats/           # 数据统计
│   ├── signin/          # 每日签到
│   └── adminApi/        # Web 管理后台 API
├── pages/
│   ├── index/           # 首页瀑布流 + 详情浮层
│   ├── upload/          # 发布作品
│   └── profile/         # 我的、编辑资料、设置、签到、统计、评论
├── components/
│   ├── login-modal/     # 登录弹窗
│   └── post-detail-overlay/  # 帖子详情浮层
├── custom-tab-bar/      # 自定义底栏
└── utils/
    ├── api.js           # 云函数 API 封装
    ├── util.js          # 通用工具（loading、格式化等）
    ├── session.js       # 登录态校验
    └── mediaPicker.js   # 相册/相机选图
```

## 云开发配置

1. 微信开发者工具中创建云环境，记录环境 ID
2. 在 `app.js` 中配置 `wx.cloud.init({ env: '...' })`
3. 部署云函数：右键各云函数目录 →「上传并部署：云端安装依赖」
   - 含 `hometown-common` 依赖的函数（auth、posts、stats、adminApi）需在云端重新安装依赖

## 数据库集合

| 集合 | 说明 |
|------|------|
| `users` | 用户信息 |
| `posts` | 帖子（含 photos 数组） |
| `post_comments` | 评论 |

## 主要功能

- 首页瀑布流浏览、筛选、详情浮层（Hero 动画）
- 发布多图作品
- 点赞、评论、楼中楼回复
- 我的作品 / 赞过 / 隐藏作品
- 每日签到、数据统计
- 微信登录、编辑资料

## TabBar 图标

`assets/icons/` 中需保留：

- `home.png` / `home-active.png`
- `profile.png` / `profile-active.png`

## 注意事项

1. 正式上架前将 `app.json` 中 `__usePrivacyCheck__` 设为 `true` 并配置隐私协议
2. 个人主体 UGC 能力受限，发帖评论需企业主体
3. Web 管理后台在仓库 `web/` 目录，使用 `adminApi` 云函数
