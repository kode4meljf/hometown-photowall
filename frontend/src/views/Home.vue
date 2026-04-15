<script setup>
import { ref, onMounted, computed } from 'vue';
import { api, auth } from '../api/photos';
import PhotoCard from '../components/PhotoCard.vue';
import UploadForm from '../components/UploadForm.vue';
import AuthModal from '../components/AuthModal.vue';
import PhotoDetail from '../components/PhotoDetail.vue';
import Timeline from '../views/Timeline.vue';
import Admin from '../views/Admin.vue';
import Toast from '../components/Toast.vue';
import { toast } from '../utils/toast.js';

const getSeason = () => {
  const month = new Date().getMonth() + 1;
  if (month >= 3 && month <= 5) {
    // 春 - 绿色渐变（上下）
    return { name: '春', bg: '#e8f5e9', pageBg: 'linear-gradient(180deg, #c8e6c9 0%, #a5d6a7 40%, #81c784 70%, #66bb6a 100%)', gradient: 'linear-gradient(135deg, #a8e6cf 0%, #88d8b0 50%, #b8f0d8 100%)' };
  } else if (month >= 6 && month <= 8) {
    // 夏 - 蓝色渐变（上下）
    return { name: '夏', bg: '#e3f2fd', pageBg: 'linear-gradient(180deg, #bbdefb 0%, #90caf9 40%, #64b5f6 70%, #42a5f5 100%)', gradient: 'linear-gradient(135deg, #89CFF0 0%, #62b6e7 50%, #a8e0ff 100%)' };
  } else if (month >= 9 && month <= 11) {
    // 秋 - 橙色渐变（上下）
    return { name: '秋', bg: '#fff3e0', pageBg: 'linear-gradient(180deg, #ffe0b2 0%, #ffcc80 40%, #ffa726 70%, #ff9800 100%)', gradient: 'linear-gradient(135deg, #ffd89b 0%, #f7971e 50%, #ffecd2 100%)' };
  } else {
    // 冬 - 灰蓝色渐变（上下）
    return { name: '冬', bg: '#eceff1', pageBg: 'linear-gradient(180deg, #cfd8dc 0%, #b0bec5 40%, #90a4ae 70%, #78909c 100%)', gradient: 'linear-gradient(135deg, #cfd8dc 0%, #b0bec5 50%, #eceff1 100%)' };
  }
};

const season = computed(() => getSeason());
const currentView = ref('home');
const photos = ref([]);
const loading = ref(false);
const showUpload = ref(false);
const showAuth = ref(false);
const selectedPhotoId = ref(null);
const locations = ref([]);
const categories = ref([]);
const selectedLocation = ref('');
const selectedCategory = ref('');
const searchKeyword = ref('');
const sortBy = ref('latest');
const currentUser = computed(() => auth.getUser());

const loadPhotos = async () => {
  loading.value = true;
  try {
    const params = {};
    if (selectedLocation.value) params.location = selectedLocation.value;
    if (selectedCategory.value) params.category = selectedCategory.value;
    if (searchKeyword.value) params.keyword = searchKeyword.value;
    if (sortBy.value) params.sort = sortBy.value;
    const res = await api.getPhotos(params);
    if (res.success) photos.value = res.data.photos;
  } catch (e) { console.error(e); }
  finally { loading.value = false; }
};

const loadLocations = async () => {
  const res = await api.getLocations();
  if (res.success) locations.value = res.data;
};

const loadCategories = async () => {
  const res = await api.getCategories();
  if (res.success) categories.value = res.data;
};

const handleLike = async (id) => {
  if (!currentUser.value) { showAuth.value = true; return; }
  const res = await api.likePhoto(id);
  if (res.success) {
    const photo = photos.value.find(p => p && p.id === id);
    if (photo) { photo.likes = res.data.likes; photo.liked = res.liked; }
  } else { toast.error(res.message || '操作失败'); }
};

const handlePhotoClick = (photo) => { if (photo && photo.id) selectedPhotoId.value = photo.id; };
const handlePhotoDeleted = () => { loadPhotos(); };
const handleUploadSuccess = () => { showUpload.value = false; loadPhotos(); };
const handleLoginSuccess = () => { window.location.reload(); };
const handleSearch = () => { loadPhotos(); };
const handleLogout = () => { auth.logout(); window.location.reload(); };
const handlePhotoDetailClose = () => { selectedPhotoId.value = null; loadPhotos(); };

onMounted(async () => {
  await auth.getCurrentUser();
  loadPhotos();
  loadLocations();
  loadCategories();
});
</script>

<template>
  <div class="app" :style="{ '--season-bg': season.pageBg }">
    <nav class="navbar">
      <div class="nav-left">
        <div class="nav-brand" @click="currentView = 'home'">
          <span class="brand-icon">🏠</span>
          <span class="brand-text">家乡照片墙</span>
        </div>
        <div class="nav-links">
          <a :class="{ active: currentView === 'home' }" @click="currentView = 'home'">首页</a>
          <a :class="{ active: currentView === 'timeline' }" @click="currentView = 'timeline'">时光轴</a>
          <a v-if="currentUser && currentUser.role === 'admin'" :class="{ active: currentView === 'admin' }" @click="currentView = 'admin'">管理</a>
        </div>
      </div>
      <div class="nav-right">
        <template v-if="currentUser">
          <div class="user-info">
            <span class="avatar" :style="{ background: season.gradient }">{{ currentUser.nickname.charAt(0) }}</span>
            <span class="nickname">{{ currentUser.nickname }}</span>
          </div>
          <button class="btn-upload" @click="showUpload = !showUpload"><span>+</span> 上传</button>
          <button class="btn-logout" @click="handleLogout">退出</button>
        </template>
        <template v-else>
          <button class="btn-login" @click="showAuth = true">登录</button>
        </template>
      </div>
    </nav>

    <div v-if="currentView === 'home'" class="main-content">
      <div v-if="showUpload" class="upload-section">
        <UploadForm @success="handleUploadSuccess" />
      </div>

      <div class="toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input v-model="searchKeyword" type="text" placeholder="搜索照片..." @keyup.enter="handleSearch" />
        </div>
        <select v-model="selectedCategory" @change="loadPhotos" class="filter-select">
          <option value="">全部分类</option>
          <option v-for="cat in (categories || [])" :key="cat.id || cat.name" :value="cat.name">{{ cat.icon }} {{ cat.name }}</option>
        </select>
        <select v-model="selectedLocation" @change="loadPhotos" class="filter-select">
          <option value="">全部地点</option>
          <option v-for="loc in locations" :key="loc" :value="loc">{{ loc }}</option>
        </select>
        <select v-model="sortBy" @change="loadPhotos" class="filter-select">
          <option value="latest">最新</option>
          <option value="likes">最多赞</option>
          <option value="views">最多浏览</option>
        </select>
      </div>

      <div v-if="loading" class="loading"><span class="loading-spinner"></span> 加载中...</div>
      <div v-else-if="photos.length === 0" class="empty"><p>📷 还没有照片，快来上传第一张吧！</p></div>
      <div v-else class="photo-grid">
        <PhotoCard v-for="photo in photos" :key="photo.id" :photo="photo" @like="handleLike" @click="handlePhotoClick(photo)" />
      </div>
    </div>

    <Timeline v-if="currentView === 'timeline'" />
    <Admin v-if="currentView === 'admin'" />

    <AuthModal :show="showAuth" @close="showAuth = false" @login-success="handleLoginSuccess" />
    <PhotoDetail v-if="selectedPhotoId" :photo-id="selectedPhotoId" @close="handlePhotoDetailClose" @deleted="handlePhotoDeleted" />
    <Toast />
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: var(--season-bg);
  transition: background 0.5s ease;
}

.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 32px;
  height: 60px;
  background: white;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  position: sticky;
  top: 0;
  z-index: 100;
}

.nav-left { display: flex; align-items: center; gap: 32px; }
.nav-brand { display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 700; font-size: 18px; color: #333; }
.brand-icon { font-size: 22px; }
.nav-links { display: flex; gap: 4px; }
.nav-links a { padding: 8px 16px; color: #666; text-decoration: none; border-radius: 8px; cursor: pointer; transition: all 0.2s; font-size: 14px; font-weight: 500; }
.nav-links a:hover { background: #f5f7fa; color: #333; }
.nav-links a.active { background: #f0f0f0; color: #333; font-weight: 600; }

.nav-right { display: flex; align-items: center; gap: 12px; }
.user-info { display: flex; align-items: center; gap: 8px; }
.avatar { width: 32px; height: 32px; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; }
.nickname { color: #333; font-size: 14px; font-weight: 500; }
.btn-upload { padding: 7px 16px; background: #333; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 4px; }
.btn-upload:hover { background: #555; }
.btn-upload span { font-size: 16px; font-weight: 700; }
.btn-logout { padding: 7px 14px; background: #f5f7fa; color: #666; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; }
.btn-logout:hover { background: #eee; }
.btn-login { padding: 7px 20px; background: #333; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; }
.btn-login:hover { background: #555; }

.main-content { max-width: 1280px; margin: 0 auto; padding: 24px 32px; }
.upload-section { margin-bottom: 24px; }

.toolbar { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.search-box { display: flex; align-items: center; background: white; border: 1px solid #e0e0e0; border-radius: 10px; padding: 0 12px; flex: 1; max-width: 320px; transition: border-color 0.2s; }
.search-box:focus-within { border-color: #999; }
.search-icon { font-size: 14px; margin-right: 8px; }
.search-box input { border: none; outline: none; padding: 9px 0; font-size: 14px; width: 100%; background: transparent; }
.filter-select { padding: 9px 14px; border: 1px solid #e0e0e0; border-radius: 10px; font-size: 13px; background: white; color: #555; cursor: pointer; outline: none; }
.filter-select:focus { border-color: #999; }

.loading { text-align: center; padding: 80px 20px; color: #999; font-size: 15px; }
.loading-spinner { display: inline-block; width: 20px; height: 20px; border: 2px solid #ddd; border-top-color: #999; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty { text-align: center; padding: 80px 20px; color: #999; font-size: 15px; }

.photo-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }

@media (max-width: 1024px) { .photo-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) {
  .navbar { padding: 0 16px; }
  .nav-left { gap: 16px; }
  .nav-brand .brand-text { display: none; }
  .nav-links { gap: 0; }
  .main-content { padding: 16px; }
  .toolbar { flex-direction: column; }
  .search-box { max-width: 100%; }
  .filter-select { width: 100%; }
  .photo-grid { grid-template-columns: 1fr; }
}
</style>
