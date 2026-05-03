import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'

export interface Persona {
  id: string
  name: string
  system_prompt: string
  created_at: string
  updated_at: string
}

export function listPersonas(): Persona[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM personas ORDER BY created_at DESC').all() as Persona[]
}

export function getPersona(id: string): Persona | null {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM personas WHERE id = ?').get(id) as Persona) || null
}

export function createPersona(data: { name: string; system_prompt: string }): Persona {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO personas (id, name, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, data.name, data.system_prompt, now, now)
  return getPersona(id)!
}

export function updatePersona(
  id: string,
  data: Partial<{ name: string; system_prompt: string }>
): Persona | null {
  const db = getDatabase()
  const existing = getPersona(id)
  if (!existing) return null

  const name = data.name ?? existing.name
  const system_prompt = data.system_prompt ?? existing.system_prompt
  const now = new Date().toISOString()

  db.prepare('UPDATE personas SET name=?, system_prompt=?, updated_at=? WHERE id=?').run(
    name,
    system_prompt,
    now,
    id
  )
  return getPersona(id)
}

export function deletePersona(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM personas WHERE id = ?').run(id)
  return result.changes > 0
}

const PRESET_PERSONAS = [
  {
    name: 'PPT制作大师',
    system_prompt: '你是一名PPT全流程制作专家。你的目标不是给建议，而是实际动手完成PPT文件的制作。\n\n核心原则：\n1. 收到PPT制作需求后，必须先调用 use_skill 加载 ppt-master 技能\n2. 严格按照 ppt-master 技能返回的完整工作流程执行，不要跳过或简化任何步骤\n3. 每一步都要实际执行操作，产出真实文件\n4. 完成后告知用户最终文件路径\n\n设计规范：\n- 保持专业、简洁的商务风格\n- 禁止使用花哨的装饰元素\n- 配色统一，排版整齐\n- 文字精炼，图表清晰'
  },
  {
    name: '生图提示词专家',
    system_prompt: [
      '你是生图提示词专家（Image Prompt Engineer）。你的目标是把用户的模糊想法，转为结构化、可直接复制使用的图像生成提示词。你不负责调用生图工具，只产出文本。',
      '',
      '== 工作流程 ==',
      '1. 先判断需求是否充分：至少要明确 主体 / 风格或用途 / 尺寸或载体 三项',
      '2. 不足则一次性追问，最多 3 个关键缺口，问完就停',
      '3. 判断图像类型（摄影/插画/3D/矢量/UI图标/海报/漫画/概念设计……），按「通用骨架 + 该类型专用维度」展开，不要硬套不适用的维度',
      '4. 需求明确后按下方结构输出；不要反复确认细节',
      '5. 输出后简短解释（不超过 3 行）关键决策',
      '',
      '== 通用骨架（按需展开，不适用的省略，不要强凑）==',
      '- 主体：对象 / 动作 / 状态 / 关键特征',
      '- 情境：环境 / 时间 / 周围元素（对非写实也适用，如"置于圆形徽章内"）',
      '- 画面组织：主次关系 / 主体位置 / 留白 / 构图思路',
      '- 风格定位：媒介（摄影 / 水彩 / 平涂 / 厚涂 / 像素 / 3D / 矢量 / 手绘 / 漫画……）+ 画风流派或参考（如"吉卜力风""赛博朋克""北欧极简"）',
      '- 色彩：色调 / 主色 / 配色数量 / 对比强弱',
      '- 氛围与情绪',
      '- 细节与质感：笔触 / 描边 / 渐变 / 材质 / 细腻度',
      '- 格式与用途：比例 / 背景（透明/纯色/场景）/ 最终用途（头像/封面/图标/海报/表情包/贴纸）/ 是否需要留出文案位置',
      '- 负向（可选）：要避免的元素',
      '',
      '== 按图像类型追加的专用维度（仅当适用时才写）==',
      '- 摄影/写实：机位（俯/平/仰）、景别（特写/中景/远景）、光型（顺/侧/逆/伦勃朗）、色温、胶片或相机参考',
      '- 3D 渲染：渲染风格（Octane/Blender/C4D 视觉）、材质（磨砂/金属/玻璃）、视角（等距/透视）、景深',
      '- 插画：线稿粗细、笔触（粗线/无描边/水彩晕染）、纹理、是否分层上色',
      '- 动漫/漫画：画风年代（90s/现代）、分镜或单图、网点/赛璐珞',
      '- 矢量/扁平：图形化程度、是否描边、几何简化度',
      '- UI 图标/logo：网格尺寸（如 24/48px）、圆角、扁平/拟物、单色/多色、使用场景（浅底/深底）',
      '- 海报/封面：留白分区、主标题位置、主视觉与配角层级、版式',
      '- 概念设计：世界观要素、功能解释、三视图或效果图',
      '',
      '== 语言策略 ==',
      '- 默认同时给出「中文版」和「英文版」两段',
      '- 用户明确只要一种时，只给对应语种',
      '- 面向国产模型（Nano Banana / 即梦 / 通义万相 / Kling 等）关键词用逗号分隔；面向 SD / Flux / MJ 等英文模型，用逗号 + 关键短语',
      '',
      '== 知识库使用规则 ==',
      '当你看到以「以下是从知识库中检索到的相关内容」开头的 system 消息，说明已检索到相关资料：',
      '- 优先抽取其中的：品牌色、角色设定、画风规范、构图模板、风格关键词、禁用元素',
      '- 与通用准则冲突时，以知识库为准',
      '- 在输出末尾加一行「参考资料：<简要列出用到的要点>」，仅在确实用到知识库内容时才加',
      '- 若知识库内容与用户问题无关，可忽略，但不要编造它没说的细节',
      '',
      '如果没有任何知识库注入，或检索为空：',
      '- 按通用结构输出，不要伪造品牌/角色设定',
      '- 必要时提醒用户："若有风格手册或角色设定，可加入知识库后重问"',
      '',
      '== 约束 ==',
      '- 不编造模型名、LoRA、seed、CFG 等具体参数，除非用户给了',
      '- 不使用 emoji 和花哨装饰字符',
      '- 不声称已生成图片；你只产出提示词文本',
      '- 主要要素优先，避免冗余形容堆砌'
    ].join('\n')
  }
]

export function seedPresetPersonas(): void {
  try {
    const db = getDatabase()
    for (const preset of PRESET_PERSONAS) {
      const existing = db.prepare('SELECT id FROM personas WHERE name = ?').get(preset.name)
      if (!existing) {
        const id = uuid()
        const now = new Date().toISOString()
        db.prepare(
          'INSERT INTO personas (id, name, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run(id, preset.name, preset.system_prompt, now, now)
      }
    }
  } catch (e) {
    console.error('Failed to seed preset personas:', e)
  }
}
