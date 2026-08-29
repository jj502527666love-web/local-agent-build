<template>
  <div
    class="flex h-screen w-screen overflow-hidden bg-surface-1"
    :class="isMac ? '' : 'p-3 gap-3'"
  >
    <!-- 四边统一 12px 边距 + 四角圆角卡片；窗口控件为自绘组件收在主区 header 右端（非系统 titleBarOverlay） -->
    <aside
      class="w-[220px] flex-shrink-0 flex flex-col overflow-hidden"
      :class="isMac ? 'bg-surface-1' : 'bg-surface-0 rounded-3xl shadow-panel'"
    >
      <!-- 品牌：Mac 红绿灯独占一行，字标另起一行；非 Mac 与主区 header 同高（48px）+ 同一条分隔线贯通 -->
      <div v-if="isMac" class="h-[38px] flex-shrink-0 app-drag" />
      <div
        class="flex items-center flex-shrink-0 px-4 h-12"
        :class="[isWin ? 'app-drag' : '', isMac ? '' : 'border-b border-surface-2']"
        @dblclick="onHeaderDblClick"
      >
        <div class="flex items-center gap-2 min-w-0">
          <img
            v-if="appIconUrl"
            :src="appIconUrl"
            class="w-7 h-7 rounded-[9px] object-cover flex-shrink-0"
            alt=""
            draggable="false"
          />
          <div
            v-else
            class="w-7 h-7 rounded-[9px] bg-primary-600 flex items-center justify-center"
          >
            <span class="text-white text-[10px] font-bold leading-none tracking-tight">{{ appAbbr }}</span>
          </div>
          <span class="text-[13px] font-semibold text-text-primary tracking-tight truncate">{{ appName }}</span>
        </div>
      </div>

      <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <!-- 固定动作区：新建对话 / 搜索 / 主导航 -->
        <nav class="px-2.5 space-y-0.5 flex-shrink-0">
          <button
            type="button"
            class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 w-full text-left"
            title="新建对话 Ctrl+N"
            @click="onSidebarNewChat"
          >
            <svg class="w-[17px] h-[17px] flex-shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.375 2.625a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414l-9.193 9.193a2 2 0 0 1-.894.532l-2.821.704a.5.5 0 0 1-.61-.61l.704-2.821a2 2 0 0 1 .532-.894z" />
            </svg>
            <span class="font-medium flex-1">新建对话</span>
            <kbd class="text-[10px] text-text-tertiary font-normal">{{ isMac ? '⌘N' : 'Ctrl+N' }}</kbd>
          </button>
          <button
            type="button"
            class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 w-full text-left"
            title="搜索 Ctrl+K"
            @click="openNavSearch"
          >
            <svg class="w-[17px] h-[17px] flex-shrink-0 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            <span class="font-medium flex-1">搜索</span>
            <kbd class="text-[10px] text-text-tertiary font-normal">{{ isMac ? '⌘K' : 'Ctrl+K' }}</kbd>
          </button>
          <template v-for="item in primaryNavItems" :key="item.key || item.path">
            <a
              v-if="!item.children && item.custom && item.custom.target_type === 'external'"
              class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
              :title="item.custom.target"
              @click="onCustomItemClick(item.custom)"
            >
              <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
              <span class="font-medium">{{ item.label }}</span>
            </a>
            <router-link
              v-else-if="!item.children && item.custom"
              :to="item.custom.target"
              :class="['nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150', isCustomInternalActive(item.custom) ? 'nav-active' : '']"
            >
              <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
              <span class="font-medium">{{ item.label }}</span>
            </router-link>
            <router-link
              v-else-if="!item.children"
              :to="item.path"
              class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150"
              active-class="nav-active"
            >
              <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
              <span class="font-medium">{{ item.label }}</span>
            </router-link>
            <div v-else>
              <button
                class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 w-full text-left"
                :class="{ 'nav-active': isGroupActive(item) }"
                @click="toggleGroup(item.key)"
              >
                <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                <span class="font-medium flex-1">{{ item.label }}</span>
                <IconChevron class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200" :class="{ 'rotate-90': expandedGroups.has(item.key) }" />
              </button>
              <div v-show="expandedGroups.has(item.key)" class="mt-0.5 space-y-0.5">
                <template v-for="child in item.children" :key="child.key || child.path">
                  <a
                    v-if="child.custom && child.custom.target_type === 'external'"
                    class="nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
                    :title="child.custom.target"
                    @click="onCustomItemClick(child.custom)"
                  >
                    <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                    <span class="font-medium">{{ child.label }}</span>
                  </a>
                  <router-link
                    v-else-if="child.custom"
                    :to="child.custom.target"
                    :class="['nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150', isCustomInternalActive(child.custom) ? 'nav-active' : '']"
                  >
                    <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                    <span class="font-medium">{{ child.label }}</span>
                  </router-link>
                  <router-link
                    v-else
                    :to="child.path"
                    class="nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150"
                    active-class="nav-active"
                  >
                    <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                    <span class="font-medium">{{ child.label }}</span>
                  </router-link>
                </template>
              </div>
            </div>
          </template>
        </nav>

        <!-- 可滚动区：创作类 + 更多（低频工具下沉） -->
        <div class="flex-1 min-h-0 overflow-y-auto px-2.5 pt-2 pb-2">
          <div class="h-px bg-surface-2 mx-1 mb-2" />
          <div class="space-y-0.5">
            <template v-for="item in creationNavItems" :key="item.key || item.path">
              <a
                v-if="!item.children && item.custom && item.custom.target_type === 'external'"
                class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
                :title="item.custom.target"
                @click="onCustomItemClick(item.custom)"
              >
                <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                <span class="font-medium">{{ item.label }}</span>
              </a>
              <router-link
                v-else-if="!item.children && item.custom"
                :to="item.custom.target"
                :class="['nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150', isCustomInternalActive(item.custom) ? 'nav-active' : '']"
              >
                <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                <span class="font-medium">{{ item.label }}</span>
              </router-link>
              <router-link
                v-else-if="!item.children"
                :to="item.path"
                class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150"
                active-class="nav-active"
              >
                <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                <span class="font-medium">{{ item.label }}</span>
              </router-link>
              <div v-else>
                <button
                  class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 w-full text-left"
                  :class="{ 'nav-active': isGroupActive(item) }"
                  @click="toggleGroup(item.key)"
                >
                  <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                  <span class="font-medium flex-1">{{ item.label }}</span>
                  <IconChevron class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200" :class="{ 'rotate-90': expandedGroups.has(item.key) }" />
                </button>
                <div v-show="expandedGroups.has(item.key)" class="mt-0.5 space-y-0.5">
                  <template v-for="child in item.children" :key="child.key || child.path">
                    <a
                      v-if="child.custom && child.custom.target_type === 'external'"
                      class="nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
                      :title="child.custom.target"
                      @click="onCustomItemClick(child.custom)"
                    >
                      <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                      <span class="font-medium">{{ child.label }}</span>
                    </a>
                    <router-link
                      v-else-if="child.custom"
                      :to="child.custom.target"
                      :class="['nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150', isCustomInternalActive(child.custom) ? 'nav-active' : '']"
                    >
                      <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                      <span class="font-medium">{{ child.label }}</span>
                    </router-link>
                    <router-link
                      v-else
                      :to="child.path"
                      class="nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150"
                      active-class="nav-active"
                    >
                      <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                      <span class="font-medium">{{ child.label }}</span>
                    </router-link>
                  </template>
                </div>
              </div>
            </template>
          </div>
          <div class="pt-1 space-y-0.5">
            <template v-for="item in moreNavItems" :key="item.key || item.path">
              <a
                v-if="!item.children && item.custom && item.custom.target_type === 'external'"
                class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
                :title="item.custom.target"
                @click="onCustomItemClick(item.custom)"
              >
                <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                <span class="font-medium">{{ item.label }}</span>
              </a>
              <router-link
                v-else-if="!item.children && item.custom"
                :to="item.custom.target"
                :class="['nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150', isCustomInternalActive(item.custom) ? 'nav-active' : '']"
              >
                <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                <span class="font-medium">{{ item.label }}</span>
              </router-link>
              <router-link
                v-else-if="!item.children"
                :to="item.path"
                class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150"
                active-class="nav-active"
              >
                <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                <span class="font-medium">{{ item.label }}</span>
              </router-link>
              <div v-else>
                <button
                  class="nav-item flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 w-full text-left"
                  :class="{ 'nav-active': isGroupActive(item) }"
                  @click="toggleGroup(item.key)"
                >
                  <component :is="item.icon" class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
                  <span class="font-medium flex-1">{{ item.label }}</span>
                  <IconChevron class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200" :class="{ 'rotate-90': expandedGroups.has(item.key) }" />
                </button>
                <div v-show="expandedGroups.has(item.key)" class="mt-0.5 space-y-0.5">
                  <template v-for="child in item.children" :key="child.key || child.path">
                    <a
                      v-if="child.custom && child.custom.target_type === 'external'"
                      class="nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
                      :title="child.custom.target"
                      @click="onCustomItemClick(child.custom)"
                    >
                      <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                      <span class="font-medium">{{ child.label }}</span>
                    </a>
                    <router-link
                      v-else-if="child.custom"
                      :to="child.custom.target"
                      :class="['nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150', isCustomInternalActive(child.custom) ? 'nav-active' : '']"
                    >
                      <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                      <span class="font-medium">{{ child.label }}</span>
                    </router-link>
                    <router-link
                      v-else
                      :to="child.path"
                      class="nav-item flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150"
                      active-class="nav-active"
                    >
                      <component :is="child.icon" class="w-[15px] h-[15px] flex-shrink-0 opacity-80" />
                      <span class="font-medium">{{ child.label }}</span>
                    </router-link>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 底部：余额徽章 + 用户中心 + 设置（设置改为全局模态，不再跳路由） -->
      <div class="px-2.5 py-2.5 border-t border-surface-2 space-y-0.5 flex-shrink-0">
        <SidebarBalanceBadge v-if="cloudAuth.isLoggedIn" class="mb-1.5" />
        <div class="flex items-center gap-1">
          <router-link
            to="/user-center"
            class="nav-item flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] text-text-secondary hover:bg-surface-2 transition-all duration-150"
            active-class="nav-active"
          >
            <IconUser class="w-[17px] h-[17px] flex-shrink-0 opacity-80" />
            <span class="font-medium truncate">{{ cloudAuth.user?.nickname || cloudAuth.user?.username || '用户' }}</span>
          </router-link>
          <button
            type="button"
            class="p-2 rounded-xl text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors"
            :class="{ 'nav-active !text-text-primary': settingsUi.open }"
            title="设置"
            @click="settingsUi.show()"
          >
            <IconSettings class="w-[17px] h-[17px]" />
          </button>
        </div>
      </div>
    </aside>

    <main
      class="flex-1 overflow-hidden flex flex-col relative bg-surface-0 min-w-0"
      :class="isMac ? 'mt-0 mr-3 mb-3 rounded-3xl shadow-panel' : 'rounded-3xl shadow-panel'"
    >
      <header
        v-if="!isChatRoute"
        class="h-12 flex-shrink-0 flex items-center px-5 gap-3"
        :class="[(isWin || isMac) ? 'app-drag' : '']"
        @dblclick="onHeaderDblClick"
      >
        <h1 class="text-sm font-semibold text-text-primary flex-shrink-0">{{ pageTitle }}</h1>
        <!-- 全局公告条：登录后自动显示当前启用的最新一条；点击展开全文弹窗。
             放在 pageTitle 右侧 + 画布徽标左侧，画布运行时仍可点击（徽标 ml-auto 抢占右侧）。
             根元素是 button，main.css 的 `.app-drag button` 规则会自动 no-drag，无需额外 class -->
        <AnnouncementBar />
        <ExpiryGlobalBanner />
        <!-- 全局画布任务徽标：anyRunning 时显示，跨页面可见，让用户知道任务仍在后台执行 -->
        <div
          v-if="canvasAnyRunning && !isCanvasRoute"
          class="ml-auto flex items-center gap-1 px-2 py-1 rounded-md border tone-warn"
        >
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          <button
            type="button"
            class="text-[11px] font-medium hover:underline"
            @click="goToRunningCanvas"
            :title="canvasRunningProjectIds.length ? '回到正在运行的画布' : '画布有节点在生成'"
          >画布生成中{{ canvasActiveCount > 0 ? ` (${canvasActiveCount})` : '' }}</button>
          <button
            v-if="canvasWorkflowRunning"
            type="button"
            class="text-[11px] px-1.5 py-0.5 rounded border border-current opacity-80 hover:opacity-100"
            @click="onCancelCanvas"
            title="停止画布工作流（已开始的节点会跑完）"
          >停止</button>
        </div>
        <!-- 自绘窗口控件（仅 Win 渲染）：收在 header 右端卡片内，替代系统 titleBarOverlay -->
        <WindowControls class="ml-auto" />
      </header>
      <div v-if="!isChatRoute" class="h-px bg-surface-2 flex-shrink-0" />
      <!-- /chat 路由：隐藏顶栏，公告/徽标改绝对定位浮动层，把纵向空间全部留给对话；
           窗口控件由 ChatView 自身 header 承载 -->
      <div
        v-else
        class="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 pt-2 pointer-events-none"
      >
        <div class="pointer-events-auto flex items-center gap-2 min-w-0" :class="{ 'app-drag': isWin }">
          <AnnouncementBar />
          <ExpiryGlobalBanner />
        </div>
        <div
          v-if="canvasAnyRunning && !isCanvasRoute"
          class="pointer-events-auto ml-auto flex items-center gap-1 px-2 py-1 rounded-md border tone-warn"
        >
          <button type="button" class="text-[11px] font-medium hover:underline" @click="goToRunningCanvas">画布生成中</button>
        </div>
      </div>
      <div class="flex-1 overflow-hidden flex flex-col min-h-0">
        <router-view />
      </div>
    </main>

    <!-- 全局余额不足弹窗：任意云端调用命中 402 时统一展示充值引导 -->
    <LowBalanceModal
      v-model:visible="lowBalance.visible"
      :balance-type="lowBalance.balanceType"
      :required="lowBalance.required"
      :available="lowBalance.available"
    />

    <!-- 设置 = 全局居中模态（内部按 settings-ui.open 显隐） -->
    <SettingsView />

    <!-- ⌘K/Ctrl+K 导航搜索：纯前端导航项过滤；无背景遮罩（项目设计规则） -->
    <div
      v-if="showNavSearch"
      class="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh]"
      @click.self="showNavSearch = false"
    >
      <div class="w-[420px] max-w-[90vw] bg-surface-0 border border-surface-3 rounded-xl shadow-modal overflow-hidden">
        <div class="px-3 py-2.5 border-b border-surface-3 flex items-center gap-2">
          <span class="text-[10px] text-text-tertiary">{{ isMac ? '⌘K' : 'Ctrl+K' }}</span>
          <input
            v-model="navSearchQuery"
            class="flex-1 text-sm bg-transparent outline-none text-text-primary placeholder:text-text-tertiary"
            placeholder="搜索功能入口…"
            autofocus
            @keydown.escape="showNavSearch = false"
            @keydown.enter.prevent="navSearchResults[0] && goNavSearch(navSearchResults[0].path)"
          />
        </div>
        <div class="max-h-72 overflow-y-auto py-1">
          <button
            v-for="item in navSearchResults"
            :key="item.path"
            type="button"
            class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            @click="goNavSearch(item.path)"
          >
            {{ item.label }}
          </button>
          <div v-if="!navSearchResults.length" class="px-3 py-6 text-center text-xs text-text-tertiary">无匹配入口</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkflowEngine } from '@/views/canvas/composables/useWorkflowEngine'
import LowBalanceModal from '@/components/LowBalanceModal.vue'
import SettingsView from '@/views/settings/SettingsView.vue'
import WindowControls from '@/components/WindowControls.vue'
import { useLowBalanceStore } from '@/stores/low-balance'
import { useSettingsUiStore } from '@/stores/settings-ui'
import IconChat from '@/components/icons/IconChat.vue'
// import IconDeck from '@/components/icons/IconDeck.vue' // AI PPT 暂时下线
import IconBot from '@/components/icons/IconBot.vue'
import IconKnowledge from '@/components/icons/IconKnowledge.vue'
import IconModel from '@/components/icons/IconModel.vue'
import IconPersona from '@/components/icons/IconPersona.vue'
import IconSkill from '@/components/icons/IconSkill.vue'
import IconTool from '@/components/icons/IconTool.vue'
import IconMcp from '@/components/icons/IconMcp.vue'
import IconSettings from '@/components/icons/IconSettings.vue'
import IconChevron from '@/components/icons/IconChevron.vue'
import IconExtension from '@/components/icons/IconExtension.vue'
import IconImageGen from '@/components/icons/IconImageGen.vue'
import IconInspiration from '@/components/icons/IconInspiration.vue'
import IconCreation from '@/components/icons/IconCreation.vue'
import IconBatchGen from '@/components/icons/IconBatchGen.vue'
import IconImage2Prompt from '@/components/icons/IconImage2Prompt.vue'
import IconImageMatting from '@/components/icons/IconImageMatting.vue'
import IconFineMatting from '@/components/icons/IconFineMatting.vue'
import IconPrompt from '@/components/icons/IconPrompt.vue'
import IconCanvas from '@/components/icons/IconCanvas.vue'
import IconGallery from '@/components/icons/IconGallery.vue'
import IconUser from '@/components/icons/IconUser.vue'
import IconAICreation from '@/components/icons/IconAICreation.vue'
import IconVideoGen from '@/components/icons/IconVideoGen.vue'
import IconVideoCreation from '@/components/icons/IconVideoCreation.vue'
import IconCanvasSquare from '@/components/icons/IconCanvasSquare.vue'
import IconImageToolkit from '@/components/icons/IconImageToolkit.vue'
import IconEweiShop from '@/components/icons/IconEweiShop.vue'
import IconClawbot from '@/components/icons/IconClawbot.vue'
import IconCustomLink from '@/components/icons/IconCustomLink.vue'
import IconCustomPage from '@/components/icons/IconCustomPage.vue'
import IconCustomApp from '@/components/icons/IconCustomApp.vue'
import IconCustomStar from '@/components/icons/IconCustomStar.vue'
import AnnouncementBar from '@/components/AnnouncementBar.vue'
import ExpiryGlobalBanner from '@/components/ExpiryGlobalBanner.vue'
import SidebarBalanceBadge from '@/components/SidebarBalanceBadge.vue'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { useSiteConfigStore } from '@/stores/site-config'
import { useClawbotStore } from '@/stores/clawbot'
import { useChatStore } from '@/stores/chat'
import { cloudClient } from '@/utils/cloud-api'
import { appName, appAbbr, appIconUrl } from '@/utils/branding'
import { cacheMenuOverrides } from '@/utils/home-path'

const route = useRoute()
const router = useRouter()
const cloudAuth = useCloudAuthStore()
const siteConfig = useSiteConfigStore()
const chatStore = useChatStore()
const lowBalance = useLowBalanceStore()
const settingsUi = useSettingsUiStore()
const pageTitle = computed(() => (route.meta?.title as string) || '')

// 画布任务全局徽标：useWorkflowEngine 是 module-level singleton，
// MainLayout 内 mount 时取到的就是任何位置（节点 / CanvasEditorView）共享的状态。
const {
  anyRunningGlobal: canvasAnyRunning,
  workflowRunningGlobal: canvasWorkflowRunning,
  activeSingleRunCount: canvasActiveSingleRunCount,
  runningProjectIds: canvasRunningProjectIds,
  cancelAllWorkflows: cancelCanvasWorkflow
} = useWorkflowEngine()

const canvasActiveCount = computed(() => {
  // workflow 模式下统计所有节点过于复杂，简化为：workflow 模式不显示数字、单节点模式显示数量
  if (canvasWorkflowRunning.value) return 0
  return canvasActiveSingleRunCount.value
})

const isCanvasRoute = computed(() => route.path.startsWith('/canvas'))
const isChatRoute = computed(() => route.path === '/chat' || route.path.startsWith('/chat/'))

/** 顶栏拖拽区双击 = 切换最大化（替代系统标题栏行为；按钮/下拉等交互元素不响应——它们自身有 click 且不是 app-drag 命中目标） */
function onHeaderDblClick(e: MouseEvent) {
  if (!isWin) return
  const target = e.target as HTMLElement
  if (target.closest('button, a, input, select, [role="button"]')) return
  ;(window as any).api?.window?.maximize?.()
}

function goToRunningCanvas() {
  const pid = canvasRunningProjectIds.value[0]
  if (pid) {
    router.push(`/canvas/${pid}`)
  } else {
    router.push('/canvas')
  }
}

function onCancelCanvas() {
  cancelCanvasWorkflow()
}

// 平台判断：Win 用自定义无边框 + titleBarOverlay（需 app-drag + 右侧 padding 让位控件按钮），
// Mac 用 hiddenInset（红绿灯在侧栏顶），Linux 用原生标题栏。
const platform = ((window as any).electron?.process?.platform || (window as any).runtimeConfig?.platform || '')
const isWin = platform === 'win32'
const isMac = platform === 'darwin'

const allNavItems = [
  // ---- primary：顶部固定主导航 ----
  { path: '/chat', label: '对话', icon: IconChat, tier: 'primary' },
  { path: '/bots', label: '智能体', icon: IconBot, tier: 'primary' },
  { path: '/knowledge', label: '知识库', icon: IconKnowledge, tier: 'primary' },
  // 微信 ClawBot：本地功能（扫码绑定微信，消息桥接进对话），不走云端权限门控
  { path: '/clawbot', label: '微信 ClawBot', icon: IconClawbot, tier: 'primary' },
  // v0.6.9+「模型服务」并入了「视频模型」+「抠图接口」tab，因此可见性改成
  // OR 关系：自定义模型/视频模型/抠图接口任一权限开启即可见。
  // 视频模型独立顶级菜单已下线（重定向到 /models?tab=video）。
  { path: '/models', label: '模型服务', icon: IconModel, tier: 'primary', requireAnyPermission: ['allow_custom_provider', 'allow_custom_video_provider', 'allow_custom_matting_provider'] },
  // ---- creation：创作类（滚动区上段） ----
  {
    key: 'group:ai-creation',
    label: 'AI 创作',
    icon: IconAICreation,
    tier: 'creation',
    children: [
      { path: '/image-gen', label: 'AI 生图', icon: IconImageGen },
      // { path: '/deck', label: 'AI PPT', icon: IconDeck }, // AI PPT 暂时下线
      { path: '/batch-gen', label: '批量生图', icon: IconBatchGen },
      { path: '/image-to-prompt', label: '图片反推', icon: IconImage2Prompt },
      { path: '/ai-matting', label: '快速抠图', icon: IconImageMatting, requireAnyPermission: ['allow_image_matting', 'allow_custom_matting_provider'] },
      { path: '/fine-matting', label: '精细抠图', icon: IconFineMatting, requireAnyPermission: ['allow_fine_matting'] },
      // 去AI标记：显示由系统设置的全局开关控制（下发 site-config.features.aiMarkRemoval）；能否使用另由权限判定
      { path: '/image-toolkit/remove-ai-mark', label: '去AI标记', icon: IconImageToolkit, requireSiteFeature: 'aiMarkRemoval' },
      { path: '/canvas', label: '流式画布', icon: IconCanvas },
      { path: '/ai-video', label: 'AI 视频', icon: IconVideoGen }
    ]
  },
  { path: '/image-toolkit', label: '图像处理', icon: IconImageToolkit, tier: 'creation' },
  // 店铺商品图：填域名/账号/密码登录 ewei 商城，选门店后用本地图库/AI生图替换商品主图/详情图。
  // 入口权限门控：allow_ewei_shop 默认 false（默认拒绝）。两级门控——授权管理端开放本云控端该功能
  // 且用户被授权时，云控端才下发 true；老/未授权云控端不下发 → 隐藏入口。
  { path: '/ewei', label: '店铺商品图', icon: IconEweiShop, tier: 'creation', requireAnyPermission: ['allow_ewei_shop', 'allow_dianda_shop', 'allow_qdyun_shop'] },
  { path: '/inspiration', label: '灵感广场', icon: IconInspiration, tier: 'creation' },
  { path: '/canvas-square', label: '创意模板', icon: IconCanvasSquare, tier: 'creation' },
  {
    key: 'group:my-creations',
    label: '我的创作',
    icon: IconCreation,
    tier: 'creation',
    children: [
      { path: '/my-creations', label: '图片创作', icon: IconImageGen },
      { path: '/video-creations', label: '视频创作', icon: IconVideoCreation }
    ]
  },
  // ---- secondary：低频工具下沉「更多」（滚动区下段） ----
  { path: '/personas', label: '人格规则', icon: IconPersona, tier: 'secondary' },
  {
    key: 'group:extensions',
    label: '扩展能力',
    icon: IconExtension,
    tier: 'secondary',
    children: [
      { path: '/gallery', label: '本地图库', icon: IconGallery },
      { path: '/prompts', label: '提示词', icon: IconPrompt },
      { path: '/tools', label: '小工具', icon: IconTool },
      { path: '/skills', label: 'Skills技能', icon: IconSkill },
      { path: '/mcps', label: 'MCP服务', icon: IconMcp }
    ]
  }
]

const expandedGroups = ref<Set<string>>(new Set())

// 云控端「桌面端菜单配置」：{ menu_key: { visible, title } }；登录后拉取，覆盖默认菜单的显隐与名称。
// menu_key：叶子菜单用 path，分组用 group:xxx。「模型服务 / AI 抠图」不下发（继续按功能权限）。
const menuOverrides = ref<Record<string, { visible: boolean; title: string }>>({})
// 云控端「自定义菜单」：后台维护的额外菜单项（内部路由 / 外部链接），随同一端点下发（仅可见项、已按 sort 排序）
interface CustomMenuItem {
  key: string
  title: string
  group_key: string
  target_type: 'internal' | 'external'
  target: string
  open_mode: 'browser' | 'window'
  icon: string
}
const customMenuItems = ref<CustomMenuItem[]>([])
onMounted(async () => {
  try {
    const res: any = await cloudClient.desktopMenu()
    menuOverrides.value = res?.overrides && typeof res.overrides === 'object' ? res.overrides : {}
    // 写入本地缓存：下次启动「/」重定向（发生在本组件挂载前）据此判断首页是 /bots 还是 /chat
    cacheMenuOverrides(menuOverrides.value)
    // 合并前过滤脏数据（字段缺失 / target_type 非法 / 目标为空或协议不符的项直接丢弃），
    // 防云端脏数据导致渲染出点击无反应的死菜单
    customMenuItems.value = Array.isArray(res?.custom_items)
      ? res.custom_items.filter((c: any) => {
          if (!c || typeof c.key !== 'string' || !c.key) return false
          if (typeof c.title !== 'string' || !c.title) return false
          if (typeof c.target !== 'string' || !c.target) return false
          if (c.target_type === 'internal') return c.target.startsWith('/')
          if (c.target_type === 'external') return /^https?:\/\//i.test(c.target)
          return false
        })
      : []
  } catch {
    menuOverrides.value = {}
    customMenuItems.value = []
  }
})

// 自定义菜单图标 key → 内置 SVG 组件（与云控端 CUSTOM_ICONS 枚举对齐；未知 key 回落链接图标）
const CUSTOM_ICON_MAP: Record<string, any> = {
  link: IconCustomLink,
  page: IconCustomPage,
  app: IconCustomApp,
  star: IconCustomStar
}

/** 自定义菜单点击：internal 走路由；external 按 open_mode 走系统浏览器 / 应用内独立窗口；失败给可见反馈 */
async function onCustomItemClick(item: CustomMenuItem) {
  if (item.target_type === 'internal') {
    router.push(item.target)
    return
  }
  const api = (window as any).api
  try {
    const res =
      item.open_mode === 'window'
        ? await api.shell.openExternalWindow(item.target, item.title)
        : await api.shell.openExternal(item.target)
    // openExternal 协议被主进程白名单拦截返回 false；openExternalWindow 校验失败返回 { success: false, error }
    if (res === false || (res && typeof res === 'object' && res.success === false)) {
      api.nativeDialog.alert(`无法打开链接：${item.target}${res?.error ? `\n${res.error}` : ''}`)
    }
  } catch (e: any) {
    api.nativeDialog.alert(`无法打开链接：${item.target}\n${e?.message || e}`)
  }
}

/** 自定义 internal 菜单的 active 判定：带 query/锚点的目标用 fullPath 精确匹配
 * （否则 /models?tab=video 与内置「模型服务」/models 会同时高亮——router-link 的 active 不按 query 区分），
 * 纯路径目标与内置一致按前缀匹配（子路由页面保持高亮） */
function isCustomInternalActive(c: CustomMenuItem): boolean {
  if (c.target.includes('?') || c.target.includes('#')) return route.fullPath === c.target
  return pathMatches(route.path, c.target)
}

// 微信 ClawBot：app 级常驻监听（幂等）装在主布局而非 ClawbotView——
// 否则用户未打开过 ClawBot 页时，微信轮次完成无法联动刷新对话页/会话列表
onMounted(() => {
  useClawbotStore().initClawbotListeners()
})

/**
 * 路径匹配：避免 `/canvas-square` 错命中 `/canvas` 这种「字符串前缀但语义不同」的情况。
 * 规则：完全相等 OR 完全相等 + 紧跟 `/`（用于带 :id 的子路径，比如 /canvas/abc）。
 * menuPath 先剥 query/锚点（自定义菜单 internal 目标可能带 ?tab=xxx），否则永不命中。
 */
function pathMatches(routePath: string, menuPath: string): boolean {
  const pure = (menuPath || '').split('?')[0].split('#')[0]
  if (!pure) return false
  return routePath === pure || routePath.startsWith(pure + '/')
}

watchEffect(() => {
  for (const item of allNavItems as any[]) {
    if (item.children?.some((child: any) => pathMatches(route.path, child.path))) {
      expandedGroups.value.add(item.key)
    }
  }
  // 自定义菜单 internal 子项命中当前路由时，所在组同样自动展开
  for (const c of customMenuItems.value) {
    if (!c.group_key || c.target_type !== 'internal') continue
    if (pathMatches(route.path, c.target)) expandedGroups.value.add(c.group_key)
  }
})

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key)
  } else {
    expandedGroups.value.add(key)
  }
}

function isGroupActive(item: any) {
  return item.children?.some((child: any) => pathMatches(route.path, child.path))
}

function passesPermissionFilter(item: any): boolean {
  // 单个 key：requirePermission 必须为真
  if (item.requirePermission && !(cloudAuth.permissions as any)[item.requirePermission]) {
    return false
  }
  // 任一 key 命中即可：requireAnyPermission（数组），用于「模型服务」这种合并入口
  if (Array.isArray(item.requireAnyPermission)) {
    const anyTrue = item.requireAnyPermission.some(
      (k: string) => Boolean((cloudAuth.permissions as any)[k]),
    )
    if (!anyTrue) return false
  }
  // 站点级功能显示开关（如去AI标记，由系统设置全局控制、经 site-config 下发；与个人权限无关）
  if (item.requireSiteFeature && !(siteConfig.features as any)[item.requireSiteFeature]) {
    return false
  }
  return true
}

const navItems = computed(() => {
  const cfg = menuOverrides.value
  // 叶子项：先过功能权限；权限项（模型服务 / AI 抠图）不受菜单配置影响；其余按云端 override 隐藏/改名
  const applyLeaf = (item: any): any | null => {
    if (!passesPermissionFilter(item)) return null
    if (item.requireAnyPermission || item.requirePermission || item.requireSiteFeature) return item
    const o = cfg[item.path]
    if (o && o.visible === false) return null
    if (o && o.title) return { ...item, label: o.title }
    return item
  }
  const result: any[] = []
  for (const item of allNavItems as any[]) {
    if (item.children) {
      const go = cfg[item.key]
      if (go && go.visible === false) continue // 整组被隐藏
      const children = item.children.map(applyLeaf).filter(Boolean)
      if (children.length === 0) continue // 子项全部被隐藏 / 无权限则不显示分组
      result.push({ ...item, label: go && go.title ? go.title : item.label, children })
    } else {
      const applied = applyLeaf(item)
      if (applied) result.push(applied)
    }
  }
  // 合并云控端自定义菜单（已按 sort 排序）：挂到对应组末尾或顶级末尾；
  // 组被 overrides 隐藏 / 子项全空不存在时，该自定义项随之不显示（管理员隐藏组的语义覆盖）。
  // key 加 custom: 前缀——自定义 internal 项的 path 可能与内置菜单重复（如再挂一个 /chat），
  // 模板 :key 优先取 key，此前缀保证天然唯一
  for (const c of customMenuItems.value) {
    const leaf = {
      key: `custom:${c.key}`,
      // internal 复用 router-link（active 态由 isCustomInternalActive 手动判定）；external 无 path，模板走 <a> 分支
      path: c.target_type === 'internal' ? c.target : undefined,
      label: c.title,
      icon: CUSTOM_ICON_MAP[c.icon] || IconCustomLink,
      custom: c,
      tier: 'secondary' as const
    }
    if (!c.group_key) {
      result.push(leaf)
      continue
    }
    const group = result.find((it) => it.key === c.group_key && it.children)
    if (group) group.children.push(leaf)
    else result.push(leaf)
  }
  return result
})

// 按 tier 拆三段渲染：primary 固定区顶部；creation 滚动区上段；其余（secondary）滚动区下段
const primaryNavItems = computed(() =>
  (navItems.value as any[]).filter((it) => it.tier === 'primary')
)
const creationNavItems = computed(() =>
  (navItems.value as any[]).filter((it) => it.tier === 'creation')
)
const moreNavItems = computed(() =>
  (navItems.value as any[]).filter((it) => it.tier !== 'primary' && it.tier !== 'creation')
)

/** 新建对话：进入空态（不落库），并确保落在 /chat */
async function onSidebarNewChat() {
  chatStore.startNewChat()
  if (route.path !== '/chat') await router.push({ path: '/chat' })
}

/** Ctrl/⌘+N 新建对话；Ctrl/⌘+K 打开导航搜索 */
const showNavSearch = ref(false)
const navSearchQuery = ref('')

function openNavSearch() {
  showNavSearch.value = true
  navSearchQuery.value = ''
}

const navSearchResults = computed(() => {
  const q = navSearchQuery.value.trim().toLowerCase()
  const flat: { label: string; path: string }[] = []
  for (const item of navItems.value as any[]) {
    if (item.children) {
      for (const c of item.children) {
        if (c.path) flat.push({ label: `${item.label} / ${c.label}`, path: c.path })
      }
    } else if (item.path) {
      flat.push({ label: item.label, path: item.path })
    }
  }
  flat.push({ label: '设置', path: '/settings' })
  if (!q) return flat.slice(0, 12)
  return flat.filter((x) => x.label.toLowerCase().includes(q)).slice(0, 12)
})

function onGlobalHotkey(e: KeyboardEvent) {
  const meta = e.metaKey || e.ctrlKey
  if (!meta) return
  const key = e.key.toLowerCase()
  if (key === 'n') {
    e.preventDefault()
    showNavSearch.value = false
    void onSidebarNewChat()
    return
  }
  if (key === 'k') {
    e.preventDefault()
    showNavSearch.value = true
    navSearchQuery.value = ''
  }
}

function goNavSearch(path: string) {
  showNavSearch.value = false
  if (path === '/settings') {
    settingsUi.show()
    return
  }
  router.push(path)
}

onMounted(() => {
  document.addEventListener('keydown', onGlobalHotkey)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalHotkey)
})
</script>

<style scoped>
.nav-active {
  background: color-mix(in srgb, var(--color-primary-500, #F27638) 8%, #fff);
  color: var(--text-primary);
}
.nav-active svg {
  color: var(--text-primary);
  opacity: 1;
}

:global(.dark .nav-active) {
  background: color-mix(in srgb, var(--color-primary-500, #F27638) 18%, transparent);
  color: var(--color-primary-200, #fed7aa);
}
:global(.dark .nav-active svg) {
  color: var(--color-primary-300, #fdba74);
}
</style>
