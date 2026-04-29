<template>
  <div class="h-full flex flex-col">
    <header class="page-header">
      <div class="flex items-center gap-3">
        <!-- Floating bot selector -->
        <div class="relative" ref="botSelectorRef">
          <button @click="showBotSelector = !showBotSelector" class="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border border-surface-3 bg-surface-0 hover:bg-surface-2 transition-colors">
            <span class="text-text-secondary">{{ selectedBotName || '选择机器人' }}</span>
            <svg class="w-3 h-3 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </button>
          <div v-if="showBotSelector" class="absolute top-full left-0 mt-1 w-48 bg-surface-0 border border-surface-3 rounded-xl shadow-modal z-50 py-1 max-h-60 overflow-y-auto">
            <div v-if="!bots.length" class="px-3 py-2 text-xs text-text-tertiary">暂无机器人</div>
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
      <div class="flex-1 flex flex-col bg-surface-1">
        <div v-if="!chatStore.currentConversationId" class="flex-1 empty-state">
          <div class="w-20 h-20 rounded-2xl bg-surface-2 flex items-center justify-center mb-5">
            <svg class="w-10 h-10 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" /></svg>
          </div>
          <p class="text-sm font-medium text-text-secondary mb-1">{{ selectedBotId ? '点击「新建对话」开始聊天' : '选择一个机器人开始' }}</p>
          <p class="text-xs text-text-tertiary">{{ selectedBotId ? '或从左侧选择历史对话' : '从顶部下拉菜单中选择' }}</p>
        </div>
        <template v-else>
          <!-- Messages -->
          <div ref="messagesContainer" class="flex-1 overflow-y-auto px-6 py-6" @click="onMessagesClick">
            <div class="max-w-3xl mx-auto space-y-5">
              <div v-for="msg in visibleMessages" :key="msg.id" :class="['flex gap-3 group/msg', msg.role === 'user' ? 'flex-row-reverse' : '']">
                <div v-if="msg.role === 'user'" class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold bg-primary-600 text-white">你</div>
                <div v-else class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold bg-primary-100 text-primary-700">{{ botInitial }}</div>
                <div :class="['max-w-[75%] relative', msg.role === 'user' ? 'text-right' : 'min-w-0']">
                  <div v-if="msg.role === 'user'" class="text-sm px-4 py-3 rounded-2xl rounded-br-md bg-primary-600 text-white whitespace-pre-wrap leading-relaxed select-text">
                    {{ msg.content }}
                  </div>
                  <template v-else>
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
                <div
                  :class="['flex-1 flex items-end gap-3 bg-surface-1 rounded-2xl border p-2 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent transition-all', dragging ? 'border-primary-500 bg-primary-50' : 'border-surface-4']"
                  @dragover.prevent="dragging = true"
                  @dragleave.prevent="dragging = false"
                  @drop.prevent="handleDrop"
                >
                  <textarea
                    ref="inputEl"
                    v-model="inputText"
                    @keydown.enter.exact.prevent="send"
                    @paste="handlePaste"
                    rows="2"
                    :placeholder="dragging ? '松开以添加附件' : '输入消息，按 Enter 发送...'"
                    class="flex-1 px-3 py-2 text-sm bg-transparent resize-none focus:outline-none placeholder:text-text-disabled"
                  ></textarea>
                  <button @click="send" :disabled="(!inputText.trim() && !pendingAttachments.length) || chatStore.streaming" class="w-9 h-9 flex items-center justify-center bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0">
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                  </button>
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
  <div v-if="previewImage" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="previewImage = null">
    <div class="relative max-w-[90vw] max-h-[90vh] rounded-xl shadow-[0_0_30px_rgba(0,0,0,0.12)] overflow-hidden bg-surface-0">
      <img :src="previewImage" class="max-w-[90vw] max-h-[90vh] object-contain" />
      <button @click="previewImage = null" class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-surface-0/80 hover:bg-surface-2 text-text-secondary transition-colors shadow-lg">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useChatStore } from '@/stores/chat'
import { useBotStore } from '@/stores/bots'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useSkillStore } from '@/stores/skills'
import { useMcpStore } from '@/stores/mcps'
import { usePromptSkillStore } from '@/stores/prompt-skills'
import { usePromptPresetStore } from '@/stores/prompt-presets'
import { renderMarkdown } from '@/utils/markdown'

const route = useRoute()
const chatStore = useChatStore()
const botStore = useBotStore()
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
const messagesContainer = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const botSelectorRef = ref<HTMLElement | null>(null)
const toolbarRef = ref<HTMLElement | null>(null)
const attachRef = ref<HTMLElement | null>(null)
const pendingAttachments = ref<{ name: string; type: string; data: string }[]>([])
const showAttachMenu = ref(false)
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
const previewImage = ref<string | null>(null)
const loadingAttachment = ref(false)
const dragging = ref(false)
const MAX_ATTACHMENTS = 5
const attachLimitMsg = ref(false)

const showQuickPrompt = ref(false)
const quickPromptSearch = ref('')
const quickPromptCategory = ref('')
const quickDirectSend = ref(false)

watch([quickPromptSearch, quickPromptCategory], () => { quickPage.value = 1 })
const quickPromptGroups = computed(() => presetStore.visibleGrouped('chat_quick'))
const quickCategories = computed(() => presetStore.categories.filter((c) => c.type === 'chat_quick'))
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

const botInitial = computed(() => {
  const name = selectedBotName.value
  return name ? name.charAt(0) : 'AI'
})

const visibleMessages = computed(() =>
  chatStore.messages.filter((m) => {
    if (m.role === 'tool') return false
    if (m.role === 'assistant' && m.tool_calls?.length && !m.content) return false
    return m.role === 'user' || (m.role === 'assistant' && (m.content || chatStore.streaming))
  })
)

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node
  if (botSelectorRef.value && !botSelectorRef.value.contains(target)) {
    showBotSelector.value = false
  }
  if (toolbarDropdown.value && toolbarRef.value && !toolbarRef.value.contains(target)) {
    toolbarDropdown.value = ''
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

async function newConversation() {
  if (!selectedBotId.value) return
  const conv = await chatStore.createConversation(selectedBotId.value)
  await chatStore.selectConversation(conv.id)
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp'])
const DOC_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'json'])

function canAddAttachment(): boolean {
  if (pendingAttachments.value.length >= MAX_ATTACHMENTS) {
    attachLimitMsg.value = true
    setTimeout(() => { attachLimitMsg.value = false }, 2000)
    return false
  }
  return true
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
        const text = await file.text()
        pendingAttachments.value.push({ name: file.name, type: 'document', data: text })
      } finally {
        loadingAttachment.value = false
      }
    }
  }
}

function compressImage(dataUri: string, maxSize: number, quality: number): Promise<string> {
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
    img.src = dataUri
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
    }) as { canceled: boolean; filePaths: string[] }
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
        const data = await window.api.chat.invoke('readFileText', filePath) as string
        pendingAttachments.value.push({ name, type: 'document', data })
      }
    }
  } catch (err) {
    console.error('Failed to pick file:', err)
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
  const wsPath = `${dataDir}\\workspaces\\${chatStore.currentConversationId}`
  ;(window as any).api.shell.openPath(wsPath)
}

function onMessagesClick(e: MouseEvent) {
  const img = (e.target as HTMLElement).closest('.prose img') as HTMLImageElement | null
  if (img?.src) {
    previewImage.value = img.src
    return
  }
  const btn = (e.target as HTMLElement).closest('.link-jump-btn') as HTMLElement | null
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

async function copyMessage(msg: any) {
  try {
    await navigator.clipboard.writeText(msg.content || '')
    copiedId.value = msg.id
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch { /* ignore */ }
}

async function send() {
  const text = inputText.value.trim()
  if ((!text && !pendingAttachments.value.length) || chatStore.streaming) return
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
  chatStore.listenTitleUpdates()
  await Promise.all([
    botStore.fetchBots(),
    kbStore.fetchCategories(),
    skillStore.fetchSkills(),
    mcpStore.fetchServers(),
    promptSkillStore.fetchSkills(),
    presetStore.fetchAll('chat_quick')
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
  scrollToBottom()
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
  chatStore.stopListenTitleUpdates()
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
