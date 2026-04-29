# Flower Gift Shop Promotion - Design Specification & Content Outline

## I. Project Information
- Project Name: Flower Gift Shop Promotion PPT
- Canvas Format: PPT 16:9
- Dimensions: 1280×720
- Page Count: 5
- Style: A) General Versatile
- Audience: 鲜花礼品店潜在顾客、到店客户、节日送礼用户
- Scenario: 门店展示、客户介绍、节日礼赠宣传
- Date: 2026-04-28

## II. Canvas Specification
- Format: PPT 16:9
- viewBox: `0 0 1280 720`
- Margins: left/right 60px, top/bottom 50px
- Safe content area: 1160×620

## III. Visual Theme
- Theme: 简洁高级、温柔自然、礼赠感
- Mode: Light theme
- Tone: 柔和、克制、精致
- Color Scheme:
  - Primary: `#EFA7B8`
  - Secondary: `#F8F4EF`
  - Accent: `#556B57`
  - Text Dark: `#2F2A28`
  - Muted: `#BFAFA7`
- Gradient Scheme:
  - Soft rose gradient: `#F8F4EF` → `#F4D8DE`

## IV. Typography System
- Title family: `Georgia, "Times New Roman", serif`
- Body family: `"Microsoft YaHei", "PingFang SC", sans-serif`
- Emphasis family: `Georgia, "Times New Roman", serif`
- Font size hierarchy:
  - cover_title: 54px
  - title: 32px
  - subtitle: 22px
  - body: 18px
  - annotation: 13px
  - page_number: 11px

## V. Layout Principles
- Header zone: 60px top title band on content pages
- Content zone: flexible, image-text mixed layouts
- Footer zone: subtle page number and shop tagline
- Spacing: 20–32px modular spacing
- Radius: 18px image/card rounded corners
- Rhythm principle:
  - P01 anchor
  - P02 breathing
  - P03 dense
  - P04 dense
  - P05 anchor

## VI. Icon Usage Spec
- Source: Built-in style reference using rounded, lifestyle-friendly visual language
- Chosen library intent: tabler-filled style equivalent
- Approved icon inventory:
  - `tabler-filled/heart`
  - `tabler-filled/gift`
  - `tabler-filled/leaf`
  - `tabler-filled/phone`
  - `tabler-filled/shopping-bag`
  - `tabler-filled/currency-yen`
- User-provided ￥图标 will be used as a visual image asset on pricing/value page

## VII. Visualization Reference List
- No chart template required
- Use custom layout for promotional storytelling pages

## VIII. Image Resource List
| Filename | Dimensions | Ratio | Purpose | Type | Status | Generation description |
|----------|------------|-------|---------|------|--------|------------------------|
| user_yen.jpg | 320x320 | 1.00 | 价格友好/礼赠价值辅助图 | Illustration | Existing | 用户提供￥图标，圆形暖橙底色，用于价值感提示 |
| user_rose.jpg | 1024x768 | 1.33 | 封面主视觉、产品配图 | Photography | Existing | 用户提供玫瑰花束照片，用于品牌氛围和产品展示 |

## IX. Content Outline

### P01 封面
- Layout: Full-bleed hero image with left-bottom overlay text
- Title: 花意有礼
- Subtitle: 简洁高级的鲜花礼品店品牌宣传
- Content points:
  - 使用玫瑰照片作为全页主视觉
  - 突出节日送礼、日常表达、到店定制
  - 右上角加入小型￥图标呼应“价格友好”
- Visualization: custom layout

### P02 品牌介绍
- Layout: Breathing page, left text + right image crop
- Title: 把日常心意，变成值得珍藏的礼物
- Content points:
  - 精选花材，保持新鲜与层次
  - 轻奢包装，适合纪念日、生日、探望、节日赠礼
  - 让鲜花兼具美感与仪式感
- Visualization: custom layout

### P03 产品卖点
- Layout: Dense 3-column card layout
- Title: 三个理由，让顾客更愿意选择我们
- Content points:
  - 花材新鲜：每日精选，色彩柔和
  - 搭配高级：简洁包装，审美统一
  - 送礼省心：到店自提、礼赠推荐、快速沟通
- Visualization: custom layout

### P04 服务与订购
- Layout: Dense split layout with service list and value icon
- Title: 从挑选到送出，流程简单而体面
- Content points:
  - 节日花束 / 生日鲜花 / 小型礼盒搭配
  - 预算友好方案与定制建议
  - 电话/到店咨询，快速下单
- Visualization: custom layout

### P05 结尾引导
- Layout: Anchor ending page with centered message
- Title: 让每一次送花，都更有分寸与温度
- Content points:
  - 欢迎到店挑选
  - 可按场景推荐花束
  - 用一束花，表达刚刚好的心意
- Visualization: custom layout

## X. Speaker Notes Requirements
- Notes style: 自然、温柔、面向顾客沟通
- Purpose: inspire + inform
- File naming: match SVG file names
- total duration: 3–5 minutes

## XI. Technical Constraints Reminder
- SVG must use viewBox `0 0 1280 720`
- No `style`, `class`, `mask`, `foreignObject`
- Use inline attributes only
- Use image references via `../images/`
- Keep typography and color usage consistent with this spec
