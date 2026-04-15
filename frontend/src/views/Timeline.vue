<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api, auth } from '../api/photos';
import PhotoDetail from '../components/PhotoDetail.vue';
import PhotoCard from '../components/PhotoCard.vue';

interface Photo {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  location: string;
  category: string;
  author: string;
  authorId: number;
  createdAt: string;
  likes: number;
  views: number;
  comments: any[];
}

interface TimelineMonth {
  month: string;
  photos: Photo[];
}

const emit = defineEmits(['open-auth']);

const timeline = ref([]);
const loading = ref(true);
const selectedPhotoId = ref(null);
const currentUser = ref(null);

const getImageUrl = (path: string) => {
  if (path.startsWith('http')) return path;
  return `http://localhost:3000${path}`;
};

const loadTimeline = async () => {
  loading.value = true;
  try {
    const res = await api.getTimeline();
    if (res.success) {
      timeline.value = res.data;
    }
  } catch (error) {
    console.error('加载时间线失败:', error);
  } finally {
    loading.value = false;
  }
};

const handleLike = async (id: number) => {
  if (!currentUser.value) {
    emit('open-auth');
    return;
  }
  const res = await api.likePhoto(id);
  if (res.success) {
    timeline.value.forEach(month => {
      const photo = month.photos.find(p => p && p.id === id);
      if (photo) {
        photo.likes = res.data.likes;
        photo.liked = res.liked;
      }
    });
  }
};

const handlePhotoClick = (photo: Photo) => {
  selectedPhotoId.value = photo.id;
};

const handleDetailClose = () => {
  selectedPhotoId.value = null;
  loadTimeline();
};

const handlePhotoDeleted = () => {
  loadTimeline();
};

onMounted(() => {
  currentUser.value = auth.getUser();
  loadTimeline();
});
</script>

<template>
  <div class="timeline-page">
    <header class="header">
      <h1>📅 时光轴</h1>
      <p>记录家乡的点点滴滴</p>
    </header>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="timeline.length === 0" class="empty">
      <p>暂无照片记录</p>
    </div>

    <div v-else class="timeline">
      <div v-for="(item, index) in timeline" :key="index" class="timeline-item">
        <div class="timeline-marker">
          <div class="dot"></div>
          <div class="line"></div>
        </div>
        
        <div class="timeline-content">
          <h2 class="month">{{ item.month }}</h2>
          
          <div class="photo-grid">
            <PhotoCard 
              v-for="photo in item.photos" 
              :key="photo.id" 
              :photo="photo"
              @like="handleLike"
              @click="handlePhotoClick(photo)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 照片详情弹窗 -->
    <PhotoDetail 
      v-if="selectedPhotoId"
      :photo-id="selectedPhotoId"
      @close="handleDetailClose"
      @deleted="handlePhotoDeleted"
    />
  </div>
</template>

<style scoped>
.timeline-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.header {
  text-align: center;
  padding: 40px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 16px;
  margin-bottom: 40px;
}

.header h1 {
  margin: 0 0 8px;
  font-size: 32px;
}

.header p {
  margin: 0;
  opacity: 0.9;
}

.loading, .empty {
  text-align: center;
  padding: 60px;
  color: #888;
}

.timeline {
  position: relative;
}

.timeline-item {
  display: flex;
  gap: 24px;
  margin-bottom: 40px;
}

.timeline-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 20px;
  flex-shrink: 0;
}

.dot {
  width: 16px;
  height: 16px;
  background: #667eea;
  border-radius: 50%;
  border: 3px solid white;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
}

.line {
  width: 2px;
  flex: 1;
  background: linear-gradient(to bottom, #667eea, #ddd);
  margin-top: 8px;
}

.timeline-item:last-child .line {
  display: none;
}

.timeline-content {
  flex: 1;
}

.month {
  margin: 0 0 20px;
  font-size: 20px;
  color: #333;
  padding-bottom: 8px;
  border-bottom: 2px solid #667eea;
  display: inline-block;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 16px;
}

@media (max-width: 640px) {
  .timeline-item {
    gap: 16px;
  }
  
  .photo-grid {
    grid-template-columns: 1fr;
  }
}
</style>
