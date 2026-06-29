const { cloud, db, postsCollection, commentsCollection } = require('../ctx');
const identity = require('../common/identity');
const sec = require('../openApiSecurity');
const {
  POST_STATUS,
  POST_STATUS_LIST,
  isUserToggleableStatus,
  normalizePostStatus,
} = require('../common/postStatus');
const { deleteCloudFiles, extractCloudFileIds } = require('../common/postHelpers');
const mediaAudit = require('../common/mediaAudit');
const { getActor } = require('../lib/access');
const {
  normalizePhotosInput,
  rejectExistingPost,
  persistRejectedPost,
  applyResubmitRejected,
  validateSubmitPhotos,
} = require('../lib/submitPhotos');
const { API_ERROR } = require('../common/apiErrors');

async function createPost(data, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }
  try {
    let authorNickname = '匿名用户';
    let authorAvatar = '';
    if (actor.user) {
      authorNickname = actor.user.nickname || '匿名用户';
      authorAvatar = actor.user.avatar || '';
    }

    const title = (data.title || '').trim();
    if (!title) {
      return { success: false, message: '请填写标题' };
    }
    const description = (data.description || '').trim();
    const location = (data.location || '').trim();

    const textCheck = await sec.checkTexts(cloud, openId, [
      { content: title, scene: sec.SCENE.SOCIAL, title },
      { content: description, scene: sec.SCENE.SOCIAL },
      { content: location, scene: sec.SCENE.SOCIAL },
    ]);
    if (!textCheck.ok) {
      const draftPhotos = normalizePhotosInput(data.photos);
      const draftFileIds = extractCloudFileIds(draftPhotos);
      if (draftPhotos.length) {
        return persistRejectedPost(
          {
            title,
            description,
            location,
            photos: draftPhotos,
            author: authorNickname,
            authorId: identity.writeAuthorId(actor),
            authorAvatar,
            likes: 0,
            views: 0,
            likedUsers: [],
            createdAt: db.serverDate(),
          },
          draftFileIds,
          textCheck.message,
          textCheck.code || API_ERROR.POST_REJECTED
        );
      }
      return { success: false, message: textCheck.message, code: textCheck.code };
    }

    const photoCheck = await validateSubmitPhotos(data.photos, actor);
    if (!photoCheck.ok) {
      return photoCheck.response;
    }
    const photos = photoCheck.photos;

    const addData = {
      title,
      description,
      location,
      photos,
      author: authorNickname,
      authorId: identity.writeAuthorId(actor),
      authorAvatar,
      likes: 0,
      views: 0,
      likedUsers: [],
      status: POST_STATUS.REVIEWING,
      createdAt: db.serverDate(),
    };

    const fileIds = extractCloudFileIds(photos);

    const result = await postsCollection.add({ data: addData });
    const postId = result._id;

    let imageCheck = { ok: true, needsReview: false, mediaTraceEntries: [] };
    if (fileIds.length) {
      imageCheck = await sec.checkImages(cloud, openId, fileIds, sec.SCENE.SOCIAL);
      if (!imageCheck.ok) {
        return rejectExistingPost(
          postId,
          addData,
          fileIds,
          imageCheck.message,
          imageCheck.code || API_ERROR.POST_REJECTED
        );
      }
    }

    if (imageCheck.needsReview && imageCheck.mediaTraceEntries && imageCheck.mediaTraceEntries.length) {
      await postsCollection.doc(postId).update({
        data: {
          mediaTraceIds: imageCheck.mediaTraceIds || [],
          mediaAuditBatch: 1,
          mediaPendingCount: imageCheck.mediaTraceEntries.length,
          updatedAt: db.serverDate(),
        },
      });
      try {
        await mediaAudit.createAuditTasks(db, {
          postId,
          auditBatch: 1,
          entries: imageCheck.mediaTraceEntries,
        });
      } catch (e) {
        console.error('[createPost] createAuditTasks failed:', e.message);
      }
      return {
        success: true,
        data: { id: postId, status: POST_STATUS.REVIEWING },
        message: '作品已提交，审核通过后将展示在首页',
      };
    }

    await postsCollection.doc(postId).update({
      data: {
        status: POST_STATUS.RELEASED,
        mediaPendingCount: 0,
        updatedAt: db.serverDate(),
      },
    });
    return { success: true, data: { id: postId, status: POST_STATUS.RELEASED } };
  } catch (e) {
    console.error('[createPost] 失败:', e.message, e.stack);
    const raw = e && e.message ? String(e.message) : '';
    if (/imgSecCheck|mediaCheckAsync|87014|risky content/i.test(raw)) {
      return { success: false, message: sec.IMAGE_BLOCK_MSG, code: 'image_block' };
    }
    if (/msgSecCheck/i.test(raw)) {
      return { success: false, message: sec.BLOCK_MSG, code: 'text_block' };
    }
    return { success: false, message: '发布失败，请稍后重试' };
  }
}

async function resubmitPost(data, openId) {
  const actor = await getActor(openId);
  if (!actor.userId) {
    return { success: false, message: '请先登录' };
  }

  const postId = data.postId || data.id;
  if (!postId) {
    return { success: false, message: '缺少作品信息' };
  }

  try {
    const postResult = await postsCollection.doc(postId).get();
    const post = postResult.data;
    if (!post) {
      return { success: false, message: '作品不存在' };
    }
    if (!identity.isAuthor(post.authorId, actor)) {
      return { success: false, message: '无权操作' };
    }
    if (normalizePostStatus(post.status) !== POST_STATUS.REJECTED) {
      return { success: false, message: '当前状态不可重新提交' };
    }

    const title = (data.title || '').trim();
    if (!title) {
      return { success: false, message: '请填写标题' };
    }
    const description = (data.description || '').trim();
    const location = (data.location || '').trim();

    const textCheck = await sec.checkTexts(cloud, openId, [
      { content: title, scene: sec.SCENE.SOCIAL, title },
      { content: description, scene: sec.SCENE.SOCIAL },
      { content: location, scene: sec.SCENE.SOCIAL },
    ]);
    if (!textCheck.ok) {
      const draftPhotos = normalizePhotosInput(data.photos);
      const draftFileIds = extractCloudFileIds(draftPhotos);
      if (draftPhotos.length) {
        return applyResubmitRejected(
          postId,
          draftPhotos,
          draftFileIds,
          textCheck.message,
          textCheck.code || API_ERROR.POST_REJECTED
        );
      }
      return { success: false, message: textCheck.message, code: textCheck.code };
    }

    const photoCheck = await validateSubmitPhotos(data.photos, actor, { previousPost: post });
    if (!photoCheck.ok) {
      return photoCheck.response;
    }
    const photos = photoCheck.photos;
    const newFileIds = photoCheck.fileIds;

    const imageCheck = await sec.checkImages(cloud, openId, newFileIds, sec.SCENE.SOCIAL);
    if (!imageCheck.ok) {
      return applyResubmitRejected(
        postId,
        photos,
        newFileIds,
        imageCheck.message,
        imageCheck.code || API_ERROR.POST_REJECTED
      );
    }

    const oldFileIds = extractCloudFileIds(post.photos);
    const removedFileIds = oldFileIds.filter((id) => !newFileIds.includes(id));

    const nextAuditBatch = (post.mediaAuditBatch || 0) + 1;
    const traceEntries = imageCheck.mediaTraceEntries || [];

    const updateData = {
      title,
      description,
      location,
      photos,
      status: POST_STATUS.REVIEWING,
      imageRemoved: false,
      mediaTraceIds: imageCheck.mediaTraceIds || [],
      mediaAuditBatch: nextAuditBatch,
      mediaPendingCount: traceEntries.length,
      updatedAt: db.serverDate(),
    };

    await postsCollection.doc(postId).update({ data: updateData });
    if (removedFileIds.length) {
      await deleteCloudFiles(cloud, removedFileIds);
    }

    if (traceEntries.length) {
      try {
        await mediaAudit.createAuditTasks(db, {
          postId,
          auditBatch: nextAuditBatch,
          entries: traceEntries,
        });
      } catch (e) {
        console.error('[resubmitPost] createAuditTasks failed:', e.message);
      }
      return {
        success: true,
        message: '已提交审核，通过后将展示在首页',
        data: { id: postId, status: POST_STATUS.REVIEWING },
      };
    }

    await postsCollection.doc(postId).update({
      data: {
        status: POST_STATUS.RELEASED,
        mediaPendingCount: 0,
        mediaAuditResolvedAt: db.serverDate(),
        updatedAt: db.serverDate(),
      },
    });
    return {
      success: true,
      message: '发布成功',
      data: { id: postId, status: POST_STATUS.RELEASED },
    };
  } catch (e) {
    console.error('[resubmitPost] 失败:', e.message, e.stack);
    const raw = e && e.message ? String(e.message) : '';
    if (/imgSecCheck|mediaCheckAsync|87014|risky content/i.test(raw)) {
      return { success: false, message: sec.IMAGE_BLOCK_MSG, code: 'image_block' };
    }
    if (/msgSecCheck/i.test(raw)) {
      return { success: false, message: sec.BLOCK_MSG, code: 'text_block' };
    }
    return { success: false, message: '提交失败，请稍后重试' };
  }
}

async function deletePost(id, openId) {
  const actor = await getActor(openId);
  try {
    if (!id) {
      return { success: false, message: '缺少帖子ID' };
    }
    const post = await postsCollection.doc(id).get();
    if (!identity.isAuthor(post.data.authorId, actor) && !actor.isAdmin) {
      return { success: false, message: '无权删除' };
    }

    const fileIds = (post.data.photos || [])
      .map((p) => p.imageUrl)
      .filter((url) => url && url.startsWith('cloud://'));
    if (fileIds.length) {
      await deleteCloudFiles(cloud, fileIds);
    }

    await postsCollection.doc(id).remove();
    await commentsCollection.where({ postId: id }).remove();

    return { success: true };
  } catch (e) {
    console.error('[deletePost] 失败:', e.message, e.stack);
    return { success: false, message: '删除失败: ' + e.message };
  }
}

async function updatePost(data, openId) {
  const actor = await getActor(openId);
  try {
    const postId = data.id || data.postId;
    const updates = data.updates || data.data || (data.status !== undefined || data.title !== undefined ? data : undefined);

    if (!postId) {
      return { success: false, message: '缺少帖子ID' };
    }

    const post = await postsCollection.doc(postId).get();
    if (!post.data || (!identity.isAuthor(post.data.authorId, actor) && !actor.isAdmin)) {
      return { success: false, message: '无权编辑' };
    }

    const titleDescUpdate =
      updates &&
      (updates.title !== undefined || updates.description !== undefined);
    if (titleDescUpdate) {
      const createdAt = post.data.createdAt;
      const createdTs = createdAt ? new Date(createdAt).getTime() : 0;
      const monthMs = 30 * 24 * 60 * 60 * 1000;
      if (!createdTs || Date.now() - createdTs >= monthMs) {
        return {
          success: false,
          message: '发布超过一个月的作品不可修改标题和描述',
        };
      }
    }

    const allowedFields = ['title', 'description', 'location', 'status'];
    const updateData = {};
    for (const field of allowedFields) {
      if (updates && updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return { success: false, message: '没有可更新的字段' };
    }

    if (updateData.status !== undefined) {
      if (!POST_STATUS_LIST.includes(updateData.status)) {
        return { success: false, message: '无效的状态' };
      }
      const currentStatus = post.data.status;
      if (!actor.isAdmin) {
        const canToggle = isUserToggleableStatus(currentStatus)
          && isUserToggleableStatus(updateData.status);
        if (!canToggle) {
          return { success: false, message: '当前状态不可修改' };
        }
      }
    }

    const textItems = [];
    if (updateData.title !== undefined) {
      textItems.push({
        content: updateData.title,
        scene: sec.SCENE.SOCIAL,
        title: updateData.title,
      });
    }
    if (updateData.description !== undefined) {
      textItems.push({ content: updateData.description, scene: sec.SCENE.SOCIAL });
    }
    if (updateData.location !== undefined) {
      textItems.push({ content: updateData.location, scene: sec.SCENE.SOCIAL });
    }
    if (textItems.length) {
      const textCheck = await sec.checkTexts(cloud, openId, textItems);
      if (!textCheck.ok) {
        return { success: false, message: textCheck.message };
      }
    }

    await postsCollection.doc(postId).update({ data: updateData });
    return { success: true };
  } catch (e) {
    console.error('[updatePost] 失败:', e.message, e.stack);
    return { success: false, message: '更新失败: ' + e.message };
  }
}

module.exports = {
  createPost,
  resubmitPost,
  deletePost,
  updatePost,
};
