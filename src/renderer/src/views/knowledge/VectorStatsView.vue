<template>
  <div class="flex-1 flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="page-header">
      <div class="flex items-center gap-2">
        <button
          class="btn-primary text-sm"
          :disabled="vectorizeStore.vectorizing"
          @click="handleVectorizeAll"
        >
          <span v-if="vectorizeStore.vectorizing" class="inline-flex items-center gap-1">
            <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            处理中...
          </span>
          <span v-else>全部增量向量化</span>
        </button>
        <router-link to="/knowledge" class="btn-secondary text-sm">返回知识库</router-link>
      </div>
    </header>

    <!-- Progress Banner -->
    <div v-if="vectorizeStore.progress" class="mx-6 mt-4 p-4 rounded-lg border"
      :class="{
        'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800': vectorizeStore.progress.status === 'embedding' || vectorizeStore.progress.status === 'chunking',
        'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800': vectorizeStore.progress.status === 'done',
        'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800': vectorizeStore.progress.status === 'error'
      }">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium">{{ vectorizeStore.progress.message }}</span>
        <span class="text-xs text-text-secondary">
          {{ vectorizeStore.progress.status === 'done' ? '✓ 完成' : vectorizeStore.progress.status === 'error' ? '✗ 失败' : '' }}
        </span>
      </div>
      <div v-if="vectorizeStore.progress.total > 0 && vectorizeStore.progress.status !== 'done'" class="w-full bg-surface-2 rounded-full h-2">
        <div class="bg-primary-500 h-2 rounded-full transition-all duration-300"
          :style="{ width: `${Math.round((vectorizeStore.progress.current / vectorizeStore.progress.total) * 100)}%` }">
        </div>
      </div>
    </div>

    <!-- Stats Content -->
    <div class="flex-1 overflow-y-auto p-6">
      <!-- Summary Cards -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-primary-600">{{ totalDocs }}</div>
          <div class="text-xs text-text-secondary mt-1">总文档数</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-green-600">{{ readyDocs }}</div>
          <div class="text-xs text-text-secondary mt-1">已向量化</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-amber-600">{{ pendingDocs }}</div>
          <div class="text-xs text-text-secondary mt-1">待处理</div>
        </div>
        <div class="card p-4 text-center">
          <div class="text-2xl font-bold text-red-600">{{ errorDocs }}</div>
          <div class="text-xs text-text-secondary mt-1">处理失败</div>
        </div>
      </div>

      <!-- Category Table -->
      <div class="card overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-surface-3 bg-surface-1">
              <th class="text-left px-5 py-3 font-medium text-text-secondary">分类名称</th>
              <th class="text-center px-4 py-3 font-medium text-text-secondary">文档数</th>
              <th class="text-center px-4 py-3 font-medium text-text-secondary">已就绪</th>
              <th class="text-center px-4 py-3 font-medium text-text-secondary">待处理</th>
              <th class="text-center px-4 py-3 font-medium text-text-secondary">失败</th>
              <th class="text-center px-4 py-3 font-medium text-text-secondary">分块数</th>
              <th class="text-center px-4 py-3 font-medium text-text-secondary">已向量化</th>
              <th class="text-center px-4 py-3 font-medium text-text-secondary">Token 总数</th>
              <th class="text-right px-5 py-3 font-medium text-text-secondary">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="cat in vectorizeStore.stats" :key="cat.category_id"
              class="border-b border-surface-3 last:border-0 hover:bg-surface-1 transition-colors">
              <td class="px-5 py-3 font-medium text-text-primary">
                <div class="flex items-center gap-2">
                  <svg class="w-5 h-5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" /></svg>
                  {{ cat.category_name }}
                </div>
              </td>
              <td class="text-center px-4 py-3 text-text-secondary">{{ cat.total_docs }}</td>
              <td class="text-center px-4 py-3">
                <span class="status-badge status-active">{{ cat.ready_docs }}</span>
              </td>
              <td class="text-center px-4 py-3">
                <span v-if="cat.pending_docs > 0" class="status-badge status-warning">{{ cat.pending_docs }}</span>
                <span v-else class="text-text-tertiary">0</span>
              </td>
              <td class="text-center px-4 py-3">
                <span v-if="cat.error_docs > 0" class="status-badge status-error">{{ cat.error_docs }}</span>
                <span v-else class="text-text-tertiary">0</span>
              </td>
              <td class="text-center px-4 py-3 text-text-secondary">{{ cat.total_chunks }}</td>
              <td class="text-center px-4 py-3 text-text-secondary">{{ cat.embedded_chunks }}</td>
              <td class="text-center px-4 py-3 text-text-secondary">{{ cat.total_tokens.toLocaleString() }}</td>
              <td class="text-right px-5 py-3">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    v-if="cat.pending_docs > 0 || cat.error_docs > 0"
                    class="btn-primary text-xs px-3 py-1"
                    :disabled="vectorizeStore.vectorizing"
                    @click="handleVectorizeCategory(cat.category_id)"
                  >
                    增量向量化
                  </button>
                  <span v-else class="text-xs text-text-tertiary">已完成</span>
                  <button
                    class="btn-secondary text-xs px-3 py-1"
                    :disabled="vectorizeStore.vectorizing"
                    @click="handleResetCategory(cat.category_id)"
                  >
                    重置
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!vectorizeStore.stats.length" class="p-12 text-center text-text-tertiary">
          <div class="w-12 h-12 mx-auto mb-3 rounded-xl bg-surface-2 flex items-center justify-center">
            <svg class="w-6 h-6 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>
          </div>
          <p>暂无知识库分类数据</p>
          <router-link to="/knowledge" class="text-primary-500 hover:underline text-sm mt-2 inline-block">前往创建知识库</router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useVectorizeStore } from '@/stores/vectorize'

const vectorizeStore = useVectorizeStore()

const totalDocs = computed(() => vectorizeStore.stats.reduce((s, c) => s + c.total_docs, 0))
const readyDocs = computed(() => vectorizeStore.stats.reduce((s, c) => s + c.ready_docs, 0))
const pendingDocs = computed(() => vectorizeStore.stats.reduce((s, c) => s + c.pending_docs, 0))
const errorDocs = computed(() => vectorizeStore.stats.reduce((s, c) => s + c.error_docs, 0))

async function handleVectorizeAll() {
  try {
    await vectorizeStore.vectorizeAll()
  } catch (e: any) {
    alert('向量化失败: ' + (e?.message || e))
  }
}

async function handleVectorizeCategory(categoryId: string) {
  try {
    await vectorizeStore.vectorizeCategory(categoryId)
  } catch (e: any) {
    alert('向量化失败: ' + (e?.message || e))
  }
}

async function handleResetCategory(categoryId: string) {
  try {
    await vectorizeStore.resetCategory(categoryId)
  } catch (e: any) {
    alert('重置失败: ' + (e?.message || e))
  }
}

onMounted(() => vectorizeStore.fetchStats())
</script>
