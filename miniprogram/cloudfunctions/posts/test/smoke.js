/**
 * posts 云函数拆分后的本地 smoke 测试（mock wx-server-sdk）
 * 运行：node test/smoke.js
 */

const path = require('path');
const postsRoot = path.join(__dirname, '..');

function makeChainable() {
  const chain = {
    where() { return chain; },
    orderBy() { return chain; },
    skip() { return chain; },
    limit() { return chain; },
    field() { return chain; },
    count: async () => ({ total: 0 }),
    get: async () => ({ data: [] }),
  };
  return chain;
}

function mockWxServerSdk() {
  const collection = () => {
    const chain = makeChainable();
    chain.doc = () => ({
      get: async () => ({ data: null }),
      update: async () => ({}),
      remove: async () => ({}),
      field: () => ({
        get: async () => ({ data: { shares: 0 } }),
      }),
    });
    chain.add = async () => ({ _id: 'mock-id' });
    chain.remove = async () => ({});
    return chain;
  };

  return {
    init: () => {},
    DYNAMIC_CURRENT_ENV: 'mock-env',
    database: () => ({
      command: {
        inc: (n) => ({ __inc: n }),
        push: (n) => ({ __push: n }),
        pull: (n) => ({ __pull: n }),
        in: (arr) => ({ __in: arr }),
        or: (...args) => ({ __or: args }),
        eq: (v) => ({ __eq: v }),
        exists: (v) => ({ __exists: v }),
        gte: (v) => ({ __gte: v }),
        lte: (v) => ({ __lte: v }),
        neq: (v) => ({ __neq: v }),
      },
      RegExp: (opts) => opts,
      serverDate: () => new Date(),
      collection,
      runTransaction: async (fn) => {
        const tx = { collection };
        await fn(tx);
      },
    }),
    getWXContext: () => ({ OPENID: 'mock-openid' }),
    uploadFile: async () => ({ fileID: 'cloud://mock/photos/u1/x.jpg' }),
    deleteFile: async () => ({}),
    openapi: {
      wxacode: {
        getUnlimited: async () => ({ buffer: Buffer.from('qr') }),
      },
    },
  };
}

const Module = require('module');
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'wx-server-sdk') {
    return mockWxServerSdk();
  }
  return originalLoad.call(this, request, parent, isMain);
};

const EXPECTED_ACTIONS = [
  'list', 'detail', 'create', 'resubmit', 'delete', 'like', 'comment',
  'deleteComment', 'locations', 'myWorks', 'myLiked', 'moreComments',
  'update', 'toggleCommentLike', 'getCommentReplies', 'myComments',
  'receivedComments', 'getShareQrCode', 'recordShare',
  'seedTestComments', 'devCreateTestPost', 'devCleanupTestPosts', 'devTestContentSecurity',
];

async function run() {
  const failures = [];
  let passed = 0;

  const indexPath = path.join(postsRoot, 'index.js');
  delete require.cache[indexPath];
  const { main } = require(indexPath);

  // 1. 未知 action
  const unknown = await main({ action: 'notReal', data: {} });
  if (unknown.message !== '未知操作') {
    failures.push(`unknown action: expected 未知操作, got ${unknown.message}`);
  } else {
    passed += 1;
  }

  // 2. dev action 生产关闭
  const devBlocked = await main({ action: 'devCreateTestPost', data: { devKey: 'x' } });
  if (devBlocked.message !== '未知操作') {
    failures.push(`dev gate: expected 未知操作, got ${devBlocked.message}`);
  } else {
    passed += 1;
  }

  // 3. locations 可读
  const loc = await main({ action: 'locations', data: {} });
  if (!loc.success || !Array.isArray(loc.data)) {
    failures.push(`locations: expected success+array, got ${JSON.stringify(loc)}`);
  } else {
    passed += 1;
  }

  // 4. list 可读
  const list = await main({ action: 'list', data: { page: 1, pageSize: 10 } });
  if (!list.success || !list.data || !Array.isArray(list.data.posts)) {
    failures.push(`list: expected posts array, got ${JSON.stringify(list)}`);
  } else {
    passed += 1;
  }

  // 5. create 未登录
  const create = await main({ action: 'create', data: { title: 't', photos: [] } });
  if (create.message !== '请先登录') {
    failures.push(`create unauth: expected 请先登录, got ${create.message}`);
  } else {
    passed += 1;
  }

  // 6. 模块结构
  const requiredFiles = [
    'ctx.js',
    'lib/pagination.js',
    'lib/access.js',
    'lib/submitPhotos.js',
    'lib/like.js',
    'lib/commentsQuery.js',
    'handlers/read.js',
    'handlers/write.js',
    'handlers/comments.js',
    'handlers/interact.js',
    'handlers/share.js',
    'handlers/dev.js',
  ];
  const fs = require('fs');
  for (const f of requiredFiles) {
    if (!fs.existsSync(path.join(postsRoot, f))) {
      failures.push(`missing file: ${f}`);
    } else {
      passed += 1;
    }
  }

  // 7. action 路由表完整性（静态检查 index.js）
  const indexSrc = fs.readFileSync(indexPath, 'utf8');
  for (const action of EXPECTED_ACTIONS) {
    if (!indexSrc.includes(`case '${action}'`) && !indexSrc.includes('dev.isDevAction')) {
      // dev actions routed via dev.isDevAction
      if (action.startsWith('dev') || action === 'seedTestComments') continue;
      failures.push(`index.js missing route case: ${action}`);
    }
  }
  if (!failures.some((f) => f.includes('missing route'))) {
    passed += 1;
  }

  console.log(`\nposts smoke test: ${passed} checks passed`);
  if (failures.length) {
    console.error('FAILURES:');
    failures.forEach((f) => console.error(' -', f));
    process.exit(1);
  }
  console.log('All smoke checks passed.\n');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
