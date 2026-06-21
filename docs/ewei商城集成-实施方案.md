# 桌面端集成 ewei 商城「门店商品图管理」实施方案

> 目标：在 local-agent 桌面端新增「ewei 连接器」，实现 填域名/账号/密码登录 → 选账号名下店铺(门店) → 进店列商品 → 用桌面端电商生图/AI生图/本地图库 生成或选图 → 上传 ewei → 回写商品主图/图集/SKU图/详情图。
>
> 本方案基于对 `F:\local-agent\agent-desktop`（桌面端）与 `F:\ewei`（商城后端 Yii2 + 前端 shop_web/web_site）两套源码的逐字契约提取，所有接口/字段/签名均附 `文件:行号` 依据。
>
> 范围确认（已与产品拍板）：
> - 「门店」= **账号名下的店铺 Shop**（走 `account/shops/switch`，Session 键 `user_shop_id`），不做 Store 店内网点（增强期再叠加）。
> - 图片来源 = **电商/AI 新生成 + 本地图库直传** 两条主链路；抠图换背景留增强期。
> - 本阶段先出方案，不动代码。

---

> **实现状态（2026-06-20）：已按本方案 v2 全量实现并通过 `electron-vite build` 构建校验。** 计费模式＝生图照旧走云端积分 + 入口权限门控（`allow_ewei_shop`，默认开，云控端可关）。新增/改动文件见 §14。

## 0. 总体结论与关键约束

- 桌面端已具备全部图像生产能力（`views/ecom/` 电商主图/详情图/SKU、`image-generation.ts` AI生图、`gallery.ts` 本地图库），产物均为本地文件，`getAbsolutePath → readFileSync → Buffer` 即可上传，**零重编码**。新增工作集中在「连接器 + 回写」。
- ewei 业务端是 **PHP Session（非 JWT）+ Cookie** 体系；后端同时支持 `session-id` 请求头复用会话（`AccountApiController::init` / `UserApiController::beforeAction` 读 `header('session-id')` 后 `LocalSession::setSessionId`）。桌面端非浏览器环境**以 session-id 头为主、Cookie jar 为辅**。
- 三组接口前缀/编码/版本头不同，client 必须分组处理（见 §3.1）。
- **前置必做**：阶段0 在真实目标环境抓一次「登录→选店→列商品→上传→保存」请求，校验请求头大小写、Cookie/session-id 行为、存储类型，再固化 client。本方案所有契约为静态读码所得，未抓包。

---

## 1. 架构总览

```
renderer (Vue3)                         main (Electron)                    ewei 云端
┌───────────────────────┐   IPC ewei:*  ┌────────────────────────┐  HTTPS  ┌──────────────┐
│ views/ewei/           │ ────────────► │ services/ewei-connectors│         │ web_site     │
│  EweiConnectorsView   │               │   (CRUD + 凭据加解密)    │         │ api/site/... │
│  EweiGoodsListView    │               │ services/ewei-client    │ ──────► │ shop_web     │
│  EweiGoodsImageView   │ ◄──────────── │   (登录/选店/商品/上传)  │         │ shop/manage/ │
│  复用 ecom 组件生成图   │   进度/结果    │ services/image-generation│         │ utility/...  │
└───────────────────────┘               │ services/gallery / matting        └──────────────┘
                                        │ sqlite: ewei_connectors (加密,不同步)│
                                        └────────────────────────┘
```

新增/改动文件清单（全部位于 `F:\local-agent\agent-desktop\`）：

| 类别 | 文件 | 动作 |
|---|---|---|
| 数据层 | `resources/schema.sql` | 追加 `ewei_connectors` 建表 |
| 数据层 | `src/main/database/index.ts` | `runMigrations()` 末尾追加同表幂等 CREATE（旧库兜底） |
| Service | `src/main/services/ewei-connectors.ts` | 新建，连接器 CRUD + 凭据加解密 |
| Service | `src/main/services/ewei-client.ts` | 新建，ewei HTTP 客户端（无界面） |
| 同步排除 | `src/main/services/sync/registry.ts` | 不注册 `ewei_connectors`，仅在排除注释补一行 |
| IPC | `src/main/ipc/index.ts` | 加 `import` + 一组 `ewei:*` handler |
| preload | `src/preload/index.ts` | 加 `ewei` bridge |
| 路由 | `src/renderer/src/router/index.ts` | children 加 `ewei/*` 子路由 |
| 菜单 | `src/renderer/src/layouts/MainLayout.vue` | `allNavItems` 加入口 |
| 视图 | `src/renderer/src/views/ewei/*.vue` | 新建 3 个视图 |
| 状态 | `src/renderer/src/stores/ewei.ts` | 可选 Pinia store |
| 版本 | `agent-admin/backend/config/version.php` 等 | 发版时按打包流程更新 |

---

## 2. 数据层：ewei_connectors 表

照抄 `matting_providers`（`resources/schema.sql:373-391`）结构，加密列沿用 `*_enc` 约定。

```sql
-- resources/schema.sql 追加
CREATE TABLE IF NOT EXISTS ewei_connectors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                       -- 连接器别名（如「我的商城-生产」）
  base_url TEXT NOT NULL DEFAULT '',        -- 业务管理端域名，末尾带 /，如 https://sj.wjmall.net/
  account TEXT NOT NULL DEFAULT '',         -- 登录账号（明文，便于列表展示）
  password_enc TEXT NOT NULL DEFAULT '',    -- 登录密码：v1:{iv}:{tag}:{ct} 加密存
  session_id TEXT NOT NULL DEFAULT '',      -- 当前会话 id（可空，过期重登；如担心安全可改 _enc）
  account_version TEXT NOT NULL DEFAULT '2.1.6',  -- web_site 版本头
  shop_version TEXT NOT NULL DEFAULT '4.6.11',    -- shop_web 版本头
  current_shop_id INTEGER NOT NULL DEFAULT 0,     -- 当前选中店铺主键
  current_shop_name TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,    -- 唯一默认连接器
  last_login_at TEXT NOT NULL DEFAULT '',
  last_login_status TEXT NOT NULL DEFAULT '',
  last_login_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- 双写：同样的 `CREATE TABLE IF NOT EXISTS ewei_connectors (...)` 追加到 `src/main/database/index.ts` 的 `runMigrations()` 末尾（约 538 行 `}` 前，参照 matting_providers 在 481-518 的兜底写法），保证旧库升级也建表。
- 加载机制：`initSchema()`（index.ts:61-79）`db.exec(schema)` 全量幂等执行。
- **绝不写入 `sync/registry.ts` 的 SYNC_ENTITIES**：仅在该文件 11-18 行「刻意排除」注释块补一行 `// - ewei_connectors : 凭据 device-id 派生密钥本地加密，跨设备不可解密`。原因：matting_providers 同例（注册表里只有 matting_tasks，无 matting_providers）。

---

## 3. ewei-client.ts：HTTP 客户端契约

### 3.1 三组接口（前缀 / 编码 / 版本头 / 鉴权）

| 组 | 适用接口 | URL 前缀 | body 编码 | version 头 | 额外头 |
|---|---|---|---|---|---|
| account | 登录、列店、切店、登出 | `{base_url}api/site/{route}` | `x-www-form-urlencoded` (qs) | `2.1.6` | — |
| shop | 商品 list/details/add/edit | `{base_url}shop/manage/{route}` | `application/json` | `4.6.11` | `shop-id: {店铺主键}` |
| utility | 图片上传 | `{base_url}utility/{route}` | `multipart/form-data` | `4.6.11` | `shop-id: {店铺主键}` |

公共头（每个请求都带）：`x-requested-with: XMLHttpRequest`、`session-id: {sessionId}`。**不要**发 `client-type`（发 wap/pc 会切到 `eweishop-member` 会话名，破坏 session-id 复用）。

URL 拼接依据：`web_site/src/utils/util.js:20-31`（`shop/`、`utility/` 前缀直拼 base_url，其余加 `api/site/`）；`shop_web/src/utils/util.js:25-39`。

### 3.2 会话策略

主用 **session-id 头**：client 启动登录前自生成一个 32 位 hex 会话 id（或调 `api/site/account/get-sessionid` 取），登录及之后所有请求都带 `session-id: {id}`，服务端 `setSessionId` 把 PHP 会话绑定到该 id。
辅以 **Cookie jar**：解析登录响应的 `Set-Cookie`（Electron 主进程 `fetch` 用 undici，`res.headers.getSetCookie()`），后续请求带 `Cookie` 头，兜底跨子域/服务端不认 session-id 头的情况。
失效处理：响应 `error === -10000`（登录态失效）→ 自动重新 `login()` 重建会话并重试一次（单飞，参照 `cloud-token.ts` 刷新模式）；`error === -3` 表示已登录，可忽略。

### 3.3 统一响应信封

`{ error: number, message?: string, ...data平铺 }`（`common/functions.php:46-75`、`common/helpers/Response.php:74-88`）。
- 成功：`error === 0`，业务字段**直接平铺在顶层**（不包 `data`，少数收银台特例除外）。
- 失败：`error < 0` + `message`（登录失败可能带 `show_captcha`）。
client 统一封装 `request(group, route, {method, query, body}) → Promise<平铺对象>`，`error !== 0` 抛 `EweiError(error, message)`。

### 3.4 密码加密（AES-128-CBC + ZeroPadding，必须 1:1 复刻）

key/iv 为固定 16 字节常量（前后端硬编码一致）：`key='eweishop.aes_key'`、`iv='eweishop.aes_iv_'`。前端 `CryptoJS.AES.encrypt(明文, Utf8.parse(key), {iv, mode:CBC, padding:ZeroPadding}).toString()` 输出 Base64；后端 `openssl_decrypt(密文,'aes-128-cbc','eweishop.aes_key',OPENSSL_ZERO_PADDING,'eweishop.aes_iv_')`（`web_site/src/utils/util.js:170-184`、`common/models/user/User.php:309-313`）。

Node 实现（与 CryptoJS 字节级一致，因 key 是 WordArray 不走 OpenSSL 盐/KDF，输出即 base64(密文)）：

```ts
import { createCipheriv } from 'crypto'
const AES_KEY = Buffer.from('eweishop.aes_key', 'utf8') // 16B
const AES_IV  = Buffer.from('eweishop.aes_iv_', 'utf8') // 16B（末尾下划线，正好16字符）

/** 复刻 CryptoJS AES-128-CBC + ZeroPadding，返回 Base64 */
export function encryptEweiPassword(plain: string): string {
  const data = Buffer.from(plain, 'utf8')
  // ZeroPadding：已是16倍数则不补，否则补 0x00 至16倍数（与 CryptoJS 行为一致）
  const pad = data.length % 16 === 0 ? 0 : 16 - (data.length % 16)
  const padded = Buffer.concat([data, Buffer.alloc(pad, 0)])
  const cipher = createCipheriv('aes-128-cbc', AES_KEY, AES_IV)
  cipher.setAutoPadding(false) // 关闭自动 PKCS7，已手动补零
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString('base64')
}
```

**单测必做**：用一组已知明文，比对 Node 输出与浏览器 CryptoJS 输出 base64 完全相等，再联调。

### 3.5 client 方法签名清单

```ts
// 会话/登录
getSessionId(): Promise<string>                          // GET api/site/account/get-sessionid → session_id（可选，亦可本地生成）
login(account: string, plainPassword: string): Promise<EweiSession>  // POST api/site/account/login/post
logout(): Promise<void>                                  // GET api/site/account/logout
// 店铺
listShops(): Promise<EweiShop[]>                          // GET api/site/account/shops/list（取响应 .list）
switchShop(shopId: number): Promise<{ url: string; is_root: number }>  // GET api/site/account/shops/switch?id=&enter_flag=1
// 商品
listGoods(params: GoodsListParams): Promise<{ list: EweiGoodsListItem[]; count: number; page: number; pageCount: number }>
getGoodsDetail(goodsId: number): Promise<{ goods: EweiGoods; specs: any[]; options: EweiGoodsOption[] }>
saveGoods(goodsId: number, data: { goods: Partial<EweiGoods>; specs?: any[]; options?: any[] }): Promise<void>
// 上传
uploadImage(buf: Buffer, filename: string): Promise<{ path: string; url: string; width?: number; height?: number; id?: number }>
```

---

## 4. ewei 接口契约速查（逐字段）

### 4.1 取会话 id（可选）
`GET {base}api/site/account/get-sessionid` → `{ error:0, session_id:"<32位md5>" }`（`common/controllers/account/LoginController.php:315-321`）。登录流程非必需，client 也可本地生成 32 hex 作 session-id。

### 4.2 登录
`POST {base}api/site/account/login/post`，`x-www-form-urlencoded`，body 仅三字段：
- `account`：明文账号（用户名/手机/邮箱；子商户为 `用户名@店铺后缀`）
- `password`：**AES 密文（base64）**，见 §3.4
- `bind`：`0`（普通登录）

成功（顶层平铺，`User.php:543-563`）：`{ error:0, uid, account, is_admin, is_root, is_merch, is_supply, shop_id, singleton, hash, ... }`。
失败：`{ error:<负数>, message, show_captcha? }`。`error:-10000` 需重登。
依据：`LoginController.php:171-308`、`api.js:49-51`、`login.vue:329-332`、`request.js:8-11`。

### 4.3 列店铺（门店）
`GET {base}api/site/account/shops/list?source=manage`。
返回：`{ error:0, count, page, pageSize, pageCount, total, list:[shop...], can_create }`。
list 每项关键字段（`ShopManager.php:225-294`）：
- `id`（int 店铺主键，== 后续 `shop-id` 头的值）
- `name`、`logo`（完整 URL）
- `status`（语义状态：0关闭/1正常/-1过期/-2未购套餐）、`showstatus`、`status_text`、`days`、`expire_time`
- `goods_count`、`member_count`、`order_count`
- `is_root`、`can_edit`、`is_merch`、`has_store`、`open_store`、`plan_name`

按当前登录 uid 过滤（`ShopManager.php:163` `where(['m.uid'=>$uid])`）。

### 4.4 切店铺（进店）
`GET {base}api/site/account/shops/switch?id={shopId}&enter_flag=1`。
- `id`：店铺主键（必填）；`enter_flag=1`：进入首页（会校验 `is_checked==1`、未过期/试用）。
成功：`{ error:0, url:"/shop", is_root:0|1, is_verification:0|1 }`。
副作用：服务端写 Session `user_shop_id`、清 `user_store`。
**client 须自行记住该 `shopId`，作为后续所有 shop/utility 请求的 `shop-id` 头**（switch 不回传 shop-id；`Shop::getClientShopId` 以请求头 `shop-id` 为准，`Shop.php:859-885`）。
依据：`shops/IndexController.php:177-328`。

### 4.5 商品列表
`GET {base}shop/manage/goods/list`，可带 `shop-id` 头。常用参数（`goods/IndexController.php:148-657`）：
`category_ids`(逗号串)、`group_ids`、`label_ids`、`status`(1在售/3售罄/-2下架/-1回收站/库存紧张等)、`title`(模糊)、`prices[]`([min,max])、`sales[]`、`type`、`goods_sort`/`goods_by`、分页 `page`/`pagesize`。
list 项图片字段只有 `thumb`、`single_row_thumb`，且 **`thumb` 已转完整 URL**（`:812` `ShopAttachment::getUrl($row['thumb'], true)`）。列表不含 `thumbs`/`content`。

### 4.6 商品详情（回显基底）
`GET {base}shop/manage/goods/details?goods_id={id}`，带 `shop-id` 头。
返回 `{ error:0, goods:{...}, specs:[...], options:[...], ... }`（`goods/IndexController.php:1191/1231/2635`，`specs`/`options` 旁挂在顶层、非 goods 子键）。
**关键：details 走 `getGoods(is_admin=0)`，`thumb/thumbs/video/single_row_thumb/detail_video/params_img` 均为【原始相对路径】**，不是 URL（与列表不同！`ShopGoods.php:3534/3613/3617`）。
- `goods.thumb`：主图相对路径
- `goods.thumbs`：图集，已 `Json::decode` 成**数组**，元素为相对路径
- `goods.content`：详情富文本（HTML，内嵌 `<img src="完整url">`）
- `goods.selling_type`、`has_option`、`title`、价格库存等
- `options[].thumb`：SKU 图相对路径；`specs[].items[].thumb`(相对) + `thumb_url`(已转URL)

### 4.7 保存商品
`POST {base}shop/manage/goods/edit`（新增用 `add`），`application/json`。
- 编辑：顶层 `goods_id`（`Request::PostInt('goods_id')`，`IndexController.php:2858`）。
- body 根 `data`：`{ goods:{...}, specs?|specs_json?, options?|options_json? }`（`ShopGoods.php:744/854-865`）。
- **回写图片字段规则**：
  - `goods.thumb` = 上传返回的 **相对 path**
  - `goods.thumbs` = **相对 path 数组**（后端 `:1124` `Json::encode`）
  - `options[i].thumb` = 相对 path（`:2079`）
  - `goods.content` = 详情图 HTML（内嵌 `<img src="绝对url">`，用上传返回的 `url`）
- 校验：`selling_type==0` 时 `thumb` 与 `thumbs`(非空数组) 必填，否则报「必须上传商品图片」（`:1007`）。
- 落库：`setAttributes($goods)` 只写 rules 白名单字段（`:1656`）。**已确认 `thumb/thumbs/content/title/single_row_thumb/video/video_thumb/detail_video/params_img` 均在白名单**（`ShopGoodsEntity.php:186-203`）；SKU `thumb` 在 `ShopGoodsOptionEntity.php:56`。
  - **更正（评审二次核验）**：`sales_count`（销量）**在白名单内**（`ShopGoodsEntity.php:189` 整型列表），整体回提 details 基底会随 `setAttributes` 写回原值——故**不要无脑整体回提全部 details 字段**，应采用「必填字段 + 目标图片字段」白名单式 payload（见 §13）。
- **回写铁律（v2，已真实验证 + 评审二次核验，详见 §13）**：以 §4.6 details 为基底，**只提交「必填字段 + 目标图片字段」的最小白名单 payload**（不能只传 `{id,thumb,thumbs}`——缺 title 报 `error:-1 请填写商品标题`）。三条致命约束（均已在 ewei 源码确认）：
  1. **多规格必带 + SKU 删除**（已真机验证，见 §11.6）：`has_option==1` 商品的 `saveGoods` **强制要求** `data.specs` 与 `data.options` 均为非空数组（`ShopGoods.php:1134-1138`），缺则**任何图位**保存都报「商品规格数据错误」。因此多规格商品**所有图位**（主图/图集/详情图/SKU）都必须回填**完整** specs+options（含全部 id），既过校验、又避免 `ShopGoodsOption::deleteAll(['not in','id',$optionIds])`（`ShopGoods.php:2403`）物理删除未列入的 SKU。details 的 `getSpec/getOptions` 与 `saveGoods` 是同一后端读/写对（weight/volume 已按 `/1000` 显示单位返回），直接回提即官方前端一致的安全往返。`has_option==0` 单品则不带 options/specs。
  2. **运费模板**：实体/称重/批发类商品（`type∈{ENTITY,WEIGHT,WHOLESALER}`）保存走 `checkDispatchMode`，`dispatch_type==0`+启用快递+`dispatch_id` 空 → `return error('请选择运费模版')` **整单失败**（`ShopGoods.php:1151-1188`）。→ 回提须完整保留 `dispatch_type/dispatch_id/dispatch_mode` 原值；`is_refund_support` 会被强制为 1（`:1191`）。
  3. **复合字段**：剔除 `diy_share`（读=模板对象、提交会被持久化）；`address/省市区/lng/lat` 保存被按店铺地址重算（一次性归一，已实测）。

### 4.8 图片上传
`POST {base}utility/attachment/upload`，`multipart/form-data`，带 `session-id` + `shop-id` 头。
- 表单字段：`file`(二进制，第3参文件名) + `type="image"`（必填）+ 可选 `category_id`、`identity=0`。
- 图片扩展白名单：jpg/jpeg/png/gif/bmp/webp/svg/avif/apng 等（`CoreAttachment.php:671`）。
- `max_size` 取 `CoreSettings::get('attachment')['image']['max_size']`（KB）；超限报「文件过大」。可先用 `makeUploadThumbnail` 压缩规避。
- 返回 `{ error:0, data:{ path, url, md5, size, ext, name, type, identity, width, height, id? } }`：
  - `path`：**相对路径**（如 `image/2026/06/{md5}.jpg`）→ 回写主图/图集/SKU 用它
  - `url`：绝对访问 URL（含 OSS/七牛压缩样式，`is_dpzs=1` 默认用 `getUrl(path)` 重算）→ 详情图 `<img src>` 用它
依据：`common/controllers/attachment/IndexController.php:56-106`、`CoreAttachment.php:464-847`、`resources-selector/default.vue:976-1003`。

---

## 5. 凭据 service：ewei-connectors.ts

照抄 `matting-providers.ts`（`src/main/services/matting-providers.ts:1-269`）：

- 复用加密：`import { encryptSecret, decryptSecret } from './matting-providers'`（AES-256-GCM + device-id 派生 key，密文 `v1:iv:tag:ct`）。或复制三件套并把 `SALT` 改 `'agent-ewei-v1'` 做密钥隔离。**device-id 必须复用现有 `device-id.ts`**。
- CRUD：`listConnectors()`/`getConnector(id)`/`createConnector(data)`/`updateConnector(id,data)`/`deleteConnector(id)`/`setCurrentShop(id, shopId, shopName)`/`resolveCredentials(id)`（解密返回 `{account, password}`，**只在主进程用，不传 renderer**）。
- `is_default` 互斥：create 用 `UPDATE ewei_connectors SET is_default=0`；update 用 `... WHERE id != ?`（`matting-providers.ts:164-167/218-225`）。
- 密码更新用真值判断（空串=不改）：`if (data.password) { sets.push('password_enc=?'); params.push(encryptSecret(data.password)) }`。
- Summary（给 renderer）：去掉 `password_enc`/`session_id`，`account` 脱敏（如 `ab****yz`），`is_default` 转 boolean。

---

## 6. IPC + preload

### 6.1 ipc/index.ts
顶部加 `import * as eweiConnectorService from '../services/ewei-connectors'`、`import * as eweiClient from '../services/ewei-client'`。
在 `registerIpcHandlers()` 内（局部 `ipcMain` 已被 `wrapWithEpoch` 包裹，自动带账号代次防串账号）加一组：

```ts
// 连接器 CRUD（返回脱敏摘要，绝不下发 password_enc/session_id）
ipcMain.handle('ewei:listConnectors', () => eweiConnectorService.listConnectors())
ipcMain.handle('ewei:getConnector',   (_, id) => eweiConnectorService.getConnectorSummary(id))
ipcMain.handle('ewei:createConnector',(_, data) => eweiConnectorService.createConnector(data))
ipcMain.handle('ewei:updateConnector',(_, id, data) => eweiConnectorService.updateConnector(id, data))
ipcMain.handle('ewei:deleteConnector',(_, id) => eweiConnectorService.deleteConnector(id))
// 业务（client 内部用 resolveCredentials 取明文登录，对外只回业务数据）
ipcMain.handle('ewei:login',       (_, id) => eweiClient.login(id))
ipcMain.handle('ewei:listShops',   (_, id) => eweiClient.listShops(id))
ipcMain.handle('ewei:switchShop',  (_, id, shopId) => eweiClient.switchShop(id, shopId))
ipcMain.handle('ewei:listGoods',   (_, id, params) => eweiClient.listGoods(id, params))
ipcMain.handle('ewei:goodsDetail', (_, id, goodsId) => eweiClient.getGoodsDetail(id, goodsId))
ipcMain.handle('ewei:replaceGoodsImage', (event, args) =>
  eweiClient.replaceGoodsImage(args, BrowserWindow.fromWebContents(event.sender)))  // 生成→上传→回写一体，推 ewei:progress
```

脱敏要点：参照 matting `getProvider` handler（`ipc/index.ts:1340`）手动构造 masked 对象返回，**明文密码/session-id 永不进 renderer**。

### 6.2 preload/index.ts
照抄 matting bridge（`src/preload/index.ts:136-148`）：

```ts
ewei: {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(`ewei:${channel}`, ...args),
  onProgress: (cb: (d: unknown) => void) => {
    const h = (_e, d) => cb(d)
    ipcRenderer.on('ewei:progress', h)
    return () => ipcRenderer.off('ewei:progress', h)
  },
},
```

renderer 调用形如 `window.api.ewei.invoke('listShops', connectorId)`。

---

## 7. 图像能力接入：生成/取图 → Buffer → 上传

三条「拿到可上传 Buffer」的真实路径（主进程内，签名见下）：

```ts
import { readFileSync } from 'fs'
import { generateImages, getAbsolutePath } from './image-generation'  // image-generation.ts:1554 / :1780
import { listItemsPaged } from './gallery'                            // gallery.ts:114
import { makeUploadThumbnailBlob } from './thumbnail-upload'          // thumbnail-upload.ts:34

// A. 电商/AI 新生成 → Buffer
const gens = await generateImages({
  prompt, refImages,            // refImages 可放商品原图/风格图
  modelProviderId, modelId, size, tierId, quality, batchCount: 1,
  progressContext: { source: 'image-gen' },
}, window)
const g = gens[0]
if (g.status === 'done' && g.result_path) {        // 成功判定
  const buf = readFileSync(getAbsolutePath(g.result_path))  // result_path 是相对路径，必须转绝对
  // 可选压缩：const t = makeUploadThumbnailBlob(buf, 1200, 88)
  await uploadImage(buf, `main_${g.id}.png`)
}

// B. 本地图库直传 → Buffer
const { items } = listItemsPaged(categoryId, '', 1, 50)   // file_path 已是绝对路径
const buf = readFileSync(items[0].file_path)
await uploadImage(buf, items[0].name)
```

- 渲染端电商批量生图复用 `views/ecom/useEcomGen.ts` 的 `run(jobs, params, {concurrency})`（默认并发3）；底层都走 `imageGen:generate` → `generateImages`。
- **输出形态约定**（务必记牢）：生图 `ImageGeneration.result_path` 是相对 `getDataDir` 的**相对路径**（读盘前 `getAbsolutePath`）；图库 `GalleryItem.file_path`、抠图 `SegmentOutput.resultPath` 是**绝对路径**（直接 `readFileSync`）。
- 生图依赖云控端登录态（`getCloudToken`）与配额：ewei 视图须前置校验「local-agent 云端已登录」，否则生图抛错。
- 关键签名：`generateImages(options: GenerateImageOptions, window?)`（必填 `prompt/modelProviderId/modelId/size`）；`makeUploadThumbnailBlob(buf, maxSide=720, quality=82)`；`listItemsPaged(categoryId|null, search, page(1-based), pageSize)`。

---

## 8. 回写逻辑（核心闭环）

`replaceGoodsImage(args, window)` 编排（在 ewei-client.ts）：

1. `detail = await getGoodsDetail(connId, goodsId)` —— 取完整 goods 作基底。
2. 按用户选定的「图位」产图并上传，得到 `{ path, url }`：
   - 主图：`detail.goods.thumb = path`
   - 图集第 N 张：`detail.goods.thumbs[N] = path`（数组；新增则 push）
   - SKU：`detail.options[i].thumb = path`
   - 详情图（MVP）：`detail.goods.content` 末尾**追加** `\n<p style="text-align:center"><img src="${url}"></p>`，或整段替换为新生成的详情条（保留原 content 备份，便于回滚）。
3. `await saveGoods(connId, goodsId, { goods: detail.goods, options: detail.options })` —— 整体提交基底（已局部替换）。
4. 全程通过 `ewei:progress` 推进度（生成/上传/保存三阶段）；批量场景逐张处理失败可重试/跳过/记录。

详情图增强期：用 `cheerio` 解析 content，按顺序/占位标记精准替换第 N 个 `<img>` 的 `src`。

---

## 9. 视图与接线

### 9.1 视图（`src/renderer/src/views/ewei/`）
- `EweiConnectorsView.vue`：连接器列表 + 新增/编辑（域名/账号/密码）+ 登录 + 店铺列表选择（调 `listShops`/`switchShop`）。
- `EweiGoodsListView.vue`：当前店铺商品列表 + 筛选（title/status/category）+ 分页。
- `EweiGoodsImageView.vue`：选商品 → 取详情 → 选图位（主图/图集/SKU/详情图）→ 选来源（电商生图 / AI生图 / 本地图库）→ 复用 `views/ecom/EcomGeneratorPanel.vue` 等生成 → 预览 → 调 `replaceGoodsImage` 上传回写。

### 9.2 路由（`src/renderer/src/router/index.ts`）
插入到 `path:'/'`(MainLayout) 父路由的 `children` 数组（紧跟 ecom 块，约 118 行后），**子路由不写 requiresAuth**（父已带），`path` 用相对（无前导 `/`）：

```ts
{ path: 'ewei/connectors', name: 'eweiConnectors', component: () => import('@/views/ewei/EweiConnectorsView.vue'), meta: { title: 'EWEI 店铺' } },
{ path: 'ewei/goods',      name: 'eweiGoods',      component: () => import('@/views/ewei/EweiGoodsListView.vue'),  meta: { title: 'EWEI 商品' } },
{ path: 'ewei/goods/:goodsId/image', name: 'eweiGoodsImage', component: () => import('@/views/ewei/EweiGoodsImageView.vue'), meta: { title: '商品图管理' } },
```

### 9.3 菜单（`src/renderer/src/layouts/MainLayout.vue` 的 `allNavItems`，约 203-250）
字段名是 **`label`(非 title)**、`path`(带前导 `/`)、`icon`(已 import 的组件)；分组用 `key:'group:xxx'` + `children`。新增叶子：

```ts
{ path: '/ewei/connectors', label: 'EWEI 店铺', icon: IconExtension },
```

或塞进现有「扩展能力」分组（`key:'group:extensions'`）的 children。`icon` 必须用文件顶部已 import 的组件。

---

## 10. 风险与规避（实施时对照）

| 风险 | 级别 | 规避 |
|---|---|---|
| 静态读码未抓包，请求头大小写/Cookie 行为未实证 | 高 | **阶段0 抓包前置**，固化 client 后再写其余 |
| 会话：PHP Session 非 JWT，session-id 头复用 + 7200s 过期 | 高 | session-id 头 + Cookie jar 双保险；`-10000` 自动重登重试 |
| 列表 thumb 是 URL、详情 thumb/thumbs 是相对路径，形态不一致 | 高 | 回写一律以 details(相对路径) 为基底；上传存 path 不存 url |
| thumbs 是 JSON 数组（非逗号串） | 中 | 提交 `goods.thumbs` 必须是相对路径**数组** |
| setAttributes 白名单：sales_count 等不可写 | 中 | 只改图片字段；已确认图片字段全在白名单 |
| 详情图富文本 `<img>` 替换易误伤 | 中 | MVP 整段替换/末尾追加 + 备份；增强期 cheerio 精准替换 |
| 密码 ZeroPadding 非 PKCS7 | 中 | `setAutoPadding(false)` 手动补零；单测与 CryptoJS 对拍 |
| 跨子域 Cookie / CORS | 中 | 请求全走主进程（绕过 renderer CORS）；session-id 头绕过 Cookie 作用域 |
| 上传 url 经二次处理（OSS/七牛样式） | 中 | 回写存 path，url 仅即时预览 |
| 多商户/供货商：thumb 来源替换、改 content 触发再审核 | 中 | MVP 限定单店店主账号；登录后读 `is_merch/is_supply` 命中则提示 |
| 登录验证码 / 接口限流 | 中 | 处理 `show_captcha`；批量加节流退避 |
| 生图依赖云端登录态/配额 | 中 | ewei 视图前置校验云端已登录；失败可重试 |
| 凭据明文泄露 | 高 | 用 `*_enc` 加密列 + 排除云同步 |
| 改错副本（_internal/working/website 同名后端） | 低 | 正式后端只认 `F:\ewei\backend\client` |

---

## 11. 分阶段任务清单

| 阶段 | 工作 | 产出/验收 | 估时 |
|---|---|---|---|
| 0 抓包核验（前置必做） | 真实环境走「登录→get-sessionid?→列店→switch→列商品→details→upload→edit」 | 固化请求头/Cookie/信封/存储类型/版本头；确认单店与否、账号类型 | 1-2天 |
| 1 数据层+凭据 | schema.sql + index.ts 兜底建表；ewei-connectors.ts CRUD + 加解密；排除同步 | 连接器增删改查可用，密码加密落库 | 1天 |
| 2 client 会话/登录/店铺 | session 管理、密码 AES 单测、login/listShops/switchShop、信封/-10000 重试 | 能登录并列出、切换店铺 | 2-3天 |
| 3 client 商品+上传+回写 | listGoods/getGoodsDetail/uploadImage/saveGoods + replaceGoodsImage 编排 | 测试商品验证 thumb/thumbs/options[].thumb 落库 | 2-3天 |
| 4 IPC+preload | ewei:* handler + 脱敏 + 进度；preload bridge | renderer 可调通全链路 | 1天 |
| 5 视图 MVP | 三视图 + 复用 ecom 生图 + 路由 + 菜单 | 端到端：登录→选店→选商品→生成主图→上传→回写 | 3-4天 |
| 6 联调验收 | 单店店主账号全链路；失败态/重登/限流 | MVP 闭环通过 | 2天 |
| 7+ 增强 | 批量SKU、抠图换背景(透明PNG补白底)、详情图 cheerio 精准替换、Store 网点 | 按需 | 各2-4天 |
| 末 打包发版 | 更新 version.php、打云控端更新包(zip 带全量 migrations)、version.json | 在线更新验证 | 1天 |

MVP = 阶段 0-6，约 2 周。

---

## 11.5 阶段0 抓包结论（2026-06-20，真实环境已验证）

读取链（登录→列店→切店→列商品→详情）已用真实环境跑通，确认如下：

- **会话策略可简化为「仅 session-id 头」**：客户端自生成 32 hex 作 session-id，发 `session-id` 头，服务端即把 PHP 会话 id 设为该值（响应 `set-cookie: eweishop-user={我们发的session-id}`）。全程不带 Cookie 也能维持登录态。→ **§3.2 的 Cookie jar 兜底可砍掉**，client 只维护 session-id。
- **密码 AES-128-CBC/ZeroPadding 复刻正确**：登录返回 `error:0, uid:75`，§3.4 代码可直接用。
- **存储是腾讯云 COS**：相对 path 形如 `6517/image/2026/06/{md5}.jpg`（含店铺 childPath 前缀 `6517/`），绝对 url = `https://cos3.xiaoyinet.cn/{path}`（可能带 COS 压缩样式后缀）。
- **列表 thumb 是完整 URL、详情 thumb/thumbs 是相对路径**（与 §4.5/§4.6 一致，已实证）：详情 `goods.thumb='6517/image/...jpg'`、`goods.thumbs` 为数组、`options/specs` 旁挂顶层。
- **目标账号 = 普通店主**（is_admin=0/is_merch=0/is_supply=0/is_root=1），**名下 39 个店铺**（默认分页 15）→ **选店 UI 必须带分页+搜索**，非单站点。
- **登录响应** `shop_id:null`（未进店时）；切店后用列表项 `id` 作 `shop-id` 头。
- version 头：account 用 2.1.6、shop 用 4.6.11（已带，请求通过）。

## 11.6 阶段0 写操作验证结论（2026-06-20，真实环境已验证）

在测试店铺 474「亿美塑雕」上用真实环境验证了上传与回写（改后已还原），结论：

- **上传契约确认**：`POST utility/attachment/upload`，multipart 字段 `file` + `type=image`（带 `session-id` + `shop-id` 头）→ 返回
  `{ error:0, data:{ path:"5440/image/2026/06/{md5}.png"(相对), url:"https://cos3.xiaoyinet.cn/{path}?imageMogr2/thumbnail/720x/rquality/50"(COS绝对,带样式), id, width, height, md5, shop_id, store_id } }`。
  回写存 `path`，预览用 `url`。
- **主图回写确认**：`POST shop/manage/goods/edit`（JSON），body `{ goods_id, data:{ goods:{...} } }`，`goods.thumb`=新相对path、`goods.thumbs`=[新相对path] → `error:0` 落库；重取详情核对 thumb/thumbs 已更新。
- **必须带必填字段**：只提交 `{id,thumb,thumbs}` 被拒（`error:-1 请填写商品标题`）→ 回写必须以 details 完整 goods 为基底（含 title 等）。
- **整体提交的副作用（一次性、可控）**：提交 details 基底会触发后端对 `address/省市区/lng/lat` 按店铺地址重算、`diy_share` 持久化。核心字段（title/价格/库存）不受影响。**建议提交前剔除 `diy_share`**。
- **还原验证通过**：测试商品 77167 主图已改回原值（地址被一次性归一为店铺真实地址"戴家路"，原"北京天安门"为旧默认值）。
- **多规格往返已验证（2026-06-20 补测，商品 77168 多规格实体）**：改主图回提「完整 specs+options」→ `error:0`；改后逐字段比对 SKU 指纹（id/title/价/库存/重量/thumb）与改前**完全一致**（weight 的 `/1000`↔`×1000` 往返正确），仅目标图变更，还原成功。结论：`has_option==1` 必须带完整 specs+options（缺则报「商品规格数据错误」），details 读格式可直接回提。

## 12. 仍待确认清单

- [x] ~~SKU/多规格写格式~~ → 已验证：has_option==1 回提完整 specs+options 安全往返（SKU 指纹零变化），缺则报「商品规格数据错误」。
- [ ] 详情图 `content` 富文本 `<img>` 替换策略（本测试商品 content 为空，未实测）。
- [ ] session_id 持久化加密存（reload 不重登）还是纯内存态（reload 重登）——产品取舍。
- [ ] 是否需云控端配合（生图计费/配额按 ewei 店铺上报）。
- [x] ~~是否单站点~~ → 否，账号名下 39 店铺（选店 UI 需分页+搜索）。
- [x] ~~session-id 头能否独立维持会话~~ → 能，砍掉 Cookie jar。
- [x] ~~账号类型~~ → 普通店主（is_root=1）。
- [x] ~~上传契约~~ → 已验证（COS，返回 path/url/id）。
- [x] ~~主图回写契约~~ → 已验证（须带必填字段，整体基底提交）。
- [x] ~~存储类型~~ → 腾讯云 COS（cos3.xiaoyinet.cn，url 带 imageMogr2 样式）。

---

## 13. 评审修正与必修项（v2，准确性+合理性复核 + 二次源码核验）

> 经 6 路对抗式复核 + 对高危/冲突断言的二次亲自核验，方案主干（登录/会话/上传/加解密/IPC 范式/同步排除）准确可靠、§11.5/§11.6 已实跑验证；以下为**动手前必须修正/补齐**的项。本节为权威覆盖，与前文冲突时以本节为准。

### 13.1 准确性更正（已二次核验）
- **sales_count 在白名单**（`ShopGoodsEntity.php:189`）：前文"改不了"有误；整体回提会写回 → 改用最小白名单 payload（见 13.3）。
- **`makeUploadThumbnailBlob` 返回 `{blob,filename}|null` 不是 Buffer**，且强制转 JPEG（丢透明通道）。需 Buffer 压缩用 `makeUploadThumbnail(buf,maxSide,quality):Buffer|null`（`thumbnail-upload.ts:12/34`）；§7 示例的 `1200/88` 与默认 `720/82` 表述统一为：封面用 maxSide=1200、quality≥85，且增强期抠图透明 PNG **禁止** JPEG 转码。
- **`wrapWithEpoch` 防的是 local-agent 多账号串库**（`account-context.ts:217` bumpEpoch），与 ewei 多店铺切换无关；§6 措辞更正，勿当作 ewei 收益。
- **会话无服务端续期端点**：7200s 是 PHP 原生滑动过期，框架无显式续期 API；§3.2/§10 删去"活跃刷新"暗示，统一为"靠每次请求自然滑动 + `-10000` 重登"。
- **content 读≠写**：详情读侧经 `self::replace`（`goods/IndexController.php:2470`）且与 clientType 相关，非恒等回提；详情图策略见 13.5。
- **脱敏在 IPC 层**：matting 的 `getProvider` 返回完整行含密文，由 IPC handler 手动构造 masked 对象（`ipc/index.ts:1340`）。ewei 的 `ewei:getConnector` 必须在 handler 内去掉 `password_enc/session_id`、`account` 脱敏；service 层即便返回完整行也绝不下发 renderer。
- **runMigrations 插入点**：ewei_connectors 兜底 CREATE 应加在 fine_matting 块之后、函数闭合 `}` 之前（约 538 行后、539 前），勿落进 fine_matting 块内。

### 13.2 修正后的 MVP 范围（收窄）
- MVP 主链路 = **主图 + 图集 + 详情图**，作用于 **任意 has_option 的商品**（但回写不碰 options，见 13.3）。
- **SKU 图回写移出 MVP**（视图中 SKU 图位禁用/标"实验性"），因其写错会物理删除 SKU（见 13.3）。
- 实施期回归测试须覆盖：has_option=1 商品的主图回写（不传 options 是否安全）、实体类商品（运费模板）、详情图非空商品。

### 13.3 回写安全 payload 规则（核心，防数据损坏）
均已在 ewei 源码确认：
1. **统一规则（已真机验证）**：以 details 完整 goods 为基底（必填字段 + 完整 `dispatch_*` 原值 + 目标图片字段），剔除 `diy_share`。
   - `has_option==0` 单品：payload 仅 `data.goods`，不带 options/specs。
   - `has_option==1` 多规格：**任何图位**都必须带 `data.options` + `data.specs` 的**完整**回填（含全部 id；改 SKU 图时仅替换目标 option 的 `thumb`），否则后端报「商品规格数据错误」；完整回填同时保证 `deleteAll(['not in','id',$optionIds])` 不删任何 SKU。提交前断言每个 option 都有数字 id。
3. **实体/称重/批发类商品**：回提保留 `dispatch_type/dispatch_id/dispatch_mode` 原值，否则 `dispatch_type==0`+快递+空 dispatch_id → `error('请选择运费模版')` 整单失败（`ShopGoods.php:1178-1188`）；上传前可对运费模板做存在性预检并给明确提示。

### 13.4 职责边界拍板：方案A（renderer 生成 → 主进程上传回写）
- **renderer** 用 `views/ecom/useEcomGen.ts` 的 `run()` 完成生成（模型/尺寸/额度均由 renderer 的模型选择器与 `useImageBilling` 提供，进入"生成"前 pre-flight 校验云端已登录+额度足，否则禁用按钮）。
- 生成得到本地产物后，renderer 把 `{ goodsId, slot, localPath|result_path }[]` 经 IPC `ewei:replaceGoodsImage` 传给**主进程**；主进程只负责 `readFileSync → 上传 → 回写 saveGoods`。
- **主进程不直接调 `generateImages`**（避免模型参数悬空、重复生成、路径不可达）。§7 示例 A（主进程内生成）作废，以本条为准。

### 13.5 健壮性必补
- **审计/回滚表 `ewei_goods_image_logs`**（与 ewei_connectors 一样排除云同步）：
  ```sql
  CREATE TABLE IF NOT EXISTS ewei_goods_image_logs (
    id TEXT PRIMARY KEY, connector_id TEXT NOT NULL, shop_id INTEGER NOT NULL,
    goods_id INTEGER NOT NULL, slot TEXT NOT NULL,            -- thumb/thumbs[i]/content/option:{id}
    old_value_json TEXT NOT NULL DEFAULT '',                  -- 原值备份（回滚用）
    new_path TEXT DEFAULT '', new_url TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',                   -- pending/uploaded/done/failed
    error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  ```
  回写前写 `pending`+备份原值，上传成功置 `uploaded`，saveGoods 成功置 `done`，失败留 `error` 供重试/回滚（重试前查 logs 避免重复上传产生 COS 垃圾）。
- **epoch × 长任务不一致**：长回写中 local-agent 热切换账号会 `bumpEpoch`，致任务末尾本地写库抛 `AccountSwitchedError`，而 COS/saveGoods 已成功 → 远端已改、本地未记。编排须：先做不可逆远端步骤(upload/saveGoods)并即时落 logs，再做受 `assertEpoch` 守卫的本地写入；显式捕获 `isAccountSwitchedError`，进度区分"远端已生效/本地未更新"。
- **会话子系统单列**（非"复用 matting"）：`session_id` 多请求共享需单飞排队；`-10000` 重登加全局节流（如 60s 最多 1 次）+ 去重，区分"真过期 vs 被 singleton 顶号"；识别 `show_captcha`/"登录次数过多"直接停手提示，避免互踢/锁号。`session_id` **内存态优先**；需持久化则 `encryptSecret` 存 `session_id_enc`，schema 不留明文列。
- **IPC 粒度**：`replaceGoodsImage` 传 `requestId` 并提供 `ewei:cancel` 信道、把 `AbortSignal` 透传给生成/网络；批量串行或并发≤2，上传/保存加退避；明确"与 ecom/Chat 生图共享同一 6 槽信号量与云端配额"的吞吐预期。
- **图位比例**：读 `detail.goods.thumbs_ratio`（默认 750:750，`ShopGoodsEntity.php:193`）约束生图 size 或生成后 `nativeImage` 居中裁剪；生图 16:9 直接回写会被 C 端拉伸。
- **网络层**：主进程 fetch 统一 `AbortSignal.timeout`（上传/保存放长）、瞬态错误退避重试、系统代理/自签证书处理。
- **合规**：首次保存第三方商城密码弹风险+用途说明并要求确认；提供一键清除凭据入口；提示换机/重装后 device-id 变化致凭据不可解需重输。
- **铁律**：新 `.vue` 禁 emoji/渐变彩色图标、弹窗仅加阴影不加遮罩；含中文文件用 pwsh(UTF-8 NoBOM)/Write 工具写入；本特性建表随**桌面端**版本分发（initSchema/runMigrations），与 agent-admin 云控端 Laravel migration 无关。

### 13.6 联调安全
专设**无销售的测试商品**并锁定，勿在真实在售商品反复改还原（§11.6 已暴露地址被归一）；回写视图加"提交前 diff 预览"，展示将变更字段（尤其被后端重算的地址/dispatch 类）。

---

## 14. 实现清单（已落地）

主进程：
- `resources/schema.sql` — 新增 `ewei_connectors`、`ewei_goods_image_logs` 两表
- `src/main/database/index.ts` — `runMigrations()` 末尾幂等建表（旧库兜底）
- `src/main/services/sync/registry.ts` — 排除注释（两表不参与云同步）
- `src/main/services/ewei-connectors.ts` — 连接器 CRUD + 复用 matting 加解密 + 审计日志读写
- `src/main/services/ewei-client.ts` — HTTP 客户端：AES-128-CBC/ZeroPadding 密码、session-id 会话（单飞登录、-10000 节流重登）、列店/切店/列商品/详情、上传（超大自动压缩）、`replaceGoodsImage` 安全回写编排（§13.3 三条致命约束 + 一致性校验）、进度广播
- `src/main/ipc/index.ts` — `ewei:*` 一组 handler（脱敏在 IPC 层）
- `src/preload/index.ts` — `api.ewei.invoke` + `onProgress`

渲染端：
- `src/renderer/src/stores/cloud-auth.ts` — 新增权限位 `allow_ewei_shop`（默认 true）
- `src/renderer/src/stores/ewei.ts` — 连接器/门店/登录态 Pinia store
- `src/renderer/src/router/index.ts` — `ewei`、`ewei/:connectorId/goods`、`ewei/:connectorId/goods/:goodsId/image` 三路由
- `src/renderer/src/layouts/MainLayout.vue` — 侧栏「店铺商品图」入口（`requireAnyPermission: ['allow_ewei_shop']`）
- `src/renderer/src/components/icons/IconEweiShop.vue` — 店铺图标
- `src/renderer/src/views/ewei/EweiConnectorsView.vue` — 连接器列表 + 新建/编辑 + 登录 + 选门店
- `src/renderer/src/views/ewei/EweiGoodsListView.vue` — 门店商品列表 + 筛选 + 分页
- `src/renderer/src/views/ewei/EweiGoodsImageView.vue` — 图片替换工作台（图位选择 / AI生成 / 本地图库 / 本地文件 → 上传回写，进度可见）

职责边界（§13.4 方案A）：生成在渲染端（复用 `useEcomGen` + `EcomModelBar` + `useImageBilling`），主进程只读盘上传 + 回写。

---

## 附：关键源码索引

桌面端（`F:\local-agent\agent-desktop\`）：
- 加解密/CRUD 范式：`src/main/services/matting-providers.ts`（encrypt 73 / decrypt 82 / is_default 164,218 / INSERT 169）
- device-id：`src/main/services/device-id.ts:14`
- 建表/迁移：`resources/schema.sql:373`、`src/main/database/index.ts:61-79,481-518`
- 同步排除：`src/main/services/sync/registry.ts:11-18,21-213`
- IPC 范式：`src/main/ipc/index.ts`（wrapWithEpoch 66 / matting 组 1339 / imageGen:generate 690）
- preload 范式：`src/preload/index.ts:108(imageGen),136(matting)`
- 生图：`src/main/services/image-generation.ts`（generateImages 1554 / GenerateImageOptions 310 / ImageGeneration 287 / getAbsolutePath 1780）
- 电商编排：`src/renderer/src/views/ecom/useEcomGen.ts:130-208`
- 缩略图：`src/main/services/thumbnail-upload.ts:12-42`
- 图库：`src/main/services/gallery.ts:19-141`
- 抠图：`src/main/services/matting.ts:45-212`
- 路由/菜单：`src/renderer/src/router/index.ts:89-118`、`src/renderer/src/layouts/MainLayout.vue:203-250`

ewei（`F:\ewei\backend\client\`）：
- 登录：`common/controllers/account/LoginController.php:171,315`、`common/models/user/User.php:188,309-313,543-572,664`
- 密码加密前端：`F:\ewei\admin-frontend\web_site\src\utils\util.js:170-184`；请求头 `request.js:8-11`
- 店铺：`user/api/site/account/shops/IndexController.php:64,177`、`common/models/shop/ShopManager.php:52,163,225`、`common/models/shop/Shop.php:125,829,859,1236`
- 商品：`user/shops/shop/manage/goods/IndexController.php:148,1191,2688,2829`、`common/models/goods/ShopGoods.php:741,1007,1124,1656,3534,3613`、白名单 `common/entities/goods/ShopGoodsEntity.php:186-203`、`ShopGoodsOptionEntity.php:49-58`
- 上传：`common/controllers/attachment/IndexController.php:56-106`、`common/models/attachment/CoreAttachment.php:464-847,95-133`、前端 `F:\ewei\admin-frontend\shop_web\src\components\biz\selector\resources-selector\default.vue:976-1003`
- 信封：`common/functions.php:46-75`、`common/helpers/Response.php:74-88`
