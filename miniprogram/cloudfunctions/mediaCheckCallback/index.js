/**
 * 接收微信 wxa_media_check 异步图片审核回调
 * 控制台配置：云开发 → 设置 → 消息推送 → 云函数
 *   消息类型 event，事件类型 wxa_media_check → 本函数
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const mediaAudit = require('./common/mediaAudit');
const { isDevActionsEnabled, assertDevKey, devActionsDisabledResponse } = require('./common/devGate');

exports.main = async (event) => {
  if (event.action === 'devSimulateCallback') {
    if (!isDevActionsEnabled()) {
      return devActionsDisabledResponse();
    }
    if (!assertDevKey(event.data)) {
      return { success: false, message: '无权限' };
    }
    return devSimulateCallback(event.data);
  }

  if (event.MsgType !== 'event' || event.Event !== 'wxa_media_check') {
    return 'success';
  }

  try {
    const result = await mediaAudit.handleMediaCheckEvent(db, event, cloud);
    console.log('[mediaCheckCallback]', JSON.stringify(result));
  } catch (e) {
    console.error('[mediaCheckCallback] handle failed:', e.message, e.stack);
  }

  return 'success';
};

/** 开发：模拟 wxa_media_check 推送，验证 trace_id → 帖子状态聚合 */
async function devSimulateCallback(data) {
  const { traceId, suggest = 'pass', errcode = 0 } = data;
  if (!traceId) {
    return { success: false, message: '缺少 traceId' };
  }

  const mockEvent = {
    MsgType: 'event',
    Event: 'wxa_media_check',
    trace_id: traceId,
    errcode,
    result: { suggest, label: suggest === 'risky' ? 200 : 100 },
  };

  const result = await mediaAudit.handleMediaCheckEvent(db, mockEvent, cloud);
  return { success: true, data: result };
}
