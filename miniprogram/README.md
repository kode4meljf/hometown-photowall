# 家乡照片墙 - 微信小程序云开发版

## 项目结构

```
miniprogram/
├── app.js              # 小程序入口（云开发初始化）
├── app.json            # 全局配置
├── app.wxss            # 全局样式
├── project.config.json # 项目配置
├── cloudfunctions/     # 云函数
│   ├── auth/           # 用户认证
│   ├── photos/         # 照片管理
│   └── admin/          # 管理员功能
├── pages/              # 页面
│   ├── index/          # 首页
│   ├── detail/         # 详情
│   ├── upload/         # 上传
│   ├── timeline/       # 时光轴
│   ├── admin/          # 管理
│   └── login/          # 登录
└── utils/              # 工具函数
    ├── api.js          # 云函数调用封装
    └── util.js         # 工具函数
```

## 云开发环境配置

### 1. 创建云开发环境

1. 打开微信开发者工具
2. 点击"云开发"按钮
3. 创建新环境，记录环境ID

### 2. 配置环境ID

在 `app.js` 中修改：
```javascript
wx.cloud.init({
  env: 'your-env-id', // 替换为你的云开发环境ID
  traceUser: true
});
```

在 `project.config.json` 中修改：
```json
{
  "appid": "your-appid" // 替换为你的小程序AppID
}
```

### 3. 创建数据库集合

在云开发控制台 -> 数据库中创建以下集合：

| 集合名称 | 说明 | 权限设置 |
|---------|------|---------|
| `users` | 用户信息 | 仅创建者可写，所有人可读 |
| `photos` | 照片信息 | 仅创建者可写，所有人可读 |
| `comments` | 评论信息 | 仅创建者可写，所有人可读 |

### 4. 部署云函数

在微信开发者工具中：
1. 右键点击 `cloudfunctions` 目录下的每个云函数
2. 选择"上传并部署：云端安装依赖"
3. 等待部署完成

### 5. 数据库字段说明

#### users 集合
```json
{
  "_id": "自动生成",
  "username": "用户名",
  "password": "密码（生产环境应加密）",
  "nickname": "昵称",
  "role": "admin/user",
  "createdAt": "注册时间"
}
```

#### photos 集合
```json
{
  "_id": "自动生成",
  "title": "标题",
  "description": "描述",
  "imageUrl": "云存储fileID",
  "location": "地点",
  "category": "分类",
  "author": "作者昵称",
  "authorId": "作者openid",
  "likes": 0,
  "views": 0,
  "likedUsers": ["openid1", "openid2"],
  "createdAt": "创建时间"
}
```

#### comments 集合
```json
{
  "_id": "自动生成",
  "photoId": "照片id",
  "content": "评论内容",
  "author": "作者昵称",
  "authorId": "作者openid",
  "createdAt": "创建时间"
}
```

## TabBar 图标

需要添加以下图标文件到 `assets/icons/` 目录：
- `home.png` / `home-active.png` (81x81 px)
- `timeline.png` / `timeline-active.png` (81x81 px)
- `admin.png` / `admin-active.png` (81x81 px)

可以使用 iconfont 或在线图标库生成。

## 功能清单

| 功能 | 说明 |
|------|------|
| 用户注册登录 | 第一个注册用户自动成为管理员 |
| 照片列表 | 支持分类、地点、关键词筛选和排序 |
| 照片详情 | 点赞、评论、图片预览 |
| 上传照片 | 从相册/相机选择图片，填写信息后发布 |
| 时光轴 | 按年份分组展示照片 |
| 管理后台 | 管理员可查看统计数据、管理照片 |

## 注意事项

1. **生产环境密码加密**：当前密码是明文存储，生产环境应该使用加密算法
2. **安全规则**：根据实际需求调整数据库权限设置
3. **图片压缩**：上传前建议压缩图片，减少存储空间和加载时间
4. **云存储配额**：注意云存储容量和流量限制

## 与 Web 版后端对比

| 对比项 | Node.js 后端 | 云开发 |
|-------|-------------|--------|
| 部署 | 需要服务器 | 无需服务器 |
| 数据库 | 内存存储（需接入MySQL） | 云数据库 |
| 文件存储 | 本地存储（需接入COS） | 云存储 |
| 认证 | JWT | 云函数内建 openid |
| 费用 | 服务器费用 | 按量付费 |
