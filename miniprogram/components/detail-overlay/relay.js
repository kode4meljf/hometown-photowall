/** 子组件向 overlay 转发 dataset / touch 事件 */
function relayDataset(eventName) {
  return function relay(e) {
    this.triggerEvent(eventName, e.currentTarget.dataset || {});
  };
}

function relayTouch(eventName) {
  return function relay(e) {
    this.triggerEvent(eventName, {
      touches: e.touches,
      changedTouches: e.changedTouches,
    });
  };
}

function relayInput(eventName) {
  return function relay(e) {
    this.triggerEvent(eventName, { value: e.detail.value });
  };
}

function relayDetail(eventName) {
  return function relay(e) {
    this.triggerEvent(eventName, e.detail || {});
  };
}

module.exports = {
  relayDataset,
  relayTouch,
  relayInput,
  relayDetail,
};
