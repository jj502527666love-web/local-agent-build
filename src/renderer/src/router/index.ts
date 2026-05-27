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
        // v0.6.9+ /models 改为 tab 容器：通用模型 / 视频模型 / 抠图接口
        // 子 tab 通过 ?tab=general|video|matting 控制，老链接 /video-models 重定向到 ?tab=video
        path: 'models',
        name: 'models',
        component: () => import('@/views/models/ModelsView.vue'),
        meta: { title: '模型服务' }
      },
      {
        // v0.6.9+ 视频模型菜单已并入「模型服务」tab。
        // 老链接 /video-models 重定向到 /models?tab=video，避免外链 / 收藏夹失效
        path: 'video-models',
        redirect: { name: 'models', query: { tab: 'video' } },
      },
      {
        // v0.6.9+ AI 抠图（阿里 viapi SegmentHDCommonImage）
        path: 'ai-matting',
        name: 'aiMatting',
        component: () => import('@/views/matting/MattingView.vue'),
        meta: { title: 'AI 抠图' }
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
        component: () => import('@/views/video/VideoCreationsView.vue'),
        meta: { title: '视频创作' }
      },
      {
        path: 'ai-video',
        name: 'aiVideo',
        component: () => import('@/views/video/AiVideoView.vue'),
        meta: { title: 'AI 视频' }
      },
      {
        // v0.7.7+ 创意模板：本地模板分类管理 + 云端模板浏览
        // 旧路径 /canvas-square 保留为「创意模板」入口（侧栏菜单已挂在此路径），无需迁移外链
        path: 'canvas-square',
        name: 'canvasSquare',
        component: () => import('@/views/creative-templates/CreativeTemplatesView.vue'),
        meta: { title: '创意模板' }
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
      },
      {
        path: 'oem-channel',
        name: 'oemChannel',
        component: () => import('@/views/user-center/OemChannelCenterView.vue'),
        meta: { title: '渠道中心' }
      }
    ]
  }
]
