# 天阙接口详情

## 目录
- [主扫/预下单](#主扫预下单)
- [被扫/付款码](#被扫付款码)
- [支付结果查询](#支付结果查询)
- [退款申请](#退款申请)
- [退款结果查询](#退款结果查询)

> 请求结构详见 [sign-examples.md](sign-examples.md#请求结构)

---

## 主扫/预下单

**接口**: `POST /order/activePlusScan`
**用途**: 生成支付二维码，用户扫码支付

### reqData 必传参数

| 参数 | 数据类型 | 说明 |
|------|----------|------|
| mno | String | 商户商编（15位） |
| ordNo | String | 商户订单号（64位内，唯一） |
| amt | **String** | 订单总金额（元），如 `"0.01"` -- **必须传字符串，传数字会验签失败** |
| subject | String | 订单标题（256位内） |
| trmIp | String | 终端 IP（16位内） |

> **amt 类型警告**：`amt` 必须是字符串类型 `"0.01"`，不能是数字类型 `0.01`。数字类型会导致验签失败！

### 成功响应（respData）

| 字段 | 数据类型 | 说明 |
|------|----------|------|
| bizCode | String | 业务响应码，`0000`=成功 |
| ordNo | String | 商户订单号 |
| uuid | String | 天阙订单号（查询用） |
| payUrl | String | 二维码链接 |
| sxfUuid | String | 落单号（退款用） |

> payUrl 返回 != 支付成功！必须轮询查询确认最终状态

---

## 被扫/付款码

**接口**: `POST /order/reverseScan`
**用途**: 商户扫用户付款码收款

### reqData 必传参数

| 参数 | 数据类型 | 说明 |
|------|----------|------|
| mno | String | 商户商编 |
| ordNo | String | 商户订单号 |
| amt | **String** | 订单金额（元） -- **必须传字符串** |
| authCode | String | 用户付款码（扫码枪获取） |
| subject | String | 订单标题 |
| trmIp | String | 终端 IP |

### 付款码识别

| 前缀 | 渠道 | 长度 |
|------|------|------|
| 10-19 | 微信 | 18-19位 |
| 25-30 | 支付宝 | 16-24位 |
| 62 | 银联 | 19位 |
| 01 | 数字人民币 | - |

### 成功响应

| 字段 | 数据类型 | 说明 |
|------|----------|------|
| bizCode | String | 业务响应码 |
| tranSts | String | 订单状态：SUCCESS/FAIL/PAYING |
| ordNo | String | 商户订单号 |
| uuid | String | 天阙订单号 |
| transactionId | String | 微信/支付宝流水号 |
| sxfUuid | String | 落单号 |

---

## 支付结果查询

**接口**: `POST /query/tradeQuery`
**用途**: 查询支付状态

### reqData 必传参数

| 参数 | 数据类型 | 说明 |
|------|----------|------|
| mno | String | 商户商编 |
| ordNo | String | 商户订单号（四选一） |
| uuid | String | 天阙订单号（四选一） |
| transactionId | String | 微信/支付宝流水号（四选一） |
| sxfUuid | String | 落单号（四选一） |

> 仅支持查询 **180 天内**订单

### 成功响应（respData）

| 字段 | 数据类型 | 说明 |
|------|----------|------|
| tranSts | String | 订单状态：SUCCESS/FAIL/PAYING/CLOSED/CANCELED |
| ordNo | String | 商户订单号 |
| uuid | String | 天阙订单号 |
| payTime | String | 支付完成时间 |
| transactionId | String | 微信/支付宝流水号 |
| sxfUuid | String | 落单号 |

---

## 退款申请

**接口**: `POST /order/refund`
**用途**: 申请退款

### reqData 必传参数

| 参数 | 数据类型 | 说明 |
|------|----------|------|
| mno | String | 商户商编 |
| ordNo | String | 退款订单号（新，唯一） |
| origOrderNo | String | 原商户订单号（三选一）原交易的ordNo |
| origUuid | String | 原天阙订单号（三选一）原交易返回的uuid |
| origSxfUuid | String | 原落单号（三选一）原交易返回的sxfUuid |
| amt | **String** | 退款金额（元） -- **必须传字符串** |

> 支持 **365 天内**退款，可多次退款

### 成功响应（respData）

| 字段 | 数据类型 | 说明 |
|------|----------|------|
| bizCode | String | `0000`=成功，`2002`=退款中需轮询 |
| tranSts | String | 退款状态：REFUNDSUC/REFUNDFAIL/REFUNDING |
| uuid | String | 天阙订单号 |
| amt | String | 退款金额（元） |

---

## 退款结果查询

**接口**: `POST /query/refundQuery`
**用途**: 查询退款状态

### reqData 必传参数

| 参数 | 数据类型 | 说明 |
|------|----------|------|
| mno | String | 商户商编 |
| ordNo | String | 退款订单号（二选一） |
| uuid | String | 天阙订单号（二选一） |

### 成功响应（respData）

| 字段 | 数据类型 | 说明 |
|------|----------|------|
| tranSts | String | 退款状态：REFUNDSUC/REFUNDFAIL/REFUNDING |
| ordNo | String | 退款订单号 |
| refundAmount | String | 退款金额（元） |
| payTime | String | 退款成功时间 |
