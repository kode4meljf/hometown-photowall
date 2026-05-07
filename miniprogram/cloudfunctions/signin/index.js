// cloudfunctions/signin/index.js - 每日签到云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const signinsCollection = db.collection('user_signins');
const usersCollection = db.collection('users');

// 获取今天是本周第几天（周一=1，周日=7）
function getWeekDay(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=周日
  return day === 0 ? 7 : day;
}

// 获取本周一日期字符串
function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = getWeekDay(dateStr);
  d.setDate(d.getDate() - (day - 1));
  return formatDate(d);
}

// 获取下周一日期字符串
function getWeekEnd(dateStr) {
  const d = new Date(dateStr);
  const day = getWeekDay(dateStr);
  d.setDate(d.getDate() + (7 - day));
  return formatDate(d);
}

// 格式化日期为 YYYY-MM-DD
function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 获取连续签到天数（从今天往前推）
async function getStreak(openId, todayStr) {
  let streak = 0;
  let checkDate = new Date(todayStr);

  while (true) {
    const dateStr = formatDate(checkDate);
    const result = await signinsCollection.where({
      _openid: openId,
      date: dateStr
    }).count();

    if (result.total > 0) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

// 云函数入口
exports.main = async (event, context) => {
  const { action } = event;
  const wxContext = cloud.getWXContext();
  const openId = wxContext.OPENID;

  switch (action) {
    case 'getSigninInfo':
      return await handleGetSigninInfo(openId);
    case 'checkin':
      return await handleCheckin(openId);
    default:
      return { success: false, message: '未知操作' };
  }
};

// 获取签到信息
async function handleGetSigninInfo(openId) {
  try {
    const today = formatDate(new Date());
    const weekStart = getWeekStart(today);
    const weekEnd = getWeekEnd(today);

    // 查询本周所有签到记录
    const weekResult = await signinsCollection.where({
      _openid: openId,
      date: _.gte(weekStart).and(_.lte(weekEnd))
    }).orderBy('date', 'asc').get();

    const weekDates = weekResult.data.map(item => item.date);
    const streak = await getStreak(openId, today);

    // 读取用户积分余额
    const userRes = await usersCollection.where({ _openid: openId }).get();
    const credits = userRes.data.length > 0 ? (userRes.data[0].credits || 0) : 0;

    // 判断今天是否已签到
    const signedToday = weekDates.includes(today);

    // 本周周一到今天的日期列表（用于前端渲染7个圆点）
    const weekDayIndex = getWeekDay(today); // 今天本周第几天
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      weekDays.push({
        date: dateStr,
        dayLabel: ['一', '二', '三', '四', '五', '六', '日'][i],
        signed: weekDates.includes(dateStr),
        isToday: dateStr === today,
        isFuture: dateStr > today
      });
    }

    return {
      success: true,
      data: {
        streak,
        credits,
        today: today,
        signedToday,
        weekDays
      }
    };
  } catch (e) {
    console.error('获取签到信息失败:', e);
    return { success: false, message: '获取签到信息失败' };
  }
}

// 执行签到
async function handleCheckin(openId) {
  try {
    const today = formatDate(new Date());

    // 检查今天是否已签到
    const existResult = await signinsCollection.where({
      _openid: openId,
      date: today
    }).count();

    if (existResult.total > 0) {
      return { success: false, message: '今日已签到' };
    }

    // 写入签到记录
    await signinsCollection.add({
      data: {
        _openid: openId,
        date: today,
        createdAt: db.serverDate()
      }
    });

    // 重新计算连续天数
    const streak = await getStreak(openId, today);

    // 计算本次奖励积分
    let reward = 1; // 每次签到 +1
    if (streak === 4) reward += 1; // 连续4天额外+1
    if (streak === 7) reward += 2; // 连续7天额外+2（7天时总共+3）

    // 更新用户积分（无记录则创建）
    const userRes = await usersCollection.where({ _openid: openId }).get();
    if (userRes.data.length > 0) {
      await usersCollection.where({ _openid: openId }).update({
        data: { credits: _.inc(reward) }
      });
    } else {
      await usersCollection.add({
        data: { _openid: openId, credits: reward }
      });
    }

    // 重新读取最新积分
    const newUserRes = await usersCollection.where({ _openid: openId }).get();
    const newCredits = newUserRes.data.length > 0 ? (newUserRes.data[0].credits || 0) : 0;

    return {
      success: true,
      data: {
        date: today,
        streak,
        credits: newCredits,
        message: streak > 1 ? `已连续签到 ${streak} 天` : '签到成功'
      }
    };
  } catch (e) {
    console.error('签到失败:', e);
    return { success: false, message: '签到失败，请重试' };
  }
}
