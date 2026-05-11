import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { guest: true }
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/chat' },
      { path: 'chat', name: 'chat', component: () => import('@/views/chat/ChatView.vue'), meta: { title: '对话' } },
      { path: 'bots', name: 'bots', component: () => import('@/views/bots/BotListView.vue'), meta: { title: '智能体' } },
      {
        path: 'knowledge',
        name: 'knowledge',
        component: () => import('@/views/knowledge/KnowledgeView.vue'),
        meta: { title: '知识库' }
      },
      {
        path: 'knowledge/:categoryId',
        name: 'knowledgeCategory',
        component: () => import('@/views/knowledge/KnowledgeCategoryView.vue'),
        meta: { title: '知识库分类' }
      },
      {
        path: 'knowledge/vectors',
        name: 'vectorStats',
        component: () => import('@/views/knowledge/VectorStatsView.vue'),
        meta: { title: '向量统计' }
      },
      {
        path: 'models',
        name: 'models',
        component: () => import('@/views/models/ModelView.vue'),
        meta: { title: '模型服务' }
      },
      {
        path: 'video-models',
        name: 'videoModels',
        component: () => import('@/views/common/DevelopingView.vue'),
        meta: { title: '视频模型' }
      },
      {
        path: 'personas',
        name: 'personas',
        component: () => import('@/views/personas/PersonaView.vue'),
        meta: { title: '人格规则' }
      },
      {
        path: 'tools',
        name: 'tools',
        component: () => import('@/views/skills/SkillView.vue'),
        meta: { title: '小工具' }
      },
      {
        path: 'skills',
        name: 'skills',
        component: () => import('@/views/skills/SkillsView.vue'),
        meta: { title: 'Skills技能' }
      },
      { path: 'mcps', name: 'mcps', component: () => import('@/views/mcps/McpView.vue'), meta: { title: 'MCP技能' } },
      {
        path: 'image-gen',
        name: 'imageGen',
        component: () => import('@/views/image-gen/ImageGenView.vue'),
        meta: { title: 'AI 生图' }
      },
      {
        path: 'batch-gen',
        name: 'batchGen',
        component: () => import('@/views/image-gen/BatchGenView.vue'),
        meta: { title: '批量生图' }
      },
      {
        path: 'image-to-prompt',
        name: 'imageToPrompt',
        component: () => import('@/views/image-gen/Image2PromptView.vue'),
        meta: { title: '图片反推' }
      },
      {
        path: 'image-toolkit',
        name: 'imageToolkit',
        component: () => import('@/views/image-toolkit/ImageToolkitView.vue'),
        meta: { title: '图像处理' }
      },
      {
        path: 'image-toolkit/collage',
        name: 'imageToolkitCollage',
        component: () => import('@/views/image-toolkit/CollageView.vue'),
        meta: { title: '拼图拼接' }
      },
      {
        path: 'image-toolkit/watermark',
        name: 'imageToolkitWatermark',
        component: () => import('@/views/image-toolkit/WatermarkView.vue'),
        meta: { title: '加水印' }
      },
      {
        path: 'image-toolkit/format-convert',
        name: 'imageToolkitFormatConvert',
        component: () => import('@/views/image-toolkit/FormatConvertView.vue'),
        meta: { title: '格式转换' }
      },
      {
        path: 'image-toolkit/compress',
        name: 'imageToolkitCompress',
        component: () => import('@/views/image-toolkit/CompressView.vue'),
        meta: { title: '图片压缩' }
      },
      {
        path: 'image-toolkit/slice',
        name: 'imageToolkitSlice',
        component: () => import('@/views/image-toolkit/SliceView.vue'),
        meta: { title: '切图' }
      },
      {
        path: 'image-toolkit/gif',
        name: 'imageToolkitGif',
        component: () => import('@/views/image-toolkit/GifView.vue'),
        meta: { title: 'GIF 制作' }
      },
      {
        path: 'inspiration',
        name: 'inspiration',
        component: () => import('@/views/image-gen/InspirationView.vue'),
        meta: { title: '灵感广场' }
      },
      {
        path: 'my-creations',
        name: 'myCreations',
        component: () => import('@/views/image-gen/MyCreationsView.vue'),
        meta: { title: '图片创作' }
      },
      {
        path: 'video-creations',
        name: 'videoCreations',
        component: () => import('@/views/common/DevelopingView.vue'),
        meta: { title: '视频创作' }
      },
      {
        path: 'ai-video',
        name: 'aiVideo',
        component: () => import('@/views/common/DevelopingView.vue'),
        meta: { title: 'AI 视频' }
      },
      {
        path: 'canvas-square',
        name: 'canvasSquare',
        component: () => import('@/views/common/DevelopingView.vue'),
        meta: { title: '画布广场' }
      },
      {
        path: 'image-edit/:id',
        name: 'imageEdit',
        component: () => import('@/views/image-gen/ImageEditView.vue'),
        meta: { title: '图片编辑' }
      },
      {
        path: 'canvas',
        name: 'canvas',
        component: () => import('@/views/canvas/CanvasListView.vue'),
        meta: { title: '流式画布' }
      },
      {
        path: 'canvas/:id',
        name: 'canvasEditor',
        component: () => import('@/views/canvas/CanvasEditorView.vue'),
        meta: { title: '流式画布编辑' }
      },
      {
        path: 'gallery',
        name: 'gallery',
        component: () => import('@/views/gallery/GalleryView.vue'),
        meta: { title: '本地图库' }
      },
      {
        path: 'prompts',
        name: 'prompts',
        component: () => import('@/views/prompts/PromptManageView.vue'),
        meta: { title: '提示词' }
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/settings/SettingsView.vue'),
        meta: { title: '设置' }
      },
      {
        path: 'user-center',
        name: 'userCenter',
        component: () => import('@/views/user-center/UserCenterView.vue'),
        meta: { title: '用户中心' }
      },
      {
        path: 'plans-store',
        name: 'plansStore',
        component: () => import('@/views/plans-store/PlansStoreView.vue'),
        meta: { title: '套餐商城' }
      }
    ]
  }
]
