// cloudfunctions/signin/index.js - 每日签到云函数
//
// 建议在云开发控制台为 user_signins 创建复合唯一索引：(_openid 升序, date 升序)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const signinsCollection = db.collection('user_signins');
const usersCollection = db.collection('users');

const STREAK_LOOKBACK_DAYS = 400;

function getWeekDay(date) {
  const d = new Date(date);
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function getWeekStart(dateStr) {
  const d = new Date(dateStr);
  const day = getWeekDay(dateStr);
  d.setDate(d.getDate() - (day - 1));
  return formatDate(d);
}

function getWeekEnd(dateStr) {
  const d = new Date(dateStr);
  const day = getWeekDay(dateStr);
  d.setDate(d.getDate() + (7 - day));
  return formatDate(d);
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateStr, delta) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

function computeStreakFromDates(signedDates, todayStr) {
  const signedSet = signedDates instanceof Set ? signedDates : new Set(signedDates);
  let streak = 0;
  let checkDate = todayStr;
  while (signedSet.has(checkDate)) {
    streak += 1;
    checkDate = addDays(checkDate, -1);
  }
  return streak;
}

async function fetchSignedDatesInRange(openId, fromStr, toStr, collection = signinsCollection) {
  const result = await collection.where({
    _openid: openId,
    date: _.gte(fromStr).and(_.lte(toStr)),
  }).field({ date: true }).limit(500).get();
  return new Set(result.data.map((item) => item.date));
}

async function getStreak(openId, todayStr) {
  const fromStr = addDays(todayStr, -(STREAK_LOOKBACK_DAYS - 1));
  const signedDates = await fetchSignedDatesInRange(openId, fromStr, todayStr);
  return computeStreakFromDates(signedDates, todayStr);
}

function computeCheckinReward(streak) {
  let reward = 1;
  if (streak === 4) reward += 1;
  if (streak === 7) reward += 2;
  return reward;
}

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

async function handleGetSigninInfo(openId) {
  try {
    const today = formatDate(new Date());
    const weekStart = getWeekStart(today);
    const weekEnd = getWeekEnd(today);

    const weekResult = await signinsCollection.where({
      _openid: openId,
      date: _.gte(weekStart).and(_.lte(weekEnd)),
    }).orderBy('date', 'asc').get();

    const weekDates = weekResult.data.map((item) => item.date);
    const streak = await getStreak(openId, today);

    const userRes = await usersCollection.where({ _openid: openId }).get();
    const credits = userRes.data.length > 0 ? (userRes.data[0].credits || 0) : 0;
    const signedToday = weekDates.includes(today);

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
        isFuture: dateStr > today,
      });
    }

    return {
      success: true,
      data: {
        streak,
        credits,
        today,
        signedToday,
        weekDays,
      },
    };
  } catch (e) {
    console.error('获取签到信息失败:', e);
    return { success: false, message: '获取签到信息失败' };
  }
}

async function handleCheckin(openId) {
  const today = formatDate(new Date());
  const transaction = await db.startTransaction();

  try {
    const signColl = transaction.collection('user_signins');
    const userColl = transaction.collection('users');

    const existResult = await signColl.where({
      _openid: openId,
      date: today,
    }).count();
    if (existResult.total > 0) {
      await transaction.rollback();
      return { success: false, message: '今日已签到' };
    }

    await signColl.add({
      data: {
        _openid: openId,
        date: today,
        createdAt: db.serverDate(),
      },
    });

    const lookbackFrom = addDays(today, -(STREAK_LOOKBACK_DAYS - 1));
    const signedDates = await fetchSignedDatesInRange(openId, lookbackFrom, today, signColl);
    signedDates.add(today);
    const streak = computeStreakFromDates(signedDates, today);
    const reward = computeCheckinReward(streak);

    const userRes = await userColl.where({ _openid: openId }).get();
    let newCredits;
    if (userRes.data.length > 0) {
      const user = userRes.data[0];
      newCredits = (user.credits || 0) + reward;
      await userColl.doc(user._id).update({
        data: { credits: newCredits },
      });
    } else {
      newCredits = reward;
      await userColl.add({
        data: { _openid: openId, credits: reward },
      });
    }

    await transaction.commit();

    return {
      success: true,
      data: {
        date: today,
        streak,
        credits: newCredits,
        message: streak > 1 ? `已连续签到 ${streak} 天` : '签到成功',
      },
    };
  } catch (e) {
    await transaction.rollback();
    console.error('签到失败:', e);
    return { success: false, message: '签到失败，请重试' };
  }
}
