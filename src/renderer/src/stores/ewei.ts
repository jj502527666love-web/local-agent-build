import { defineStore } from 'pinia'
import { ref } from 'vue'

// window.api 是固定类型，未含 ewei，统一用 any 桥接（与 ecom 的 (window as any).api 一致）。
const ewei = () => (window as any).api.ewei

export interface EweiConnectorSummary {
  id: string
  name: string
  base_url: string
  account_masked: string
  account_version: string
  shop_version: string
  current_shop_id: number
  current_shop_name: string
  is_default: boolean
  last_login_at: string
  last_login_status: string
  last_login_message: string
  created_at: string
  updated_at: string
}

export interface EweiLoginResult {
  uid: number
  account: string
  contact: string
  isAdmin: boolean
  isRoot: boolean
  isMerch: boolean
  isSupply: boolean
}

export interface EweiShop {
  id: number
  name: string
  logo: string
  status: number
  showstatus: string | number
  status_text: string
  goods_count: number
  is_root: number
  days: string
}

export const useEweiStore = defineStore('ewei', () => {
  const connectors = ref<EweiConnectorSummary[]>([])
  const loading = ref(false)
  // connectorId -> 登录结果（内存态，进程级会话在主进程维护）
  const loginInfo = ref<Record<string, EweiLoginResult>>({})
  // 从商品列表点进图片工作台时暂存的列表项（带「绝对 thumb URL」，用于详情页预览现有图）。
  const currentGoods = ref<{ id: number; title: string; thumb: string } | null>(null)
  function setCurrentGoods(g: { id: number; title: string; thumb: string } | null): void {
    currentGoods.value = g
  }

  // ===== 页面状态持久化（切走再回来不丢；store 是单例，跨路由存活）=====
  // 商品列表（按 connectorId）：筛选 + 已加载结果
  const goodsListState = ref<Record<string, any>>({})
  function getGoodsListState(id: string): any {
    return goodsListState.value[id] || null
  }
  function setGoodsListState(id: string, s: any): void {
    goodsListState.value[id] = s
  }
  // 图片工作台（按 goodsId）：图位 + 来源 tab + 已选图（AI 生成结果由 ecom-gen scope 自身持久）
  const imageWorkState = ref<Record<string, any>>({})
  function getImageWorkState(goodsId: number): any {
    return imageWorkState.value[String(goodsId)] || null
  }
  function setImageWorkState(goodsId: number, s: any): void {
    imageWorkState.value[String(goodsId)] = s
  }
  // 新增商品草稿（按 connectorId）：整个表单
  const createDraft = ref<Record<string, any>>({})
  function getCreateDraft(id: string): any {
    return createDraft.value[id] || null
  }
  function setCreateDraft(id: string, d: any): void {
    createDraft.value[id] = d
  }
  function clearCreateDraft(id: string): void {
    delete createDraft.value[id]
  }

  async function loadConnectors(): Promise<void> {
    loading.value = true
    try {
      connectors.value = (await ewei().invoke('listConnectors')) || []
    } finally {
      loading.value = false
    }
  }

  function getConnector(id: string): EweiConnectorSummary | undefined {
    return connectors.value.find((c) => c.id === id)
  }

  async function createConnector(data: {
    name: string
    base_url: string
    account: string
    password: string
    is_default?: boolean
  }): Promise<EweiConnectorSummary> {
    const c = await ewei().invoke('createConnector', data)
    await loadConnectors()
    return c
  }

  async function updateConnector(
    id: string,
    data: Partial<{ name: string; base_url: string; account: string; password: string; is_default: boolean }>,
  ): Promise<void> {
    await ewei().invoke('updateConnector', id, data)
    await loadConnectors()
  }

  async function deleteConnector(id: string): Promise<void> {
    await ewei().invoke('deleteConnector', id)
    delete loginInfo.value[id]
    await loadConnectors()
  }

  async function login(id: string): Promise<EweiLoginResult> {
    const r = (await ewei().invoke('login', id)) as EweiLoginResult
    loginInfo.value[id] = r
    return r
  }

  async function logout(id: string): Promise<void> {
    await ewei().invoke('logout', id)
    delete loginInfo.value[id]
  }

  async function listShops(id: string, page = 1, pagesize = 50): Promise<{ list: EweiShop[]; count: number }> {
    return await ewei().invoke('listShops', id, page, pagesize)
  }

  async function switchShop(id: string, shopId: number, shopName = ''): Promise<void> {
    await ewei().invoke('switchShop', id, shopId, shopName)
    await loadConnectors() // 刷新 current_shop_*
  }

  return {
    connectors,
    loading,
    loginInfo,
    currentGoods,
    setCurrentGoods,
    getGoodsListState,
    setGoodsListState,
    getImageWorkState,
    setImageWorkState,
    getCreateDraft,
    setCreateDraft,
    clearCreateDraft,
    loadConnectors,
    getConnector,
    createConnector,
    updateConnector,
    deleteConnector,
    login,
    logout,
    listShops,
    switchShop,
  }
})
