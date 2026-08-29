<template>
  <div class="h-full flex flex-col bg-surface-0">
    <!-- 顶栏：/chat 路由下 MainLayout 已隐藏全局顶栏，本 header 兼任窗口拖拽区（48px 与全局 header/侧栏品牌区同高） -->
    <header
      class="h-12 flex-shrink-0 flex items-center gap-2 px-3 border-b border-surface-2"
      :class="[(isWin || isMac) ? 'app-drag' : '']"
      @dblclick="onHeaderDblClick"
    >
      <!-- Floating bot selector -->
      <div class="relative no-drag" ref="botSelectorRef">
        <button
          type="button"
          @click="showBotSelector = !showBotSelector"
          class="flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-lg text-text-secondary hover:bg-surface-1 transition-colors"
          title="智能体"
        >
          <span class="max-w-[10rem] truncate">{{ selectedBotName || '选择智能体' }}</span>
          <svg class="w-3 h-3 text-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
        </button>
        <div v-if="showBotSelector" class="absolute top-full left-0 mt-1 w-52 bg-surface-0 border border-surface-3 rounded-xl shadow-modal z-50 py-1 max-h-60 overflow-y-auto">
          <div v-if="!bots.length" class="px-3 py-2 text-xs text-text-tertiary">暂无智能体</div>
          <button v-for="bot in bots" :key="bot.id" @click="selectedBotId = bot.id; showBotSelector = false" :class="['w-full text-left px-3 py-2 text-xs transition-colors', bot.id === selectedBotId ? 'bg-surface-2 text-text-primary font-medium' : 'text-text-secondary hover:bg-surface-1']">
            {{ bot.name }}
          </button>
        </div>
      </div>
      <button
        type="button"
        @click="newConversation"
        class="h-8 w-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-1 transition-colors flex-shrink-0 no-drag"
        title="新建对话（进入空态，发送首条消息时才创建会话）"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
      </button>
      <button
        v-if="chatStore.currentConversationId"
        type="button"
        @click="openWorkspace"
        class="h-8 px-2.5 text-xs font-medium rounded-lg text-text-secondary hover:bg-surface-1 hover:text-text-primary transition-colors no-drag"
        title="打开本会话工作区目录"
      >工作区</button>
      <!-- 自绘窗口控件（仅 Win 渲染） -->
      <WindowControls class="ml-auto" />
    </header>
    <div class="flex-1 flex overflow-hidden min-h-0">
      <!-- Conversation list sidebar (narrow)：浅灰底与白消息区底色区分（新色板下边框太淡） -->
      <aside v-if="selectedBotId && chatStore.conversations.length" class="w-40 flex-shrink-0 border-r border-surface-2 bg-surface-1 flex flex-col">
        <div class="flex-1 overflow-y-auto px-2 py-2">
          <div
            v-for="conv in chatStore.conversations"
            :key="conv.id"
            @click="chatStore.selectConversation(conv.id)"
            :class="['px-3 py-2.5 text-xs cursor-pointer rounded-lg mb-0.5 flex items-center justify-between group transition-all duration-150', conv.id === chatStore.currentConversationId ? 'bg-primary-50 text-primary-700 font-medium' : 'text-text-secondary hover:bg-surface-2']"
          >
            <input
              v-if="editingConvId === conv.id"
              ref="titleInputRef"
              v-model="editingTitle"
              @click.stop
              @keydown.enter="confirmEditTitle(conv.id)"
              @keydown.escape="cancelEditTitle"
              @blur="confirmEditTitle(conv.id)"
              maxlength="15"
              class="flex-1 min-w-0 text-xs bg-transparent border-b border-primary-400 outline-none py-0"
            />
            <span v-else class="truncate flex-1">{{ conv.title }}</span>
            <div class="flex items-center gap-0.5 ml-1 flex-shrink-0">
              <button v-if="editingConvId !== conv.id" @click.stop="startEditTitle(conv.id, conv.title)" class="opacity-0 group-hover:opacity-100 text-text-tertiary hover:text-text-primary transition-opacity" title="重命名">
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" /></svg>
              </button>
              <template v-if="confirmDeleteId === conv.id">
                <button @click.stop="chatStore.deleteConversation(conv.id); confirmDeleteId = null" class="text-red-500 hover:text-red-700 transition-colors" title="确认删除">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </button>
                <button @click.stop="confirmDeleteId = null" class="text-text-tertiary hover:text-text-primary transition-colors" title="取消">
                  <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </template>
              <button v-else @click.stop="confirmDeleteId = conv.id" :disabled="chatStore.isConversationStreaming(conv.id)" class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 disabled:opacity-20 disabled:cursor-not-allowed transition-opacity" title="删除">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <!-- Chat Area -->
      <div class="flex-1 flex flex-col bg-surface-0 relative min-w-0">
        <!-- 空态工作台：问候 + 大输入卡 + 场景胶囊 + 设置入口；发送首条消息时才真正建会话 -->
        <div v-if="!chatStore.currentConversationId" class="flex-1 flex flex-col items-center justify-center px-6 py-10 overflow-y-auto">
          <div class="w-[79%] max-w-[51rem] flex flex-col items-center">
            <h2 class="text-[30px] font-semibold text-text-primary tracking-tight mb-10 text-center leading-snug">{{ emptyGreeting }}</h2>

            <!-- 工具选择条（知识库/小工具/Skills/MCP）：空态与会话态共用 -->
            <div v-if="showToolbar" ref="toolbarRef" class="w-full mb-2">
              <div class="flex gap-2 flex-wrap">
                <!-- 知识库 -->
                <div class="relative">
                  <button @click="toolbarDropdown = toolbarDropdown === 'kb' ? '' : 'kb'" class="toolbar-select-btn">
                    知识库 <span v-if="tempKbIds.length" class="toolbar-count">{{ tempKbIds.length }}</span>
                    <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  <div v-if="toolbarDropdown === 'kb'" class="toolbar-dropdown toolbar-dropdown-down">
                    <label v-for="cat in kbStore.categories" :key="cat.id" class="toolbar-dropdown-item">
                      <input type="checkbox" :value="cat.id" v-model="tempKbIds" class="rounded w-3 h-3" />
                      <span class="truncate">{{ cat.name }}</span>
                    </label>
                    <div v-if="!kbStore.categories.length" class="text-[10px] text-text-disabled px-3 py-2">无可用分类</div>
                    <div v-if="currentBot?.cloud_kb_ids?.length" class="text-[10px] text-teal-600 dark:text-teal-300 px-3 py-2 border-t border-border-subtle">
                      已绑定 {{ currentBot.cloud_kb_ids.length }} 个云端知识库（随智能体下发，对话时自动在线检索）
                    </div>
                  </div>
                </div>
                <!-- 小工具 -->
                <div class="relative">
                  <button @click="toolbarDropdown = toolbarDropdown === 'skill' ? '' : 'skill'" class="toolbar-select-btn">
                    小工具 <span v-if="tempSkillIds.length" class="toolbar-count">{{ tempSkillIds.length }}</span>
                    <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  <div v-if="toolbarDropdown === 'skill'" class="toolbar-dropdown toolbar-dropdown-down">
                    <label v-for="s in userSkills" :key="s.id" class="toolbar-dropdown-item">
                      <input type="checkbox" :value="s.id" v-model="tempSkillIds" class="rounded w-3 h-3" />
                      <span class="truncate">{{ s.name }}</span>
                    </label>
                    <div v-if="!userSkills.length" class="text-[10px] text-text-disabled px-3 py-2">无可用小工具</div>
                  </div>
                </div>
                <!-- Skills -->
                <div class="relative">
                  <button @click="toolbarDropdown = toolbarDropdown === 'prompt' ? '' : 'prompt'" class="toolbar-select-btn">
                    Skills <span v-if="tempPromptSkillDirs.length" class="toolbar-count">{{ tempPromptSkillDirs.length }}</span>
                    <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  <div v-if="toolbarDropdown === 'prompt'" class="toolbar-dropdown toolbar-dropdown-down">
                    <label v-for="ps in promptSkillStore.skills" :key="ps.dirName" class="toolbar-dropdown-item">
                      <input type="checkbox" :value="ps.dirName" v-model="tempPromptSkillDirs" class="rounded w-3 h-3" />
                      <span class="truncate">{{ ps.name }}</span>
                    </label>
                    <div v-if="!promptSkillStore.skills.length" class="text-[10px] text-text-disabled px-3 py-2">无可用Skills</div>
                  </div>
                </div>
                <!-- MCP -->
                <div class="relative">
                  <button @click="toolbarDropdown = toolbarDropdown === 'mcp' ? '' : 'mcp'" class="toolbar-select-btn">
                    MCP <span v-if="tempMcpIds.length" class="toolbar-count">{{ tempMcpIds.length }}</span>
                    <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  <div v-if="toolbarDropdown === 'mcp'" class="toolbar-dropdown toolbar-dropdown-down">
                    <label
                      v-for="m in mcpStore.servers"
                      :key="m.id"
                      :class="['toolbar-dropdown-item', { disabled: !m.enabled }]"
                    >
                      <input type="checkbox" :value="m.id" v-model="tempMcpIds" :disabled="!m.enabled" class="rounded w-3 h-3" />
                      <span class="truncate">{{ m.name }}</span>
                      <span v-if="!m.enabled" class="text-[10px] text-text-disabled ml-auto">（未启用）</span>
                    </label>
                    <div v-if="!mcpStore.servers.length" class="text-[10px] text-text-disabled px-3 py-2">暂无 MCP 服务</div>
                  </div>
                </div>
              </div>
            </div>

            <div
              :class="['w-full flex flex-col bg-surface-0 rounded-[24px] border shadow-modal transition-all mb-5', dragging ? 'border-primary-500' : 'border-surface-3 focus-within:border-surface-4']"
              @dragover.prevent="dragging = true"
              @dragleave.prevent="dragging = false"
              @drop.prevent="handleDrop"
            >
              <div v-if="attachLimitMsg" class="px-4 pt-3 text-xs" style="color: var(--warn-fg)">最多添加 {{ MAX_ATTACHMENTS }} 个附件</div>
              <div v-if="attachmentError" class="px-4 pt-3 text-xs" style="color: var(--danger-fg)">{{ attachmentError }}</div>
              <div v-if="attachmentNotice" class="px-4 pt-3 text-xs" style="color: var(--warn-fg)">{{ attachmentNotice }}</div>
              <div v-if="loadingAttachment" class="px-4 pt-3 flex items-center gap-2 text-xs text-text-tertiary">
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                正在处理附件...
              </div>
              <div v-if="composerAssist.errorText.value" class="px-4 pt-3 text-[11px]" style="color: var(--danger-fg)">{{ composerAssist.errorText.value }}</div>
              <PromptTextarea
                ref="emptyInputEl"
                v-model="inputText"
                @paste="handlePaste"
                @submit="onEmptyStart"
                @tab="composerAssist.onTab"
                @optimize="composerAssist.optimize"
                title="开始任务"
                :min-height="56"
                :max-height="160"
                auto-grow
                hide-expand
                plain
                submit-on-enter
                inline-edit
                :show-count="false"
                :placeholder="dragging ? '松开以添加附件' : emptyPlaceholder"
                :ghost-text="composerAssist.suggestion.value"
                :tab-hint="true"
                :optimizing="composerAssist.busy.value === 'optimize'"
                container-class="mx-4 mt-4 mb-2"
                input-class="text-[15px] leading-normal"
              />
              <div v-if="pendingAttachments.length" class="flex gap-2 flex-wrap px-4 pb-2">
                <div v-for="(att, i) in pendingAttachments" :key="i" class="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-1 border border-surface-3 rounded-lg text-xs text-text-secondary">
                  <span class="max-w-[120px] truncate">{{ att.name }}</span>
                  <button type="button" @click="pendingAttachments.splice(i, 1)" class="text-text-tertiary hover:text-text-primary">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              <div class="px-3.5 pb-3.5">
                <ChatComposerToolbar
                  :disabled="chatStore.streaming"
                  :tools-open="showToolbar"
                  :active-tool-count="activeToolCount"
                  :permission-mode="draftToolApproval"
                  :bot-default="(currentBot?.tool_approval as any) || 'destructive'"
                  :chat-provider-id="draftChatModel.provider_id"
                  :chat-model-id="draftChatModel.model_id"
                  :show-image-model="!!currentBot?.enable_image_gen"
                  :image-provider-id="draftImageModel.provider_id"
                  :image-model-id="draftImageModel.model_id"
                  :can-send="!!(inputText.trim() || pendingAttachments.length) && !emptyStarting"
                  :send-title="emptyStartHint"
                  @attach="pickFile"
                  @gallery="openGalleryForChat"
                  @prompt="showQuickPrompt = true"
                  @tools="showToolbar = !showToolbar"
                  @permission-change="onDraftToolApprovalChange"
                  @chat-model-change="onDraftChatModelChange"
                  @image-model-change="onDraftImageModelChange"
                  @send="onEmptyStart"
                />
              </div>
            </div>

            <div class="w-full flex flex-wrap justify-center items-center gap-2">
              <button
                v-for="cap in visibleCapsules"
                :key="cap.key"
                type="button"
                @click="onCapsule(cap)"
                :class="cap.key === 'guide'
                  ? 'inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full bg-primary-600 text-white hover:bg-primary-500 transition-colors'
                  : 'px-3 py-1.5 text-xs rounded-full bg-surface-1 text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors'"
              >
                {{ cap.label }}
              </button>
              <button
                type="button"
                class="h-7 w-7 flex items-center justify-center rounded-full text-text-tertiary hover:text-text-primary hover:bg-surface-1 transition-colors"
                title="设置"
                @click="settingsUi.show()"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <template v-else>
          <!-- Messages -->
          <div ref="messagesContainer" class="flex-1 overflow-y-auto px-6 py-6" @click="onMessagesClick">
            <div class="max-w-3xl mx-auto space-y-5">
              <div v-for="msg in renderedMessages" :key="msg.id" :class="['flex gap-3 group/msg', msg.role === 'user' ? 'flex-row-reverse' : '']">
                <div v-if="msg.role === 'user'" class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold bg-primary-600 text-white">你</div>
                <div v-else class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold bg-primary-100 text-primary-700">{{ botInitial }}</div>
                <div :class="['max-w-[75%] relative', msg.role === 'user' ? 'flex flex-col items-end' : 'min-w-0']">
                  <div v-if="msg.role === 'user'" class="w-full flex flex-col items-end">
                    <div v-if="editingMsgId === msg.id" class="w-full flex flex-col gap-1.5">
                      <textarea v-model="editingText" rows="3" class="w-full px-3 py-2 text-sm rounded-xl border border-primary-300 bg-surface-0 text-text-primary resize-y focus:outline-none focus:ring-1 focus:ring-primary-400"></textarea>
                      <div class="flex gap-2 justify-end">
                        <button @click="cancelEdit" class="px-3 py-1 text-xs rounded-lg border border-surface-3 text-text-secondary hover:bg-surface-2 transition-colors">取消</button>
                        <button @click="confirmEdit(msg.id)" class="px-3 py-1 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors">保存并重发</button>
                      </div>
                    </div>
                    <template v-else>
                      <div :class="['text-sm px-4 py-3 rounded-2xl rounded-br-md text-white whitespace-pre-wrap leading-relaxed select-text', msg.failed ? 'bg-red-500/90' : 'bg-primary-600']">
                        {{ msg.content }}
                      </div>
                      <div v-if="msg.failed" class="mt-1 text-[11px] text-red-500">发送失败，请重新发送</div>
                    </template>
                  </div>
                  <template v-else>
                    <div v-if="msg._reasoning" class="mb-1.5">
                      <button
                        @click="msg._reasoningActive ? (msg._reasoningActive = false) : (msg._reasoningCollapsed = !msg._reasoningCollapsed)"
                        class="flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors px-2 py-1 rounded-lg hover:bg-surface-2"
                      >
                        <svg :class="['w-3 h-3 transition-transform', (msg._reasoningActive || !msg._reasoningCollapsed) ? 'rotate-90' : '']" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7" /></svg>
                        <svg v-if="msg._reasoningActive" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        {{ msg._reasoningActive ? '思考中…' : '已深度思考' }}
                      </button>
                      <div v-if="msg._reasoningActive || !msg._reasoningCollapsed" class="mt-1 max-h-48 overflow-y-auto rounded-lg bg-surface-2/40 border-l-2 border-surface-4 px-3 py-2 text-[11px] text-text-tertiary leading-relaxed whitespace-pre-wrap">{{ msg._reasoning }}</div>
                    </div>
                    <div v-if="msg._toolLogs?.length" class="mb-1.5">
                      <button
                        @click="msg._toolActive ? (msg._toolActive = false) : (msg._collapsed = !msg._collapsed)"
                        class="flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors px-2 py-1 rounded-lg hover:bg-surface-2"
                      >
                        <svg :class="['w-3 h-3 transition-transform', (msg._toolActive || !msg._collapsed) ? 'rotate-90' : '']" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m9 5 7 7-7 7" /></svg>
                        <svg v-if="msg._toolActive" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        {{ msg._toolLogs.length }} 步工具调用
                      </button>
                      <div v-if="msg._toolActive || !msg._collapsed" class="mt-1 max-h-32 overflow-y-auto rounded-lg bg-surface-2/50 border border-surface-3 px-3 py-2 text-[11px] font-mono text-text-tertiary leading-relaxed whitespace-pre-wrap">{{ msg._toolLogs.join('\n') }}</div>
                    </div>
                    <AskUserCard
                      v-if="msg.card && msg.card.type === 'ask_user'"
                      :card="msg.card"
                      @submit="(payload) => onCardSubmit(msg, payload)"
                    />
                    <ImageParamsCard
                      v-else-if="msg.card && msg.card.type === 'image_params'"
                      :card="msg.card"
                      @submit="(payload) => onCardSubmit(msg, payload)"
                    />
                    <div v-else class="text-sm px-4 py-3 rounded-2xl rounded-bl-md bg-surface-0 text-text-primary shadow-card prose prose-sm dark:prose-invert max-w-none select-text" v-html="msg.id === '__live__' ? renderMarkdownLive(msg.content || '...') : renderMarkdown(msg.content || '...')"></div>
                    <!-- 从中断处继续生成（仅末条、被中断/报错、且当前未在流式时显示） -->
                    <button
                      v-if="msg.role === 'assistant' && msg.id === lastAssistantId && !chatStore.streaming && isContinuable(msg.content)"
                      @click="chatStore.continueGenerate()"
                      class="mt-2 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-surface-3 bg-surface-0 text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
                      title="保留已生成的内容，让模型接着写"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                      继续生成
                    </button>
                  </template>
                  <div v-if="msg.attachments?.length" class="mt-1.5 flex gap-1.5 flex-wrap" :class="msg.role === 'user' ? 'justify-end' : ''">
                    <template v-for="(att, i) in msg.attachments" :key="i">
                      <img v-if="att.type === 'image' && att.data" :src="att.data" @click="previewImage = att.data" class="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity border border-surface-3" :alt="att.name" />
                      <div v-else class="text-xs px-2.5 py-1 bg-surface-2 rounded-md text-text-secondary">{{ att.name || att.type }}</div>
                    </template>
                  </div>
                  <button
                    @click="copyMessage(msg)"
                    :class="['absolute opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-tertiary hover:text-text-primary', msg.role === 'user' ? '-left-8 top-1' : '-right-8 top-1']"
                    :title="copiedId === msg.id ? '已复制' : '复制'"
                  >
                    <svg v-if="copiedId !== msg.id" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                    <svg v-else class="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  </button>
                  <!-- 编辑并重发(用户消息) -->
                  <button
                    v-if="msg.role === 'user' && editingMsgId !== msg.id && !chatStore.streaming"
                    @click="startEdit(msg)"
                    class="absolute -left-8 top-9 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-tertiary hover:text-text-primary"
                    title="编辑并重发"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                  <!-- 重新生成(最后一条助手消息) -->
                  <button
                    v-if="msg.role === 'assistant' && msg.id === lastAssistantId && !chatStore.streaming"
                    @click="chatStore.regenerate()"
                    class="absolute -right-8 top-[4.25rem] opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-tertiary hover:text-text-primary"
                    title="重新生成"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  </button>
                  <!-- 删除此消息 -->
                  <button
                    v-if="!chatStore.streaming"
                    @click="chatStore.deleteMessage(msg.id)"
                    :class="['absolute opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded-lg bg-surface-2 hover:bg-red-50 text-text-tertiary hover:text-red-600', msg.role === 'user' ? '-left-8 top-[6.25rem]' : '-right-8 top-[6.25rem]']"
                    title="删除此消息"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
                  </button>
                  <div
                    v-if="msg.role === 'assistant'"
                    :data-dispatch-id="msg.id"
                    class="absolute -right-8 top-9"
                  >
                    <button
                      @click.stop="toggleDispatchMenu(msg.id)"
                      :class="['transition-opacity p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-tertiary hover:text-text-primary', dispatchMenuId === msg.id ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100']"
                      title="发送到"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                    </button>
                    <div v-if="dispatchMenuId === msg.id" class="absolute right-0 top-full mt-1 w-32 py-1 rounded-lg bg-surface-0 border border-surface-3 shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-20">
                      <button @click.stop="dispatchTo('imageGen', msg)" class="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors">AI 生图</button>
                      <button @click.stop="dispatchTo('batchGen', msg)" class="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors">批量生图</button>
                      <button @click.stop="dispatchTo('canvasOrchestrate', msg)" class="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors">流式画布</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Toolbar -->
          <div v-if="showToolbar" ref="toolbarRef" class="border-t border-surface-3 px-4 py-2.5 bg-surface-0">
            <div class="max-w-3xl mx-auto flex gap-2 flex-wrap">
              <!-- 知识库 -->
              <div class="relative">
                <button @click="toolbarDropdown = toolbarDropdown === 'kb' ? '' : 'kb'" class="toolbar-select-btn">
                  知识库 <span v-if="tempKbIds.length" class="toolbar-count">{{ tempKbIds.length }}</span>
                  <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                </button>
                <div v-if="toolbarDropdown === 'kb'" class="toolbar-dropdown">
                  <label v-for="cat in kbStore.categories" :key="cat.id" class="toolbar-dropdown-item">
                    <input type="checkbox" :value="cat.id" v-model="tempKbIds" class="rounded w-3 h-3" />
                    <span class="truncate">{{ cat.name }}</span>
                  </label>
                  <div v-if="!kbStore.categories.length" class="text-[10px] text-text-disabled px-3 py-2">无可用分类</div>
                  <div v-if="currentBot?.cloud_kb_ids?.length" class="text-[10px] text-teal-600 dark:text-teal-300 px-3 py-2 border-t border-border-subtle">
                    已绑定 {{ currentBot.cloud_kb_ids.length }} 个云端知识库（随智能体下发，对话时自动在线检索）
                  </div>
                </div>
              </div>
              <!-- 小工具 -->
              <div class="relative">
                <button @click="toolbarDropdown = toolbarDropdown === 'skill' ? '' : 'skill'" class="toolbar-select-btn">
                  小工具 <span v-if="tempSkillIds.length" class="toolbar-count">{{ tempSkillIds.length }}</span>
                  <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                </button>
                <div v-if="toolbarDropdown === 'skill'" class="toolbar-dropdown">
                  <label v-for="s in userSkills" :key="s.id" class="toolbar-dropdown-item">
                    <input type="checkbox" :value="s.id" v-model="tempSkillIds" class="rounded w-3 h-3" />
                    <span class="truncate">{{ s.name }}</span>
                  </label>
                  <div v-if="!userSkills.length" class="text-[10px] text-text-disabled px-3 py-2">无可用小工具</div>
                </div>
              </div>
              <!-- Skills -->
              <div class="relative">
                <button @click="toolbarDropdown = toolbarDropdown === 'prompt' ? '' : 'prompt'" class="toolbar-select-btn">
                  Skills <span v-if="tempPromptSkillDirs.length" class="toolbar-count">{{ tempPromptSkillDirs.length }}</span>
                  <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                </button>
                <div v-if="toolbarDropdown === 'prompt'" class="toolbar-dropdown">
                  <label v-for="ps in promptSkillStore.skills" :key="ps.dirName" class="toolbar-dropdown-item">
                    <input type="checkbox" :value="ps.dirName" v-model="tempPromptSkillDirs" class="rounded w-3 h-3" />
                    <span class="truncate">{{ ps.name }}</span>
                  </label>
                  <div v-if="!promptSkillStore.skills.length" class="text-[10px] text-text-disabled px-3 py-2">无可用Skills</div>
                </div>
              </div>
              <!-- MCP -->
              <div class="relative">
                <button @click="toolbarDropdown = toolbarDropdown === 'mcp' ? '' : 'mcp'" class="toolbar-select-btn">
                  MCP <span v-if="tempMcpIds.length" class="toolbar-count">{{ tempMcpIds.length }}</span>
                  <svg class="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                </button>
                <div v-if="toolbarDropdown === 'mcp'" class="toolbar-dropdown">
                  <label
                    v-for="m in mcpStore.servers"
                    :key="m.id"
                    :class="['toolbar-dropdown-item', { disabled: !m.enabled }]"
                  >
                    <input type="checkbox" :value="m.id" v-model="tempMcpIds" :disabled="!m.enabled" class="rounded w-3 h-3" />
                    <span class="truncate">{{ m.name }}</span>
                    <span v-if="!m.enabled" class="text-[10px] text-text-disabled ml-auto">（未启用）</span>
                  </label>
                  <div v-if="!mcpStore.servers.length" class="text-[10px] text-text-disabled px-3 py-2">暂无 MCP 服务</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Input -->
          <div class="px-4 pb-4 pt-2 bg-surface-0">
            <div class="max-w-3xl mx-auto">
              <div v-if="attachLimitMsg" class="flex items-center gap-2 mb-2 px-1 text-xs" style="color: var(--warn-fg)">
                最多添加 {{ MAX_ATTACHMENTS }} 个附件
              </div>
              <div v-if="attachmentError" class="flex items-center gap-2 mb-2 px-1 text-xs" style="color: var(--danger-fg)">
                {{ attachmentError }}
              </div>
              <div v-if="attachmentNotice" class="flex items-center gap-2 mb-2 px-1 text-xs" style="color: var(--warn-fg)">
                {{ attachmentNotice }}
              </div>
              <div v-if="loadingAttachment" class="flex items-center gap-2 mb-2 px-1 text-xs text-text-tertiary">
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                正在处理附件...
              </div>
              <div v-if="composerAssist.errorText.value" class="mb-2 px-1 text-[11px]" style="color: var(--danger-fg)">{{ composerAssist.errorText.value }}</div>
              <!-- 输入整卡：PromptTextarea + 底部 Composer 工具栏（附件/提示词/工具 + 模型切换 + 发送） -->
              <div
                :class="['flex flex-col bg-surface-0 rounded-[24px] border shadow-modal transition-all', dragging ? 'border-primary-500' : 'border-surface-3 focus-within:border-surface-4']"
                @dragover.prevent="dragging = true"
                @dragleave.prevent="dragging = false"
                @drop.prevent="handleDrop"
              >
                <PromptTextarea
                  ref="inputEl"
                  v-model="inputText"
                  @paste="handlePaste"
                  @submit="send"
                  @tab="composerAssist.onTab"
                  @optimize="composerAssist.optimize"
                  title="编辑消息"
                  :min-height="48"
                  :max-height="160"
                  auto-grow
                  hide-expand
                  plain
                  submit-on-enter
                  inline-edit
                  :show-count="false"
                  :placeholder="dragging ? '松开以添加附件' : '输入消息，按 Enter 发送...'"
                  :ghost-text="composerAssist.suggestion.value"
                  :tab-hint="true"
                  :optimizing="composerAssist.busy.value === 'optimize'"
                  container-class="mx-4 mt-3.5 mb-1"
                  input-class="text-[15px] leading-normal"
                />
                <div v-if="pendingAttachments.length" class="flex gap-2 flex-wrap px-4 pb-2">
                  <div v-for="(att, i) in pendingAttachments" :key="i" class="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-1 border border-surface-3 rounded-lg text-xs text-text-secondary">
                    <svg v-if="att.type === 'image'" class="w-3.5 h-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                    <svg v-else class="w-3.5 h-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125.504 1.125 1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                    <span class="max-w-[120px] truncate">{{ att.name }}</span>
                    <button @click="pendingAttachments.splice(i, 1)" class="text-text-tertiary hover:text-text-primary ml-0.5">
                      <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
                <div class="px-3.5 pb-3.5">
                  <ChatComposerToolbar
                    :tools-open="showToolbar"
                    :active-tool-count="activeToolCount"
                    :permission-mode="chatStore.currentConversation?.tool_approval || ''"
                    :bot-default="(currentBot?.tool_approval as any) || 'destructive'"
                    :chat-provider-id="chatStore.currentConversation?.active_model_provider_id || ''"
                    :chat-model-id="chatStore.currentConversation?.active_model_id || ''"
                    :show-image-model="!!currentBot?.enable_image_gen"
                    :image-provider-id="chatStore.currentConversation?.active_image_provider_id || ''"
                    :image-model-id="chatStore.currentConversation?.active_image_model_id || ''"
                    :can-send="!!(inputText.trim() || pendingAttachments.length)"
                    :streaming="chatStore.streaming"
                    :cancelling="chatStore.isCancelling()"
                    @attach="pickFile"
                    @gallery="openGalleryForChat"
                    @prompt="showQuickPrompt = true"
                    @tools="showToolbar = !showToolbar"
                    @permission-change="onToolApprovalChange"
                    @chat-model-change="onChatModelChange"
                    @image-model-change="onImageModelChange"
                    @send="send"
                    @cancel="chatStore.cancel()"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>

  <!-- Quick Prompt Modal -->
  <div v-if="showQuickPrompt" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="showQuickPrompt = false">
    <div class="w-[520px] max-h-[70vh] bg-surface-0 border border-surface-3 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] flex flex-col">
      <div class="px-5 pt-4 pb-3 border-b border-surface-3">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-text-primary">快捷提示词</h3>
          <div class="flex items-center gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer" @click.stop="toggleQuickDirectSend">
              <div :class="['w-7 h-4 rounded-full transition-colors relative', quickDirectSend ? 'bg-primary-600' : 'bg-surface-4']">
                <div :class="['absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm', quickDirectSend ? 'left-3.5' : 'left-0.5']"></div>
              </div>
              <span class="text-[10px] text-text-tertiary">直接发送</span>
            </label>
            <button @click="showQuickPrompt = false" class="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <input v-model="quickPromptSearch" placeholder="搜索提示词..." class="w-full px-3 py-2 text-xs border border-surface-3 rounded-lg bg-surface-1 outline-none focus:ring-2 focus:ring-primary-500" />
        <div v-if="quickCategories.length" class="flex flex-wrap gap-1.5 mt-2.5">
          <button
            @click="quickPromptCategory = ''"
            :class="['px-2.5 py-1 text-[10px] rounded-md transition-colors', !quickPromptCategory ? 'bg-primary-600 text-white' : 'bg-surface-2 text-text-secondary hover:bg-surface-3']"
          >全部</button>
          <button
            v-for="cat in quickCategories"
            :key="cat.id"
            @click="quickPromptCategory = quickPromptCategory === cat.id ? '' : cat.id"
            :class="['px-2.5 py-1 text-[10px] rounded-md transition-colors', quickPromptCategory === cat.id ? 'bg-primary-600 text-white' : 'bg-surface-2 text-text-secondary hover:bg-surface-3']"
          >{{ cat.name }}</button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <template v-if="pagedQuickPresets.length">
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="item in pagedQuickPresets"
              :key="item.id"
              @click="selectQuickPrompt(item.content)"
              class="text-left px-3 py-2.5 rounded-xl border border-surface-3 hover:border-primary-400 hover:bg-primary-50 transition-colors"
            >
              <div class="text-xs font-medium text-text-primary mb-0.5">{{ item.label }}</div>
              <div class="text-[10px] text-text-tertiary line-clamp-2">{{ item.content }}</div>
              <div class="text-[9px] text-text-disabled mt-1">{{ item.categoryName }}</div>
            </button>
          </div>
        </template>
        <div v-else class="text-center py-8 text-xs text-text-tertiary">
          暂无快捷提示词，请在提示词管理中添加
        </div>
      </div>
      <div v-if="quickTotalPages > 1" class="flex items-center justify-center gap-2 px-5 py-2.5 border-t border-surface-3">
        <button @click="quickPage = Math.max(1, quickPage - 1)" :disabled="quickPage <= 1" class="px-2 py-1 text-[10px] rounded-md bg-surface-2 text-text-secondary hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">上一页</button>
        <span class="text-[10px] text-text-tertiary">{{ quickPage }} / {{ quickTotalPages }}</span>
        <button @click="quickPage = Math.min(quickTotalPages, quickPage + 1)" :disabled="quickPage >= quickTotalPages" class="px-2 py-1 text-[10px] rounded-md bg-surface-2 text-text-secondary hover:bg-surface-3 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">下一页</button>
      </div>
    </div>
  </div>

  <!-- Image Preview -->
  <ImageLightbox :src="previewImage" :on-locate="previewLocate" @close="previewImage = null" />

  <!-- Tool Approval Modal -->
  <div v-if="pendingApproval" class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
    <div :class="['pointer-events-auto max-w-[90vw] rounded-xl bg-surface-0 shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-surface-3 overflow-hidden flex flex-col', approvalPreview ? 'w-[720px] max-h-[80vh]' : 'w-[480px]']">
      <div class="px-5 py-3 border-b border-surface-3 flex items-center gap-2 flex-shrink-0">
        <svg class="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
        <div class="text-sm font-semibold text-text-primary">调用工具确认</div>
      </div>
      <div class="px-5 py-4 space-y-3 overflow-y-auto">
        <div class="text-xs text-text-secondary">AI 请求调用工具 <code class="px-1.5 py-0.5 rounded bg-surface-2 text-primary-700 font-mono text-[11px]">{{ pendingApproval.tool }}</code>，是否允许？</div>

        <!-- File write/append preview with line diff -->
        <template v-if="approvalPreview && approvalPreview.type === 'file_write'">
          <div class="flex items-center gap-2 text-[11px]">
            <span :class="['px-1.5 py-0.5 rounded font-medium', approvalPreview.exists ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300']">{{ approvalPreview.exists ? '修改文件' : '新建文件' }}</span>
            <code class="font-mono text-text-secondary truncate flex-1" :title="approvalPreview.path">{{ approvalPreview.path }}</code>
            <span v-if="approvalDiffSummary" class="font-mono"><span class="text-emerald-600 dark:text-emerald-400">+{{ approvalDiffSummary.adds }}</span> <span class="text-red-500 dark:text-red-400">-{{ approvalDiffSummary.dels }}</span></span>
          </div>
          <div v-if="approvalPreview.tooLarge" class="text-[11px] text-text-tertiary">原文件超过 200KB，仅展示新内容预览。允许后原文件将被覆盖（同路径 .bak 会保留备份）。</div>
          <div v-else-if="approvalPreview.isBinary" class="text-[11px] text-text-tertiary">原文件为二进制，仅展示新内容预览。允许后同路径 .bak 保留备份。</div>
          <div class="rounded-lg border border-surface-3 overflow-hidden text-[11px] font-mono leading-relaxed max-h-[50vh] overflow-y-auto">
            <div v-for="(ln, i) in approvalDiffLines" :key="i" :class="['px-3 py-0.5 whitespace-pre-wrap break-words', ln.cls]"><span class="select-none mr-2 text-text-tertiary">{{ ln.sigil }}</span>{{ ln.text }}</div>
            <div v-if="approvalDiffTruncated" class="px-3 py-1 text-text-tertiary text-center bg-surface-2">… 剩余差异已省略</div>
          </div>
        </template>

        <!-- run_command preview -->
        <template v-else-if="pendingApproval.tool === 'run_command' && pendingApproval.args?.command">
          <div class="text-[11px] text-text-secondary">将执行命令：</div>
          <pre class="text-[12px] font-mono leading-relaxed bg-surface-2 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-amber-700">{{ pendingApproval.args.command }}</pre>
          <div v-if="pendingApproval.args.cwd" class="text-[11px] text-text-tertiary">工作目录：<code class="font-mono">{{ pendingApproval.args.cwd }}</code></div>
        </template>

        <!-- file_ops read preview -->
        <template v-else-if="approvalReadPreview">
          <div class="flex items-center gap-2 text-[11px]">
            <span :class="['px-1.5 py-0.5 rounded font-medium whitespace-nowrap', approvalReadPreview.outsideWorkspace ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300']">{{ approvalReadPreview.outsideWorkspace ? '读取工作区外文件' : '读取文件' }}</span>
            <code class="font-mono text-text-secondary truncate flex-1" :title="approvalReadPreview.path">{{ approvalReadPreview.path }}</code>
          </div>
          <div v-if="approvalReadPreview.outsideWorkspace" class="text-[11px] text-text-tertiary leading-relaxed">该路径在工作区之外，读取后内容会发送给 AI。请确认其中无敏感信息再允许。可在「设置 → 文件读取安全」将常用目录加入白名单，免去重复确认。</div>
        </template>

        <!-- Generic args fallback -->
        <pre v-else class="text-[11px] font-mono leading-relaxed bg-surface-2 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-text-secondary">{{ formattedApprovalArgs }}</pre>
      </div>
      <div class="px-5 py-3 border-t border-surface-3 flex justify-end gap-2 flex-shrink-0">
        <button @click="respondApproval(false)" class="px-3 py-1.5 text-xs rounded-lg border border-surface-3 hover:bg-surface-2 text-text-secondary">拒绝</button>
        <button @click="respondApproval(true)" class="px-3 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700">允许执行</button>
      </div>
    </div>
  </div>
  <GalleryPicker v-model:visible="showGalleryPicker" :multiple="true" @select="onGallerySelectForChat" />
  <LowBalanceModal
    v-model:visible="lowBalanceOpen"
    :balance-type="lowBalanceState.balanceType"
    :required="lowBalanceState.required"
    :available="lowBalanceState.available"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useChatStore, isContinuable } from '@/stores/chat'
import { useHandoffStore } from '@/stores/handoff'
import { useBotStore } from '@/stores/bots'
import type { ToolApproval } from '@/stores/bots'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useSkillStore } from '@/stores/skills'
import { useMcpStore } from '@/stores/mcps'
import { usePromptSkillStore } from '@/stores/prompt-skills'
import { usePromptPresetStore } from '@/stores/prompt-presets'
import { useModelStore } from '@/stores/models'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { hasCap } from '@/utils/model-caps'
import { useSiteConfigStore } from '@/stores/site-config'
import { renderMarkdown, renderMarkdownLive, resolveLocalFileTarget } from '@/utils/markdown'
import { stripImageMetadata } from '@shared/strip-image-metadata'
import { CLOUD_KEY_SEP, stripModelId } from '@shared/model-id'
import GalleryPicker from '@/components/GalleryPicker.vue'
import ImageLightbox from '@/components/ImageLightbox.vue'
import ChatComposerToolbar from '@/components/ChatComposerToolbar.vue'
import LowBalanceModal from '@/components/LowBalanceModal.vue'
import PromptTextarea from '@/components/PromptTextarea.vue'
import AskUserCard from '@/components/AskUserCard.vue'
import ImageParamsCard from '@/components/ImageParamsCard.vue'
import { useSettingsUiStore } from '@/stores/settings-ui'
import { useComposerAssist } from '@/composables/useComposerAssist'
import WindowControls from '@/components/WindowControls.vue'

const route = useRoute()
const router = useRouter()
const handoff = useHandoffStore()
const chatStore = useChatStore()
const botStore = useBotStore()
const modelStore = useModelStore()
const cloudAuth = useCloudAuthStore()
const siteConfigStore = useSiteConfigStore()
const settingsUi = useSettingsUiStore()

// 平台判断：/chat 路由下 MainLayout 隐藏全局顶栏，本页 header 兼任窗口拖拽区（与 MainLayout 同一判定）
const platform = ((window as any).electron?.process?.platform || (window as any).runtimeConfig?.platform || '')
const isWin = platform === 'win32'
const isMac = platform === 'darwin'

/** 顶栏拖拽区双击 = 切换最大化（与 MainLayout 同一行为） */
function onHeaderDblClick(e: MouseEvent) {
  if (!isWin) return
  const target = e.target as HTMLElement
  if (target.closest('button, a, input, select, [role="button"]')) return
  ;(window as any).api?.window?.maximize?.()
}
const kbStore = useKnowledgeStore()
const skillStore = useSkillStore()
const CORE_TOOL_NAMES = ['file_ops', 'run_command', 'image_gen']
const userSkills = computed(() =>
  skillStore.skills.filter((s) => !CORE_TOOL_NAMES.includes(s.function_def?.name))
)
const mcpStore = useMcpStore()
// MCP 弹层只展示「已启用」的服务器，避免误把 disabled 项一并选中
const enabledMcpServers = computed(() => mcpStore.servers.filter((s) => s.enabled))
const promptSkillStore = usePromptSkillStore()
const presetStore = usePromptPresetStore()

const bots = ref<any[]>([])
const selectedBotId = ref('')
const restoringState = ref(false)
const showBotSelector = ref(false)
const inputText = ref('')
const lowBalanceOpen = ref(false)
const lowBalanceState = ref({ balanceType: 'token', required: 0, available: 0 })
const messagesContainer = ref<HTMLElement | null>(null)
const inputEl = ref<InstanceType<typeof PromptTextarea> | null>(null)
const emptyInputEl = ref<InstanceType<typeof PromptTextarea> | null>(null)
const botSelectorRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const pendingAttachments = ref<{ name: string; type: string; data: string }[]>([])
const showGalleryPicker = ref(false)
const showToolbar = ref(false)
const toolbarDropdown = ref('')
const tempKbIds = ref<string[]>([])
const tempSkillIds = ref<string[]>([])
const tempMcpIds = ref<string[]>([])
const tempPromptSkillDirs = ref<string[]>([])

// === 空态工作台：draft 模型（未建会话时的模型选择，发送时随 createConversation 落库） ===
const draftChatModel = ref<{ provider_id: string; model_id: string }>({ provider_id: '', model_id: '' })
const draftImageModel = ref<{ provider_id: string; model_id: string }>({ provider_id: '', model_id: '' })

function onDraftChatModelChange(val: { provider_id: string; model_id: string }) {
  draftChatModel.value = { provider_id: val.provider_id, model_id: val.model_id }
}
function onDraftImageModelChange(val: { provider_id: string; model_id: string }) {
  draftImageModel.value = { provider_id: val.provider_id, model_id: val.model_id }
}

// === 会话级工具权限档：会话态写库覆盖；空态先记 draft，建会话时落库 ===
const draftToolApproval = ref<ToolApproval | ''>('')
function onDraftToolApprovalChange(mode: ToolApproval) {
  draftToolApproval.value = mode
}
async function onToolApprovalChange(mode: ToolApproval) {
  const id = chatStore.currentConversationId
  if (!id) {
    draftToolApproval.value = mode
    return
  }
  await chatStore.updateConversationToolApproval(id, mode)
}

function syncDraftModelFromDefault() {
  if (!draftChatModel.value.model_id) {
    const m = resolveDefaultModel()
    if (m.model_id) draftChatModel.value = { ...m }
  }
  if (!draftImageModel.value.model_id) {
    const im = resolveDefaultImageModel()
    if (im.model_id) draftImageModel.value = { ...im }
  }
}

// === 空态工作台：问候语 / 占位文案 / 场景胶囊 ===
const emptyGreeting = computed(() => {
  const h = new Date().getHours()
  if (h < 5) return '夜深了，需要把思路整理成文档吗？'
  if (h < 11) return '早上好，今天想写、查还是改？'
  if (h < 14) return '中午好，要推进哪项任务？'
  if (h < 18) return '下午好，把想法变成可执行任务吧'
  return '晚上好，有什么我可以帮你的？'
})
const emptyPlaceholder = computed(() => '请你帮我研究一下最近一天的最新 AI 新闻')

type SceneCapsule = { key: string; label: string; kind: 'route' | 'prompt' | 'more'; to?: string; prompt?: string }
const extraCapsules: SceneCapsule[] = [
  { key: 'ai-video', label: 'AI 视频', kind: 'route', to: '/ai-video' },
  { key: 'canvas', label: '流式画布', kind: 'route', to: '/canvas' },
  { key: 'toolkit', label: '图像处理', kind: 'route', to: '/image-toolkit' }
]
const showMoreCapsules = ref(false)
const sceneCapsules = computed<SceneCapsule[]>(() => [
  { key: 'guide', label: '引导帮助', kind: 'prompt', prompt: '请用简洁步骤引导我完成今天最重要的一件事：先问清目标，再给出可执行清单。\n' },
  { key: 'write', label: '写作', kind: 'prompt', prompt: '帮我把下面这个想法整理成一篇结构清晰的文稿：\n' },
  { key: 'ppt', label: 'PPT', kind: 'prompt', prompt: '请根据主题输出一份 PPT 大纲：每页标题、要点、建议配图说明。主题：\n' },
  { key: 'research', label: '调研报告', kind: 'prompt', prompt: '请围绕主题输出一份调研报告提纲，含背景、问题清单、资料来源建议与结论结构：\n' },
  { key: 'image', label: 'AI 生图', kind: 'route', to: '/image-gen' },
  { key: 'more', label: '更多', kind: 'more' }
])
const visibleCapsules = computed(() => {
  const base = sceneCapsules.value.filter((c) => c.key !== 'more')
  const more = sceneCapsules.value.find((c) => c.key === 'more')
  const list = showMoreCapsules.value ? [...base, ...extraCapsules] : base
  return more ? [...list, more] : list
})

function goToImageGenWithDraft() {
  const refs = pendingAttachments.value
    .filter((a) => a.type === 'image' && a.data)
    .map((a) => a.data)
    .slice(0, 10)
  const prompt = inputText.value.trim()
  if (prompt || refs.length) {
    handoff.set('imageGen', { prompt, refImages: refs.length ? refs : undefined })
  }
  router.push({ name: 'imageGen' })
}

async function onCapsule(cap: SceneCapsule) {
  if (cap.kind === 'more') {
    showMoreCapsules.value = !showMoreCapsules.value
    return
  }
  if (cap.key === 'image') {
    goToImageGenWithDraft()
    return
  }
  if (cap.kind === 'route' && cap.to) {
    router.push(cap.to)
    return
  }
  if (cap.kind === 'prompt' && cap.prompt) {
    inputText.value = cap.prompt
    await nextTick()
    emptyInputEl.value?.focus()
  }
}

/** 空态发送：先建会话再走既有 send() */
const emptyStarting = ref(false)

// === 输入辅助：500ms 防抖补全（ghost text）+ Tab 接受 / 无补全时 Tab 一键优化提示词 ===
// 模型跟随当前会话模型，空态跟随 draft 模型；未选模型时自动静默不启用
const composerAssist = useComposerAssist({
  text: inputText,
  providerId: () => chatStore.currentConversation?.active_model_provider_id || draftChatModel.value.provider_id,
  modelId: () => chatStore.currentConversation?.active_model_id || draftChatModel.value.model_id
})
// 切会话/新建对话时丢弃未完成的补全请求与建议
watch(() => chatStore.currentConversationId, () => composerAssist.cancel())
const emptyStartHint = computed(() => {
  if (!inputText.value.trim() && !pendingAttachments.value.length) return '请先输入内容'
  if (emptyStarting.value) return '正在创建对话…'
  return '开始对话'
})

async function onEmptyStart() {
  if (emptyStarting.value) return
  emptyStarting.value = true
  try {
    await sendFromEmpty()
  } catch (e: any) {
    console.error('[chat] empty start failed:', e)
    ;(window as any).api?.nativeDialog?.alert?.(e?.message || '无法开始对话，请重试')
  } finally {
    emptyStarting.value = false
  }
}

async function sendFromEmpty() {
  const text = inputText.value.trim()
  if (!text && !pendingAttachments.value.length) return
  // 空态必须落到一个智能体：未选时取第一个；一个都没有则提示先建
  if (!selectedBotId.value) {
    if (bots.value.length) {
      selectedBotId.value = bots.value[0].id
    } else {
      throw new Error('请先在「智能体」页创建一个智能体')
    }
  }
  // 显式等待 bot 上下文就绪：watch(selectedBotId) 的异步 fetch 不保证时序，
  // currentBotId 未就绪时 sendMessage 会静默 return，把用户输入吞掉
  if ((chatStore.currentBotId ?? '') !== selectedBotId.value) {
    await chatStore.fetchConversations(selectedBotId.value)
  }
  if (chatStore.streaming) {
    throw new Error('当前仍有回复在进行中，请稍候或先点停止')
  }
  syncDraftModelFromDefault()
  const initialModel = draftChatModel.value.model_id ? draftChatModel.value : resolveDefaultModel()
  if (!initialModel.model_id) {
    throw new Error('暂无可用对话模型，请先在「模型服务」页配置或确认套餐权限')
  }
  const initialImageModel = draftImageModel.value.model_id ? draftImageModel.value : resolveDefaultImageModel()
  const conv = await chatStore.createConversation(
    selectedBotId.value,
    undefined,
    initialModel,
    initialImageModel.model_id ? initialImageModel : undefined
  )
  // 先存草稿再选会话：watch(currentConversationId) 触发 loadDraftFor 时把输入原样还原
  saveDraftFor(conv.id)
  await chatStore.selectConversation(conv.id)
  // 空态选过的权限档随建会话落库（空串 = 继承智能体默认，无需写）
  if (draftToolApproval.value) {
    await chatStore.updateConversationToolApproval(conv.id, draftToolApproval.value)
  }
  await send()
}

const editingConvId = ref<string | null>(null)
const editingTitle = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const confirmDeleteId = ref<string | null>(null)
const copiedId = ref<string | null>(null)
const editingMsgId = ref<string>('')
const editingText = ref<string>('')

function startEdit(msg: any) {
  editingMsgId.value = msg.id
  editingText.value = typeof msg.content === 'string' ? msg.content : ''
}
function cancelEdit() {
  editingMsgId.value = ''
  editingText.value = ''
}
async function confirmEdit(id: string) {
  const text = editingText.value
  editingMsgId.value = ''
  editingText.value = ''
  await chatStore.editMessage(id, text)
}
const previewImage = ref<string | null>(null)
// 预览图为本地文件（local-file://）时给 Lightbox 传「打开所在文件夹」回调；
// http(s)/data: 等远程或内联图无本地位置，返回 undefined——组件内对应按钮自动隐藏。
const previewLocate = computed(() => {
  const src = previewImage.value
  if (!src || !src.startsWith('local-file:')) return undefined
  return () => {
    const p = resolveLocalFileTarget(src)
    if (p) (window as any).api.shell.showItemInFolder(p)
  }
})
const dispatchMenuId = ref<string | null>(null)
interface FileWritePreview {
  type: 'file_write'
  action: string
  path: string
  exists: boolean
  isBinary?: boolean
  tooLarge?: boolean
  currentContent?: string
  newContent: string
}
interface FileReadPreview {
  type: 'file_read'
  action: string
  path: string
  outsideWorkspace: boolean
}
// 审批卡改由 store 级常驻状态按当前会话派生：切走/回来不丢、跨会话不互相覆盖（见 chat store）。
const pendingApproval = computed(() => chatStore.getPendingApproval(chatStore.currentConversationId))
const formattedApprovalArgs = computed(() => {
  const args = pendingApproval.value?.args
  if (args == null) return ''
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
})
const approvalPreview = computed<FileWritePreview | null>(() => {
  const p = pendingApproval.value?.preview
  return p && p.type === 'file_write' ? (p as FileWritePreview) : null
})
const approvalReadPreview = computed<FileReadPreview | null>(() => {
  const p = pendingApproval.value?.preview
  return p && p.type === 'file_read' ? (p as FileReadPreview) : null
})

const DIFF_MAX_LINES = 1200
const DIFF_RENDER_CAP = 600

function lineDiff(a: string, b: string): { sigil: string; text: string; cls: string }[] {
  const aL = (a || '').split('\n').slice(0, DIFF_MAX_LINES)
  const bL = (b || '').split('\n').slice(0, DIFF_MAX_LINES)
  const m = aL.length, n = bL.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = aL[i] === bL[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: { sigil: string; text: string; cls: string }[] = []
  let i = 0, j = 0
  while (i < m && j < n) {
    if (aL[i] === bL[j]) { out.push({ sigil: ' ', text: aL[i], cls: '' }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ sigil: '-', text: aL[i], cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' }); i++ }
    else { out.push({ sigil: '+', text: bL[j], cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }); j++ }
  }
  while (i < m) out.push({ sigil: '-', text: aL[i++], cls: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' })
  while (j < n) out.push({ sigil: '+', text: bL[j++], cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' })
  return out
}

const approvalDiff = computed(() => {
  const p = approvalPreview.value
  if (!p) return [] as { sigil: string; text: string; cls: string }[]
  if (typeof p.currentContent !== 'string') {
    // No current content (new file / binary / too large): treat as all-new lines
    return (p.newContent || '').split('\n').map((text) => ({ sigil: '+', text, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }))
  }
  return lineDiff(p.currentContent, p.newContent)
})
const approvalDiffLines = computed(() => approvalDiff.value.slice(0, DIFF_RENDER_CAP))
const approvalDiffTruncated = computed(() => approvalDiff.value.length > DIFF_RENDER_CAP)
const approvalDiffSummary = computed(() => {
  const all = approvalDiff.value
  return {
    adds: all.filter((l) => l.sigil === '+').length,
    dels: all.filter((l) => l.sigil === '-').length
  }
})
async function respondApproval(approved: boolean) {
  const ap = pendingApproval.value
  if (!ap) return
  // store 内乐观清掉本地卡片后再回传主进程（UI 立即恢复）
  await chatStore.respondApproval(ap.request_id, approved)
}

// 对话内交互卡片（ask_user / 生图参数卡）用户选择回传 → 主进程 resolve 挂起的工具执行
async function onCardSubmit(
  msg: any,
  payload: { answers?: Record<string, { selected: string[]; free_text?: string }>; result?: Record<string, any> }
) {
  const card = msg?.card
  if (!card || !card.request_id) return
  try {
    // payload.answers / result 来自组件响应式状态，含 Vue reactive proxy；
    // 直接走 IPC structured clone 会抛 "An object could not be cloned"，故先转成纯对象。
    const plain = JSON.parse(JSON.stringify(payload))
    await window.api.chat.invoke('respondUserChoice', card.request_id, plain)
  } catch (e) {
    console.error('[chat] respondUserChoice failed:', e)
  }
}
const loadingAttachment = ref(false)
const dragging = ref(false)
const MAX_ATTACHMENTS = 5
const attachLimitMsg = ref(false)
const attachmentError = ref('')
const attachmentNotice = ref('')

interface ParsedDocumentResult {
  ok: boolean
  text: string
  ext?: string
  parser?: string
  error?: string
  warnings?: string[]
}

const showQuickPrompt = ref(false)
const quickPromptSearch = ref('')
const quickPromptCategory = ref('')
const quickDirectSend = ref(false)

watch([quickPromptSearch, quickPromptCategory], () => { quickPage.value = 1 })
const quickPromptGroups = computed(() => presetStore.visibleGrouped('chat'))
const quickCategories = computed(() => presetStore.categories.filter((c) => c.type === 'chat'))
const quickPage = ref(1)
const QUICK_PAGE_SIZE = 20
const filteredQuickAll = computed(() => {
  let groups = quickPromptGroups.value
  if (quickPromptCategory.value) {
    groups = groups.filter((g) => g.id === quickPromptCategory.value)
  }
  const flat = groups.flatMap((g) => g.items.map((item) => ({ ...item, categoryName: g.name })))
  if (quickPromptSearch.value) {
    const q = quickPromptSearch.value.toLowerCase()
    return flat.filter((p) => p.label.toLowerCase().includes(q) || p.content.toLowerCase().includes(q))
  }
  return flat
})
const quickTotalPages = computed(() => Math.max(1, Math.ceil(filteredQuickAll.value.length / QUICK_PAGE_SIZE)))
const pagedQuickPresets = computed(() => {
  const start = (quickPage.value - 1) * QUICK_PAGE_SIZE
  return filteredQuickAll.value.slice(start, start + QUICK_PAGE_SIZE)
})

async function loadQuickSendSetting() {
  const val = await (window as any).api.settings.invoke('get', 'quick_prompt_direct_send')
  quickDirectSend.value = val === '1'
}

async function toggleQuickDirectSend() {
  quickDirectSend.value = !quickDirectSend.value
  await (window as any).api.settings.invoke(
    'set',
    'quick_prompt_direct_send',
    quickDirectSend.value ? '1' : '0'
  )
}

function selectQuickPrompt(content: string) {
  if (quickDirectSend.value) {
    inputText.value = content
    showQuickPrompt.value = false
    nextTick(() => send())
  } else {
    inputText.value = content
    showQuickPrompt.value = false
    nextTick(() => inputEl.value?.focus())
  }
}

const activeToolCount = computed(() => tempKbIds.value.length + tempSkillIds.value.length + tempMcpIds.value.length + tempPromptSkillDirs.value.length)

const selectedBotName = computed(() => {
  const bot = bots.value.find((b) => b.id === selectedBotId.value)
  return bot?.name || ''
})

// 当前选中智能体的完整对象：以 selectedBotId 索引。
// 请不要考虑「生图：」切换器是否渲染（如果 bot.enable_image_gen=0 则隐藏）；chat-engine 同样会跳过生图工作流。
const currentBot = computed(() => bots.value.find((b) => b.id === selectedBotId.value))

const chatEstimate = computed(() => {
  const conv = chatStore.currentConversation
  const rule = effectiveBillingRule(conv?.active_model_provider_id || '', conv?.active_model_id || '')
  if (!rule) return { balanceType: 'token', amount: 0 }
  if (rule.billing_type === 'token' || rule.billing_type === 'credit') {
    const inputTokens = Math.ceil((inputText.value.trim().length + pendingAttachments.value.length * 300) / 3)
    const outputTokens = 800
    const amount = (inputTokens / 1000000) * Number(rule.input_price || 0)
      + (outputTokens / 1000000) * Number(rule.output_price || 0)
    return { balanceType: rule.billing_type === 'credit' ? 'credit' : 'token', amount }
  }
  return { balanceType: 'token', amount: 0 }
})

const botInitial = computed(() => {
  const name = selectedBotName.value
  return name ? name.charAt(0) : 'AI'
})

const visibleMessages = computed(() =>
  chatStore.messages.filter((m) => {
    if (m.role === 'tool') return false
    if (m.role === 'assistant' && m.tool_calls?.length && !m.content) return false
    // 交互卡片消息（ask_user / 生图参数卡）content 为空，但需渲染卡片，故按 card 放行
    return m.role === 'user' || (m.role === 'assistant' && (!!m.content || !!m.card))
  })
)

// 进行中的流式回复：拼成一条虚拟 live 气泡追加到列表末尾。
// 数据源是 store 级 streamingStates，故切走会话/页面再回来只要本轮仍在跑就能继续逐字渲染。
const liveMessage = computed(() => {
  const convId = chatStore.currentConversationId
  if (!convId || !chatStore.isConversationStreaming(convId)) return null
  const st = chatStore.getStreamingState(convId)
  if (!st) return null
  return {
    id: '__live__',
    conversation_id: convId,
    role: 'assistant',
    content: st.content,
    attachments: [],
    tool_calls: [],
    created_at: '',
    _reasoning: st.reasoning,
    _reasoningActive: st.reasoningActive,
    _reasoningCollapsed: !st.reasoningActive,
    _toolLogs: st.toolLogs,
    _toolActive: st.toolActive,
    _collapsed: st.collapsed,
  } as any
})

const renderedMessages = computed(() =>
  liveMessage.value ? [...visibleMessages.value, liveMessage.value] : visibleMessages.value
)

// 最后一条助手消息 id(仅在末条显示“重新生成”)
const lastAssistantId = computed(() => {
  const list = renderedMessages.value
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === 'assistant') return list[i].id
  }
  return ''
})

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node
  if (botSelectorRef.value && !botSelectorRef.value.contains(target)) {
    showBotSelector.value = false
  }
  if (toolbarDropdown.value && toolbarRef.value && !toolbarRef.value.contains(target)) {
    toolbarDropdown.value = ''
  }
  if (dispatchMenuId.value) {
    const wrapper = (target as HTMLElement).closest('[data-dispatch-id]') as HTMLElement | null
    if (!wrapper || wrapper.dataset.dispatchId !== dispatchMenuId.value) {
      dispatchMenuId.value = null
    }
  }
}

watch(selectedBotId, async (id) => {
  if (!id) return
  if (restoringState.value) {
    restoringState.value = false
    return
  }
  // 空态（无当前会话）时换 bot：不做全量 reset——reset 会清空所有会话的草稿，
  // 而空态下 conversations/messages 本就为空，直接拉新 bot 会话列表即可（fetchConversations 自带 currentBotId）
  if (!chatStore.currentConversationId) {
    await chatStore.fetchConversations(id)
    return
  }
  chatStore.reset()
  await chatStore.fetchConversations(id)
})

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch(() => chatStore.messages.length, scrollToBottom)
watch(() => chatStore.streamContent, scrollToBottom)
watch(() => chatStore.currentConversationId, scrollToBottom)

// === Per-conversation 草稿同步　===
// 文字 / 附件 / 临时工具选择 都与当前对话绑定。
// 路由切走： onUnmounted save 。
// 路由进入： onMounted load（需等着对话 id 已在 store 中）。
// 切换对话：下面 watch 同时 save 旧 + load 新。
function saveDraftFor(convId: string) {
  chatStore.setDraft(convId, {
    inputText: inputText.value,
    attachments: JSON.parse(JSON.stringify(pendingAttachments.value)),
    tempKbIds: [...tempKbIds.value],
    tempSkillIds: [...tempSkillIds.value],
    tempMcpIds: [...tempMcpIds.value],
    tempPromptSkillDirs: [...tempPromptSkillDirs.value],
  })
}
// 把「按 bot 默认 ∩ enabled 预填到 tempXxx」抽成局部辅助函数，loadDraftFor 与 watch 兜底复用。
// 仅在对应 tempXxx 当前为空时才填，避免覆盖用户「本轮明确不用」的清空意图。
// 返回是否产生过预填，调用方据此决定是否 saveDraftFor。
function prefillToolsFromBot(): boolean {
  if (!currentBot.value) return false
  let changed = false
  if (tempMcpIds.value.length === 0) {
    const enabledIds = new Set(enabledMcpServers.value.map((s) => s.id))
    const botMcpIds = Array.isArray(currentBot.value.mcp_ids) ? currentBot.value.mcp_ids : []
    const prefilled = botMcpIds.filter((id: string) => enabledIds.has(id))
    if (prefilled.length) { tempMcpIds.value = prefilled; changed = true }
  }
  if (tempKbIds.value.length === 0) {
    const botKbIds = Array.isArray(currentBot.value.kb_category_ids) ? currentBot.value.kb_category_ids : []
    if (botKbIds.length) { tempKbIds.value = [...botKbIds]; changed = true }
  }
  if (tempSkillIds.value.length === 0) {
    const botSkillIds = Array.isArray(currentBot.value.skill_ids) ? currentBot.value.skill_ids : []
    if (botSkillIds.length) { tempSkillIds.value = [...botSkillIds]; changed = true }
  }
  if (tempPromptSkillDirs.value.length === 0) {
    const botDirs = Array.isArray(currentBot.value.prompt_skill_dirs) ? currentBot.value.prompt_skill_dirs : []
    if (botDirs.length) { tempPromptSkillDirs.value = [...botDirs]; changed = true }
  }
  return changed
}

function loadDraftFor(convId: string) {
  // 首次为该会话加载草稿（drafts 里尚无条目）时，按 bot 默认 ∩ enabled 预填四类 temp；
  // 若 drafts 已存在则严格按 draft 还原，避免覆盖用户显式清空后的「本轮不用」语义。
  const hadDraft = !!chatStore.drafts[convId]
  const d = chatStore.getDraft(convId)
  inputText.value = d.inputText
  pendingAttachments.value = JSON.parse(JSON.stringify(d.attachments))
  tempKbIds.value = [...d.tempKbIds]
  tempSkillIds.value = [...d.tempSkillIds]
  tempMcpIds.value = [...d.tempMcpIds]
  tempPromptSkillDirs.value = [...d.tempPromptSkillDirs]
  if (!hadDraft && prefillToolsFromBot()) saveDraftFor(convId)
}
function clearLocalDraft() {
  inputText.value = ''
  pendingAttachments.value = []
  tempKbIds.value = []
  tempSkillIds.value = []
  tempMcpIds.value = []
  tempPromptSkillDirs.value = []
}
watch(() => chatStore.currentConversationId, (newId, oldId) => {
  if (oldId) saveDraftFor(oldId)
  if (newId) loadDraftFor(newId)
  else clearLocalDraft()
})

// 兜底：loadDraftFor 首次执行时若 bots 异步未就绪（currentBot 还是 undefined），
// 预填路径会被静默跳过；此后 hadDraft 永远为 true 导致预填永久失效。
// 这里同时盯 currentBot 与 currentConversationId，待 bot 就绪后按需补做一次预填。
watch(
  () => [chatStore.currentConversationId, currentBot.value?.id] as const,
  ([convId, botId]) => {
    if (!convId || !botId) return
    // 仅在四类 temp 全部为空（很可能是首次预填因 bot 未就绪被跳过）时尝试补预填
    const allEmpty =
      tempMcpIds.value.length === 0 &&
      tempKbIds.value.length === 0 &&
      tempSkillIds.value.length === 0 &&
      tempPromptSkillDirs.value.length === 0
    if (!allEmpty) return
    if (prefillToolsFromBot()) saveDraftFor(convId)
  }
)

/**
 * 「对话默认模型」解析：
 * 1. 云控端下发的 chatDefaultModel（主选）——云端默认 model_id 会被 upgrade 为复合 key 避免多服务商同名冲突
 * 2. 本地所有 chat 类型模型中第一个（兑底）
 * 3. 都没有→返回空，让 chat-engine 报「未选择对话模型」
 */
function resolveDefaultModel(): { provider_id: string; model_id: string } {
  // 首选云控端下发默认：provider 固定 'cloud:default'，model_id 可能是裸值或复合 key
  // （云控端新版本下发复合 key `model_id#@provider_name` 精确锁定服务商；老版本/老数据为裸值，
  //  此处 upgradeToCompositeKey 会按用户已授权列表补成首选复合 key）。
  const cloud = siteConfigStore.chatDefaultModel
  if (cloud?.provider_id && cloud?.model_id) {
    const candidate = cloud.provider_id === 'cloud:default'
      ? modelStore.upgradeToCompositeKey(cloud.model_id)
      : cloud.model_id
    // 仅当用户对该默认模型【有权限且具备 chat 能力】时才采用。
    // modelStore.providers 的可选模型由 cloudAuth.models（myModels=用户已授权列表）构建，
    // 若云控端配置的默认模型不在其中（用户无权限），不返回它、继续走下面的兜底链，
    // 避免给用户摆一个列表里都没有、还发不出消息的「幽灵模型」。
    const prov = modelStore.providers.find((p) => p.id === cloud.provider_id)
    const cloudType = modelStore.cloudTypeOf(cloud.provider_id, candidate)
    if (prov && prov.models.includes(candidate) && hasCap(candidate, 'chat', cloudType)) {
      return { provider_id: cloud.provider_id, model_id: candidate }
    }
    // 无权限 / 不可用 → 落到兜底（用户第一个已授权 chat 模型）
  }
  // 兑底：本地所有 provider 里第一个 chat 类型模型
  // 与 ChatModelSwitcher 用同一套过滤规则（hasCap）保持一致，
  // 避免本地 provider 把图像/embedding 模型当作默认对话模型选中
  for (const p of modelStore.providers) {
    for (const m of p.models) {
      const cloudType = modelStore.cloudTypeOf(p.id, m)
      if (!hasCap(m, 'chat', cloudType)) continue
      return { provider_id: p.id, model_id: m }
    }
  }
  return { provider_id: '', model_id: '' }
}

/**
 * 「生图默认模型」解析（v0.6.6+）：本地所有 image 类型模型中第一个。
 *
 * 说明：
 * - 云控端未下发 image_default_model（后端未提供），只走本地兑底链
 * - 返回空时 chat-engine 调 image_gen 仍可让 LLM 自行 list_providers（向后兼容）
 * - 与 ChatModelSwitcher type="image" 用同一套 hasCap 过滤规则
 */
function resolveDefaultImageModel(): { provider_id: string; model_id: string } {
  for (const p of modelStore.providers) {
    for (const m of p.models) {
      const cloudType = modelStore.cloudTypeOf(p.id, m)
      if (!hasCap(m, 'image', cloudType)) continue
      return { provider_id: p.id, model_id: m }
    }
  }
  return { provider_id: '', model_id: '' }
}

/** 新建对话：不再立刻建会话，进入空态（发送首条消息时才 createConversation，避免空会话堆列表） */
async function newConversation() {
  chatStore.startNewChat()
}

// 已在空态时再点「新建对话」（侧栏 ⌘N/本页 +）：清掉本地草稿并聚焦输入框
watch(
  () => chatStore.newChatSeq,
  async () => {
    if (chatStore.currentConversationId) return
    clearLocalDraft()
    syncDraftModelFromDefault()
    await nextTick()
    emptyInputEl.value?.focus()
  }
)

/**
 * 打开旧会话时的兼容兜底：若 conversation.active_model_* / active_image_* 为空（老会话、跨版本升级），
 * 自动用 resolveDefaultModel / resolveDefaultImageModel 填充一次并持久化。让升级用户也能享受「打开会话即默认模型」。
 */
watch(
  () => chatStore.currentConversationId,
  async (newId) => {
    if (!newId) return
    const conv = chatStore.currentConversation
    if (!conv) return
    // 对话模型兜底
    if (!conv.active_model_id) {
      const m = resolveDefaultModel()
      if (m.model_id) {
        await chatStore.updateConversationModel(newId, m.provider_id, m.model_id)
      }
      // 本地也没可用模型，让 chat-engine 在 sendMessage 时再抛错
    }
    // 生图模型兜底（v0.6.6+）：老会话表里 image 字段原本为空，首次打开填一次
    if (!conv.active_image_model_id) {
      const im = resolveDefaultImageModel()
      if (im.model_id) {
        await chatStore.updateConversationImageModel(newId, im.provider_id, im.model_id)
      }
      // 本地没 image 模型就留空，chat-engine 让 LLM 自行 list_providers
    }
  },
  { immediate: false }
)

/**
 * 输入框左下角 ChatModelSwitcher type="chat" 选定模型后的回调。
 * 写回主进程 conversation 表，同时同步本地 conversations 缓存。
 */
async function onChatModelChange(val: { provider_id: string; model_id: string }) {
  const convId = chatStore.currentConversationId
  if (!convId) return
  await chatStore.updateConversationModel(convId, val.provider_id, val.model_id)
}

/**
 * 输入框左下角 ChatModelSwitcher type="image" 选定生图模型后的回调（v0.6.6+）。
 * 写回主进程；chat-engine 下一轮调 image_gen tool 时作为默认 args。
 */
async function onImageModelChange(val: { provider_id: string; model_id: string }) {
  const convId = chatStore.currentConversationId
  if (!convId) return
  await chatStore.updateConversationImageModel(convId, val.provider_id, val.model_id)
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const DOC_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'json', 'pptx', 'ppt'])
// 二进制办公文档：file.text() 按 utf-8 读会得到乱码，必须走 main 进程 parseBuffer 解析
const BINARY_DOC_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'pptx', 'ppt'])

function canAddAttachment(): boolean {
  if (pendingAttachments.value.length >= MAX_ATTACHMENTS) {
    attachLimitMsg.value = true
    setTimeout(() => { attachLimitMsg.value = false }, 2000)
    return false
  }
  return true
}

function showAttachmentError(message: string) {
  attachmentError.value = message
  setTimeout(() => {
    if (attachmentError.value === message) attachmentError.value = ''
  }, 3000)
}

function showAttachmentNotice(message: string) {
  attachmentNotice.value = message
  setTimeout(() => {
    if (attachmentNotice.value === message) attachmentNotice.value = ''
  }, 6000)
}

function documentFallbackText(result: ParsedDocumentResult): string {
  return `[文档解析失败：${result.error || '未知错误'}（解析器=${result.parser || '未知'}, 扩展名=${result.ext || '未知'}）]`
}

function resolveParsedDocumentText(result: ParsedDocumentResult): string {
  if (result.warnings?.length) showAttachmentNotice(result.warnings[0])
  if (result.ok) return result.text
  showAttachmentError(`文档解析失败：${result.error || '未知错误'}`)
  return documentFallbackText(result)
}

async function addImageFromBlob(blob: Blob, name: string) {
  if (!canAddAttachment()) return
  loadingAttachment.value = true
  try {
    const reader = new FileReader()
    const dataUri = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const compressed = await compressImage(dataUri, 1024, 0.8)
    pendingAttachments.value.push({ name, type: 'image', data: compressed })
  } finally {
    loadingAttachment.value = false
  }
}

async function handlePaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const blob = item.getAsFile()
      if (blob) {
        const ext = item.type.split('/')[1] || 'png'
        await addImageFromBlob(blob, `paste.${ext}`)
      }
    }
  }
}

async function handleDrop(e: DragEvent) {
  dragging.value = false
  const files = e.dataTransfer?.files
  if (!files?.length) return
  for (const file of files) {
    if (!canAddAttachment()) break
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(ext)) {
      await addImageFromBlob(file, file.name)
    } else if (DOC_EXTENSIONS.has(ext)) {
      loadingAttachment.value = true
      try {
        let text: string
        if (BINARY_DOC_EXTENSIONS.has(ext)) {
          const buffer = await file.arrayBuffer()
          const parsed = await window.api.chat.invoke('parseDocumentBuffer', { buffer, ext }) as ParsedDocumentResult
          text = resolveParsedDocumentText(parsed)
        } else {
          text = await file.text()
        }
        pendingAttachments.value.push({ name: file.name, type: 'document', data: text })
      } finally {
        loadingAttachment.value = false
      }
    }
  }
}

function compressImage(dataUri: string, maxSize: number, quality: number): Promise<string> {
  const cleanUri = stripImageMetadata(dataUri)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = cleanUri
  })
}

async function pickFile(fileType: 'image' | 'document') {
  try {
    const filters = fileType === 'image'
      ? [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
      : [{ name: 'Documents', extensions: ['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'json', 'pptx', 'ppt'] }]

    const result = await window.api.dialog.openFile({
      title: fileType === 'image' ? '选择图片' : '选择文档',
      filters,
      properties: ['openFile', 'multiSelections']
    }) as { canceled: boolean; filePaths: string[]; error?: string }
    if (result.error) {
      showAttachmentError(`打开文件选择器失败：${result.error}`)
      return
    }
    if (result.canceled || !result.filePaths.length) return
    loadingAttachment.value = true

    for (const filePath of result.filePaths) {
      if (!canAddAttachment()) break
      const name = filePath.split(/[\\/]/).pop() || 'file'
      const ext = name.split('.').pop()?.toLowerCase() || ''

      if (fileType === 'image') {
        const raw = await window.api.chat.invoke('readFileBase64', filePath) as string
        const dataUri = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${raw}`
        const compressed = await compressImage(dataUri, 1024, 0.8)
        pendingAttachments.value.push({ name, type: 'image', data: compressed })
      } else {
        const parsed = await window.api.chat.invoke('readDocument', filePath) as ParsedDocumentResult
        const data = resolveParsedDocumentText(parsed)
        pendingAttachments.value.push({ name, type: 'document', data })
      }
    }
  } catch (err: any) {
    console.error('Failed to pick file:', err)
    showAttachmentError(`${fileType === 'image' ? '图片' : '文档'}添加失败：${err?.message || String(err)}`)
  } finally {
    loadingAttachment.value = false
  }
}

function openGalleryForChat() {
  showGalleryPicker.value = true
}

async function onGallerySelectForChat(paths: string[]) {
  if (!paths.length) return
  loadingAttachment.value = true
  try {
    for (const filePath of paths) {
      if (!canAddAttachment()) break
      const name = filePath.split(/[\\/]/).pop() || 'image'
      const ext = name.split('.').pop()?.toLowerCase() || 'png'
      const raw = await window.api.chat.invoke('readFileBase64', filePath) as string
      const dataUri = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${raw}`
      const compressed = await compressImage(dataUri, 1024, 0.8)
      pendingAttachments.value.push({ name, type: 'image', data: compressed })
    }
  } catch (err) {
    console.error('Failed to load gallery images:', err)
  } finally {
    loadingAttachment.value = false
  }
}

function startEditTitle(convId: string, currentTitle: string) {
  editingConvId.value = convId
  editingTitle.value = currentTitle
  nextTick(() => {
    const input = titleInputRef.value
    if (Array.isArray(input)) {
      input[0]?.focus()
    } else if (input) {
      input.focus()
    }
  })
}

async function confirmEditTitle(convId: string) {
  const title = editingTitle.value.trim()
  if (title && title !== chatStore.conversations.find((c) => c.id === convId)?.title) {
    await chatStore.updateTitle(convId, title)
  }
  editingConvId.value = null
  editingTitle.value = ''
}

function cancelEditTitle() {
  editingConvId.value = null
  editingTitle.value = ''
}

async function openWorkspace() {
  if (!chatStore.currentConversationId) return
  const dataDir = await (window as any).api.dataDir.get()
  // 用 / 分隔符兼容 macOS / Linux：Windows shell.openPath 同时接受 / 和 \，
  // 但 macOS 不识别 \，混合分隔符会导致 openPath 静默失败
  const wsPath = `${dataDir}/workspaces/${chatStore.currentConversationId}`
  ;(window as any).api.shell.openPath(wsPath)
}

async function onMessagesClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  const img = target.closest('.prose img') as HTMLImageElement | null
  if (img?.src) {
    // 角标按钮与 img 平级（同在 .img-file-wrap 内），closest 沿祖先链找不到 img，不会误入此分支
    previewImage.value = img.src
    return
  }
  // 「打开所在目录 / 浏览器打开」跳转按钮：必须先于 anchor 分支判断——
  // linked image（[![图](local-file...)](https://...)）形态下角标按钮也在 <a> 内，
  // 若 anchor 分支先命中，点定位按钮会被劫持成打开外部链接。按钮是显式操作控件，优先。
  const btn = target.closest('.link-jump-btn') as HTMLElement | null
  if (btn?.dataset?.link) {
    const link = btn.dataset.link
    const type = btn.dataset.linkType
    if (type === 'external') {
      ;(window as any).api.shell.openExternal(link)
    } else if (type === 'localfile') {
      const p = resolveLocalFileTarget(link)
      if (p) (window as any).api.shell.showItemInFolder(p)
    } else {
      ;(window as any).api.shell.showItemInFolder(link)
    }
    return
  }
  // 普通 markdown 链接：拦截原地导航，改用系统浏览器打开。否则点击会让渲染窗口从 SPA 跳走
  // 加载外站，生产 CSP(default-src 'self') 拦掉外站资源→白屏，且无边框窗口无返回键回不来。
  const anchor = target.closest('a[href]') as HTMLAnchorElement | null
  if (anchor) {
    const href = anchor.getAttribute('href') || ''
    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      e.preventDefault()
      ;(window as any).api.shell.openExternal(href)
      return
    }
    // local-file 协议链接（如 AI 输出 [查看文件](local-file://...)）：不拦截会让渲染窗口
    // 原地导航去加载该文件、替换整个 SPA，改为在文件管理器中定位
    if (/^local-file:/i.test(href)) {
      e.preventDefault()
      const p = resolveLocalFileTarget(href)
      if (p) (window as any).api.shell.showItemInFolder(p)
      return
    }
  }
  // Markdown 代码块右上角「复制」按钮：用事件委托替代 inline onclick，
  // 因为生产 CSP（main/index.ts 的 script-src 'self'）不允许 inline handler。
  const copyBtn = target.closest('.copy-btn[data-action="copy-code"]') as HTMLButtonElement | null
  if (copyBtn) {
    const wrapper = copyBtn.closest('.code-block-wrapper')
    const codeEl = wrapper?.querySelector('code')
    const text = codeEl?.textContent || ''
    if (text) {
      try {
        await navigator.clipboard.writeText(text)
        const orig = copyBtn.textContent || '复制'
        copyBtn.textContent = '已复制'
        copyBtn.disabled = true
        setTimeout(() => {
          copyBtn.textContent = orig
          copyBtn.disabled = false
        }, 1500)
      } catch { /* ignore */ }
    }
    return
  }
}

/**
 * 从 markdown 内容提取所有图片本地路径。
 * 支持两种 url 形态：
 *  - `local-file://img?p=<encoded-abs>` 或 `local-file://img?rel=<encoded-rel>`（应用内自定义协议）
 *  - 裸绝对路径（如 `C:\...` 或 `/...`）
 * 其它（http(s) / data:）当前剪贴板写图链路不支持，跳过。
 */
function extractImagePathsFromMarkdown(content: string): string[] {
  const paths: string[] = []
  const regex = /!\[[^\]]*\]\(([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(content)) !== null) {
    const url = m[1].trim()
    if (url.startsWith('local-file://')) {
      try {
        const u = new URL(url)
        const p = u.searchParams.get('p') || u.searchParams.get('rel')
        if (p) paths.push(p)
      } catch {
        // bad URL，跳过
      }
    } else if (/^[A-Za-z]:[\\/]/.test(url) || url.startsWith('/')) {
      paths.push(url)
    }
  }
  return paths
}

async function copyMessage(msg: any) {
  try {
    const content = String(msg.content || '')
    // 优先：消息含 markdown 图片 → 复制图片本身（粘到 QQ/微信/邮件直接是图）
    // 多张图取第一张；图片复制失败再回退到文本。
    const imagePaths = extractImagePathsFromMarkdown(content)
    if (imagePaths.length > 0) {
      const res = (await (window as any).api.clipboard.writeImage(imagePaths[0])) as
        | { success?: boolean }
        | undefined
      if (res?.success) {
        copiedId.value = msg.id
        setTimeout(() => { copiedId.value = null }, 2000)
        return
      }
    }
    await navigator.clipboard.writeText(content)
    copiedId.value = msg.id
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch { /* ignore */ }
}

function toggleDispatchMenu(id: string) {
  dispatchMenuId.value = dispatchMenuId.value === id ? null : id
}

function dispatchTo(target: 'imageGen' | 'batchGen' | 'canvasOrchestrate', msg: any) {
  const content = (msg.content || '').trim()
  if (!content) return
  if (target === 'imageGen') {
    handoff.set('imageGen', { prompt: content })
    router.push({ name: 'imageGen' })
  } else if (target === 'batchGen') {
    handoff.set('batchGen', { prompt: content })
    router.push({ name: 'batchGen' })
  } else {
    handoff.set('canvasOrchestrate', { description: content })
    router.push({ name: 'canvas' })
  }
  dispatchMenuId.value = null
}

function cloudProviderName(modelKey: string): string {
  const i = modelKey.indexOf(CLOUD_KEY_SEP)
  return i >= 0 ? modelKey.slice(i + CLOUD_KEY_SEP.length) : ''
}

function effectiveBillingRule(providerId: string, modelKey: string): any | null {
  if (providerId !== 'cloud:default' || !modelKey) return null
  const pure = stripModelId(modelKey)
  const providerName = cloudProviderName(modelKey)
  const cloudModel = cloudAuth.models.find((m) => {
    if (m.model_id !== pure) return false
    return providerName ? m.provider_name === providerName : true
  })
  return cloudAuth.billingRules.find((r: any) => Number(r.cloud_model_id) === Number(cloudModel?.id))
    || cloudAuth.billingRules.find((r: any) => r.model_id === pure)
    || null
}

function availableBalance(type: string): number {
  return Number(cloudAuth.quotas?.balances?.[type]?.total
    ?? cloudAuth.balances.find((b) => b.type === type)?.amount
    ?? 0)
}

async function send() {
  const text = inputText.value.trim()
  if ((!text && !pendingAttachments.value.length) || chatStore.streaming) return
  if (chatEstimate.value.amount > 0) {
    const available = availableBalance(chatEstimate.value.balanceType)
    if (available + 0.000001 < chatEstimate.value.amount) {
      lowBalanceState.value = {
        balanceType: chatEstimate.value.balanceType,
        required: chatEstimate.value.amount,
        available,
      }
      lowBalanceOpen.value = true
      return
    }
  }
  inputText.value = ''
  const attachments = pendingAttachments.value.length ? JSON.parse(JSON.stringify(pendingAttachments.value)) : undefined
  pendingAttachments.value = []
  // 四类 override 全部无条件下发：空数组同样表示「本轮明确不用」，与 MCP 对齐，
  // 避免用户清空知识库/小工具/Skills 后被静默回填 bot 默认
  const overrides = {
    kbCategoryIds: [...tempKbIds.value],
    skillIds: [...tempSkillIds.value],
    mcpIds: [...tempMcpIds.value],
    promptSkillDirs: [...tempPromptSkillDirs.value]
  }
  await chatStore.sendMessage(text, attachments, overrides)
}

onMounted(async () => {
  document.addEventListener('click', onClickOutside)
  // app 级常驻流式监听（幂等，永不退订）：保证切走会话/页面再回来仍能继续逐字渲染
  chatStore.initStreamListener()
  chatStore.listenTitleUpdates()
  // 监听 image_gen fire-and-forget 完成后追加的图片消息（异步生图工作流）
  chatStore.listenAppendMessage()
  chatStore.listenUpdateMessage()
  // app 级常驻审批监听（幂等，永不退订）：审批卡按会话路由、切走/回来不丢
  chatStore.initApprovalListener()
  await Promise.all([
    botStore.fetchBots(),
    kbStore.fetchCategories(),
    skillStore.fetchSkills(),
    mcpStore.fetchServers(),
    promptSkillStore.fetchSkills(),
    presetStore.fetchAll('chat')
  ])
  loadQuickSendSetting()
  bots.value = botStore.bots

  const botId = route.query.botId as string
  if (botId) {
    selectedBotId.value = botId
  } else if (chatStore.currentBotId) {
    restoringState.value = true
    selectedBotId.value = chatStore.currentBotId
  }

  // 路由进入后恢复当前对话的未发送草稿。watch 只在 currentConversationId
  // 变化时触发；如果 chat 页面重新进入但对话 id 未变，需要这里手动 load。
  if (chatStore.currentConversationId) {
    await chatStore.selectConversation(chatStore.currentConversationId)
    loadDraftFor(chatStore.currentConversationId)
    // 僵尸轮次恢复：渲染端 reload/托盘重开后主进程轮次可能仍在跑，重建流式态
    //（续接后续流事件 + 恢复停止按钮；轮末由 round_done 事件收尾重拉）
    void chatStore.resumeStreamingIfActive(chatStore.currentConversationId)
  } else {
    // 空态：draft 模型预填（providers 未就绪时留空，发送前 syncDraftModelFromDefault 兜底）
    syncDraftModelFromDefault()
    await nextTick()
    emptyInputEl.value?.focus()
  }

  scrollToBottom()
})

// 模型列表异步就绪后，空态 draft 模型仍为空时补一次预填（打开即能聊）
watch(
  () => modelStore.providers.length,
  () => {
    if (!chatStore.currentConversationId) syncDraftModelFromDefault()
  }
)

onUnmounted(() => {
  // 路由离开前保存当前对话的草稿到 store（仅会话级，重启 app 后丢失）
  if (chatStore.currentConversationId) {
    saveDraftFor(chatStore.currentConversationId)
  }
  document.removeEventListener('click', onClickOutside)
  chatStore.stopListenTitleUpdates()
  chatStore.stopListenAppendMessage()
  chatStore.stopListenUpdateMessage()
  // 审批监听是 app 级常驻、按会话路由，不在此退订（退订会导致切走对话页时审批卡丢失，正是本次修复点）
})
</script>

<style scoped>
.toolbar-select-btn {
  @apply flex items-center gap-1 px-2.5 py-1.5 text-xs text-text-secondary bg-surface-2 rounded-lg hover:bg-surface-3 transition-colors cursor-pointer;
}
.toolbar-count {
  @apply inline-flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-primary-600 text-white rounded-full;
}
.toolbar-dropdown {
  @apply absolute bottom-full left-0 mb-1 w-48 max-h-48 overflow-y-auto bg-surface-0 border border-surface-3 rounded-lg shadow-lg z-50 py-1;
}
/* 空态工作台：Toolbar 条在输入卡上方，下拉改向下展开 */
.toolbar-dropdown-down {
  @apply top-full bottom-auto mt-1 mb-0;
}
.toolbar-dropdown-item {
  @apply flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors;
}
/* 未启用的 MCP 项灰显 + 禁止点击（仍保留在列表里供用户感知，避免「列表里看不到」的困惑） */
.toolbar-dropdown-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.toolbar-dropdown-item.disabled:hover {
  @apply bg-transparent text-text-secondary;
}
</style>

<style>
/* Fix long path overflow in prose */
.prose code {
  word-break: break-all;
}

/* Link jump button styles */
.link-jump-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 3px;
  padding: 0;
  border: 1px solid var(--surface-3);
  border-radius: 4px;
  background: var(--surface-2);
  cursor: pointer;
  vertical-align: middle;
  transition: background 0.15s, border-color 0.15s;
}
.link-jump-btn:hover {
  background: var(--surface-3);
  border-color: #f9974c;
}
.link-jump-icon {
  flex-shrink: 0;
  color: #e5652a;
}

/* local-file 图片的「打开所在目录」角标：默认隐藏，hover 图片时浮现在右上角 */
.img-file-wrap {
  position: relative;
  display: inline-block;
}
/* .prose img 的上下 margin 会撑大 wrap 高度、让角标浮到图片上方的空白带里；
   把垂直间距挪到包装层（特异性压过 .prose img），使 wrap 内容盒 = 图片盒，角标贴合图片右上角 */
.prose .img-file-wrap {
  margin: 8px 0;
}
.prose .img-file-wrap img {
  margin: 0;
}
.img-file-wrap .link-jump-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  margin-left: 0;
  opacity: 0;
  /* 透明时不得拦截图片点击（点击图片 = 预览），仅 hover 显示后才可点 */
  pointer-events: none;
  background: var(--surface-0, #fff);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  transition: opacity 0.15s, background 0.15s, border-color 0.15s;
}
.img-file-wrap:hover .link-jump-btn {
  opacity: 1;
  pointer-events: auto;
}
</style>
