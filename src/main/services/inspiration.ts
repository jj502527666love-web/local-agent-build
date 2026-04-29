import { app } from 'electron'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import https from 'https'

export interface Inspiration {
  id: string
  title: string
  prompt_cn: string
  prompt_en: string
  category: string
  tags: string[]
  ref_image?: string
  cover_image?: string
}

let cachedInspirations: Inspiration[] | null = null

function getInspirationsPath(): string {
  const isProd = app.isPackaged
  if (isProd) {
    return join(process.resourcesPath, 'inspirations.json')
  }
  return join(__dirname, '../../resources/inspirations.json')
}

function loadInspirations(): Inspiration[] {
  if (cachedInspirations) return cachedInspirations

  const filePath = getInspirationsPath()
  if (!existsSync(filePath)) {
    cachedInspirations = []
    return cachedInspirations
  }

  try {
    const raw = readFileSync(filePath, 'utf-8')
    cachedInspirations = JSON.parse(raw) as Inspiration[]
  } catch {
    cachedInspirations = []
  }
  return cachedInspirations
}

export function listInspirations(options?: {
  category?: string
  search?: string
  page?: number
  pageSize?: number
}): { items: Inspiration[]; total: number; categories: string[] } {
  let items = loadInspirations()
  const allCategories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)))

  if (options?.category) {
    items = items.filter((i) => i.category === options.category)
  }

  if (options?.search) {
    const q = options.search.toLowerCase()
    items = items.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.prompt_cn.toLowerCase().includes(q) ||
        i.prompt_en.toLowerCase().includes(q) ||
        i.tags.some((t) => t.toLowerCase().includes(q))
    )
  }

  const total = items.length
  const page = options?.page || 1
  const pageSize = options?.pageSize || 20
  const offset = (page - 1) * pageSize
  items = items.slice(offset, offset + pageSize)

  return { items, total, categories: allCategories }
}

export function getInspiration(id: string): Inspiration | null {
  const items = loadInspirations()
  return items.find((i) => i.id === id) || null
}

export function reloadInspirations(): void {
  cachedInspirations = null
}

const ERNIE_API = 'https://aistudio.baidu.com/llm/lmapp/ernie-image/search'
let totalPages = 33 // ~1335 items / 40 per page

function mapErnieItem(item: any): Inspiration {
  const tags: string[] = Array.isArray(item.tag) ? item.tag : []
  let category = '创意'
  if (tags.some((t: string) => /人物|角色|少女|女性|男/.test(t))) category = '人物'
  else if (tags.some((t: string) => /风景|建筑|城市|自然/.test(t))) category = '风景'
  else if (tags.some((t: string) => /动漫|卡通|Q版|漫画/.test(t))) category = '动漫'
  else if (tags.some((t: string) => /设计|海报|字体|排版|信息图/.test(t))) category = '设计'
  return {
    id: `ernie-${item.conversationId}`,
    title: tags[0] || 'AI 创作',
    prompt_cn: item.prompt,
    prompt_en: item.prompt,
    category,
    tags: tags.slice(0, 5),
    cover_image: item.images?.[0]?.url
  }
}

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = ''
      res.on('data', (chunk: string) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    }).on('error', reject)
  })
}

export async function fetchOnlineInspirations(options?: {
  page?: number
  pageSize?: number
}): Promise<{ items: Inspiration[]; total: number }> {
  const pageSize = options?.pageSize || 40
  const page = options?.page || (Math.floor(Math.random() * totalPages) + 1)
  const url = `${ERNIE_API}?page=${page}&pageSize=${pageSize}`

  const json = await fetchJson(url)
  if (json.errorCode !== 0) throw new Error(json.errorMsg || 'API error')

  // Update totalPages dynamically
  if (json.result.totalPage) {
    totalPages = json.result.totalPage
  } else if (json.result.totalCount) {
    totalPages = Math.ceil(json.result.totalCount / pageSize)
  }

  const items = (json.result.data || []).map(mapErnieItem)

  // If empty (page out of range), retry with page 1
  if (!items.length) {
    const retryUrl = `${ERNIE_API}?page=1&pageSize=${pageSize}`
    const retryJson = await fetchJson(retryUrl)
    if (retryJson.errorCode === 0 && retryJson.result.data?.length) {
      return { items: retryJson.result.data.map(mapErnieItem), total: retryJson.result.totalCount || 0 }
    }
  }

  return { items, total: json.result.totalCount || items.length }
}
