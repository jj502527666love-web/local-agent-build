<template>
  <!-- First Launch Setup -->
  <div v-if="showSetup" class="fixed inset-0 z-[9999] flex items-center justify-center bg-surface-1">
    <div class="w-full max-w-lg bg-surface-0 rounded-2xl shadow-2xl p-8">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
          <span class="text-white text-lg font-bold">L</span>
        </div>
        <div>
          <h1 class="text-lg font-bold text-text-primary">Local Agent</h1>
          <p class="text-xs text-text-tertiary">首次启动配置</p>
        </div>
      </div>

      <div class="mb-6">
        <label class="block text-sm font-medium text-text-primary mb-2">数据存储目录</label>
        <p class="text-xs text-text-tertiary mb-3">数据库、技能、工作区等数据将存放在此目录中</p>
        <div class="flex items-center gap-2">
          <input :value="setupDir" readonly class="flex-1 px-3 py-2.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-text-primary cursor-default" />
          <button @click="pickSetupDir" class="px-4 py-2.5 text-sm font-medium bg-surface-2 hover:bg-surface-3 border border-surface-3 rounded-lg text-text-secondary transition-colors whitespace-nowrap">
            更改
          </button>
        </div>
      </div>

      <button @click="confirmSetup" class="w-full py-3 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors">
        确认并开始使用
      </button>
    </div>
  </div>

  <!-- Migration Dialog -->
  <div v-if="showMigration" class="fixed inset-0 z-[9998] flex items-center justify-center bg-surface-1/80">
    <div class="w-full max-w-lg bg-surface-0 rounded-2xl shadow-2xl p-8">
      <h2 class="text-base font-bold text-text-primary mb-1">数据迁移</h2>

      <!-- Ask to migrate -->
      <template v-if="migrationStep === 'ask'">
        <p class="text-sm text-text-secondary mb-4">检测到旧数据目录中有 {{ migrationInfo.fileCount }} 个文件，是否迁移到新目录?</p>
        <div class="text-xs text-text-tertiary space-y-1 mb-5 p-3 bg-surface-2 rounded-lg">
          <div class="flex gap-2"><span class="text-text-secondary font-medium w-10 shrink-0">旧:</span><span class="break-all">{{ migrationInfo.oldDir }}</span></div>
          <div class="flex gap-2"><span class="text-text-secondary font-medium w-10 shrink-0">新:</span><span class="break-all">{{ migrationInfo.newDir }}</span></div>
        </div>
        <div class="flex gap-3">
          <button @click="startMigration" class="flex-1 py-2.5 text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors">迁移数据</button>
          <button @click="skipMigration" class="px-6 py-2.5 text-sm font-medium border border-surface-3 rounded-xl text-text-secondary hover:bg-surface-2 transition-colors">跳过</button>
        </div>
      </template>

      <!-- Migrating -->
      <template v-if="migrationStep === 'migrating'">
        <p class="text-sm text-text-secondary mb-4">正在迁移数据，请勿关闭软件...</p>
        <div class="mb-3">
          <div class="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
            <div class="h-full bg-primary-600 rounded-full transition-all duration-150" :style="{ width: progressPercent + '%' }"></div>
          </div>
        </div>
        <div class="flex justify-between text-xs text-text-tertiary">
          <span>{{ migrationProgress.current }} / {{ migrationProgress.total }}</span>
          <span class="truncate ml-4 max-w-[60%] text-right">{{ migrationProgress.fileName }}</span>
        </div>
      </template>

      <!-- Done -->
      <template v-if="migrationStep === 'done'">
        <p class="text-sm text-emerald-600 font-medium mb-4">数据迁移完成</p>
        <p class="text-sm text-text-secondary mb-5">是否删除旧数据目录?</p>
        <div class="text-xs text-text-tertiary mb-5 p-3 bg-surface-2 rounded-lg break-all">{{ migrationInfo.oldDir }}</div>
        <div class="flex gap-3">
          <button @click="deleteOldAndClose" class="flex-1 py-2.5 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors">删除旧目录</button>
          <button @click="closeMigration" class="px-6 py-2.5 text-sm font-medium border border-surface-3 rounded-xl text-text-secondary hover:bg-surface-2 transition-colors">保留</button>
        </div>
      </template>

      <!-- Error -->
      <template v-if="migrationStep === 'error'">
        <p class="text-sm text-red-500 mb-4">迁移失败: {{ migrationError }}</p>
        <button @click="closeMigration" class="w-full py-2.5 text-sm font-medium border border-surface-3 rounded-xl text-text-secondary hover:bg-surface-2 transition-colors">关闭</button>
      </template>
    </div>
  </div>

  <!-- Update Notification -->
  <div v-if="updateState !== 'idle'" class="fixed bottom-5 right-5 z-[9000] w-80 bg-surface-0 border border-surface-3 rounded-xl shadow-lg overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-surface-2">
      <span class="text-xs font-semibold text-text-primary">软件更新</span>
      <button v-if="updateState !== 'downloading'" @click="dismissUpdate" class="text-text-tertiary hover:text-text-primary">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="px-4 py-3">
      <!-- Available -->
      <template v-if="updateState === 'available'">
        <p class="text-xs text-text-secondary mb-3">发现新版本 <span class="font-semibold text-primary-600">v{{ updateVersion }}</span></p>
        <div class="flex gap-2">
          <button @click="startDownload" class="flex-1 py-2 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors">立即更新</button>
          <button @click="dismissUpdate" class="px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary border border-surface-3 rounded-lg transition-colors">稍后</button>
        </div>
      </template>
      <!-- Downloading -->
      <template v-if="updateState === 'downloading'">
        <p class="text-xs text-text-secondary mb-2">正在下载更新...</p>
        <div class="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden mb-1">
          <div class="h-full bg-primary-600 rounded-full transition-all duration-300" :style="{ width: downloadPercent + '%' }"></div>
        </div>
        <p class="text-[10px] text-text-tertiary text-right">{{ downloadPercent }}%</p>
      </template>
      <!-- Downloaded -->
      <template v-if="updateState === 'downloaded'">
        <p class="text-xs text-text-secondary mb-3">更新已下载完成，重启后生效</p>
        <div class="flex gap-2">
          <button @click="installUpdate" class="flex-1 py-2 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors">立即重启</button>
          <button @click="dismissUpdate" class="px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary border border-surface-3 rounded-lg transition-colors">稍后</button>
        </div>
      </template>
      <!-- Error -->
      <template v-if="updateState === 'error'">
        <p class="text-xs text-red-500 mb-2">更新失败: {{ updateError }}</p>
        <button @click="dismissUpdate" class="w-full py-2 text-xs text-text-tertiary border border-surface-3 rounded-lg hover:bg-surface-2 transition-colors">关闭</button>
      </template>
    </div>
  </div>

  <router-view v-if="!showSetup" />

  <!-- Register bonus toast (non-blocking) -->
  <RegisterBonusToast />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import RegisterBonusToast from '@/components/RegisterBonusToast.vue'

const api = () => (window as any).api

const showSetup = ref(false)
const setupDir = ref('')

const showMigration = ref(false)
const migrationStep = ref<'ask' | 'migrating' | 'done' | 'error'>('ask')
const migrationInfo = ref({ oldDir: '', newDir: '', fileCount: 0 })
const migrationProgress = ref({ current: 0, total: 0, fileName: '' })
const migrationError = ref('')

const progressPercent = computed(() => {
  if (!migrationProgress.value.total) return 0
  return Math.round((migrationProgress.value.current / migrationProgress.value.total) * 100)
})

// === Auto Update ===
const updateState = ref<'idle' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle')
const updateVersion = ref('')
const downloadPercent = ref(0)
const updateError = ref('')

function setupUpdaterListeners(): void {
  const u = window.api?.updater
  if (!u) return
  u.onAvailable((data) => {
    updateVersion.value = data.version
    updateState.value = 'available'
  })
  u.onProgress((data) => {
    downloadPercent.value = data.percent
    updateState.value = 'downloading'
  })
  u.onDownloaded(() => {
    updateState.value = 'downloaded'
  })
  u.onError((msg) => {
    updateError.value = msg
    updateState.value = 'error'
  })
}

function startDownload(): void {
  updateState.value = 'downloading'
  downloadPercent.value = 0
  window.api?.updater?.download()
}

function installUpdate(): void {
  window.api?.updater?.install()
}

function dismissUpdate(): void {
  updateState.value = 'idle'
}

onMounted(async () => {
  setupUpdaterListeners()
  const first = await api().dataDir.isFirstLaunch()
  if (first) {
    setupDir.value = await api().dataDir.get()
    showSetup.value = true
    return
  }

  const check = await api().migration.check()
  if (check.needed) {
    migrationInfo.value = check
    showMigration.value = true
  }
})

async function pickSetupDir() {
  const picked = await api().dataDir.pick()
  if (!picked) return
  setupDir.value = picked.endsWith('\\local-agent') || picked.endsWith('/local-agent')
    ? picked
    : picked.replace(/[\\/]+$/, '') + '\\local-agent'
}

async function confirmSetup() {
  await api().dataDir.init(setupDir.value)
  showSetup.value = false
}

async function startMigration() {
  migrationStep.value = 'migrating'
  api().migration.onProgress((data: { current: number; total: number; fileName: string }) => {
    migrationProgress.value = data
  })
  const result = await api().migration.start()
  api().migration.offProgress()
  if (result.success) {
    migrationStep.value = 'done'
  } else {
    migrationError.value = result.error || 'Unknown error'
    migrationStep.value = 'error'
  }
}

async function skipMigration() {
  await api().migration.skip()
  showMigration.value = false
}

async function deleteOldAndClose() {
  await api().migration.deleteOld()
  showMigration.value = false
}

async function closeMigration() {
  await api().migration.skip()
  showMigration.value = false
}

onUnmounted(() => {
  api().migration.offProgress()
  window.api?.updater?.offAll()
})
</script>
