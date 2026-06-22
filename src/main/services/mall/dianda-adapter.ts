// ============================================================================
// 点大商城（iappwx）适配器。协议见 docs/多商城接入方案-店铺商品图泛化.md §1（已抓包实测）。
// 与 ewei 关键差异：
//   - ThinkPHP + PHPSESSID Cookie 会话（需 cookie jar），密码明文，登录每次要图形验证码。
//   - 无需切门店：登录后 ?s=/ShopProduct/index 直接列商品。
//   - 图片是绝对 URL；上传 ?s=/upload/index 字段 file → {status:1,url}。
//   - 保存 ?s=/ShopProduct/save 是「全量替换」：缺字段静默清空 → 必须取该商品全部表单字段、
//     只改目标图字段、整体回提（harvestEditForm + 覆盖 + POST）。
// ============================================================================
import { readFileSync } from 'fs'
import { BrowserWindow } from 'electron'
import { getAbsolutePath } from '../image-generation'
import { makeUploadThumbnail } from '../thumbnail-upload'
import * as connectorService from '../ewei-connectors'
import type {
  MallAdapter,
  MallBeginLoginResult,
  MallCaptchaChallenge,
  MallShop,
  MallGoodsListItem,
  MallGoodsListParams,
  MallGoodsDetail,
  MallCategory,
  EweiUploadResult,
  ReplaceGoodsImageArgs,
} from './types'

// 复用 ewei 的错误类型语义（renderer 已能识别 message）。
class DiandaError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message || `点大接口错误(${code})`)
    this.name = 'DiandaError'
    this.code = code
  }
}

// ---- 会话（cookie jar）：内存态 + 持久化到连接器 extra_json，减少验证码频次 ----
interface DiandaSession {
  cookie: string // 形如 'PHPSESSID=xxx; xxx=yyy'
  loggedIn: boolean
}
const sessions = new Map<string, DiandaSession>()

function getSession(connectorId: string): DiandaSession {
  let s = sessions.get(connectorId)
  if (!s) {
    // 启动后首次：尝试从 extra_json 恢复上次持久化的 cookie（可能仍有效 → 免验证码）
    const extra = connectorService.getExtra(connectorId)
    s = { cookie: typeof extra.dd_cookie === 'string' ? extra.dd_cookie : '', loggedIn: false }
    sessions.set(connectorId, s)
  }
  return s
}

function persistCookie(connectorId: string, cookie: string): void {
  const s = getSession(connectorId)
  s.cookie = cookie
  connectorService.setExtra(connectorId, { dd_cookie: cookie })
}

export function clearSession(connectorId: string): void {
  sessions.delete(connectorId)
}

/** 合并 Set-Cookie 到 jar（只保留 name=value，丢弃属性）。 */
function mergeSetCookie(connectorId: string, res: Response): void {
  let list: string[] = []
  const anyHeaders = res.headers as any
  if (typeof anyHeaders.getSetCookie === 'function') list = anyHeaders.getSetCookie()
  else {
    const sc = res.headers.get('set-cookie')
    if (sc) list = [sc]
  }
  if (!list.length) return
  const s = getSession(connectorId)
  const jar: Record<string, string> = {}
  for (const part of (s.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) jar[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  for (const raw of list) {
    const first = raw.split(';')[0]
    const i = first.indexOf('=')
    if (i > 0) jar[first.slice(0, i).trim()] = first.slice(i + 1).trim()
  }
  s.cookie = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

// ---- 进度广播（复用 ewei:progress 信道，renderer 监听同一事件）----
function broadcastProgress(p: any): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('ewei:progress', p)
    } catch {
      /* ignore */
    }
  }
}

// ---- 底层请求 ----
function baseUrl(connectorId: string): string {
  const creds = connectorService.resolveCredentials(connectorId)
  if (!creds) throw new DiandaError(-1, '连接器不存在')
  return creds.base_url.endsWith('/') ? creds.base_url : creds.base_url + '/'
}

/** 构造 `?s=/route` URL（route 形如 'ShopProduct/index'）。 */
function buildUrl(base: string, route: string, query?: Record<string, string | number | undefined>): string {
  let url = base + '?s=/' + route
  if (query) {
    const qs = Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) url += '&' + qs
  }
  return url
}

interface ReqOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
  form?: Record<string, string> // x-www-form-urlencoded（单值）
  formBody?: string // 预构造的 x-www-form-urlencoded body（支持同名多值字段，全量回提用）
  formData?: FormData // multipart
  timeoutMs?: number
}

async function rawFetch(connectorId: string, route: string, opts: ReqOptions): Promise<Response> {
  const base = baseUrl(connectorId)
  const s = getSession(connectorId)
  const headers: Record<string, string> = { 'x-requested-with': 'XMLHttpRequest' }
  if (s.cookie) headers['cookie'] = s.cookie
  let body: any
  if (opts.formData) {
    body = opts.formData // 让 fetch 注入 multipart boundary
  } else if (opts.formBody !== undefined) {
    headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    body = opts.formBody
  } else if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    body = new URLSearchParams(opts.form).toString()
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || (opts.formData ? 120_000 : 30_000))
  let res: Response
  try {
    res = await fetch(buildUrl(base, route, opts.query), {
      method: opts.method || 'GET',
      headers,
      body,
      redirect: 'manual', // 未登录会 302 跳登录页，自己识别
      signal: controller.signal,
    })
  } catch (e: any) {
    throw new DiandaError(-1, `网络请求失败：${e?.message || e}`)
  } finally {
    clearTimeout(timer)
  }
  mergeSetCookie(connectorId, res)
  return res
}

/** 期望 JSON 响应的请求；登录态失效(跳转/HTML)时抛「需重新登录」。 */
async function requestJson(connectorId: string, route: string, opts: ReqOptions): Promise<any> {
  const res = await rawFetch(connectorId, route, opts)
  if (res.status >= 300 && res.status < 400) {
    getSession(connectorId).loggedIn = false
    throw new DiandaError(-10000, '登录态已失效，请重新登录（点大需重新输入验证码）')
  }
  const text = await res.text()
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    // 非 JSON 多半是被重定向回登录页的 HTML
    getSession(connectorId).loggedIn = false
    throw new DiandaError(-10000, '登录态已失效，请重新登录（点大需重新输入验证码）')
  }
  return json
}

// ---- 登录（验证码两步）----
async function fetchCaptcha(connectorId: string): Promise<MallCaptchaChallenge> {
  // 确保有 PHPSESSID：先访问登录页种 cookie，再拉与该 session 绑定的验证码图
  await rawFetch(connectorId, 'Login/index', { method: 'GET' })
  const res = await rawFetch(connectorId, 'captcha', { method: 'GET' })
  const buf = Buffer.from(await res.arrayBuffer())
  const mime = res.headers.get('content-type') || 'image/png'
  return { needCaptcha: true, captchaImage: `data:${mime};base64,${buf.toString('base64')}` }
}

const diandaAdapter: MallAdapter = {
  platform: 'dianda',
  capabilities: {
    needsShopSwitch: false,
    needsCaptcha: true,
    supportsAddGoods: false,
    supportsGallery: true,
    detailFormat: 'blocks',
  },

  async beginLogin(connectorId: string): Promise<MallBeginLoginResult> {
    // 先试用持久化的 cookie 是否仍有效（探一个只读接口）；有效则免验证码直接成功
    const s = getSession(connectorId)
    if (s.cookie) {
      try {
        const probe = await requestJson(connectorId, 'ShopProduct/index', { query: { page: 1, limit: 1 } })
        if (probe && Number(probe.code) === 0) {
          s.loggedIn = true
          const creds = connectorService.resolveCredentials(connectorId)
          connectorService.updateLoginResult(connectorId, 'success', '已登录（复用会话）')
          return { needCaptcha: false, result: makeLoginResult(creds?.account || '') }
        }
      } catch {
        /* cookie 失效，走验证码 */
      }
    }
    return await fetchCaptcha(connectorId)
  },

  async submitLogin(connectorId: string, captcha: string): Promise<MallBeginLoginResult> {
    const creds = connectorService.resolveCredentials(connectorId)
    if (!creds) throw new DiandaError(-1, '连接器不存在')
    const res = await rawFetch(connectorId, 'Login/index', {
      method: 'POST',
      form: {
        username: creds.account,
        password: creds.password, // 点大明文提交
        captcha: (captcha || '').trim(),
        remember: '1', // 自动登录，延长会话、减少验证码
      },
    })
    let json: any
    try {
      json = JSON.parse(await res.text())
    } catch {
      throw new DiandaError(-1, '登录响应异常')
    }
    if (Number(json.status) === 2) {
      // 验证码错：返回新挑战让用户重输
      connectorService.updateLoginResult(connectorId, 'failed', json.msg || '验证码错误')
      return await fetchCaptcha(connectorId)
    }
    if (Number(json.status) === 1 || json.url) {
      const s = getSession(connectorId)
      s.loggedIn = true
      persistCookie(connectorId, s.cookie)
      connectorService.updateLoginResult(connectorId, 'success', '已登录')
      return { needCaptcha: false, result: makeLoginResult(creds.account) }
    }
    const msg = json.msg || '登录失败'
    connectorService.updateLoginResult(connectorId, 'failed', msg)
    throw new DiandaError(Number(json.status) || -1, msg)
  },

  async refreshCaptcha(connectorId: string): Promise<MallCaptchaChallenge> {
    return await fetchCaptcha(connectorId)
  },

  async logout(connectorId: string): Promise<void> {
    try {
      await rawFetch(connectorId, 'Login/logout', { method: 'GET' })
    } catch {
      /* ignore */
    }
    connectorService.setExtra(connectorId, { dd_cookie: null })
    clearSession(connectorId)
  },

  // 点大无门店切换：返回空列表，renderer 据 capabilities.needsShopSwitch=false 不展示选门店
  async listShops(): Promise<{ list: MallShop[]; count: number }> {
    return { list: [], count: 0 }
  },
  async switchShop(): Promise<{ ok: boolean }> {
    return { ok: true }
  },

  async listGoods(connectorId: string, params: MallGoodsListParams = {}): Promise<{ list: MallGoodsListItem[]; count: number }> {
    const json = await requestJson(connectorId, 'ShopProduct/index', {
      query: {
        page: params.page || 1,
        limit: params.pagesize || 20,
        name: params.title,
        status: params.status,
        cid: params.category_ids,
      },
    })
    if (Number(json.code) !== 0) throw new DiandaError(Number(json.code) || -1, json.msg || '获取商品失败')
    const list: MallGoodsListItem[] = (json.data || []).map((g: any) => ({
      id: Number(g.id),
      title: String(g.name || ''),
      thumb: String(g.pic || ''), // 点大主图已是绝对 URL
      status: Number(g.status) || 0,
      has_option: hasRealOption(g.guigedata) ? 1 : 0,
      selling_type: 0,
      type: Number(g.product_type) || 0,
      price: String(g.sell_price ?? ''),
    }))
    return { list, count: Number(json.count) || list.length }
  },

  async getGoodsDetail(connectorId: string, goodsId: number): Promise<MallGoodsDetail> {
    const product = await fetchProduct(connectorId, goodsId)
    const pics = String(product.pics || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    // 整形成 ewei 风格 goods，让现有 EweiGoodsImageView 能预览主图/图集
    const goods: any = {
      id: Number(product.id),
      title: String(product.name || ''),
      thumb: String(product.pic || ''),
      thumbs: pics,
      content: '', // 点大详情是块状 JSON（见 capabilities.detailFormat='blocks'），暂不在此预览
      has_option: hasRealOption(product.guigedata) ? 1 : 0,
    }
    return { goods, options: [], specs: [] }
  },

  async replaceGoodsImage(args: ReplaceGoodsImageArgs): Promise<{ ok: boolean; uploaded: EweiUploadResult[] }> {
    const { connectorId, goodsId, slot, images } = args
    if (!images || !images.length) throw new DiandaError(-1, '没有可应用的图片')
    if (slot === 'optionThumb') {
      throw new DiandaError(-1, '点大多规格 SKU 图替换暂未支持（待补测多规格保存字段）')
    }
    if (slot === 'detailReplace' || slot === 'detailAppend') {
      throw new DiandaError(-1, '点大详情图为块状结构，详情图替换暂未支持（待实现块状详情）')
    }

    const taskId = Math.random().toString(16).slice(2, 10)
    const logId = connectorService.createImageLog({
      connectorId,
      shopId: 0,
      goodsId,
      goodsTitle: '',
      slot,
      oldValue: null,
    })
    try {
      // 1) 先取编辑页全部表单字段 + 商品对象作为全量回提基底（点大 save 是全量替换，缺字段静默清空）。
      //    params 用 URLSearchParams：同名多值字段(如门店绑定 info[bind_mendian_ids][])经 append 完整保留。
      broadcastProgress({ taskId, goodsId, phase: 'saving', message: '读取商品现状…' })
      const { params, product } = await harvestEditForm(connectorId, goodsId)
      // 多规格商品的 save 字段展开(option[N]/specs/guigedata)尚未实测，全量替换下可能清空 SKU → 所有图位整体拒绝
      if (hasRealOption(product?.guigedata)) {
        throw new DiandaError(-1, '点大多规格商品改图暂未支持（多规格保存字段待补测，已中止以避免误删 SKU）')
      }
      if (!params.get('info[name]')) {
        throw new DiandaError(-1, '未能读取商品完整数据，已中止以避免误删（请重试或检查登录态）')
      }

      // 2) 上传新图（点大上传走商户后台存储，返回绝对 URL）
      const uploaded: EweiUploadResult[] = []
      for (let i = 0; i < images.length; i++) {
        broadcastProgress({ taskId, goodsId, phase: 'uploading', current: i, total: images.length, message: `上传第 ${i + 1}/${images.length} 张` })
        uploaded.push(await uploadImage(connectorId, images[i]))
      }
      connectorService.updateImageLog(logId, { status: 'uploaded', newPaths: uploaded.map((u) => u.url) })

      // 3) 覆盖目标图片字段（.set 替换该键全部值；其余字段含多值数组原样保留）
      const urls = uploaded.map((u) => u.url)
      if (slot === 'mainThumb') {
        params.set('info[pic]', urls[0])
      } else if (slot === 'galleryReplace') {
        params.set('info[pics]', urls.join(','))
        if (!params.get('info[pic]')) params.set('info[pic]', urls[0])
      } else if (slot === 'galleryAppend') {
        const cur = (params.get('info[pics]') || '').split(',').map((s) => s.trim()).filter(Boolean)
        params.set('info[pics]', [...cur, ...urls].join(','))
      }

      // 4) 整体回提
      broadcastProgress({ taskId, goodsId, phase: 'saving', message: '写回商品…' })
      const json = await requestJson(connectorId, 'ShopProduct/save', { method: 'POST', formBody: params.toString() })
      if (Number(json.status) !== 1) throw new DiandaError(Number(json.status) || -1, json.msg || '保存失败')

      connectorService.updateImageLog(logId, { status: 'done' })
      broadcastProgress({ taskId, goodsId, phase: 'done', message: '已应用到商品' })
      return { ok: true, uploaded }
    } catch (e: any) {
      const msg = e?.message || '替换失败'
      connectorService.updateImageLog(logId, { status: 'failed', error: msg })
      broadcastProgress({ taskId, goodsId, phase: 'error', message: msg })
      throw e
    }
  },

  async listGoodsCategories(connectorId: string): Promise<MallCategory[]> {
    // 点大分类内嵌在列表页 cid 下拉；简单 GET getcategory 返回「无权限」。暂返回空（不影响主图/图集替换）。
    void connectorId
    return []
  },

  async addGoods(): Promise<{ goodsId: number }> {
    throw new DiandaError(-1, '点大暂不支持在桌面端新增商品')
  },
}

// ---- 辅助 ----
function makeLoginResult(account: string) {
  return { uid: 0, account, contact: account, isAdmin: false, isRoot: false, isMerch: false, isSupply: false }
}

/** guigedata 是否为「真·多规格」（非单一默认规格）。 */
function hasRealOption(guigedata: any): boolean {
  try {
    const arr = typeof guigedata === 'string' ? JSON.parse(guigedata) : guigedata
    if (!Array.isArray(arr) || !arr.length) return false
    if (arr.length > 1) return true
    const items = arr[0]?.items
    return Array.isArray(items) && items.length > 1
  } catch {
    return false
  }
}

const MAX_UPLOAD_SIDE = 2400

async function uploadImage(connectorId: string, localPath: string): Promise<EweiUploadResult> {
  const abs = getAbsolutePath(localPath)
  let buf: Buffer<ArrayBufferLike> = readFileSync(abs)
  let name = abs.split(/[\\/]/).pop() || 'image.png'
  const send = async (b: Buffer, n: string): Promise<any> => {
    const fd = new FormData()
    fd.append('file', new Blob([new Uint8Array(b)]), n)
    const res = await rawFetch(connectorId, 'upload/index', { method: 'POST', formData: fd })
    return JSON.parse(await res.text())
  }
  let json: any
  try {
    json = await send(buf, name)
  } catch (e: any) {
    throw new DiandaError(-1, `上传失败：${e?.message || e}`)
  }
  if (Number(json.status) !== 1 || !json.url) {
    // 文件过大兜底：压成 JPEG 重试一次
    if (/大|large|size|超/i.test(String(json.msg || ''))) {
      const jpeg = makeUploadThumbnail(buf, MAX_UPLOAD_SIDE, 90)
      if (jpeg) {
        buf = jpeg
        name = name.replace(/\.[^.]+$/, '') + '.jpg'
        json = await send(buf, name)
      }
    }
  }
  if (Number(json.status) !== 1 || !json.url) {
    throw new DiandaError(Number(json.status) || -1, json.msg || '上传失败')
  }
  const info = json.info || {}
  return {
    path: String(json.url), // 点大回写用绝对 URL，path 与 url 同
    url: String(json.url),
    width: Number(info.width) || 0,
    height: Number(info.height) || 0,
    id: Number(info.id) || 0,
  }
}

/** 取单品完整数据：解析编辑页内嵌的 `var product = {...}`。 */
async function fetchProduct(connectorId: string, goodsId: number): Promise<any> {
  const res = await rawFetch(connectorId, `ShopProduct/edit/id/${goodsId}`, { method: 'GET' })
  if (res.status >= 300 && res.status < 400) {
    getSession(connectorId).loggedIn = false
    throw new DiandaError(-10000, '登录态已失效，请重新登录')
  }
  const html = await res.text()
  const product = extractJsVar(html, 'product')
  if (!product) throw new DiandaError(-1, '未能解析商品数据（编辑页结构可能变更）')
  return product
}

/**
 * 取编辑页服务端渲染的全部商品表单字段（name→value），作为全量回提基底。
 * 仅收商品表单相关字段（info[*] / option[*] / specs / id / 佣金 / 运费等），避免抓到搜索框/模板行。
 * 这是「保存=全量替换、缺字段清空」下的安全做法：忠实复刻官方编辑页提交的字段集。
 */
async function harvestEditForm(
  connectorId: string,
  goodsId: number,
): Promise<{ params: URLSearchParams; product: any }> {
  const res = await rawFetch(connectorId, `ShopProduct/edit/id/${goodsId}`, { method: 'GET' })
  if (res.status >= 300 && res.status < 400) {
    getSession(connectorId).loggedIn = false
    throw new DiandaError(-10000, '登录态已失效，请重新登录')
  }
  const html = await res.text()
  const params = new URLSearchParams()
  for (const [name, value] of extractFormEntries(html)) params.append(name, value)
  const product = extractJsVar(html, 'product')
  // 详情(info[detail])可能由 JS 从 var product 注入而非静态 value；缺则从 product 补，避免清空详情
  if (!params.has('info[detail]') && product && product.detail !== undefined) {
    params.append('info[detail]', typeof product.detail === 'string' ? product.detail : JSON.stringify(product.detail))
  }
  if (!params.has('id')) params.append('id', String(goodsId))
  return { params, product }
}

/**
 * 从 HTML 抽取 input/textarea/select 的 name→value（限定商品表单相关字段名），返回 entries 数组。
 * 多值数组字段（name 以 `[]` 结尾，如门店绑定 info[bind_mendian_ids][]）全部保留；
 * 标量字段去重保留首个，避免编辑页隐藏/模板行重复污染全量回提。
 */
function extractFormEntries(html: string): Array<[string, string]> {
  const entries: Array<[string, string]> = []
  const seen = new Set<string>()
  const want = (name: string): boolean =>
    name === 'id' ||
    name.startsWith('info[') ||
    name.startsWith('option[') ||
    name === 'specs' ||
    name.startsWith('ggname') ||
    name.startsWith('commissiondata') ||
    name.startsWith('commissionpingjidata') ||
    name.startsWith('gdfenhong') ||
    name.startsWith('jd_') ||
    name === 'province' ||
    name === 'city' ||
    name === 'district'
  const add = (name: string, value: string): void => {
    if (!name.endsWith('[]')) {
      if (seen.has(name)) return
      seen.add(name)
    }
    entries.push([name, value])
  }

  // input
  const inputRe = /<input\b([^>]*)>/gi
  let m: RegExpExecArray | null
  while ((m = inputRe.exec(html))) {
    const attrs = m[1]
    const name = attrOf(attrs, 'name')
    if (!name || !want(name)) continue
    const type = (attrOf(attrs, 'type') || 'text').toLowerCase()
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(attrs)) continue
    add(name, decodeHtml(attrOf(attrs, 'value') || ''))
  }
  // textarea
  const taRe = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi
  while ((m = taRe.exec(html))) {
    const name = attrOf(m[1], 'name')
    if (!name || !want(name)) continue
    add(name, decodeHtml(m[2] || ''))
  }
  // select：取 selected option（无则首个）
  const selRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi
  while ((m = selRe.exec(html))) {
    const name = attrOf(m[1], 'name')
    if (!name || !want(name)) continue
    const body = m[2]
    let val = ''
    let first = ''
    const optRe = /<option\b([^>]*)>/gi
    let om: RegExpExecArray | null
    while ((om = optRe.exec(body))) {
      const v = attrOf(om[1], 'value') || ''
      if (first === '') first = v
      if (/\bselected\b/i.test(om[1])) {
        val = v
        break
      }
    }
    add(name, decodeHtml(val || first))
  }
  return entries
}

function attrOf(attrs: string, key: string): string | null {
  const re = new RegExp(key + '\\s*=\\s*"([^"]*)"', 'i')
  const m = re.exec(attrs)
  if (m) return m[1]
  const re2 = new RegExp(key + "\\s*=\\s*'([^']*)'", 'i')
  const m2 = re2.exec(attrs)
  return m2 ? m2[1] : null
}

function decodeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** 从页面脚本里抽取 `var NAME = {...};` / `var NAME = [...];` 并 JSON.parse。 */
function extractJsVar(html: string, name: string): any {
  const idx = html.indexOf('var ' + name)
  if (idx < 0) return null
  const eq = html.indexOf('=', idx)
  if (eq < 0) return null
  let i = eq + 1
  while (i < html.length && /\s/.test(html[i])) i++
  const open = html[i]
  const close = open === '{' ? '}' : open === '[' ? ']' : ''
  if (!close) return null
  // 括号配平扫描（跳过字符串内的括号）
  let depth = 0
  let inStr: string | null = null
  let esc = false
  let end = -1
  for (let j = i; j < html.length; j++) {
    const c = html[j]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'") {
      inStr = c
      continue
    }
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) {
        end = j
        break
      }
    }
  }
  if (end < 0) return null
  const raw = html.slice(i, end + 1)
  try {
    return JSON.parse(raw)
  } catch {
    // 标准 var product 为合法 JSON(双引号)，首次即成功。非标准时仅给「未加引号的 key」补双引号，
    // 不全局替换单引号——否则会破坏字符串值内的合法撇号(商品名/详情常含 ')。
    try {
      return JSON.parse(raw.replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":'))
    } catch {
      return null
    }
  }
}

export { diandaAdapter }
