const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'hometown_secret_key_2024';

// 中间件
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 确保上传目录存在
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) cb(null, true);
    else cb(new Error('只支持图片文件'));
  }
});

// ============ 模拟数据库 ============

// 分类/标签
let categories = [
  { id: 1, name: '风景', icon: '🏞️', color: '#4CAF50' },
  { id: 2, name: '人物', icon: '👥', color: '#2196F3' },
  { id: 3, name: '建筑', icon: '🏠', color: '#FF9800' },
  { id: 4, name: '美食', icon: '🍜', color: '#E91E63' },
  { id: 5, name: '民俗', icon: '🎭', color: '#9C27B0' },
  { id: 6, name: '变迁', icon: '📸', color: '#607D8B' }
];
let nextCategoryId = 7;

// 用户
let users = [
  { id: 1, username: 'admin', password: '$2a$10$dummy', nickname: '管理员', role: 'admin', avatar: '/uploads/default-avatar.png', createdAt: '2024-01-01T00:00:00Z' }
];
let nextUserId = 2;

// 照片
let photos = [
  {
    id: 1,
    title: '家乡的老槐树',
    aspectRatio: 1,
    description: '村口那棵百年老槐树，每年春天都开满了花',
    imageUrl: '/uploads/sample1.jpg',
    location: '村口',
    category: '风景',
    author: '张三',
    authorId: 1,
    createdAt: '2024-03-15T10:30:00Z',
    likes: 12,
    views: 156,
    likedUsers: [],
    comments: [
      { id: 1, author: '管理员', authorId: 1, content: '这张照片太美了，勾起了我的童年回忆', createdAt: '2026-04-06T08:54:38.214Z' },
      { id: 2, author: '管理员', authorId: 1, content: '老槐树还在吗？', createdAt: '2026-04-06T07:54:38.237Z' },
      { id: 3, author: '管理员', authorId: 1, content: '小时候经常在树下乘凉', createdAt: '2026-04-06T06:54:38.237Z' },
      { id: 4, author: '管理员', authorId: 1, content: '花开的时候满村都是香味', createdAt: '2026-04-06T05:54:38.237Z' },
      { id: 5, author: '管理员', authorId: 1, content: '这张照片拍得真好', createdAt: '2026-04-06T04:54:38.237Z' },
      { id: 6, author: '管理员', authorId: 1, content: '情怀满满', createdAt: '2026-04-06T03:54:38.237Z' },
      { id: 7, author: '管理员', authorId: 1, content: '我们村也有一棵老槐树', createdAt: '2026-04-06T02:54:38.237Z' },
      { id: 8, author: '管理员', authorId: 1, content: '每年春天都去拍照', createdAt: '2026-04-06T01:54:38.237Z' },
      { id: 9, author: '管理员', authorId: 1, content: '家乡的记忆！', createdAt: '2026-04-06T00:54:38.237Z' },
      { id: 10, author: '管理员', authorId: 1, content: '这张必须收藏', createdAt: '2026-04-05T23:54:38.237Z' },
      { id: 11, author: '管理员', authorId: 1, content: '树龄有上百年了吧', createdAt: '2026-04-05T22:54:38.237Z' },
      { id: 12, author: '管理员', authorId: 1, content: '小时候听老人讲过这棵树的故事', createdAt: '2026-04-05T21:54:38.237Z' },
      { id: 13, author: '管理员', authorId: 1, content: '怀念小时候的时光', createdAt: '2026-04-05T20:54:38.237Z' },
      { id: 14, author: '管理员', authorId: 1, content: '老家的味道', createdAt: '2026-04-05T19:54:38.237Z' },
      { id: 15, author: '管理员', authorId: 1, content: '这棵树见证了几代人的成长', createdAt: '2026-04-05T18:54:38.237Z' },
      { id: 16, author: '管理员', authorId: 1, content: '每年清明前后花最美', createdAt: '2026-04-05T17:54:38.237Z' },
      { id: 17, author: '管理员', authorId: 1, content: '好想回家看看', createdAt: '2026-04-05T16:54:38.237Z' },
      { id: 18, author: '管理员', authorId: 1, content: '照片很有年代感', createdAt: '2026-04-05T15:54:38.237Z' },
      { id: 19, author: '管理员', authorId: 1, content: '希望能一直保留下去', createdAt: '2026-04-05T14:54:38.237Z' },
      { id: 20, author: '管理员', authorId: 1, content: '小时候在树下捉过知了', createdAt: '2026-04-05T13:54:38.237Z' },
      { id: 21, author: '管理员', authorId: 1, content: '这棵树的传说你知道吗', createdAt: '2026-04-05T12:54:38.237Z' },
      { id: 22, author: '管理员', authorId: 1, content: '村民们都喜欢在这棵树下聊天', createdAt: '2026-04-05T11:54:38.237Z' },
      { id: 23, author: '管理员', authorId: 1, content: '夏天的时候树叶特别茂盛', createdAt: '2026-04-05T10:54:38.237Z' },
      { id: 24, author: '管理员', authorId: 1, content: '秋天叶子落下来很美', createdAt: '2026-04-05T09:54:38.237Z' },
      { id: 25, author: '管理员', authorId: 1, content: '这张照片有故事', createdAt: '2026-04-05T08:54:38.237Z' },
      { id: 26, author: '管理员', authorId: 1, content: '家乡的标志性景物', createdAt: '2026-04-05T07:54:38.237Z' },
      { id: 27, author: '管理员', authorId: 1, content: '每次回家都要来看看', createdAt: '2026-04-05T06:54:38.237Z' },
      { id: 28, author: '管理员', authorId: 1, content: '树周围的环境保护得很好', createdAt: '2026-04-05T05:54:38.237Z' },
      { id: 29, author: '管理员', authorId: 1, content: '这棵树是村里的风水树', createdAt: '2026-04-05T04:54:38.237Z' },
      { id: 30, author: '管理员', authorId: 1, content: '小时候奶奶经常给我讲这棵树的故事', createdAt: '2026-04-05T03:54:38.237Z' },
      { id: 31, author: '管理员', authorId: 1, content: '花开的季节整个村子都香了', createdAt: '2026-04-05T02:54:38.237Z' },
      { id: 32, author: '管理员', authorId: 1, content: '夏天乘凉的好地方', createdAt: '2026-04-05T01:54:38.237Z' },
      { id: 33, author: '管理员', authorId: 1, content: '小时候放学后就在这玩', createdAt: '2026-04-05T00:54:38.237Z' },
      { id: 34, author: '管理员', authorId: 1, content: '这棵树有灵气', createdAt: '2026-04-04T23:54:38.239Z' },
      { id: 35, author: '管理员', authorId: 1, content: '每年都有人来祭拜', createdAt: '2026-04-04T22:54:38.239Z' },
      { id: 36, author: '管理员', authorId: 1, content: '这棵树见证了村子的变迁', createdAt: '2026-04-04T21:54:38.239Z' },
      { id: 37, author: '管理员', authorId: 1, content: '拍得很有意境', createdAt: '2026-04-04T20:54:38.239Z' },
      { id: 38, author: '管理员', authorId: 1, content: '让人想起远方的家', createdAt: '2026-04-04T19:54:38.239Z' },
      { id: 39, author: '管理员', authorId: 1, content: '希望能一直保存下去', createdAt: '2026-04-04T18:54:38.239Z' },
      { id: 40, author: '管理员', authorId: 1, content: '这棵树是村子的灵魂', createdAt: '2026-04-04T17:54:38.239Z' },
      { id: 41, author: '管理员', authorId: 1, content: '小时候骑在树杈上玩', createdAt: '2026-04-04T16:54:38.239Z' },
      { id: 42, author: '管理员', authorId: 1, content: '花落的时候像雪一样', createdAt: '2026-04-04T15:54:38.239Z' },
      { id: 43, author: '管理员', authorId: 1, content: '秋天的老槐树也很美', createdAt: '2026-04-04T14:54:38.239Z' },
      { id: 44, author: '管理员', authorId: 1, content: '这棵树有几百年的历史', createdAt: '2026-04-04T13:54:38.239Z' },
      { id: 45, author: '管理员', authorId: 1, content: '每年春节都有人来挂红灯笼', createdAt: '2026-04-04T12:54:38.239Z' },
      { id: 46, author: '管理员', authorId: 1, content: '树下是村民聚会的场所', createdAt: '2026-04-04T11:54:38.239Z' },
      { id: 47, author: '管理员', authorId: 1, content: '这张照片让我想起了爷爷', createdAt: '2026-04-04T10:54:38.239Z' },
      { id: 48, author: '管理员', authorId: 1, content: '家乡的一草一木都让人牵挂', createdAt: '2026-04-04T09:54:38.239Z' },
      { id: 49, author: '管理员', authorId: 1, content: '时光飞逝，树木依旧', createdAt: '2026-04-04T08:54:38.239Z' },
      { id: 50, author: '管理员', authorId: 1, content: '这棵树是我们村的骄傲', createdAt: '2026-04-04T07:54:38.239Z' }
    ]
  },
  {
    id: 2,
    title: '秋收时节',
    aspectRatio: 1,
    description: '金黄的稻田，丰收的喜悦',
    imageUrl: '/uploads/sample2.jpg',
    location: '东边田地',
    category: '风景',
    author: '李四',
    authorId: 2,
    createdAt: '2024-10-20T14:20:00Z',
    likes: 25,
    views: 203,
    likedUsers: [],
    comments: [
      { id: 1001, author: '管理员', authorId: 1, content: '丰收的季节最美了', createdAt: '2026-04-06T08:54:38.237Z' },
      { id: 1002, author: '管理员', authorId: 1, content: '金黄的稻田太漂亮了', createdAt: '2026-04-06T07:54:38.237Z' },
      { id: 1003, author: '管理员', authorId: 1, content: '这就是我小时候的记忆', createdAt: '2026-04-06T06:54:38.237Z' },
      { id: 1004, author: '管理员', authorId: 1, content: '每年秋收都很忙', createdAt: '2026-04-06T05:54:38.237Z' },
      { id: 1005, author: '管理员', authorId: 1, content: '稻香阵阵', createdAt: '2026-04-06T04:54:38.237Z' },
      { id: 1006, author: '管理员', authorId: 1, content: '好想回家帮忙收割', createdAt: '2026-04-06T03:54:38.237Z' },
      { id: 1007, author: '管理员', authorId: 1, content: '小时候最开心的就是秋收', createdAt: '2026-04-06T02:54:38.237Z' },
      { id: 1008, author: '管理员', authorId: 1, content: '粒粒皆辛苦', createdAt: '2026-04-06T01:54:38.237Z' },
      { id: 1009, author: '管理员', authorId: 1, content: '这张照片拍出了丰收的喜悦', createdAt: '2026-04-06T00:54:38.237Z' },
      { id: 1010, author: '管理员', authorId: 1, content: '农村生活真的很充实', createdAt: '2026-04-05T23:54:38.237Z' },
      { id: 1011, author: '管理员', authorId: 1, content: '收割机还是人工割的？', createdAt: '2026-04-05T22:54:38.237Z' },
      { id: 1012, author: '管理员', authorId: 1, content: '我记得小时候是用镰刀割的', createdAt: '2026-04-05T21:54:38.237Z' },
      { id: 1013, author: '管理员', authorId: 1, content: '秋收时节全村都很忙', createdAt: '2026-04-05T20:54:38.237Z' },
      { id: 1014, author: '管理员', authorId: 1, content: '稻子黄了的时候最好看', createdAt: '2026-04-05T19:54:38.237Z' },
      { id: 1015, author: '管理员', authorId: 1, content: '这张照片太有感觉了', createdAt: '2026-04-05T18:54:38.237Z' },
      { id: 1016, author: '管理员', authorId: 1, content: '让人想起辛苦劳作的父老乡亲', createdAt: '2026-04-05T17:54:38.237Z' },
      { id: 1017, author: '管理员', authorId: 1, content: '现在农村生活也越来越好了', createdAt: '2026-04-05T16:54:38.237Z' },
      { id: 1018, author: '管理员', authorId: 1, content: '小时候在稻田里打过滚', createdAt: '2026-04-05T15:54:38.237Z' },
      { id: 1019, author: '管理员', authorId: 1, content: '秋收时节天气最好', createdAt: '2026-04-05T14:54:38.237Z' },
      { id: 1020, author: '管理员', authorId: 1, content: '金灿灿的稻谷让人欣慰', createdAt: '2026-04-05T13:54:38.237Z' },
      { id: 1021, author: '管理员', authorId: 1, content: '还记得小时候晒稻谷的场景', createdAt: '2026-04-05T12:54:38.237Z' },
      { id: 1022, author: '管理员', authorId: 1, content: '这张照片有浓浓的乡情', createdAt: '2026-04-05T11:54:38.237Z' },
      { id: 1023, author: '管理员', authorId: 1, content: '秋天的农村是最美的', createdAt: '2026-04-05T10:54:38.237Z' },
      { id: 1024, author: '管理员', authorId: 1, content: '稻田里的青蛙叫个不停', createdAt: '2026-04-05T09:54:38.237Z' },
      { id: 1025, author: '管理员', authorId: 1, content: '小时候抓过稻田里的泥鳅', createdAt: '2026-04-05T08:54:38.237Z' },
      { id: 1026, author: '管理员', authorId: 1, content: '农民伯伯辛苦了', createdAt: '2026-04-05T07:54:38.237Z' },
      { id: 1027, author: '管理员', authorId: 1, content: '这就是丰收的味道', createdAt: '2026-04-05T06:54:38.237Z' },
      { id: 1028, author: '管理员', authorId: 1, content: '看着稻谷心里就踏实', createdAt: '2026-04-05T05:54:38.237Z' },
      { id: 1029, author: '管理员', authorId: 1, content: '秋收时节村里最热闹', createdAt: '2026-04-05T04:54:38.237Z' },
      { id: 1030, author: '管理员', authorId: 1, content: '小时候最期待秋收了', createdAt: '2026-04-05T03:54:38.237Z' },
      { id: 1031, author: '管理员', authorId: 1, content: '割稻子虽然累但很快乐', createdAt: '2026-04-05T02:54:38.237Z' },
      { id: 1032, author: '管理员', authorId: 1, content: '这张照片拍出了乡村之美', createdAt: '2026-04-05T01:54:38.237Z' },
      { id: 1033, author: '管理员', authorId: 1, content: '稻田里的蚂蚱很多', createdAt: '2026-04-05T00:54:38.237Z' },
      { id: 1034, author: '管理员', authorId: 1, content: '小时候在田埂上追过蝴蝶', createdAt: '2026-04-04T23:54:38.239Z' },
      { id: 1035, author: '管理员', authorId: 1, content: '秋天的风都是甜的', createdAt: '2026-04-04T22:54:38.239Z' },
      { id: 1036, author: '管理员', authorId: 1, content: '想起了那句诗：锄禾日当午', createdAt: '2026-04-04T21:54:38.239Z' },
      { id: 1037, author: '管理员', authorId: 1, content: '这张照片很有意境', createdAt: '2026-04-04T20:54:38.239Z' },
      { id: 1038, author: '管理员', authorId: 1, content: '农村的日子虽然辛苦但很充实', createdAt: '2026-04-04T19:54:38.239Z' },
      { id: 1039, author: '管理员', authorId: 1, content: '金色的稻田像画一样', createdAt: '2026-04-04T18:54:38.239Z' },
      { id: 1040, author: '管理员', authorId: 1, content: '秋收是农村最热闹的时候', createdAt: '2026-04-04T17:54:38.239Z' },
      { id: 1041, author: '管理员', authorId: 1, content: '小时候最开心的事就是秋收', createdAt: '2026-04-04T16:54:38.239Z' },
      { id: 1042, author: '管理员', authorId: 1, content: '稻谷飘香', createdAt: '2026-04-04T15:54:38.239Z' },
      { id: 1043, author: '管理员', authorId: 1, content: '这张照片让我感动', createdAt: '2026-04-04T14:54:38.239Z' },
      { id: 1044, author: '管理员', authorId: 1, content: '父辈们辛苦了', createdAt: '2026-04-04T13:54:38.239Z' },
      { id: 1045, author: '管理员', authorId: 1, content: '秋收时节家家户户都在忙', createdAt: '2026-04-04T12:54:38.239Z' },
      { id: 1046, author: '管理员', authorId: 1, content: '想起了小时候帮家里干农活', createdAt: '2026-04-04T11:54:38.239Z' },
      { id: 1047, author: '管理员', authorId: 1, content: '这才是真正的田园生活', createdAt: '2026-04-04T10:54:38.239Z' },
      { id: 1048, author: '管理员', authorId: 1, content: '丰收的喜悦溢于言表', createdAt: '2026-04-04T09:54:38.239Z' },
      { id: 1049, author: '管理员', authorId: 1, content: '看着这些稻谷就想起家乡', createdAt: '2026-04-04T08:54:38.239Z' },
      { id: 1050, author: '管理员', authorId: 1, content: '永远的乡愁', createdAt: '2026-04-04T07:54:38.239Z' }
    ]
  },
  {
    id: 3,
    title: '新建的文化广场',
    aspectRatio: 1,
    description: '去年新建的村民活动广场',
    imageUrl: '/uploads/sample3.jpg',
    location: '村中心',
    category: '建筑',
    author: '王五',
    authorId: 3,
    createdAt: '2025-01-10T09:15:00Z',
    likes: 18,
    views: 89,
    likedUsers: [],
    comments: []
  }
];
let nextPhotoId = 4;

// JWT 验证中间件
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
  } catch (e) {
    req.user = null;
  }
  next();
};

// 管理员验证中间件
const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '需要管理员权限' });
  }
  next();
};

// ============ 用户 API ============

app.post('/api/auth/register', async (req, res) => {
  const { username, password, nickname } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '请填写用户名和密码' });
  }
  
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ success: false, message: '用户名已存在' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: nextUserId++,
    username,
    password: hashedPassword,
    nickname: nickname || username,
    role: users.length === 0 ? 'admin' : 'user', // 第一个用户是管理员
    avatar: '/uploads/default-avatar.png',
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  
  const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
  
  res.json({
    success: true,
    message: '注册成功',
    data: { token, user: { id: newUser.id, username: newUser.username, nickname: newUser.nickname, role: newUser.role } }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  const user = users.find(u => u.username === username);
  if (!user) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  
  res.json({
    success: true,
    message: '登录成功',
    data: { token, user: { id: user.id, username: user.username, nickname: user.nickname, role: user.role } }
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  if (!req.user) {
    return res.json({ success: true, data: null });
  }
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.json({ success: true, data: null });
  }
  res.json({
    success: true,
    data: { id: user.id, username: user.username, nickname: user.nickname, role: user.role }
  });
});

// ============ 分类 API ============

app.get('/api/categories', (req, res) => {
  res.json({ success: true, data: categories });
});

app.post('/api/categories', authenticate, isAdmin, (req, res) => {
  const { name, icon, color } = req.body;
  if (!name) {
    return res.status(400).json({ success: false, message: '请输入分类名称' });
  }
  
  const newCategory = {
    id: nextCategoryId++,
    name,
    icon: icon || '📌',
    color: color || '#667eea'
  };
  
  categories.push(newCategory);
  res.json({ success: true, message: '分类创建成功', data: newCategory });
});

app.delete('/api/categories/:id', authenticate, isAdmin, (req, res) => {
  const index = categories.findIndex(c => c.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ success: false, message: '分类不存在' });
  }
  
  // 检查是否有照片使用该分类
  const usedCount = photos.filter(p => p.category === categories[index].name).length;
  if (usedCount > 0) {
    return res.status(400).json({ success: false, message: `该分类下有 ${usedCount} 张照片，无法删除` });
  }
  
  categories.splice(index, 1);
  res.json({ success: true, message: '分类删除成功' });
});

// ============ 照片 API ============

app.get('/api/photos', authenticate, (req, res) => {
  const { page = 1, limit = 20, location, keyword, category, sort } = req.query;
  
  let filteredPhotos = [...photos];
  
  if (location) {
    filteredPhotos = filteredPhotos.filter(p => p.location.includes(location));
  }
  
  if (category) {
    filteredPhotos = filteredPhotos.filter(p => p.category === category);
  }
  
  if (keyword) {
    const k = keyword.toLowerCase();
    filteredPhotos = filteredPhotos.filter(p => 
      p.title.toLowerCase().includes(k) || 
      p.description.toLowerCase().includes(k) ||
      p.location.toLowerCase().includes(k)
    );
  }
  
  // 排序
  if (sort === 'likes') {
    filteredPhotos.sort((a, b) => b.likes - a.likes);
  } else if (sort === 'views') {
    filteredPhotos.sort((a, b) => b.views - a.views);
  } else {
    filteredPhotos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  
  const start = (page - 1) * limit;
  const end = start + parseInt(limit);
  
  // 添加当前用户是否点赞的状态；去掉 comments 避免全量加载
  const userId = req.user?.id;
  const paginatedPhotos = filteredPhotos.slice(start, end).map(p => ({
    ...p,
    comments: undefined,
    liked: userId && p.likedUsers ? p.likedUsers.includes(userId) : false
  }));
  
  res.json({
    success: true,
    data: {
      photos: paginatedPhotos,
      total: filteredPhotos.length,
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
});

// 获取时间线数据（按月份分组）
app.get('/api/photos/timeline', authenticate, (req, res) => {
  const timeline = {};
  const userId = req.user?.id;
  
  photos.forEach(photo => {
    const date = new Date(photo.createdAt);
    const key = `${date.getFullYear()}年${date.getMonth() + 1}月`;
    
    if (!timeline[key]) {
      timeline[key] = [];
    }
    timeline[key].push({
      ...photo,
      liked: userId && photo.likedUsers ? photo.likedUsers.includes(userId) : false
    });
  });
  
  const result = Object.entries(timeline).map(([month, monthPhotos]) => ({
    month,
    photos: monthPhotos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  })).sort((a, b) => {
    const [yearA, monthA] = a.month.match(/(\d+)年(\d+)月/).slice(1);
    const [yearB, monthB] = b.month.match(/(\d+)年(\d+)月/).slice(1);
    return parseInt(yearB) - parseInt(yearA) || parseInt(monthB) - parseInt(monthA);
  });
  
  res.json({ success: true, data: result });
});

app.get('/api/photos/:id', authenticate, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) {
    return res.status(404).json({ success: false, message: '照片不存在' });
  }
  
  // 增加浏览量
  photo.views = (photo.views || 0) + 1;
  
  // 返回是否已点赞；去掉 fullComments，改用独立分页接口
  const userId = req.user?.id;
  const liked = userId && photo.likedUsers ? photo.likedUsers.includes(userId) : false;
  
  res.json({
    success: true,
    data: {
      ...photo,
      comments: undefined,
      commentCount: photo.comments ? photo.comments.length : 0,
      liked
    }
  });
});

// 评论分页接口（性能优化：按需加载）
app.get('/api/photos/:id/comments', authenticate, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) {
    return res.status(404).json({ success: false, message: '照片不存在' });
  }
  
  const { page = 1, limit = 20 } = req.query;
  const allComments = photo.comments || [];
  
  // 按时间倒序
  const sorted = [...allComments].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  
  const start = (parseInt(page) - 1) * parseInt(limit);
  const end = start + parseInt(limit);
  
  res.json({
    success: true,
    data: {
      comments: sorted.slice(start, end),
      total: allComments.length,
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
});

app.post('/api/photos', authenticate, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '请上传图片' });
  }
  
  if (!req.user) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  
  const user = users.find(u => u.id === req.user.id);
  const { title, description, location, category, author, aspectRatio } = req.body;
  
  const newPhoto = {
    id: nextPhotoId++,
    title: title || '无标题',
    description: description || '',
    imageUrl: `/uploads/${req.file.filename}`,
    location: location || '未知地点',
    category: category || '风景',
    author: author || user.nickname,
    authorId: user.id,
    aspectRatio: parseFloat(aspectRatio) || 1,  // 宽高比，默认 1
    createdAt: new Date().toISOString(),
    likes: 0,
    views: 0,
    likedUsers: [],
    comments: []
  };
  
  photos.push(newPhoto);
  
  res.json({ success: true, message: '上传成功', data: newPhoto });
});

app.post('/api/photos/:id/like', authenticate, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) {
    return res.status(404).json({ success: false, message: '照片不存在' });
  }
  
  // 未登录不能点赞
  if (!req.user) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  
  // 初始化 likes 和 likedUsers
  if (!photo.likes) photo.likes = 0;
  if (!photo.likedUsers) photo.likedUsers = [];
  
  const userId = req.user.id;
  
  // 检查是否已点赞
  const likedIndex = photo.likedUsers.indexOf(userId);
  if (likedIndex > -1) {
    // 已点赞，取消点赞
    photo.likedUsers.splice(likedIndex, 1);
    photo.likes -= 1;
    return res.json({ success: true, message: '取消点赞', liked: false, data: { likes: photo.likes } });
  } else {
    // 未点赞，添加点赞
    photo.likedUsers.push(userId);
    photo.likes += 1;
    return res.json({ success: true, message: '点赞成功', liked: true, data: { likes: photo.likes } });
  }
});

app.delete('/api/photos/:id', authenticate, (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  
  const index = photos.findIndex(p => p.id === parseInt(req.params.id));
  if (index === -1) {
    return res.status(404).json({ success: false, message: '照片不存在' });
  }
  
  const photo = photos[index];
  // 管理员可以删除任何照片，用户只能删除自己的
  if (photo.authorId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '只能删除自己的照片' });
  }
  
  const deleted = photos.splice(index, 1)[0];
  const filePath = path.join(__dirname, deleted.imageUrl);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  res.json({ success: true, message: '删除成功', data: deleted });
});

app.post('/api/photos/:id/comments', authenticate, (req, res) => {
  const photo = photos.find(p => p.id === parseInt(req.params.id));
  if (!photo) {
    return res.status(404).json({ success: false, message: '照片不存在' });
  }
  
  if (!req.user) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  
  const user = users.find(u => u.id === req.user.id);
  const { content } = req.body;
  
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: '请输入评论内容' });
  }
  
  const comment = {
    id: Date.now(),
    author: user.nickname,
    authorId: user.id,
    content: content.trim(),
    createdAt: new Date().toISOString()
  };
  
  photo.comments.push(comment);
  
  res.json({ success: true, message: '评论成功', data: comment });
});

// ============ 其他 API ============

app.get('/api/locations', (req, res) => {
  const locations = [...new Set(photos.map(p => p.location))];
  res.json({ success: true, data: locations });
});

app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      totalPhotos: photos.length,
      totalUsers: users.length,
      totalLikes: photos.reduce((sum, p) => sum + p.likes, 0),
      totalViews: photos.reduce((sum, p) => sum + (p.views || 0), 0),
      totalComments: photos.reduce((sum, p) => sum + p.comments.length, 0)
    }
  });
});

// ============ 管理后台 API ============

app.get('/api/admin/users', authenticate, isAdmin, (req, res) => {
  const userList = users.map(u => ({
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    role: u.role,
    createdAt: u.createdAt,
    photoCount: photos.filter(p => p.authorId === u.id).length
  }));
  res.json({ success: true, data: userList });
});

app.get('/api/admin/photos', authenticate, isAdmin, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  
  const sortedPhotos = [...photos].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const start = (page - 1) * limit;
  const end = start + parseInt(limit);
  
  res.json({
    success: true,
    data: {
      photos: sortedPhotos.slice(start, end),
      total: photos.length,
      page: parseInt(page),
      limit: parseInt(limit)
    }
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 服务器运行在 http://localhost:${PORT}`);
  console.log(`📸 家乡照片墙 API 服务已启动 (完整版)`);
  console.log(`👤 第一个注册的用户为管理员`);
});
