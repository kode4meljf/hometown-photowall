const PAGE_SIZE_MAX = 50;
const PAGE_SIZE_DEFAULT = 20;

function normalizePagePagination(params = {}, defaultPageSize = PAGE_SIZE_DEFAULT) {
  const pageRaw = parseInt(params.page, 10);
  const sizeRaw = parseInt(params.pageSize, 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const pageSizeBase = Number.isFinite(sizeRaw) && sizeRaw >= 1 ? sizeRaw : defaultPageSize;
  return { page, pageSize: Math.min(pageSizeBase, PAGE_SIZE_MAX) };
}

function normalizeOffsetLimit(params = {}, defaults = { offset: 0, limit: 10 }) {
  const offsetRaw = parseInt(params.offset, 10);
  const limitRaw = parseInt(params.limit, 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : defaults.offset;
  const limitBase = Number.isFinite(limitRaw) && limitRaw >= 1 ? limitRaw : defaults.limit;
  return { offset, limit: Math.min(limitBase, PAGE_SIZE_MAX) };
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  PAGE_SIZE_MAX,
  PAGE_SIZE_DEFAULT,
  normalizePagePagination,
  normalizeOffsetLimit,
  escapeRegExp,
};
