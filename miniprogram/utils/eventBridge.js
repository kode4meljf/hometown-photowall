function getTouches(e) {
  if (e && e.touches && e.touches.length) return e.touches;
  if (e && e.detail && e.detail.touches) return e.detail.touches;
  return [];
}

function getChangedTouches(e) {
  if (e && e.changedTouches && e.changedTouches.length) return e.changedTouches;
  if (e && e.detail && e.detail.changedTouches) return e.detail.changedTouches;
  return [];
}

function getDataset(e) {
  if (e && e.detail && typeof e.detail === 'object' && Object.keys(e.detail).length) {
    return e.detail;
  }
  return (e && e.currentTarget && e.currentTarget.dataset) || {};
}

module.exports = {
  getTouches,
  getChangedTouches,
  getDataset,
};
