import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { cloudPublic } from '@/utils/cloud-api'

/**
 * 站点公开配置 store。无需登录，App 启动时拉取一次。
 *
 * 业务上：
 * - balance_type='token'  -> 现金钱包，默认显示"金币"
 * - balance_type='credit' -> 积分钱包，默认显示"积分"
 *
 * 管理员可在云控后台「设置 → 界面文案」自定义这两个标签。
 */
export interface CurrencyLabels {
  token: string
  credit: string
}

/**
 * 支付通道开关。云控后台关闭后桌面端隐藏对应的支付按钮；两个都关闭时 PaymentDialog
 * 显示「暂无可用的支付方式」。默认都为 true（保留原有行为），拉取到 publicConfig 后用后端值覆盖。
 */
export interface PaymentAvailability {
  wechat: boolean
  tianque: boolean
}

export interface RegisterAvailability {
  enabled: boolean
}

/**
 * 注册页协议（注册协议、隐私协议）。由云控端「系统设置 → 协议管理」维护，
 * 桌面端在注册前弹窗展示。content 是 HTML 富文本，渲染前用 DOMPurify 过滤。
 */
export interface Agreement {
  title: string
  content: string
}

export interface Agreements {
  register: Agreement
  privacy: Agreement
}

/**
 * 「对话页面默认模型」：由云控端「系统设置 → 对话模型」维护。
 * 桌面端新建会话时把这两个字段填入 conversation.active_model_*；
 * 用户在对话页输入框左下角切换 → 写回 conversation.active_model_*（per-conversation）。
 * 任一字段为空表示未配置，桌面端将回退到本地第一个 chat 类型模型。
 */
export interface ChatDefaultModel {
  provider_id: string
  model_id: string
}

export interface CustomerServiceInfo {
  title: string
  image_url: string
  source?: string
  project_key?: string | null
}

const DEFAULT_LABELS: CurrencyLabels = { token: '金币', credit: '积分' }
const DEFAULT_PAYMENT: PaymentAvailability = { wechat: true, tianque: true }
const DEFAULT_REGISTER: RegisterAvailability = { enabled: true }
const DEFAULT_AGREEMENTS: Agreements = {
  register: { title: '注册协议', content: '' },
  privacy: { title: '隐私协议', content: '' },
}
const DEFAULT_CHAT_MODEL: ChatDefaultModel = { provider_id: '', model_id: '' }
const DEFAULT_CUSTOMER_SERVICE: CustomerServiceInfo | null = null

const STORAGE_KEY = 'site_config_currency'
const PAYMENT_STORAGE_KEY = 'site_config_payment'
const REGISTER_STORAGE_KEY = 'site_config_register'
const AGREEMENTS_STORAGE_KEY = 'site_config_agreements'
const CHAT_MODEL_STORAGE_KEY = 'site_config_chat_default_model'
const CUSTOMER_SERVICE_STORAGE_KEY = 'site_config_customer_service'

function readCache(): CurrencyLabels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LABELS }
    const parsed = JSON.parse(raw)
    return {
      token: typeof parsed?.token === 'string' && parsed.token ? parsed.token : DEFAULT_LABELS.token,
      credit: typeof parsed?.credit === 'string' && parsed.credit ? parsed.credit : DEFAULT_LABELS.credit,
    }
  } catch {
    return { ...DEFAULT_LABELS }
  }
}

function writeCache(labels: CurrencyLabels) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(labels))
  } catch {
    // localStorage 不可用时静默失败
  }
}

function readPaymentCache(): PaymentAvailability {
  try {
    const raw = localStorage.getItem(PAYMENT_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_PAYMENT }
    const parsed = JSON.parse(raw)
    return {
      wechat: typeof parsed?.wechat === 'boolean' ? parsed.wechat : DEFAULT_PAYMENT.wechat,
      tianque: typeof parsed?.tianque === 'boolean' ? parsed.tianque : DEFAULT_PAYMENT.tianque,
    }
  } catch {
    return { ...DEFAULT_PAYMENT }
  }
}

function writePaymentCache(p: PaymentAvailability) {
  try {
    localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(p))
  } catch {
    // 静默失败
  }
}

function readRegisterCache(): RegisterAvailability {
  try {
    const raw = localStorage.getItem(REGISTER_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_REGISTER }
    const parsed = JSON.parse(raw)
    return {
      enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : DEFAULT_REGISTER.enabled,
    }
  } catch {
    return { ...DEFAULT_REGISTER }
  }
}

function writeRegisterCache(r: RegisterAvailability) {
  try {
    localStorage.setItem(REGISTER_STORAGE_KEY, JSON.stringify(r))
  } catch {
    // 静默失败
  }
}

function readAgreementsCache(): Agreements {
  try {
    const raw = localStorage.getItem(AGREEMENTS_STORAGE_KEY)
    if (!raw) return { register: { ...DEFAULT_AGREEMENTS.register }, privacy: { ...DEFAULT_AGREEMENTS.privacy } }
    const parsed = JSON.parse(raw)
    return {
      register: {
        title: typeof parsed?.register?.title === 'string' && parsed.register.title ? parsed.register.title : DEFAULT_AGREEMENTS.register.title,
        content: typeof parsed?.register?.content === 'string' ? parsed.register.content : '',
      },
      privacy: {
        title: typeof parsed?.privacy?.title === 'string' && parsed.privacy.title ? parsed.privacy.title : DEFAULT_AGREEMENTS.privacy.title,
        content: typeof parsed?.privacy?.content === 'string' ? parsed.privacy.content : '',
      },
    }
  } catch {
    return { register: { ...DEFAULT_AGREEMENTS.register }, privacy: { ...DEFAULT_AGREEMENTS.privacy } }
  }
}

function writeAgreementsCache(a: Agreements) {
  try {
    localStorage.setItem(AGREEMENTS_STORAGE_KEY, JSON.stringify(a))
  } catch {
    // 静默失败
  }
}

function readChatDefaultModelCache(): ChatDefaultModel {
  try {
    const raw = localStorage.getItem(CHAT_MODEL_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CHAT_MODEL }
    const parsed = JSON.parse(raw)
    return {
      provider_id: typeof parsed?.provider_id === 'string' ? parsed.provider_id : '',
      model_id: typeof parsed?.model_id === 'string' ? parsed.model_id : '',
    }
  } catch {
    return { ...DEFAULT_CHAT_MODEL }
  }
}

function writeChatDefaultModelCache(m: ChatDefaultModel) {
  try {
    localStorage.setItem(CHAT_MODEL_STORAGE_KEY, JSON.stringify(m))
  } catch {
    // 静默失败
  }
}

function normalizeCustomerService(raw: unknown): CustomerServiceInfo | null {
  const data = raw as Partial<CustomerServiceInfo> | null
  const title = typeof data?.title === 'string' ? data.title.trim() : ''
  const imageUrl = typeof data?.image_url === 'string' ? data.image_url.trim() : ''
  if (!title || !imageUrl) return null
  return {
    title,
    image_url: imageUrl,
    source: typeof data?.source === 'string' ? data.source : undefined,
    project_key: typeof data?.project_key === 'string' ? data.project_key : null,
  }
}

function readCustomerServiceCache(): CustomerServiceInfo | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_SERVICE_STORAGE_KEY)
    if (!raw) return DEFAULT_CUSTOMER_SERVICE
    return normalizeCustomerService(JSON.parse(raw))
  } catch {
    return DEFAULT_CUSTOMER_SERVICE
  }
}

function writeCustomerServiceCache(info: CustomerServiceInfo | null) {
  try {
    if (info) localStorage.setItem(CUSTOMER_SERVICE_STORAGE_KEY, JSON.stringify(info))
    else localStorage.removeItem(CUSTOMER_SERVICE_STORAGE_KEY)
  } catch {
  }
}

export const useSiteConfigStore = defineStore('siteConfig', () => {
  // 启动时先用 localStorage 缓存，避免首屏闪烁默认文案
  const labels = ref<CurrencyLabels>(readCache())
  const payment = ref<PaymentAvailability>(readPaymentCache())
  const register = ref<RegisterAvailability>(readRegisterCache())
  const agreements = ref<Agreements>(readAgreementsCache())
  const chatDefaultModel = ref<ChatDefaultModel>(readChatDefaultModelCache())
  const customerService = ref<CustomerServiceInfo | null>(readCustomerServiceCache())
  const loading = ref(false)
  const lastFetchedAt = ref<number | null>(null)

  /**
   * 根据 balance_type / billing_type 取对应文案。
   * 'credit' -> labels.credit，其他（含 'token'、空、未知值）-> labels.token
   */
  const labelOf = computed(() => (type: string | null | undefined): string => {
    return type === 'credit' ? labels.value.credit : labels.value.token
  })

  /** 存在可用的支付通道 */
  const hasAnyPayment = computed(() => payment.value.wechat || payment.value.tianque)

  async function fetch(): Promise<void> {
    loading.value = true
    try {
      const data = await cloudPublic.siteConfig()
      const next: CurrencyLabels = {
        token: data?.currency?.token || DEFAULT_LABELS.token,
        credit: data?.currency?.credit || DEFAULT_LABELS.credit,
      }
      labels.value = next
      writeCache(next)

      // payment 字段为后加，老后端返回中可能不带。不在时保持当前值（避免老后端 + 新桌面端场景下误以为都关闭）
      if (data?.payment && typeof data.payment === 'object') {
        const nextPayment: PaymentAvailability = {
          wechat: !!data.payment.wechat,
          tianque: !!data.payment.tianque,
        }
        payment.value = nextPayment
        writePaymentCache(nextPayment)
      }

      if (data?.register && typeof data.register === 'object') {
        const nextRegister: RegisterAvailability = {
          enabled: typeof data.register.enabled === 'boolean' ? data.register.enabled : DEFAULT_REGISTER.enabled,
        }
        register.value = nextRegister
        writeRegisterCache(nextRegister)
      }

      // agreements 字段为后加，老后端不带时保持当前值（缓存或默认占位）
      if (data?.agreements && typeof data.agreements === 'object') {
        const nextAgreements: Agreements = {
          register: {
            title: (typeof data.agreements?.register?.title === 'string' && data.agreements.register.title) || DEFAULT_AGREEMENTS.register.title,
            content: typeof data.agreements?.register?.content === 'string' ? data.agreements.register.content : '',
          },
          privacy: {
            title: (typeof data.agreements?.privacy?.title === 'string' && data.agreements.privacy.title) || DEFAULT_AGREEMENTS.privacy.title,
            content: typeof data.agreements?.privacy?.content === 'string' ? data.agreements.privacy.content : '',
          },
        }
        agreements.value = nextAgreements
        writeAgreementsCache(nextAgreements)
      }

      // chat_default_model 字段为后加（v0.6.5+），老后端不带时保持当前值（缓存或空占位）
      if (data?.chat_default_model && typeof data.chat_default_model === 'object') {
        const nextChatModel: ChatDefaultModel = {
          provider_id: typeof data.chat_default_model?.provider_id === 'string' ? data.chat_default_model.provider_id : '',
          model_id: typeof data.chat_default_model?.model_id === 'string' ? data.chat_default_model.model_id : '',
        }
        chatDefaultModel.value = nextChatModel
        writeChatDefaultModelCache(nextChatModel)
      }

      if (data && typeof data === 'object' && 'customer_service' in data) {
        const nextCustomerService = normalizeCustomerService(data.customer_service)
        customerService.value = nextCustomerService
        writeCustomerServiceCache(nextCustomerService)
      }

      lastFetchedAt.value = Date.now()
    } catch {
      // 拉取失败保持当前值（缓存或默认）
    } finally {
      loading.value = false
    }
  }

  /**
   * App 启动时调用。已有缓存就立即可用，同时后台异步刷新最新值。
   */
  function init(): void {
    fetch()
  }

  return { labels, payment, register, agreements, chatDefaultModel, customerService, hasAnyPayment, loading, lastFetchedAt, labelOf, fetch, init }
})
