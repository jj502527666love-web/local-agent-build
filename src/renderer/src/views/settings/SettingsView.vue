<template>
  <div class="h-full flex flex-col">
    <header class="page-header"></header>
    <div class="page-body">
      <div class="max-w-2xl space-y-8">
        <!-- Vector Service -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <div class="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
              <svg class="w-4 h-4 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>
            </div>
            <h2 class="text-sm font-semibold text-text-primary">向量服务</h2>
          </div>
          <div class="form-card">
            <div>
              <label class="form-label">服务类型</label>
              <select v-model="vectorForm.type" class="select-field">
                <option value="openai">OpenAI</option>
                <option value="openai_compatible">OpenAI 兼容</option>
              </select>
            </div>
            <div>
              <label class="form-label">API 基础地址</label>
              <input v-model="vectorForm.api_base" placeholder="https://api.openai.com/v1" class="input-field" />
            </div>
            <div>
              <label class="form-label">API 密钥</label>
              <input v-model="vectorForm.api_key" type="password" class="input-field" />
            </div>
            <div>
              <label class="form-label">嵌入模型</label>
              <input v-model="vectorForm.model" placeholder="text-embedding-3-small" class="input-field" />
            </div>
            <div class="flex items-center gap-3 pt-1">
              <button @click="saveVectorSettings" class="btn-primary">保存</button>
              <button @click="testVectorConnection" :disabled="vectorTesting || !vectorForm.api_base" class="btn-secondary flex items-center gap-1.5">
                <svg v-if="vectorTesting" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75" /></svg>
                <span>{{ vectorTesting ? '测试中...' : '连接测试' }}</span>
              </button>
              <span v-if="vectorSaved" class="text-xs text-emerald-600 font-medium animate-pulse">已保存</span>
              <span v-if="vectorTestResult" :class="['text-xs font-medium', vectorTestOk ? 'text-emerald-600' : 'text-red-500']">{{ vectorTestResult }}</span>
            </div>
          </div>
        </section>

        <!-- General -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <div class="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg class="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
            </div>
            <h2 class="text-sm font-semibold text-text-primary">常规</h2>
          </div>
          <div class="form-card">
            <div>
              <label class="form-label">默认温度</label>
              <input v-model="generalForm.temperature" type="number" step="0.1" min="0" max="2" class="input-field max-w-xs" />
            </div>
            <div class="flex items-center gap-3 pt-1">
              <button @click="saveGeneralSettings" class="btn-primary">保存</button>
              <span v-if="generalSaved" class="text-xs text-emerald-600 font-medium animate-pulse">已保存</span>
            </div>
          </div>
        </section>

        <!-- Data Directory -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <div class="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
              <svg class="w-4 h-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
            </div>
            <h2 class="text-sm font-semibold text-text-primary">数据目录</h2>
          </div>
          <div class="form-card">
            <div>
              <label class="form-label">当前数据存储路径</label>
              <div class="flex items-center gap-2">
                <input :value="dataDir" readonly class="input-field flex-1 bg-surface-2 cursor-default" />
                <button @click="changeDataDir" class="btn-secondary whitespace-nowrap">更改</button>
                <button @click="openDataDir" class="btn-secondary whitespace-nowrap">打开</button>
              </div>
              <p class="text-[11px] text-text-tertiary mt-1.5">数据库、技能、工作区等数据存放位置</p>
            </div>
            <div v-if="dataDirChanged" class="flex items-center gap-2 pt-1 text-xs text-amber-600 font-medium">
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
              数据目录已更改，请重启软件后生效
            </div>
          </div>
        </section>

        <!-- Data Backup -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <div class="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
              <svg class="w-4 h-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" /></svg>
            </div>
            <h2 class="text-sm font-semibold text-text-primary">数据备份</h2>
          </div>
          <div class="form-card">
            <div>
              <div class="flex items-center gap-4">
                <div class="flex-1">
                  <label class="form-label">自动备份</label>
                  <select v-model="backupInterval" @change="saveBackupSettings" class="select-field">
                    <option value="off">关闭</option>
                    <option value="daily">每日</option>
                    <option value="weekly">每周</option>
                  </select>
                </div>
                <div class="flex-1">
                  <label class="form-label">保留份数</label>
                  <select v-model="backupMaxCount" @change="saveBackupSettings" class="select-field">
                    <option v-for="n in [3, 5, 10, 20]" :key="n" :value="n">{{ n }} 份</option>
                  </select>
                </div>
              </div>
              <p class="text-[11px] text-text-tertiary mt-1.5">启动时自动备份，时间段内多次启动不重复备份，自动备份仅备份数据库</p>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <div class="relative">
                <button @click.stop="showBackupMenu = !showBackupMenu" :disabled="backupRunning" class="btn-primary flex items-center gap-1.5">
                  <svg v-if="backupRunning" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75" /></svg>
                  <span>{{ backupRunning ? '备份中...' : '立即备份' }}</span>
                  <svg v-if="!backupRunning" class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                </button>
                <div v-if="showBackupMenu" class="absolute left-0 top-full mt-1 w-56 bg-surface-0 rounded-lg shadow-lg border border-surface-3 py-1 z-10">
                  <button @click="doBackup('db')" class="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-surface-2 transition-colors">
                    <div class="font-medium">快速备份</div>
                    <div class="text-text-tertiary mt-0.5">仅数据库</div>
                  </button>
                  <button @click="doBackup('full')" class="w-full text-left px-3 py-2 text-xs text-text-primary hover:bg-surface-2 transition-colors">
                    <div class="font-medium">完整备份</div>
                    <div class="text-text-tertiary mt-0.5">含技能、图片等全部文件</div>
                  </button>
                </div>
              </div>
              <span v-if="backupMessage" :class="['text-xs font-medium', backupMessageOk ? 'text-emerald-600' : 'text-red-500']">{{ backupMessage }}</span>
            </div>

            <div v-if="backups.length > 0" class="pt-3 border-t border-surface-3">
              <label class="form-label mb-2">备份记录</label>
              <div class="grid grid-cols-2 gap-2">
                <div v-for="b in pagedBackups" :key="b.fileName" class="flex flex-col gap-1.5 px-3 py-2 rounded-lg bg-surface-1 text-xs">
                  <div class="flex items-center gap-2">
                    <span :class="['inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium', b.type === 'full' ? 'bg-sky-100 text-sky-700' : 'bg-surface-3 text-text-secondary']">{{ b.type === 'full' ? '完整' : '自动' }}</span>
                    <span class="text-text-secondary flex-1">{{ formatTime(b.createdAt) }}</span>
                    <span class="text-text-tertiary">{{ formatSize(b.size) }}</span>
                  </div>
                  <div class="flex items-center gap-2 justify-end">
                    <button @click="confirmRestore(b)" class="text-primary-600 hover:text-primary-700 font-medium">恢复</button>
                    <button @click="removeBackup(b.fileName)" class="text-text-tertiary hover:text-red-500">删除</button>
                  </div>
                </div>
              </div>
              <div v-if="backupTotalPages > 1" class="flex items-center justify-center gap-2 mt-2">
                <button @click="backupPage = Math.max(1, backupPage - 1)" :disabled="backupPage <= 1" class="px-2 py-1 text-[10px] text-text-tertiary hover:text-text-secondary disabled:opacity-30">上一页</button>
                <span class="text-[10px] text-text-tertiary">{{ backupPage }} / {{ backupTotalPages }}</span>
                <button @click="backupPage = Math.min(backupTotalPages, backupPage + 1)" :disabled="backupPage >= backupTotalPages" class="px-2 py-1 text-[10px] text-text-tertiary hover:text-text-secondary disabled:opacity-30">下一页</button>
              </div>
            </div>
            <div v-else class="pt-3 border-t border-surface-3">
              <p class="text-xs text-text-tertiary">暂无备份记录</p>
            </div>
          </div>

          <!-- Restore Confirm Dialog -->
          <div v-if="restoreTarget" class="fixed inset-0 flex items-center justify-center z-50">
            <div class="bg-surface-0 rounded-xl shadow-2xl border border-surface-3 p-6 max-w-sm w-full mx-4">
              <h3 class="text-sm font-semibold text-text-primary mb-2">确认恢复</h3>
              <p class="text-xs text-text-secondary mb-1">{{ restoreTarget.type === 'full' ? '将恢复所有数据和文件，当前数据将被覆盖。' : '将恢复对话、Bot、知识库等配置数据，技能文件和图片不受影响。' }}</p>
              <p class="text-xs text-amber-600 font-medium mb-4">恢复后需要重启应用才能生效。</p>
              <div class="flex justify-end gap-2">
                <button @click="restoreTarget = null" class="btn-secondary">取消</button>
                <button @click="doRestore" :disabled="restoreRunning" class="btn-primary flex items-center gap-1.5">
                  <svg v-if="restoreRunning" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75" /></svg>
                  <span>{{ restoreRunning ? '恢复中...' : '确认恢复' }}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Theme -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <div class="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <svg class="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>
            </div>
            <h2 class="text-sm font-semibold text-text-primary">外观</h2>
          </div>
          <div class="form-card">
            <div>
              <label class="form-label">主题模式</label>
              <div class="flex gap-2">
                <button v-for="opt in themeOptions" :key="opt.value" @click="themeStore.setMode(opt.value)" :class="['flex-1 px-3 py-2.5 text-xs font-medium rounded-lg border transition-all', themeStore.mode === opt.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-3 bg-surface-0 text-text-secondary hover:bg-surface-2']">
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- About -->
        <section>
          <div class="flex items-center gap-2.5 mb-4">
            <div class="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center">
              <svg class="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" /></svg>
            </div>
            <h2 class="text-sm font-semibold text-text-primary">关于</h2>
          </div>
          <div class="card p-5">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                <span class="text-white text-xs font-bold leading-none tracking-tight">{{ appAbbr }}</span>
              </div>
              <div>
                <div class="text-sm font-semibold text-text-primary">{{ appName }}</div>
                <div class="text-xs text-text-tertiary">v{{ appVersion }} · 本地智能体平台</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
import type { ThemeMode } from '@/stores/theme'
import { appName, appAbbr } from '@/utils/branding'

declare const __APP_VERSION__: string
const appVersion = __APP_VERSION__

const themeStore = useThemeStore()
const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' }
]

const vectorForm = ref({ type: 'openai', api_base: '', api_key: '', model: 'text-embedding-3-small' })
const generalForm = ref({ temperature: '0.7' })
const vectorSaved = ref(false)
const vectorTesting = ref(false)
const vectorTestResult = ref('')
const vectorTestOk = ref(false)
const generalSaved = ref(false)
const dataDir = ref('')
const dataDirChanged = ref(false)

interface BackupInfo {
  fileName: string
  type: 'auto' | 'full'
  size: number
  createdAt: string
}

const backups = ref<BackupInfo[]>([])
const backupInterval = ref('off')
const backupMaxCount = ref(5)
const backupRunning = ref(false)
const backupMessage = ref('')
const backupMessageOk = ref(false)
const showBackupMenu = ref(false)
const restoreTarget = ref<BackupInfo | null>(null)
const restoreRunning = ref(false)
const backupPage = ref(1)
const BACKUP_PAGE_SIZE = 8

const pagedBackups = computed(() => {
  const start = (backupPage.value - 1) * BACKUP_PAGE_SIZE
  return backups.value.slice(start, start + BACKUP_PAGE_SIZE)
})

const backupTotalPages = computed(() =>
  Math.ceil(backups.value.length / BACKUP_PAGE_SIZE)
)

async function loadBackups() {
  backups.value = (await window.api.backup.invoke('list')) as BackupInfo[]
  const settings = (await window.api.backup.invoke('getSettings')) as { interval: string; maxCount: number }
  backupInterval.value = settings.interval
  backupMaxCount.value = settings.maxCount
}

async function saveBackupSettings() {
  await window.api.backup.invoke('setSettings', backupInterval.value, backupMaxCount.value)
}

async function doBackup(type: 'db' | 'full') {
  showBackupMenu.value = false
  backupRunning.value = true
  backupMessage.value = ''
  try {
    if (type === 'db') {
      await window.api.backup.invoke('db')
    } else {
      await window.api.backup.invoke('full')
    }
    backupMessageOk.value = true
    backupMessage.value = '备份完成'
    await loadBackups()
  } catch (e: any) {
    backupMessageOk.value = false
    backupMessage.value = `备份失败: ${e?.message || e}`
  } finally {
    backupRunning.value = false
    setTimeout(() => { backupMessage.value = '' }, 4000)
  }
}

function confirmRestore(b: BackupInfo) {
  restoreTarget.value = b
}

async function doRestore() {
  if (!restoreTarget.value) return
  restoreRunning.value = true
  try {
    const b = restoreTarget.value
    let result: { success: boolean; error?: string }
    if (b.type === 'full') {
      result = (await window.api.backup.invoke('restoreFull', b.fileName)) as any
    } else {
      result = (await window.api.backup.invoke('restoreDb', b.fileName)) as any
    }
    if (result.success) {
      backupMessageOk.value = true
      backupMessage.value = '恢复完成，请重启应用'
    } else {
      backupMessageOk.value = false
      backupMessage.value = `恢复失败: ${result.error}`
    }
  } catch (e: any) {
    backupMessageOk.value = false
    backupMessage.value = `恢复失败: ${e?.message || e}`
  } finally {
    restoreRunning.value = false
    restoreTarget.value = null
    setTimeout(() => { backupMessage.value = '' }, 5000)
  }
}

async function removeBackup(fileName: string) {
  await window.api.backup.invoke('delete', fileName)
  await loadBackups()
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function onClickOutsideMenu() {
  if (showBackupMenu.value) {
    showBackupMenu.value = false
  }
}

async function changeDataDir() {
  const picked = await (window as any).api.dataDir.pick() as string | null
  if (!picked) return
  const finalDir = picked.endsWith('\\local-agent') || picked.endsWith('/local-agent')
    ? picked
    : picked.replace(/[\\/]+$/, '') + '\\local-agent'
  await (window as any).api.dataDir.set(finalDir)
  dataDir.value = finalDir
  dataDirChanged.value = true
}

function openDataDir() {
  if (dataDir.value) (window as any).api.shell.openPath(dataDir.value)
}

async function loadSettings() {
  const all = (await window.api.settings.invoke('getAll')) as Record<string, string>
  if (all['vector_type']) vectorForm.value.type = all['vector_type']
  if (all['vector_api_base']) vectorForm.value.api_base = all['vector_api_base']
  if (all['vector_api_key']) vectorForm.value.api_key = all['vector_api_key']
  if (all['vector_model']) vectorForm.value.model = all['vector_model']
  if (all['temperature']) generalForm.value.temperature = all['temperature']
  dataDir.value = await (window as any).api.dataDir.get() as string
}

async function saveVectorSettings() {
  await window.api.settings.invoke('set', 'vector_type', vectorForm.value.type)
  await window.api.settings.invoke('set', 'vector_api_base', vectorForm.value.api_base)
  await window.api.settings.invoke('set', 'vector_api_key', vectorForm.value.api_key)
  await window.api.settings.invoke('set', 'vector_model', vectorForm.value.model)
  vectorSaved.value = true
  setTimeout(() => { vectorSaved.value = false }, 2000)
}

async function testVectorConnection() {
  vectorTesting.value = true
  vectorTestResult.value = ''
  vectorTestOk.value = false
  try {
    const res = (await window.api.settings.invoke('testVector', vectorForm.value.api_base, vectorForm.value.api_key, vectorForm.value.model)) as { dimension: number }
    vectorTestOk.value = true
    vectorTestResult.value = `连接成功 (维度: ${res.dimension})`
  } catch (e: any) {
    vectorTestOk.value = false
    vectorTestResult.value = `连接失败: ${e?.message || e}`
  } finally {
    vectorTesting.value = false
    setTimeout(() => { vectorTestResult.value = '' }, 5000)
  }
}

async function saveGeneralSettings() {
  await window.api.settings.invoke('set', 'temperature', generalForm.value.temperature)
  generalSaved.value = true
  setTimeout(() => { generalSaved.value = false }, 2000)
}

onMounted(() => {
  loadSettings()
  loadBackups()
  document.addEventListener('click', onClickOutsideMenu)
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutsideMenu)
})
</script>
