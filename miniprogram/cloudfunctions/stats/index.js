// cloudfunctions/stats/index.js - 个人数据统计
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const postsCollection = db.collection('posts');
const commentsCollection = db.collection('post_comments');
const usersCollection = db.collection('users');
const { identity } = require('hometown-common');

const GRADES = [
  [90, 'A'],
  [85, 'A−'],
  [80, 'B+'],
  [70, 'B'],
  [60, 'B−'],
  [0, 'C'],
];

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v.$date) return new Date(v.$date);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function scoreToGrade(score) {
  const s = Math.min(100, Math.max(0, Math.round(score)));
  for (let i = 0; i < GRADES.length; i++) {
    if (s >= GRADES[i][0]) return { score: s, grade: GRADES[i][1] };
  }
  return { score: s, grade: 'C' };
}

function buildMonthlySeries(posts, months = 6) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: monthKey(d),
      label: `${d.getMonth() + 1}月`,
      count: 0,
      isCurrent: i === 0,
    });
  }
  const map = {};
  buckets.forEach((b) => {
    map[b.key] = b;
  });
  posts.forEach((p) => {
    const created = toDate(p.createdAt);
    if (!created) return;
    const key = monthKey(created);
    if (map[key]) map[key].count += 1;
  });
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return buckets.map((b) => ({
    label: b.label,
    count: b.count,
    isCurrent: b.isCurrent,
    heightPct: Math.round((b.count / max) * 100),
  }));
}

async function countCommentsOnPosts(postIds, since) {
  if (!postIds.length) return 0;
  const CHUNK = 20;
  let total = 0;
  for (let i = 0; i < postIds.length; i += CHUNK) {
    const chunk = postIds.slice(i, i + CHUNK);
    const where = { postId: _.in(chunk) };
    if (since) where.createdAt = _.gte(since);
    const res = await commentsCollection.where(where).count();
    total += res.total;
  }
  return total;
}

async function computeLikePercentile(myLikes) {
  try {
    const res = await postsCollection.field({ authorId: true, likes: true }).limit(1000).get();
    const byAuthor = {};
    res.data.forEach((p) => {
      if (!p.authorId) return;
      byAuthor[p.authorId] = (byAuthor[p.authorId] || 0) + (p.likes || 0);
    });
    const totals = Object.values(byAuthor);
    if (totals.length === 0) return 0;
    const below = totals.filter((t) => t < myLikes).length;
    return Math.round((below / totals.length) * 100);
  } catch (e) {
    return 0;
  }
}

async function getPlatformStats(monthStart) {
  const [postCount, userCount, commentCount] = await Promise.all([
    postsCollection.count(),
    usersCollection.count(),
    commentsCollection.count(),
  ]);

  const likesResult = await postsCollection.field({ likes: true }).limit(1000).get();
  const totalLikes = likesResult.data.reduce((sum, p) => sum + (p.likes || 0), 0);

  const [postsMonth, usersMonth] = await Promise.all([
    postsCollection.where({ createdAt: _.gte(monthStart) }).count(),
    usersCollection.where({ createdAt: _.gte(monthStart) }).count(),
  ]);

  const postsMonthData = await postsCollection
    .where({ createdAt: _.gte(monthStart) })
    .field({ likes: true })
    .limit(1000)
    .get();
  const likesMonth = postsMonthData.data.reduce((sum, p) => sum + (p.likes || 0), 0);

  return {
    totalPosts: postCount.total,
    totalUsers: userCount.total,
    totalComments: commentCount.total,
    totalLikes,
    deltaPostsMonth: postsMonth.total,
    deltaUsersMonth: usersMonth.total,
    deltaLikesMonth: likesMonth,
  };
}

async function handleGetDashboard(openId) {
  const actor = await identity.resolveActor(db, openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }

  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);

  const postsRes = await postsCollection
    .where(identity.authorOwnerWhere(db, actor))
    .field({ likes: true, views: true, createdAt: true })
    .limit(1000)
    .get();
  const posts = postsRes.data;
  const postIds = posts.map((p) => p._id).filter(Boolean);

  const works = posts.length;
  const totalLikes = posts.reduce((s, p) => s + (p.likes || 0), 0);
  const totalViews = posts.reduce((s, p) => s + (p.views || 0), 0);

  let worksMonth = 0;
  let likesWeek = 0;
  let viewsWeek = 0;
  posts.forEach((p) => {
    const created = toDate(p.createdAt);
    if (!created) return;
    if (created >= monthStart) worksMonth += 1;
    if (created >= weekStart) {
      likesWeek += p.likes || 0;
      viewsWeek += p.views || 0;
    }
  });

  const commentsTotal = await countCommentsOnPosts(postIds);
  const commentsWeek = await countCommentsOnPosts(postIds, weekStart);

  const monthly = buildMonthlySeries(posts, 6);
  const chartMonthDelta = monthly.length ? monthly[monthly.length - 1].count : 0;

  const avgLikes = works > 0 ? totalLikes / works : 0;
  const avgViews = works > 0 ? totalViews / works : 0;
  const avgComments = works > 0 ? commentsTotal / works : 0;

  const abilities = [
    {
      key: 'creative',
      name: '创作活跃度',
      ...scoreToGrade(Math.min(100, worksMonth * 20 + works * 3)),
      width: Math.min(100, worksMonth * 20 + works * 3),
    },
    {
      key: 'popular',
      name: '内容受欢迎',
      ...scoreToGrade(Math.min(100, avgLikes * 8)),
      width: Math.min(100, avgLikes * 8),
    },
    {
      key: 'engage',
      name: '互动参与度',
      ...scoreToGrade(Math.min(100, avgComments * 15)),
      width: Math.min(100, avgComments * 15),
    },
    {
      key: 'views',
      name: '浏览量增长',
      ...scoreToGrade(Math.min(100, avgViews / 8)),
      width: Math.min(100, avgViews / 8),
    },
  ];

  const percentile = await computeLikePercentile(totalLikes);

  const payload = {
    isAdmin: actor.isAdmin,
    personal: {
      works,
      likes: totalLikes,
      comments: commentsTotal,
      views: totalViews,
      deltaWorksMonth: worksMonth,
      deltaLikesWeek: likesWeek,
      deltaCommentsWeek: commentsWeek,
      deltaViewsWeek: viewsWeek,
      likesPercentile: percentile,
      monthly,
      chartMonthDelta,
      abilities,
    },
  };

  if (actor.isAdmin) {
    payload.platform = await getPlatformStats(monthStart);
  }

  return { success: true, data: payload };
}

exports.main = async (event) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  switch (action) {
    case 'getDashboard':
      return await handleGetDashboard(openId);
    default:
      return { success: false, message: '未知操作' };
  }
};
