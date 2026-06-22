// ============================================================================
// 全端云商城（xiaoyinetwork）适配器。协议见会话逆向 + docs。
// 与 ewei/点大都不同的第三种栈：JWT token 鉴权 + 两层（token SPA 门户 + we7 商户后台）。
//   第1层(/admin)：登录 POST /admin/login/login(username/password/captcha,每次验证码)→{code:"20000",data:{secret:JWT}}
//     之后带头 authorization-token: Bearer <JWT>；验证码 /admin/login/captcha；项目列表 /admin/applet/userIndex。
//   第2层(/index, we7)：商品列表 /index/duoproducts/index?appletid=N(JS渲染)；编辑器 /index/duoproducts/add.html?
//     appletid=N&newsid=<proid>(JS渲染重型表单,checkinfo校验)；图片上传 /index/duoproducts/imgupload.html?uniacid=N
//     字段 uploadfile[]→[{"url":"<绝对COS URL>"}]；保存 POST /index/duoproducts/save.html?appletid=N&newsid=<proid>
//     (112字段);主图(列表显示)=commonuploadpic1、轮播=imgsrcs[]。
//
// 实现策略：we7 编辑器/列表是 JS 渲染的重型表单，纯协议复刻不出 112 字段渲染态。故：
//   - 登录/验证码/applet/上传：走【per-connector 持久化 Electron 会话分区】的 session.fetch（cookie 自动管理，
//     与下面的 BrowserWindow 同分区共享会话）。
//   - 列商品/改图：用【隐藏 BrowserWindow(同分区)】加载真实页面，executeJavaScript 读渲染态/驱动编辑器保存——
//     设 commonuploadpic1 + checkinfo()通过 + 序列化 FormData POST save.html。
// 改图当前支持 mainThumb(主图,列表显示)；图集/详情/SKU/多规格(SKU)整体守卫拒绝(防全量替换清字段)。
//
// 【2026-06-23 真实账号 HTTP/DB 实测修正的三处致命点(纯代码审查不可见)】：
//   1. 验证码是 JSON：admin/login/captcha 回 {data:{image_data:"data:image/png;base64..",key:".."}}，
//      不是裸图片。image_data 直接当 captchaImage；key 必须在 submitLogin 回传(form.key)否则报"登录key错误"。
//   2. /index(we7) 不认 /admin 的 JWT：顶层导航/列表/保存只带 cookie。须先用 cache_key(登录种下的账号级
//      cookie,名==值,32位hex) GET index/datashow/index.html?appletid=N&cache_key=KEY 触发服务端 setLoginData
//      写 PHP $_SESSION(绑定 PHPSESSID)，之后 /index 才通过。见 ensureWe7Session——所有 /index 操作前必调。
//   3. 编辑器 add.html?appletid&newsid 对【脏数据商品】会服务端 in_array 报错(返回错误页)；对【多规格但
//      无真实SKU】被 checkinfo "请添加规格组"拒——demo applet 237 商品系统性损坏，无一可走通保存(非适配器问题)。
//
// 【源码逆向确认(2026-06-23, 经授权只读 SSH 读 qd 服务器 ThinkPHP 视图源码 add.html)】：
//   - 编辑器 add.html 是【服务端全量渲染】：商品的分类(#w2 select2)、取货方式(kuaidi[] 复选框)、轮播图(#imgzs)、
//     详情(UEditor #editor)、门店选择等在页面加载时即由 {$products.*} 渲染进 DOM —— 并非 AJAX 懒加载(此前"懒加载"
//     判断有误)。=> 对【配置完整】的商品，隐藏 BrowserWindow 加载后 DOM 即处于可提交态。
//   - 客户端校验契约 = 页面自带 checkinfo()：必填 #w2(分类)/#proTitle/缩略图(commonuploadpic1)/轮播图/详情，并负责
//     把 #w2->#cates、UEditor->#text、#w3/#w4->门店等做全量拷贝。故本适配器【直接复用 checkinfo()】(校验+拷贝)，
//     返回 false 即放弃，避免 we7 全量替换保存把字段写空。
//   - save.html 是 ThinkPHP success()/error()：带 x-requested-with 回 JSON——成功 {code:1,..}，失败 {code:0,msg:".."}。
//     服务端再校验一次(分类/取货方式等)，不完整直接 code:0 拒绝且【不落库】，是数据安全网。
//   - 唯一失败模式 = 商品在后台【本就残缺】(如 demo 项目 237 的 2978/2979 无分类/无取货方式) —— 这类会被
//     checkinfo 或服务端拒、replaceGoodsImage 抛错而非误改。对配置完整的商品本 headless 路径可正常保存(主图)。
//   - happy-path 未在本环境实证：仅有的 demo 商品系统性残缺，且不应拿生产真实商品做写测试。建议首次启用时在
//     用户愿意改动的商品上验证；或用【可见 webview】让用户在真实编辑器点保存(最稳)。
// ============================================================================
import { BrowserWindow, session as electronSession } from 'electron'
import { readFileSync } from 'fs'
import { getAbsolutePath } from '../image-generation'
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

class QdyunError extends Error {
  code: number
  constructor(code: number | string, message: string) {
    super(message || `全端云接口错误(${code})`)
    this.name = 'QdyunError'
    this.code = Number(code) || -1
  }
}

const SUCCESS_CODE = '20000'
const PARTITION = (id: string): string => 'persist:mall-qdyun-' + id
function ses(id: string): Electron.Session {
  return electronSession.fromPartition(PARTITION(id))
}

// ---- 会话态（JWT + 当前 applet；we7 cookie 在分区里持久化）----
interface QdyunSession {
  token: string
  appletId: number
}
const sessions = new Map<string, QdyunSession>()
// 最近一次验证码响应里的 key（登录必须回传，否则服务端报"登录key错误"）。
// fetchCaptcha 写入、submitLogin 读取——同进程顺序调用，不依赖 renderer 透传 challengeId。
const pendingCaptchaKey = new Map<string, string>()
// 已建立 we7 第2层(/index)会话的 appletId 集合（见 ensureWe7Session）。
const we7Bridged = new Map<string, Set<number>>()
function getSession(connectorId: string): QdyunSession {
  let s = sessions.get(connectorId)
  if (!s) {
    const extra = connectorService.getExtra(connectorId)
    s = { token: typeof extra.qd_token === 'string' ? extra.qd_token : '', appletId: Number(extra.qd_applet) || 0 }
    sessions.set(connectorId, s)
  }
  return s
}
export function clearSession(connectorId: string): void {
  sessions.delete(connectorId)
  pendingCaptchaKey.delete(connectorId)
  we7Bridged.delete(connectorId)
  try {
    // 清全部存储（cookie + SPA 门户 localStorage/IndexedDB 等），避免换号/登出残留串台
    ses(connectorId).clearStorageData()
  } catch {
    /* ignore */
  }
}

/** 读分区里登录时种下的 cache_key（账号级，cookie 名==值，32 位 hex）。 */
async function getCacheKey(connectorId: string): Promise<string> {
  try {
    const cookies = await ses(connectorId).cookies.get({ url: baseUrl(connectorId) })
    for (const c of cookies) {
      if (/^[a-f0-9]{32}$/.test(c.name) && c.value === c.name) return c.name
    }
  } catch {
    /* ignore */
  }
  return ''
}

/**
 * 建立 we7 第2层(/index)会话。we7 不认 /admin 的 JWT——顶层导航/列表/保存只带 cookie。
 * 进入项目时需用 cache_key 触发服务端 setLoginData 把登录态写入 PHP $_SESSION（绑定到分区
 * 里的 PHPSESSID）；之后 /index 请求(含 BrowserWindow 顶层导航)只凭 PHPSESSID 即通过。
 * 按 appletId 缓存，幂等；失败(会话失效→302 回 /new_plat 登录)抛错。
 */
async function ensureWe7Session(connectorId: string, appletId: number): Promise<void> {
  let set = we7Bridged.get(connectorId)
  if (set && set.has(appletId)) return
  const cacheKey = await getCacheKey(connectorId)
  if (!cacheKey) throw new QdyunError(-1, '全端云会话已失效，请重新登录')
  const r = await sfetch(connectorId, 'index/datashow/index.html', {
    query: { appletid: appletId, cache_key: cacheKey },
  })
  // 成功为 200 text/html(datashow 页面)；失败(check_login=false)会重定向到 /new_plat，
  // 或因带 x-requested-with 头而回 JSON 错误({code,msg})——两者都视为桥接失败。
  const ct = (r.headers.get('content-type') || '').toLowerCase()
  if (r.status >= 400 || r.url.includes('new_plat') || ct.includes('json')) {
    throw new QdyunError(-1, '建立全端云商户后台会话失败，请重新登录')
  }
  if (!set) {
    set = new Set()
    we7Bridged.set(connectorId, set)
  }
  set.add(appletId)
}

function baseUrl(connectorId: string): string {
  const creds = connectorService.resolveCredentials(connectorId)
  if (!creds) throw new QdyunError(-1, '连接器不存在')
  return creds.base_url.endsWith('/') ? creds.base_url : creds.base_url + '/'
}

interface ReqOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, string | number | undefined>
  form?: Record<string, string>
  formData?: FormData
  auth?: boolean
}

/** 走分区 session.fetch（cookie 自动管理，与 BrowserWindow 同分区共享）。 */
async function sfetch(connectorId: string, route: string, opts: ReqOptions = {}): Promise<Response> {
  let url = baseUrl(connectorId) + route.replace(/^\//, '')
  if (opts.query) {
    const qs = Object.entries(opts.query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&')
    if (qs) url += (url.includes('?') ? '&' : '?') + qs
  }
  const headers: Record<string, string> = { 'x-requested-with': 'XMLHttpRequest' }
  let body: any
  if (opts.formData) {
    body = opts.formData
  } else if (opts.form) {
    headers['content-type'] = 'application/x-www-form-urlencoded;charset=UTF-8'
    body = new URLSearchParams(opts.form).toString()
  }
  if (opts.auth) {
    const s = getSession(connectorId)
    if (s.token) headers['authorization-token'] = 'Bearer ' + s.token
  }
  return ses(connectorId).fetch(url, { method: opts.method || 'GET', headers, body })
}

async function fetchCaptcha(connectorId: string): Promise<MallCaptchaChallenge> {
  const res = await sfetch(connectorId, 'admin/login/captcha')
  const buf = Buffer.from(await res.arrayBuffer())
  const text = buf.toString('utf8')
  // 全端云验证码是 JSON：{code,data:{image_data:"data:image/png;base64,..", key:".."}}。
  // image_data 本身即可直接用的 data URI；key 必须在 submitLogin 回传。
  try {
    const j = JSON.parse(text)
    const img = j?.data?.image_data
    const key = j?.data?.key
    if (typeof img === 'string' && img.startsWith('data:')) {
      if (typeof key === 'string' && key) pendingCaptchaKey.set(connectorId, key)
      return { needCaptcha: true, captchaImage: img, challengeId: typeof key === 'string' ? key : undefined }
    }
  } catch {
    /* 非 JSON：按裸图片兜底 */
  }
  const mime = res.headers.get('content-type') || 'image/png'
  return { needCaptcha: true, captchaImage: `data:${mime};base64,${buf.toString('base64')}` }
}

// ---- 隐藏 BrowserWindow（同分区，复刻真实页面 + 驱动编辑器）----
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      onTimeout()
      reject(new QdyunError(-1, '页面操作超时'))
    }, ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/** 在隐藏 BrowserWindow(同分区,带 we7 会话)里加载 url 并执行 js，返回 js 结果。 */
async function runInWindow(connectorId: string, route: string, js: string, timeoutMs = 30000): Promise<any> {
  const url = baseUrl(connectorId) + route.replace(/^\//, '')
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      partition: PARTITION(connectorId),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  const wc = win.webContents
  try {
    // 把「加载+等待 did-finish-load+执行 JS」整体纳入超时——否则页面挂死时
    // await loaded 永不返回，隐藏窗口与上层 IPC Promise 双双泄漏。
    const run = (async (): Promise<any> => {
      const loaded = new Promise<void>((resolve, reject) => {
        const ok = (): void => {
          cleanup()
          resolve()
        }
        // did-fail-load 对主帧和任意子帧/中止都会触发：we7 重型页常带 iframe(UEditor 等)，
        // 仅主帧导航失败才算整页失败；忽略子帧失败与 ERR_ABORTED(-3, 重定向/中止常态)。
        const fail = (_e: unknown, code: number, desc: string, _u: string, isMainFrame: boolean): void => {
          if (!isMainFrame || code === -3) return
          cleanup()
          reject(new QdyunError(code, `页面加载失败 ${desc}`))
        }
        const cleanup = (): void => {
          wc.off('did-finish-load', ok)
          wc.off('did-fail-load', fail)
        }
        wc.once('did-finish-load', ok)
        wc.on('did-fail-load', fail) // on 而非 once：忽略子帧失败后仍能等主帧 did-finish-load
      })
      // loadURL 在重定向/中止时会 reject ERR_ABORTED；成败统一交给 loaded 裁决，超时兜底。
      wc.loadURL(url).catch(() => {})
      await loaded
      return await wc.executeJavaScript(js, true)
    })()
    return await withTimeout(run, timeoutMs, () => {
      if (!win.isDestroyed()) win.destroy()
    })
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

function hasRealOption(useMore: any): boolean {
  return String(useMore) === '1'
}

const qdyunAdapter: MallAdapter = {
  platform: 'qdyun',
  capabilities: {
    needsShopSwitch: true, // applet/项目选择，复用「选门店」UI
    needsCaptcha: true,
    supportsAddGoods: false,
    supportsGallery: false, // 仅支持主图，图集/详情/SKU 守卫拒绝
    detailFormat: 'blocks',
  },

  async beginLogin(connectorId: string): Promise<MallBeginLoginResult> {
    const s = getSession(connectorId)
    if (s.token) {
      try {
        const r = await sfetch(connectorId, 'admin/applet/userIndex', {
          query: { page: 1, size: 1, type: 7, source: 0, key: '' },
          auth: true,
        })
        const j = await r.json()
        if (j && String(j.code) === SUCCESS_CODE) {
          const creds = connectorService.resolveCredentials(connectorId)
          connectorService.updateLoginResult(connectorId, 'success', '已登录（复用会话）')
          return { needCaptcha: false, result: makeLoginResult(creds?.account || '') }
        }
      } catch {
        /* 失效，走验证码 */
      }
    }
    return await fetchCaptcha(connectorId)
  },

  async submitLogin(connectorId: string, captcha: string, challengeId?: string): Promise<MallBeginLoginResult> {
    const creds = connectorService.resolveCredentials(connectorId)
    if (!creds) throw new QdyunError(-1, '连接器不存在')
    // 全端云登录必须回传验证码响应里的 key，否则报"登录key错误"。优先用本地暂存的 key
    // （fetchCaptcha 写入），兼容 renderer 透传的 challengeId。
    const key = pendingCaptchaKey.get(connectorId) || challengeId || ''
    const res = await sfetch(connectorId, 'admin/login/login', {
      method: 'POST',
      form: { username: creds.account, password: creds.password, captcha: (captcha || '').trim(), key },
    })
    let json: any
    try {
      json = JSON.parse(await res.text())
    } catch {
      throw new QdyunError(-1, '登录响应异常')
    }
    if (String(json.code) !== SUCCESS_CODE || !json.data?.secret) {
      connectorService.updateLoginResult(connectorId, 'failed', json.msg || '登录失败')
      return await fetchCaptcha(connectorId)
    }
    const s = getSession(connectorId)
    s.token = String(json.data.secret)
    connectorService.setExtra(connectorId, { qd_token: s.token })
    connectorService.updateLoginResult(connectorId, 'success', '已登录')
    return { needCaptcha: false, result: makeLoginResult(String(json.data.user_name || creds.account)) }
  },

  async refreshCaptcha(connectorId: string): Promise<MallCaptchaChallenge> {
    return await fetchCaptcha(connectorId)
  },

  async logout(connectorId: string): Promise<void> {
    connectorService.setExtra(connectorId, { qd_token: null, qd_applet: null })
    clearSession(connectorId)
  },

  // 「门店」= 项目(applet)
  async listShops(connectorId: string, page = 1, pagesize = 18): Promise<{ list: MallShop[]; count: number }> {
    const r = await sfetch(connectorId, 'admin/applet/userIndex', {
      query: { page, size: pagesize, type: 7, source: 0, key: '' },
      auth: true,
    })
    const json = await r.json()
    if (String(json.code) !== SUCCESS_CODE) throw new QdyunError(json.code, json.msg || '获取项目失败')
    const rows: any[] = json.data?.list || json.data?.data || (Array.isArray(json.data) ? json.data : [])
    const list: MallShop[] = rows.map((p: any) => ({
      id: Number(p.uniacid ?? p.appletid ?? p.id),
      name: String(p.name ?? p.title ?? ''),
      logo: String(p.logo ?? p.icon ?? ''),
      status: Number(p.status) || 0,
      showstatus: p.showstatus ?? '',
      status_text: String(p.status_text ?? p.expire_text ?? ''),
      goods_count: Number(p.goods_count ?? 0),
      is_root: 0,
      days: String(p.days ?? ''),
    }))
    return { list, count: Number(json.data?.total ?? json.data?.count ?? list.length) }
  },

  async switchShop(connectorId: string, shopId: number, shopName = ''): Promise<{ ok: boolean }> {
    const s = getSession(connectorId)
    s.appletId = shopId
    connectorService.setExtra(connectorId, { qd_applet: shopId })
    connectorService.setCurrentShop(connectorId, shopId, shopName)
    return { ok: true }
  },

  // 商品列表：we7 列表行 JS 渲染，用隐藏窗口读渲染态
  async listGoods(connectorId: string, params: MallGoodsListParams = {}): Promise<{ list: MallGoodsListItem[]; count: number }> {
    const appletId = getSession(connectorId).appletId
    if (!appletId) throw new QdyunError(-1, '请先选择项目')
    await ensureWe7Session(connectorId, appletId)
    const js = `(async function(){
      var deadline=Date.now()+15000;
      function rows(){return document.querySelectorAll('table tr, .layui-table tr, tbody tr');}
      while(Date.now()<deadline){ if(rows().length>1) break; await new Promise(function(r){setTimeout(r,300)}); }
      var trs=rows(); var out=[];
      for(var i=0;i<trs.length;i++){
        var tr=trs[i]; var proid=0;
        var as=tr.querySelectorAll('a');
        for(var k=0;k<as.length;k++){ var hv=(as[k].getAttribute('href')||'')+(as[k].getAttribute('onclick')||'');
          var m=hv.match(/proid=(\\d+)/)||hv.match(/newsid=(\\d+)/); if(m){proid=Number(m[1]);break;} }
        if(!proid) continue;
        var img=tr.querySelector('img'); var pic=img?(img.getAttribute('src')||''):'';
        var tds=tr.querySelectorAll('td'); var title=''; var price='';
        for(var t=0;t<tds.length;t++){ var tx=(tds[t].textContent||'').trim();
          if(!title && tx.length>1 && !/^[0-9.￥¥]+$/.test(tx) && tds[t].querySelector('img')===null) title=tx.slice(0,40);
          if(!price && /^[￥¥]?[0-9]+(\\.[0-9]+)?$/.test(tx)) price=tx.replace(/[￥¥]/,''); }
        out.push({ id:proid, title:title, thumb:pic, status:1, has_option:0, selling_type:0, type:0, price:price });
      }
      // 去重(同 proid 多行取首)
      var seen={}; var uniq=[];
      for(var u=0;u<out.length;u++){ if(!seen[out[u].id]){seen[out[u].id]=1; uniq.push(out[u]);} }
      return uniq;
    })()`
    const list: MallGoodsListItem[] = await runInWindow(
      connectorId,
      `index/duoproducts/index?appletid=${appletId}`,
      js,
      30000,
    )
    let filtered = Array.isArray(list) ? list : []
    if (params.title) filtered = filtered.filter((g) => String(g.title || '').includes(params.title as string))
    return { list: filtered, count: filtered.length }
  },

  async getGoodsDetail(connectorId: string, goodsId: number): Promise<MallGoodsDetail> {
    // 读编辑器里的当前主图/轮播/标题作预览（用列表暂存的 thumb 兜底）
    const appletId = getSession(connectorId).appletId
    const js = `(async function(){
      function q(s){return document.querySelector(s);}
      var deadline=Date.now()+18000;
      while(Date.now()<deadline){ var t=q('#proTitle'); var w2=q('#w2'); if(t&&t.value&&w2&&w2.options.length>1) break; await new Promise(function(r){setTimeout(r,300)}); }
      function val(n){var e=document.querySelector("[name='"+n+"']"); return e?String(e.value||''):'';}
      var imgs=[]; document.querySelectorAll("[name='imgsrcs[]']").forEach(function(e){ if(e.value) imgs.push(e.value); });
      return { title:(q('#proTitle')?q('#proTitle').value:''), thumb:val('commonuploadpic1'), thumbs:imgs, use_more:val('use_more') };
    })()`
    let data: any = {}
    try {
      await ensureWe7Session(connectorId, appletId)
      data = await runInWindow(connectorId, `index/duoproducts/add.html?appletid=${appletId}&newsid=${goodsId}`, js, 25000)
    } catch {
      data = {}
    }
    const goods: any = {
      id: goodsId,
      title: String(data.title || ''),
      thumb: String(data.thumb || ''),
      thumbs: Array.isArray(data.thumbs) ? data.thumbs : [],
      content: '',
      has_option: hasRealOption(data.use_more) ? 1 : 0,
    }
    return { goods, options: [], specs: [] }
  },

  // 上传：we7 imgupload，字段 uploadfile[] → 绝对 COS URL
  async replaceGoodsImage(args: ReplaceGoodsImageArgs): Promise<{ ok: boolean; uploaded: EweiUploadResult[] }> {
    const { connectorId, goodsId, slot, images } = args
    if (!images || !images.length) throw new QdyunError(-1, '没有可应用的图片')
    if (slot !== 'mainThumb') {
      throw new QdyunError(-1, '全端云目前仅支持替换主图（图集/详情/SKU 因 we7 编辑器结构特殊待补）')
    }
    const appletId = getSession(connectorId).appletId
    if (!appletId) throw new QdyunError(-1, '请先选择项目')

    const logId = connectorService.createImageLog({ connectorId, shopId: appletId, goodsId, goodsTitle: '', slot, oldValue: null })
    try {
      // 0) 建立 we7 会话（上传 imgupload 与保存 save 都走 /index，需先桥接）
      await ensureWe7Session(connectorId, appletId)
      // 1) 上传新图
      const uploaded: EweiUploadResult[] = []
      for (let i = 0; i < images.length; i++) {
        broadcastProgress({ goodsId, phase: 'uploading', current: i, total: images.length, message: `上传第 ${i + 1}/${images.length} 张` })
        uploaded.push(await uploadImage(connectorId, appletId, images[i]))
      }
      const newUrl = uploaded[0].url
      connectorService.updateImageLog(logId, { status: 'uploaded', newPaths: uploaded.map((u) => u.url) })

      // 2) 隐藏窗口加载编辑器 → 设主图 commonuploadpic1 + checkinfo() + 序列化 FormData POST save.html
      broadcastProgress({ goodsId, phase: 'saving', message: '写回商品…' })
      const js = `(async function(){
        function q(s){return document.querySelector(s);}
        function ready(){
          if(typeof window.$==='undefined') return false;
          var f=q('#form_sample_2')||q('form[action*=save]');
          var t=q('#proTitle'); var w2=q('#w2'); var thumb=q("[name='commonuploadpic1']");
          var slide=document.querySelectorAll('#imgzs .thumbnail');
          var ueOk=window.ue && window.ue.isReady;
          return !!(f && t && t.value && w2 && thumb && thumb.value && slide.length>0 && ueOk);
        }
        var deadline=Date.now()+25000;
        while(Date.now()<deadline){ if(ready()) break; await new Promise(function(r){setTimeout(r,300)}); }
        var form=q('#form_sample_2')||q('form[action*=save]');
        if(!form) return {ok:false,msg:'编辑器表单未加载完成'};
        var w2=q('#w2');
        if(!w2 || !w2.value){ return {ok:false,msg:'该商品在全端云后台未设置"所属分类"(保存强制要求分类)，请先在全端云为其设置分类后再改图'}; }
        var t=q('#proTitle'); if(!t || !t.value) return {ok:false,msg:'该商品缺少名称，无法保存'};
        var um=q("input[name='use_more']:checked")||q("[name='use_more']");
        if(um && String(um.value)==='1'){ return {ok:false,msg:'该商品为多规格(SKU)商品，桌面端改图暂不支持(避免全量保存清空规格/价格/库存)，请用全端云后台处理'}; }
        var shownSlide=document.querySelectorAll('#imgzs .thumbnail').length;
        if(shownSlide===0) return {ok:false,msg:'该商品缺少轮播图，保存要求至少一张轮播图'};
        var namedSlide=document.querySelectorAll("#imgzs [name='imgsrcs[]']").length;
        if(namedSlide<shownSlide){ return {ok:false,msg:'轮播图存在无法安全序列化的项(可能为已上传图对象)，为避免保存时丢图已中止，请用全端云后台或可见编辑器处理该商品'}; }
        if(!window.ue || !window.ue.isReady) return {ok:false,msg:'商品详情编辑器未就绪，请重试'};
        try{ window.ue.sync(); }catch(x){}
        var NEW=${JSON.stringify(newUrl)};
        var set=0;
        document.querySelectorAll("[name='commonuploadpic1']").forEach(function(e){ e.value=NEW; e.setAttribute('value',NEW); set++; });
        if(set===0) return {ok:false,msg:'未找到主图字段(commonuploadpic1)'};
        var pv=q('.thumbnail.commonuploadpic1 img'); if(pv) pv.setAttribute('src',NEW);
        var ci=(typeof window.checkinfo==='function') ? window.checkinfo() : undefined;
        if(ci===false){ return {ok:false,msg:'保存校验未通过：商品仍有缺失的必填项，请在全端云后台补全后再改图'}; }
        var fd=new FormData(form); var p=new URLSearchParams();
        var it=fd.entries(),e;
        while(!(e=it.next()).done){ if(typeof e.value[1]==='string') p.append(e.value[0], e.value[1]); }
        var r=await fetch(form.getAttribute('action'),{method:'POST',headers:{'x-requested-with':'XMLHttpRequest','content-type':'application/x-www-form-urlencoded;charset=UTF-8'},body:p.toString()});
        var txt=await r.text(); var j={}; try{ j=JSON.parse(txt); }catch(x){}
        var okSave=(r.status>=200&&r.status<300)&&(Number(j.code)===1);
        return { ok:okSave, code:j.code, status:j.status, msg:String(j.msg||txt.slice(0,150)), url:j.url };
      })()`
      const result = await runInWindow(connectorId, `index/duoproducts/add.html?appletid=${appletId}&newsid=${goodsId}`, js, 35000)
      if (!result || !result.ok) {
        throw new QdyunError(result?.code ?? -1, result?.msg || '保存失败')
      }
      void newUrl
      connectorService.updateImageLog(logId, { status: 'done' })
      broadcastProgress({ goodsId, phase: 'done', message: '已应用到商品' })
      return { ok: true, uploaded }
    } catch (e: any) {
      const msg = e?.message || '替换失败'
      connectorService.updateImageLog(logId, { status: 'failed', error: msg })
      broadcastProgress({ goodsId, phase: 'error', message: msg })
      throw e
    }
  },

  async listGoodsCategories(): Promise<MallCategory[]> {
    return []
  },
  async addGoods(): Promise<{ goodsId: number }> {
    throw new QdyunError(-1, '全端云暂不支持在桌面端新增商品')
  },
}

// ---- 辅助 ----
function makeLoginResult(account: string) {
  return { uid: 0, account, contact: account, isAdmin: false, isRoot: false, isMerch: false, isSupply: false }
}

function broadcastProgress(p: any): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('ewei:progress', p)
    } catch {
      /* ignore */
    }
  }
}

async function uploadImage(connectorId: string, appletId: number, localPath: string): Promise<EweiUploadResult> {
  const abs = getAbsolutePath(localPath)
  const buf = readFileSync(abs)
  const name = abs.split(/[\\/]/).pop() || 'image.png'
  const fd = new FormData()
  fd.append('uploadfile[]', new Blob([new Uint8Array(buf)]), name)
  const res = await sfetch(connectorId, 'index/duoproducts/imgupload.html', {
    method: 'POST',
    query: { uniacid: appletId },
    formData: fd,
  })
  let json: any
  try {
    json = JSON.parse(await res.text())
  } catch {
    throw new QdyunError(-1, '上传响应异常')
  }
  // 成功为数组 [{"url":"<绝对URL>"}]；失败为 {code,msg}
  const url = Array.isArray(json) ? json[0]?.url : json?.url || json?.data?.url
  if (!url) throw new QdyunError(json?.code ?? -1, json?.msg || '上传失败')
  return { path: String(url), url: String(url), width: 0, height: 0, id: 0 }
}

export { qdyunAdapter }
