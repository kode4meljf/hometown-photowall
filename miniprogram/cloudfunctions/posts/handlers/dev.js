const { cloud, db, postsCollection, commentsCollection } = require('../ctx');
const sec = require('../openApiSecurity');
const { getActor, requireReleasedPost } = require('../lib/access');
const { createPost, deletePost } = require('./write');

const DEV_ACTIONS = new Set([
  'seedTestComments',
  'devCreateTestPost',
  'devCleanupTestPosts',
  'devTestContentSecurity',
]);

const DEV_SEED_MARKER = 'photowall-dev-seed-v1';
const DEV_POST_MARKER = 'photowall-dev-post-v1';
const DEV_MINI_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
  'base64'
);

function isDevAction(action) {
  return DEV_ACTIONS.has(action);
}

async function devCreateTestPost(data, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  const ts = Date.now();
  let fileID;
  try {
    const up = await cloud.uploadFile({
      cloudPath: `photos/${actor.userId}/dev-autotest-${ts}.jpg`,
      fileContent: DEV_MINI_JPEG,
    });
    fileID = up.fileID;
  } catch (e) {
    return { success: false, message: '测试图片上传失败: ' + e.message };
  }

  const title = (data.title || `[auto-test-post] 家乡测试 ${ts}`).slice(0, 80);
  const result = await createPost({
    title,
    description: data.description || '自动化轻量发帖测试，可删除',
    location: data.location || '茶村',
    photos: [{ imageUrl: fileID, width: 800, height: 600, order: 0 }],
  }, openId);

  if (result.success && result.data && result.data.id) {
    try {
      await postsCollection.doc(result.data.id).update({
        data: { _devSeedBatch: DEV_POST_MARKER },
      });
    } catch (e) {
      console.error('[devCreateTestPost] marker update failed:', e.message);
    }
  }
  return result;
}

async function devCleanupTestPosts(data, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  try {
    const found = await postsCollection.where({ _devSeedBatch: DEV_POST_MARKER }).limit(50).get();
    let removed = 0;
    for (const doc of found.data) {
      const del = await deletePost(doc._id, openId);
      if (del.success) removed += 1;
    }
    return { success: true, data: { removed, total: found.data.length } };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

async function devTestContentSecurity(data, openId) {
  const actor = await getActor(openId);
  const checks = [];

  const pushCheck = (name, result, expectOk = true) => {
    checks.push({
      name,
      ok: result.ok,
      message: result.message || '',
      errcode: result.errcode,
      pass: expectOk ? !!result.ok : !result.ok,
    });
  };

  pushCheck('text_empty', await sec.checkText(cloud, openId, { content: '', scene: sec.SCENE.COMMENT }));
  pushCheck(
    'text_benign_social',
    await sec.checkText(cloud, openId, {
      content: '家乡的茶园风景很好',
      scene: sec.SCENE.SOCIAL,
      title: '测试标题',
    })
  );
  pushCheck(
    'text_benign_comment',
    await sec.checkText(cloud, openId, {
      content: '拍得真好看',
      scene: sec.SCENE.COMMENT,
      nickname: actor.user?.nickname || '测试用户',
    })
  );

  if (actor.userId && openId) {
    let fileID;
    try {
      const up = await cloud.uploadFile({
        cloudPath: `photos/${actor.userId}/dev-sec-${Date.now()}.jpg`,
        fileContent: DEV_MINI_JPEG,
      });
      fileID = up.fileID;
      const img = await sec.checkImages(cloud, openId, [fileID], sec.SCENE.SOCIAL);
      checks.push({
        name: 'image_benign',
        ok: img.ok,
        message: img.message || '',
        pass: !!img.ok,
        needsReview: !!img.needsReview,
      });
    } catch (e) {
      checks.push({
        name: 'image_benign',
        ok: false,
        message: e.message,
        pass: false,
      });
    } finally {
      if (fileID) {
        await cloud.deleteFile({ fileList: [fileID] }).catch(() => {});
      }
    }
  } else {
    checks.push({
      name: 'image_benign',
      ok: false,
      message: '未登录或无 openId',
      pass: false,
      skipped: true,
    });
  }

  const rejectTitle = await createPost(
    { title: '  ', photos: [{ imageUrl: 'cloud://invalid', width: 1, height: 1 }] },
    openId
  );
  checks.push({
    name: 'create_reject_empty_title',
    ok: !rejectTitle.success,
    message: rejectTitle.message || '',
    pass: !rejectTitle.success && (rejectTitle.message || '').includes('标题'),
  });

  const rejectPhotos = await createPost({ title: '测试无图', photos: [] }, openId);
  checks.push({
    name: 'create_reject_no_photos',
    ok: !rejectPhotos.success,
    message: rejectPhotos.message || '',
    pass: !rejectPhotos.success && (rejectPhotos.message || '').includes('图片'),
  });

  return {
    success: true,
    data: {
      openIdPresent: !!openId,
      userId: actor.userId || null,
      checks,
    },
  };
}

async function seedTestComments(data) {
  const { postId } = data || {};
  if (!postId) {
    return { success: false, message: '缺少 postId' };
  }
  const gate = await requireReleasedPost(postId, '写入测试评论');
  if (!gate.ok) {
    return { success: false, message: gate.message };
  }

  try {
    const oldRes = await commentsCollection
      .where({ postId, _devSeedBatch: DEV_SEED_MARKER })
      .get();
    for (const doc of oldRes.data) {
      await commentsCollection.doc(doc._id).remove();
    }

    const authors = ['阿茶', '老根', '村民甲', '摄影人', '回乡客'];
    const topCount = 18;
    const replyCount = 12;
    const topIds = [];
    const replyIds = [];
    const baseTs = Date.now() - topCount * 120000;

    for (let i = 0; i < topCount; i++) {
      const addRes = await commentsCollection.add({
        data: {
          postId,
          content: `测试主评论 ${i + 1}：这条评论用于详情页验收`,
          author: authors[i % authors.length],
          authorId: `dev_seed_user_${i % authors.length}`,
          createdAt: new Date(baseTs + i * 120000),
          likes: (i * 3) % 17,
          likedUsers: [],
          parentId: null,
          replyTo: null,
          replyToAuthor: '',
          _devSeedBatch: DEV_SEED_MARKER,
        },
      });
      topIds.push(addRes._id);
    }

    for (let i = 0; i < replyCount; i++) {
      const parentId = topIds[i % topIds.length];
      let replyTo = parentId;
      let replyToAuthor = '';
      if (i >= 6 && replyIds.length > 0) {
        replyTo = replyIds[i % replyIds.length];
        replyToAuthor = authors[i % authors.length];
      }
      const addRes = await commentsCollection.add({
        data: {
          postId,
          content: `测试回复 ${i + 1}：同意，拍得很好`,
          author: authors[(i + 2) % authors.length],
          authorId: `dev_seed_reply_${i % authors.length}`,
          createdAt: new Date(baseTs + (topCount + i) * 60000),
          likes: i % 5,
          likedUsers: [],
          parentId,
          replyTo,
          replyToAuthor,
          _devSeedBatch: DEV_SEED_MARKER,
        },
      });
      replyIds.push(addRes._id);
    }

    const cntRes = await commentsCollection.where({ postId }).count();
    return {
      success: true,
      data: {
        inserted: topCount + replyCount,
        totalOnPost: cntRes.total || 0,
        topLevel: topCount,
        replies: replyCount,
      },
    };
  } catch (e) {
    console.error('[seedTestComments]', e);
    return { success: false, message: '写入失败' };
  }
}

async function dispatch(action, data, openId) {
  switch (action) {
    case 'seedTestComments':
      return seedTestComments(data);
    case 'devCreateTestPost':
      return devCreateTestPost(data, openId);
    case 'devCleanupTestPosts':
      return devCleanupTestPosts(data, openId);
    case 'devTestContentSecurity':
      return devTestContentSecurity(data, openId);
    default:
      return { success: false, message: '未知操作' };
  }
}

module.exports = {
  isDevAction,
  dispatch,
};
