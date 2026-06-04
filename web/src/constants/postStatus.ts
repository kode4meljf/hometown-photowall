/** 帖子状态 — 与 cloudfunctions/common/postStatus.js、miniprogram/utils/postStatus.js 保持同步 */

export const POST_STATUS = {
  RELEASED: 'released',
  REVIEWING: 'reviewing',
  HIDDEN: 'hidden',
  REJECTED: 'rejected',
} as const;

export type PostStatus = (typeof POST_STATUS)[keyof typeof POST_STATUS];

export const POST_STATUS_LIST: PostStatus[] = Object.values(POST_STATUS);

export const POST_STATUS_ADMIN_LABEL: Record<PostStatus, string> = {
  [POST_STATUS.RELEASED]: '已发布',
  [POST_STATUS.REVIEWING]: '审核中',
  [POST_STATUS.HIDDEN]: '已隐藏',
  [POST_STATUS.REJECTED]: '未通过',
};

export function postStatusLabel(status: PostStatus): string {
  return POST_STATUS_ADMIN_LABEL[status] || POST_STATUS_ADMIN_LABEL[POST_STATUS.REJECTED];
}

export type PostStatusFilter = 'all' | PostStatus;

export const POST_STATUS_FILTER_TABS: { key: PostStatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  ...POST_STATUS_LIST.map((key) => ({
    key,
    label: POST_STATUS_ADMIN_LABEL[key],
  })),
];

export function isPublicStatus(status: string): boolean {
  return status === POST_STATUS.RELEASED;
}
