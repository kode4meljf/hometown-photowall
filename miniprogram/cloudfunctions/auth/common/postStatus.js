const POST_STATUS = {
  RELEASED: 'released',
  REVIEWING: 'reviewing',
  HIDDEN: 'hidden',
  REJECTED: 'rejected',
};

const POST_STATUS_LIST = Object.values(POST_STATUS);

function isPublicStatus(status) {
  return status === POST_STATUS.RELEASED;
}

module.exports = {
  POST_STATUS,
  POST_STATUS_LIST,
  isPublicStatus,
};
