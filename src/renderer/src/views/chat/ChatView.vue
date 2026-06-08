<template>
  <div class="h-full flex flex-col">
    <header class="page-header">
      <div class="flex items-center gap-3">
        <!-- Floating bot selector -->
        <div class="relative" ref="botSelectorRef">
          <button @click="showBotSelector = !showBotSelector" class="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-surface-3 bg-surface-0 hover:bg-surface-2 transition-colors">
            <span class="text-text-secondary">{{ selectedBotName || '选择智能体' }}</span>
            <svg class="w-3 h-3 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </button>
          <div v-if="showBotSelector" class="absolute top-full left-0 mt-1 w-48 bg-surface-0 border border-surface-3 rounded-xl shadow-modal z-50 py-1 max-h-60 overflow-y-auto">
            <div v-if="!bots.length" class="px-3 py-2 text-xs text-text-tertiary">暂无智能体</div>
            <button v-for="bot in bots" :key="bot.id" @click="selectedBotId = bot.id; showBotSelector = false" :class="['w-full text-left px-3 py-2 text-xs transition-colors', bot.id === selectedBotId ? 'bg-primary-50 text-primary-700 font-medium' : 'text-text-secondary hover:bg-surface-2']">
              {{ bot.name }}
            </button>
          </div>
        </div>
      </div>
      <button v-if="selectedBotId" @click="newConversation" class="btn-primary text-xs">+ 新建对话</button>
    </header>
    <div class="flex-1 flex overflow-hidden">
      <!-- Conversation list sidebar (narrow) -->
      <aside v-if="selectedBotId && chatStore.conversations.length" class="w-40 flex-shrink-0 border-r border-surface-3 bg-surface-0 flex flex-col">
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
      <div class="flex-1 flex flex-col bg-surface-1 relative">
        <div v-if="!chatStore.currentConversationId" class="flex-1 empty-state">
          <div class="w-20 h-20 rounded-2xl bg-surface-2 flex items-center justify-center mb-5">
            <svg class="w-10 h-10 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>
          </div>
          <p class="text-sm font-medium text-text-secondary mb-1">{{ selectedBotId ? '点击「新建对话」开始聊天' : '选择一个智能体开始' }}</p>
          <p class="text-xs text-text-tertiary">{{ selectedBotId ? '或从左侧选择历史对话' : '从顶部下拉菜单中选择' }}</p>
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
                    <div v-else class="text-sm px-4 py-3 rounded-2xl rounded-br-md bg-primary-600 text-white whitespace-pre-wrap leading-relaxed select-text">
                      {{ msg.content }}
                    </div>
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
                    <div class="text-sm px-4 py-3 rounded-2xl rounded-bl-md bg-surface-0 text-text-primary shadow-card prose prose-sm dark:prose-invert max-w-none select-text" v-html="renderMarkdown(msg.content || '...')"></div>
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
                  <label v-for="m in mcpStore.servers" :key="m.id" class="toolbar-dropdown-item">
                    <input type="checkbox" :value="m.id" v-model="tempMcpIds" class="rounded w-3 h-3" />
                    <span class="truncate">{{ m.name }}</span>
                  </label>
                  <div v-if="!mcpStore.servers.length" class="text-[10px] text-text-disabled px-3 py-2">无可用MCP</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Input -->
          <div class="border-t border-surface-3 p-4 bg-surface-0">
            <div class="max-w-3xl mx-auto">
              <div v-if="attachLimitMsg" class="flex items-center gap-2 mb-2 px-1 text-xs text-amber-600">
                最多添加 {{ MAX_ATTACHMENTS }} 个附件
              </div>
              <div v-if="attachmentError" class="flex items-center gap-2 mb-2 px-1 text-xs text-red-500">
                {{ attachmentError }}
              </div>
              <div v-if="attachmentNotice" class="flex items-center gap-2 mb-2 px-1 text-xs text-amber-600">
                {{ attachmentNotice }}
              </div>
              <div v-if="loadingAttachment" class="flex items-center gap-2 mb-2 px-1 text-xs text-text-tertiary">
                <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                正在处理附件...
              </div>
              <div v-if="pendingAttachments.length" class="flex gap-2 flex-wrap mb-2 px-1">
                <div v-for="(att, i) in pendingAttachments" :key="i" class="flex items-center gap-1.5 px-2.5 py-1.5 bg-surface-2 rounded-lg text-xs text-text-secondary group">
                  <svg v-if="att.type === 'image'" class="w-3.5 h-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                  <svg v-else class="w-3.5 h-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                  <span class="max-w-[120px] truncate">{{ att.name }}</span>
                  <button @click="pendingAttachments.splice(i, 1)" class="text-text-tertiary hover:text-text-primary ml-0.5">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              <div class="flex items-end gap-3">
                <div class="flex flex-col gap-1 flex-shrink-0">
                  <div class="flex gap-1.5">
                    <button @click="showToolbar = !showToolbar" class="relative w-9 h-9 flex items-center justify-center text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-surface-2 transition-all" :class="showToolbar ? 'text-primary-600 bg-primary-50' : ''" title="工具">
                      <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>
                      <span v-if="activeToolCount" class="absolute -top-0.5 -right-0.5 w-4 h-4 bg-primary-600 text-white text-[9px] rounded-full flex items-center justify-center font-medium">{{ activeToolCount }}</span>
                    </button>
                    <div class="relative" ref="attachRef">
                      <button @click="showAttachMenu = !showAttachMenu" :disabled="chatStore.streaming" class="w-9 h-9 flex items-center justify-center text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-surface-2 disabled:opacity-40 transition-all" title="添加附件">
                        <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" /></svg>
                      </button>
                      <div v-if="showAttachMenu" class="absolute bottom-full left-0 mb-2 bg-surface-0 rounded-lg shadow-lg border border-surface-3 py-1 w-32 z-10">
                        <button @click="pickFile('image')" class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-1 transition-colors">
                          <svg class="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
                          图片
                        </button>
                        <button @click="pickFile('document')" class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-1 transition-colors">
                          <svg class="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                          文档
                        </button>
                        <button @click="openGalleryForChat" class="w-full flex items-center gap-2 px-3 py-2 text-xs text-text-secondary hover:bg-surface-1 transition-colors">
                          <svg class="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.5" stroke-width="2"/><polyline points="21 15 16 10 5 21" stroke-width="2"/></svg>
                          图库
                        </button>
                      </div>
                    </div>
                    <button @click="showQuickPrompt = true" class="w-9 h-9 flex items-center justify-center text-text-tertiary hover:text-text-secondary rounded-lg hover:bg-surface-2 transition-all" title="快捷提示词">
                      <svg class="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                    </button>
                  </div>
                  <button @click="openWorkspace" :disabled="!chatStore.currentConversationId" class="w-full h-7 flex items-center justify-center text-[10px] text-text-tertiary hover:text-text-secondary rounded-md border border-surface-3 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all" title="打开工作区">
                    工作区
                  </button>
                </div>
                <!-- 输入框容器：flex-col，上部 textarea + 底部左 ModelSwitcher / 右 发送按钮。IDE 风格。 -->
                <div
                  :class="['flex-1 flex flex-col bg-surface-1 rounded-2xl border focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all', dragging ? 'border-primary-500 bg-primary-50' : 'border-surface-4']"
                  @dragover.prevent="dragging = true"
                  @dragleave.prevent="dragging = false"
                  @drop.prevent="handleDrop"
                >
                  <PromptTextarea
                    ref="inputEl"
                    v-model="inputText"
                    @paste="handlePaste"
                    @submit="send"
                    title="编辑消息"
                    :height="64"
                    submit-on-enter
                    inline-edit
                    :show-count="false"
                    :placeholder="dragging ? '松开以添加附件' : '输入消息，按 Enter 发送...'"
                    container-class="m-2 mb-1"
                    input-class="text-sm"
                  />
                  <!-- 底部条：左侧 「对话：」+ 「生图：」两个模型切换器并排（IDE 风格）、右侧 发送/中断按钮。
                       生图切换器控制 image_gen tool 默认 provider/model，LLM args 未传时作为兑底 -->
                  <div class="flex items-center justify-between gap-2 px-2 pb-2">
                    <div class="flex items-center gap-1 min-w-0">
                      <ChatModelSwitcher
                        type="chat"
                        :provider-id="chatStore.currentConversation?.active_model_provider_id || ''"
                        :model-id="chatStore.currentConversation?.active_model_id || ''"
                        @change="onChatModelChange"
                      />
                      <ChatModelSwitcher
                        v-if="currentBot?.enable_image_gen"
                        type="image"
                        :provider-id="chatStore.currentConversation?.active_image_provider_id || ''"
                        :model-id="chatStore.currentConversation?.active_image_model_id || ''"
                        @change="onImageModelChange"
                      />
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <button v-if="chatStore.streaming" @click="chatStore.cancel()" class="w-8 h-8 flex items-center justify-center bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all flex-shrink-0" title="中断当前回复">
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                      </button>
                      <button v-else @click="send" :disabled="!inputText.trim() && !pendingAttachments.length" class="w-8 h-8 flex items-center justify-center bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0" title="发送">
                        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                      </button>
                    </div>
                  </div>
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
  <ImageLightbox :src="previewImage" @close="previewImage = null" />

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
import { useChatStore } from '@/stores/chat'
import { useHandoffStore } from '@/stores/handoff'
import { useBotStore } from '@/stores/bots'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useSkillStore } from '@/stores/skills'
import { useMcpStore } from '@/stores/mcps'
import { usePromptSkillStore } from '@/stores/prompt-skills'
import { usePromptPresetStore } from '@/stores/prompt-presets'
import { useModelStore } from '@/stores/models'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { hasCap } from '@/utils/model-caps'
import { useSiteConfigStore } from '@/stores/site-config'
import { renderMarkdown } from '@/utils/markdown'
import { stripImageMetadata } from '@shared/strip-image-metadata'
import { CLOUD_KEY_SEP, stripModelId } from '@shared/model-id'
import GalleryPicker from '@/components/GalleryPicker.vue'
import ImageLightbox from '@/components/ImageLightbox.vue'
import ChatModelSwitcher from '@/components/ChatModelSwitcher.vue'
import LowBalanceModal from '@/components/LowBalanceModal.vue'
import PromptTextarea from '@/components/PromptTextarea.vue'

const route = useRoute()
const router = useRouter()
const handoff = useHandoffStore()
const chatStore = useChatStore()
const botStore = useBotStore()
const modelStore = useModelStore()
const cloudAuth = useCloudAuthStore()
const siteConfigStore = useSiteConfigStore()
const kbStore = useKnowledgeStore()
const skillStore = useSkillStore()
const CORE_TOOL_NAMES = ['file_ops', 'run_command', 'image_gen']
const userSkills = computed(() =>
  skillStore.skills.filter((s) => !CORE_TOOL_NAMES.includes(s.function_def?.name))
)
const mcpStore = useMcpStore()
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
const botSelectorRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const attachRef = ref<HTMLElement | null>(null)
const pendingAttachments = ref<{ name: string; type: string; data: string }[]>([])
const showAttachMenu = ref(false)
const showGalleryPicker = ref(false)
const showToolbar = ref(false)
const toolbarDropdown = ref('')
const tempKbIds = ref<string[]>([])
const tempSkillIds = ref<string[]>([])
const tempMcpIds = ref<string[]>([])
const tempPromptSkillDirs = ref<string[]>([])

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
const pendingApproval = ref<{ request_id: string; conversation_id: string; tool: string; args: any; preview?: FileWritePreview | FileReadPreview } | null>(null)
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
  pendingApproval.value = null
  await window.api.chat.invoke('respondToolApproval', ap.request_id, approved)
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
    return m.role === 'user' || (m.role === 'assistant' && !!m.content)
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
  if (showAttachMenu.value && attachRef.value && !attachRef.value.contains(target)) {
    showAttachMenu.value = false
  }
}

watch(selectedBotId, async (id) => {
  if (!id) return
  if (restoringState.value) {
    restoringState.value = false
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
function loadDraftFor(convId: string) {
  const d = chatStore.getDraft(convId)
  inputText.value = d.inputText
  pendingAttachments.value = JSON.parse(JSON.stringify(d.attachments))
  tempKbIds.value = [...d.tempKbIds]
  tempSkillIds.value = [...d.tempSkillIds]
  tempMcpIds.value = [...d.tempMcpIds]
  tempPromptSkillDirs.value = [...d.tempPromptSkillDirs]
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

/**
 * 「对话默认模型」解析：
 * 1. 云控端下发的 chatDefaultModel（主选）——云端默认 model_id 会被 upgrade 为复合 key 避免多服务商同名冲突
 * 2. 本地所有 chat 类型模型中第一个（兑底）
 * 3. 都没有→返回空，让 chat-engine 报「未选择对话模型」
 */
function resolveDefaultModel(): { provider_id: string; model_id: string } {
  // 首选云控端下发默认：provider 固定 'cloud:default'，model_id 是裸值，要 upgrade 为复合 key
  const cloud = siteConfigStore.chatDefaultModel
  if (cloud?.provider_id && cloud?.model_id) {
    return {
      provider_id: cloud.provider_id,
      model_id: cloud.provider_id === 'cloud:default'
        ? modelStore.upgradeToCompositeKey(cloud.model_id)
        : cloud.model_id,
    }
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

async function newConversation() {
  if (!selectedBotId.value) return
  // 「智能体不再绑定模型」（v0.6.5+）：新会话预填云控默认模型；db 层 active_model_*
  // 以后用户可随时在输入框左下角切换，每个会话独立记忆。
  // v0.6.6+：生图模型同理预填本地第一个 image 模型，带不出时让 chat-engine fallback 到 list_providers
  const initialModel = resolveDefaultModel()
  const initialImageModel = resolveDefaultImageModel()
  const conv = await chatStore.createConversation(
    selectedBotId.value,
    undefined,
    initialModel.model_id ? initialModel : undefined,
    initialImageModel.model_id ? initialImageModel : undefined
  )
  await chatStore.selectConversation(conv.id)
}

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
const DOC_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'json'])
// 二进制办公文档：file.text() 按 utf-8 读会得到乱码，必须走 main 进程 parseBuffer 解析
const BINARY_DOC_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx'])

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
  showAttachMenu.value = false
  try {
    const filters = fileType === 'image'
      ? [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
      : [{ name: 'Documents', extensions: ['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'json'] }]

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
  showAttachMenu.value = false
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
    previewImage.value = img.src
    return
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
  const btn = target.closest('.link-jump-btn') as HTMLElement | null
  if (btn?.dataset?.link) {
    const link = btn.dataset.link
    const type = btn.dataset.linkType
    if (type === 'external') {
      ;(window as any).api.shell.openExternal(link)
    } else {
      ;(window as any).api.shell.showItemInFolder(link)
    }
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
  const overrides = (tempKbIds.value.length || tempSkillIds.value.length || tempMcpIds.value.length || tempPromptSkillDirs.value.length)
    ? {
        kbCategoryIds: tempKbIds.value.length ? [...tempKbIds.value] : undefined,
        skillIds: tempSkillIds.value.length ? [...tempSkillIds.value] : undefined,
        mcpIds: tempMcpIds.value.length ? [...tempMcpIds.value] : undefined,
        promptSkillDirs: tempPromptSkillDirs.value.length ? [...tempPromptSkillDirs.value] : undefined
      }
    : undefined
  await chatStore.sendMessage(text, attachments, overrides)
}

onMounted(async () => {
  document.addEventListener('click', onClickOutside)
  // app 级常驻流式监听（幂等，永不退订）：保证切走会话/页面再回来仍能继续逐字渲染
  chatStore.initStreamListener()
  chatStore.listenTitleUpdates()
  // 监听 image_gen fire-and-forget 完成后追加的图片消息（异步生图工作流）
  chatStore.listenAppendMessage()
  window.api.chat.onToolApproval((data: any) => {
    pendingApproval.value = data
  })
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
  }

  scrollToBottom()
})

onUnmounted(() => {
  // 路由离开前保存当前对话的草稿到 store（仅会话级，重启 app 后丢失）
  if (chatStore.currentConversationId) {
    saveDraftFor(chatStore.currentConversationId)
  }
  document.removeEventListener('click', onClickOutside)
  chatStore.stopListenTitleUpdates()
  chatStore.stopListenAppendMessage()
  window.api.chat.offToolApproval()
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
.toolbar-dropdown-item {
  @apply flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors;
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
</style>
