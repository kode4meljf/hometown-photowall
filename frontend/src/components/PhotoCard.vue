<script setup>
defineProps({
  photo: {
    type: Object,
    required: true
  }
});

defineEmits(['like', 'click']);

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const getImageUrl = (path) => {
  if (path.startsWith('http')) return path;
  return `http://localhost:3000${path}`;
};
</script>

<template>
  <div class="photo-card" @click="photo && $emit('click', photo)">
    <div class="image-wrapper">
      <div class="image-container">
        <img :src="getImageUrl(photo.imageUrl)" :alt="photo.title" />
      </div>
    </div>
    <div class="content">
      <h3 class="title">{{ photo.title }}</h3>
      <p class="description">{{ photo.description }}</p>
      <div class="meta">
        <span class="location">
          <span class="icon location-icon">📍</span>
          {{ photo.location }}
        </span>
        <span class="author">
          <span class="icon user-icon">👤</span>
          {{ photo.author }}
        </span>
      </div>
      <div class="footer">
        <span class="date">{{ formatDate(photo.createdAt) }}</span>
        <div class="stats">
          <span class="stat-item">
            <span class="icon">👁️</span>
            <span class="num">{{ photo.views || 0 }}</span>
          </span>
          <button 
            :class="['like-btn', { liked: photo.liked }]" 
            @click.stop="photo && $emit('like', photo.id)"
          >
            <span class="heart">{{ photo.liked ? '❤️' : '🤍' }}</span>
            <span class="num">{{ photo.likes }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.photo-card {
  background: linear-gradient(180deg, #f0f7ff 0%, #f8faf5 100%);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  cursor: pointer;
}

.photo-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
}

.image-wrapper {
  padding: 15px 15px 0 15px;
}

.image-container {
  width: 100%;
  /* 艺术感比例：图片高度设为卡片的 55%，形成修长比例 */
  height: 0;
  padding-bottom: 55%;
  position: relative;
  /* 四角圆角，右上角 80px 大圆角 */
  border-radius: 16px 80px 16px 16px;
  overflow: hidden;
}

.image-container img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.photo-card:hover .image-container img {
  transform: scale(1.04);
}

.content {
  padding: 14px 16px 16px;
}

.title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 700;
  color: #2c3e50;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.description {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 400;
  color: #5a6c7d;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  font-size: 12px;
}

.location, .author {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #7a8a9a;
}

.icon {
  font-size: 11px;
}

.location-icon {
  color: #e74c3c;
}

.user-icon {
  color: #3498db;
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

.date {
  font-size: 11px;
  color: #9aaaba;
}

.stats {
  display: flex;
  align-items: center;
  gap: 10px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  color: #8a9aaa;
}

.stat-item .icon {
  font-size: 11px;
}

.stat-item .num {
  font-weight: 500;
}

.like-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(0, 0, 0, 0.04);
  border: none;
  padding: 4px 8px;
  border-radius: 14px;
  cursor: pointer;
  font-size: 12px;
  color: #8a9aaa;
  transition: all 0.2s;
}

.like-btn:hover {
  background: rgba(0, 0, 0, 0.08);
}

.like-btn.liked {
  background: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
}

.like-btn.liked:hover {
  background: rgba(231, 76, 60, 0.15);
}

.heart {
  font-size: 13px;
}
</style>
