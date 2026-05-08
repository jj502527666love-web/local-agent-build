---
name: tianque-payment
description: 支付接入。一句话接通支付。支持主扫、被扫、查询、退款。触发词：天阙、收款、支付、预下单、退款、验签失败、随行付、付款码、收款码、小程序、二维码、条形码、预下单、下单、退款、关单、验签失败、订单查询。
---

# 天阙支付接入

> 通过此skill快速接入天阙开放平台，支持主扫、被扫、查询、退款等核心功能。务必按照skill规定的步骤执行

---

## 引导话术

用户说"接入支付"等模糊表述时，主动澄清：

> 接入天阙支付需要以下信息，请逐一确认：
> 1. 身份类型：商户还是服务商？
> 2. 环境：测试还是生产？
> 3. 三要素：机构号(orgId)、商户号(mno)、私钥(PKCS8格式)
>
> 缺少哪项请告知，我帮你准备。

### 澄清话术表

| 场景 | 用户表述 | 澄清话术 |
|------|----------|----------|
| 身份不明 | "我要支付" | "您是商户还是服务商？商户用version=1.2，服务商用1.0" |
| 环境不明 | "帮我接入" | "先测试还是直连生产？测试域名openapi-test，生产域名openapi" |
| 私钥不明 | "我有私钥" | "请确认是PKCS8格式（PEM头不含RSA），或发给我检查" |
| 场景不明 | "能收款吗" | "主扫（生成二维码让用户扫）还是被扫（扫用户付款码）？" |

---

## 禁止事项

1. 自行生成任何与规范不符的代码
2. 任何未询问用户的参数都不能默认生成
3. 代码生成后未测试直接交付
4. 不按步骤执行，跳过任何一步

---

## 执行流程

### 步骤1 用户配置确认

向用户询问以下内容：

1. **身份类型？** 商户=1.2 / 服务商=1.0
2. **调用环境？** 测试域名=`https://openapi-test.tianquetech.com` / 生产域名=`https://openapi.tianquetech.com`
3. **配置参数？** 机构号-orgId(8位或10位纯数字)、天阙商户编号-mno(399开头的15位纯数字)、私钥（**PKCS8格式**）
> 用户无私钥？执行：
> ```bash
> openssl genrsa -out pri.key 2048 && openssl pkcs8 -topk8 -inform PEM -in pri.key -outform PEM -nocrypt -out private.key && openssl rsa -in pri.key -pubout -out public.key
> ```
> 告知用户：`private.key`私钥自用签名，`public.key`公钥发给天阙配置
>
> 用户有PKCS1私钥？转换：`openssl pkcs8 -topk8 -inform PEM -in pkcs1.key -outform PEM -nocrypt -out private.key`

以上内容必须由用户指定，禁止默认或跳过

4. **技术选型？** Python/Node.js/Java/PHP/Go/C#  此项可根据用户当前项目语言环境选择，默认Python

### 步骤1.5 前置检查

代码生成前，校验关键参数格式：

| 参数 | 校验规则 | 不合规处理 |
|------|----------|------------|
| orgId | 8位或10位纯数字 | 提示"机构号应为8或10位数字" |
| mno | 399开头，15位纯数字 | 提示"商户号应为399开头的15位数字" |
| 私钥 | PEM头为 `BEGIN PRIVATE KEY`（不含RSA） | 提供转换命令 |
| amt | 字符串类型 `"0.01"` | 提示"amt必须传字符串，不是数字" |

**校验代码示例（Python）：**
```python
def validate_config(org_id, mno, private_key):
    if not (len(org_id) in (8, 10) and org_id.isdigit()):
        raise ValueError("机构号应为8或10位纯数字")
    if not (mno.startswith("399") and len(mno) == 15 and mno.isdigit()):
        raise ValueError("商户号应为399开头的15位纯数字")
    if "RSA PRIVATE KEY" in private_key:
        raise ValueError("私钥应为PKCS8格式，请转换：openssl pkcs8 -topk8 -inform PEM -in pkcs1.key -outform PEM -nocrypt -out pkcs8.key")
    return True
```

校验失败时暂停，提示用户修正后再继续。

### 步骤2 场景确认

向用户询问：本次接入的目标是实现什么支付功能？

- **选项1**：主扫支付 -- 商户生成二维码，消费者扫码付款（微信/支付宝/云闪付）
- **选项2**：被扫支付 -- 消费者出示付款码，商户扫码收款（微信/支付宝/云闪付）
- **选项3**：两者都支持

### 步骤3 代码生成

根据用户的配置和场景，生成代码实现：

| 模块 | 说明 | 参考文档 |
|------|------|----------|
| 公共逻辑 | 签名、验签、请求构造 | [sign-examples.md](references/sign-examples.md) |
| 收款+查询 | 主扫、被扫、支付查询 | [api-reference.md](references/api-reference.md) |
| 退款+查询 | 退款申请、退款查询 | [api-reference.md](references/api-reference.md) |

> 所有字段必须严格按规范实现，reqData保持原始顺序不排序

### 步骤4 测试验证

使用用户提供的参数进行接口调用测试：

1. **被扫测试**：使用虚拟付款码请求成功即可
   - 微信：`134567891012345678`
   - 支付宝：`281234567890123456`
   - 银联：`6212345678901234567`
2. **主扫测试**：返回 `payUrl` 即成功（无需实际支付）
3. **验证成功标准**：`code=0000` 且 `bizCode=0000`

非签名类错误根据 [response-codes.md](references/response-codes.md) 排查修复

### 步骤4.5 错误处理流程

bizCode!=0000 时，按以下步骤处理：

| bizCode | 含义 | 处理 |
|---------|------|------|
| 0005 | 验签失败 | 按步骤5排查签名串 |
| 1001 | 参数缺失 | 检查reqData必填字段 |
| 1002 | 参数格式错误 | 检查amt是否字符串、mno是否15位 |
| 2001 | 订单不存在 | 检查ordNo/uuid是否正确 |
| 2002 | 订单状态异常 | 查询tranSts确认当前状态 |
| 9999 | 系统异常 | 重试或联系天阙技术支持 |

**处理步骤：**
1. 打印完整响应，确认bizCode和bizMsg
2. 对照上表确认含义
3. 检查对应参数，修正后重试
4. 3次重试失败，提供完整日志给用户分析

### 步骤5 自动修复（验签失败 code=0005）

#### 5.1 签名串对比法（首选）

打印实际签名字符串，与预期对比：

```python
# 在签名前打印
sign_string = build_sign_string(params)
print("签名字符串:", sign_string)
print("reqData JSON:", json.dumps(params['reqData'], separators=(',', ':'), ensure_ascii=False))
```

**检查要点：**
- reqData内部字段顺序是否与代码定义顺序一致
- 中文是否显示为原字符（不是 `\uXXXX`）
- JSON是否无空格（`{"key":"val"}` 不是 `{ "key": "val" }`）

#### 5.2 私钥格式检查

**确认私钥是PKCS8格式**（统一要求PKCS8，C#代码自动转换）：

| 格式 | PEM头 |
|------|-------|
| PKCS8 | `-----BEGIN PRIVATE KEY-----` |
| PKCS1 | `-----BEGIN RSA PRIVATE KEY-----` |

若为PKCS1，转换命令：
```bash
openssl pkcs8 -topk8 -inform PEM -in pkcs1.key -outform PEM -nocrypt -out pkcs8.key
```

#### 5.3 检查项排查（按高频排序）

| # | 检查项 | 现象 | 修复方法 |
|---|--------|------|----------|
| 1 | reqData内部排序了 | 中文JSON顺序变了 | 保持代码定义顺序，不按字母排序 |
| 2 | 中文被转义了 | `\uXXXX` 出现 | `ensure_ascii=False` |
| 3 | JSON有空格 | `{ "key": "val" }` | `separators=(',',':')` |
| 4 | 用了SHA256 | 签名算法错误 | 改为 **SHA1** |
| 5 | timestamp是毫秒 | 时间戳格式错误 | 改为 `"yyyyMMddHHmmss"` |
| 6 | 外层没排序 | 签名串顺序不对 | 按key字典序排序 |
| 7 | 空值没过滤 | null字段被签名 | 过滤null/空串，保留0 |
| 8 | 时间偏差 | 服务器时间差>5分钟 | 同步服务器时间 |
| 9 | 字段类型错误 | amt传数字 | amt传**字符串** `"0.01"` |

#### 5.4 快速判断问题根源

| 情况 | 根源 | 处理 |
|------|------|------|
| 测试环境验签失败 | 私钥或签名实现问题 | 按5.2排查 |
| 生产环境验签失败 | 可能是公钥未配置 | 确认公钥已上传天阙 |
| 两环境都失败 | 私钥格式或签名实现问题 | 按5.2排查 |
| 两环境都成功但特定订单失败 | 时间偏差或参数类型 | 检查timestamp和amt类型 |

### 5次修复失败后

询问用户：
1. 公钥是否已发送给天阙并完成配置？——天阙配置的公钥必定为正确格式，故障碍必定出在未配置公钥、用户私钥格式或签名实现上
2. 私钥与公钥是否匹配？

## 参考资料

| 文档 | 路径 |
|------|------|
| 完整代码（6语言） | [references/sign-examples.md](references/sign-examples.md) |
| 接口参数详情 | [references/api-reference.md](references/api-reference.md) |
| 应答码详情 | [references/response-codes.md](references/response-codes.md) |
