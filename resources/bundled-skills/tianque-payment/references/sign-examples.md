# 天阙签名规则与代码示例

> SHA1withRSA 签名实现，支持 Python / Node.js / Java / PHP / Go / C#

---

## 目录
- [请求结构](#请求结构)
- [签名规则](#签名规则)
- [私钥格式](#私钥格式)
- [密钥生成](#密钥生成)
- [签名代码示例](#签名代码示例)
  - [Python](#python)
  - [Node.js](#nodejs)
  - [Java](#java)
  - [PHP](#php)
  - [Go](#go)
  - [C# / .NET](#c-net)
- [验签示例](#验签示例)
- [语言陷阱速查](#语言陷阱速查)

---

## 请求结构

### 外层参数（所有接口通用）

| 字段 | 类型 | 说明 |
|------|------|------|
| signType | String | 固定 `RSA` |
| version | String | 商户=`1.2`，服务商=`1.0`（必填） |
| orgId | String | 机构号（8位或10位纯数字） |
| reqId | String | UUID去横线，<=32位 |
| timestamp | String | `yyyyMMddHHmmss`（北京时间） |
| sign | String | RSA签名值 |
| reqData | Object | 业务参数对象 |

### 请求示例

```json
{
  "signType": "RSA",
  "version": "1.2",
  "orgId": "73007943",
  "reqId": "abc12345678901234567890123456789",
  "timestamp": "20260402182452",
  "reqData": {
    "mno": "399210602052650",
    "ordNo": "ORDER001",
    "amt": "0.01",
    "subject": "测试商品",
    "trmIp": "127.0.0.1"
  },
  "sign": "Base64签名值..."
}
```

### 关键规则

| 规则 | 说明 |
|------|------|
| 外层排序 | 按key字典序排序（sign最后） |
| reqData不排序 | 保持代码定义顺序 |
| amt类型 | 必须是**字符串** `"0.01"`，不能是数字 |

---

## 签名规则

### 签名步骤

1. **过滤参数**：排除 `sign` 字段、`null` 值、空字符串（保留数字 `0`）
2. **外层排序**：按 key 字典序排序
3. **reqData不排序**：**保持代码中定义的字段顺序**，不是JSON原始顺序，不是字母顺序
4. **JSON紧凑**：`separators=(',', ':')`，无空格
5. **中文不转义**：`ensure_ascii=False`
6. **拼接字符串**：`key=value` 用 `&` 连接
7. **签名算法**：SHA1withRSA，Base64 输出

> **关键**：reqData内部字段顺序必须与代码中定义顺序完全一致。例如代码中写 `{'mno': ..., 'ordNo': ..., 'amt': ...}`，签名字符串中reqData也必须是 `{"mno":...,"ordNo":...,"amt":...}` 这个顺序。

### 签名字符串示例

代码定义：
```python
req_data = {'mno': '399210602052650', 'ordNo': 'ORDER001', 'amt': '0.01', 'subject': '测试', 'trmIp': '127.0.0.1'}
```

生成签名字符串：
```
orgId=73007943&reqData={"mno":"399210602052650","ordNo":"ORDER001","amt":"0.01","subject":"测试","trmIp":"127.0.0.1"}&reqId=abc123&signType=RSA&timestamp=20260402182452&version=1.2
```

> 注意reqData内部是 mno -> ordNo -> amt -> subject -> trmIp，与代码定义顺序一致，**不是字母顺序**（字母顺序应该是 amt -> mno -> ordNo -> subject -> trmIp）

---

## 私钥格式

**统一使用 PKCS8 格式**，C# 代码会自动转换为 PKCS1。

| 格式 | PEM头 | 说明 |
|------|-------|------|
| PKCS8 | `-----BEGIN PRIVATE KEY-----` | 统一要求 |
| PKCS1 | `-----BEGIN RSA PRIVATE KEY-----` | 需转换 |

**PKCS1 转 PKCS8：**
```bash
openssl pkcs8 -topk8 -inform PEM -in pkcs1.key -outform PEM -nocrypt -out pkcs8.key
```

---

## 密钥生成

```bash
# 生成私钥（PKCS8格式）和公钥
openssl genrsa -out pri.key 2048 && \
openssl pkcs8 -topk8 -inform PEM -in pri.key -outform PEM -nocrypt -out private.key && \
openssl rsa -in pri.key -pubout -out public.key
```

- `private.key` -- 私钥（PKCS8），用于签名
- `public.key` -- 公钥，发给天阙配置

---

## 签名代码示例

### Python

```python
"""
天阙支付签名 - Python

依赖：pip install pycryptodome
"""

import json, base64, uuid
from datetime import datetime
from Crypto.PublicKey import RSA
from Crypto.Signature import PKCS1_v1_5
from Crypto.Hash import SHA

def to_pem(base64_key):
    """转为 PEM 格式"""
    return f"-----BEGIN PRIVATE KEY-----\n{base64_key}\n-----END PRIVATE KEY-----"

def build_sign_string(params):
    """构建签名字符串"""
    keys = sorted([k for k in params if k != 'sign' and params[k] is not None and params[k] != ''])
    parts = []
    for k in keys:
        v = params[k]
        if isinstance(v, dict):
            # 中文不转义，无空格
            v = json.dumps(v, separators=(',', ':'), ensure_ascii=False)
        parts.append(f"{k}={v}")
    return '&'.join(parts)

def sign(params, private_key_pem):
    """SHA1withRSA 签名"""
    h = SHA.new(build_sign_string(params).encode('utf-8'))
    return base64.b64encode(PKCS1_v1_5.new(RSA.import_key(private_key_pem)).sign(h)).decode()

def build_request(org_id, req_data, version='1.2'):
    """构造完整请求"""
    params = {
        'signType': 'RSA',
        'version': version,
        'orgId': org_id,
        'reqId': uuid.uuid4().hex[:32],
        'timestamp': datetime.now().strftime('%Y%m%d%H%M%S'),
        'reqData': req_data
    }
    params['sign'] = sign(params, to_pem(PRIVATE_KEY))
    return params

# 必须由用户提供真实值
PRIVATE_KEY = ''  # 用户私钥（PKCS8 base64）
```

---

### Node.js

```javascript
/**
 * 天阙支付签名 - Node.js
 * 无需额外依赖，使用内置 crypto 模块
 */

const crypto = require('crypto')

function toPem(base64Key) {
  return `-----BEGIN PRIVATE KEY-----\n${base64Key}\n-----END PRIVATE KEY-----`
}

function buildSignString(params) {
  const keys = Object.keys(params)
    .filter(k => k !== 'sign' && params[k] !== null && params[k] !== '')
    .sort()
  
  return keys.map(k => {
    const v = params[k]
    if (typeof v === 'object') {
      return `${k}=${JSON.stringify(v)}`  // Node 默认不转义中文
    }
    return `${k}=${v}`
  }).join('&')
}

function sign(params, privateKeyPem) {
  const signer = crypto.createSign('RSA-SHA1')
  signer.update(buildSignString(params))
  signer.end()
  // 必须转 base64 字符串
  return signer.sign(privateKeyPem).toString('base64')
}

function buildRequest(orgId, reqData, version = '1.2') {
  const params = {
    signType: 'RSA',
    version,
    orgId,
    reqId: crypto.randomUUID().replace(/-/g, '').substring(0, 32),
    timestamp: getTimestamp(),
    reqData
  }
  params.sign = sign(params, toPem(PRIVATE_KEY))
  return params
}

function getTimestamp() {
  const d = new Date()
  return d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0')
}

// 必须由用户提供真实值
const PRIVATE_KEY = ''  // 用户私钥（PKCS8 base64）
```

---

### Java

```java
/**
 * 天阙支付签名 - Java
 * 依赖：com.fasterxml.jackson.core:jackson-databind
 */

import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import com.fasterxml.jackson.databind.ObjectMapper;

public class TianqueSign {
    
    private static final ObjectMapper mapper = new ObjectMapper();
    
    private static PrivateKey loadPrivateKey(String base64Key) throws Exception {
        byte[] keyBytes = Base64.getDecoder().decode(base64Key);
        // Java 必须用 PKCS8
        PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(keyBytes);
        return KeyFactory.getInstance("RSA").generatePrivate(spec);
    }
    
    private static String buildSignString(Map<String, Object> params) throws Exception {
        TreeMap<String, Object> sorted = new TreeMap<>(params);
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Object> e : sorted.entrySet()) {
            if ("sign".equals(e.getKey()) || e.getValue() == null || "".equals(e.getValue())) continue;
            if (sb.length() > 0) sb.append("&");
            if (e.getValue() instanceof Map) {
                sb.append(e.getKey()).append("=").append(mapper.writeValueAsString(e.getValue()));
            } else {
                sb.append(e.getKey()).append("=").append(e.getValue());
            }
        }
        return sb.toString();
    }
    
    public static String sign(Map<String, Object> params, String privateKey) throws Exception {
        Signature signer = Signature.getInstance("SHA1withRSA");
        signer.initSign(loadPrivateKey(privateKey));
        signer.update(buildSignString(params).getBytes("UTF-8"));
        return Base64.getEncoder().encodeToString(signer.sign());
    }
    
    public static Map<String, Object> buildRequest(String orgId, Map<String, Object> reqData, String version) throws Exception {
        Map<String, Object> params = new TreeMap<>();
        params.put("signType", "RSA");
        params.put("version", version != null ? version : "1.2");
        params.put("orgId", orgId);
        params.put("reqId", UUID.randomUUID().toString().replace("-", "").substring(0, 32));
        params.put("timestamp", LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss")));
        params.put("reqData", reqData);
        params.put("sign", sign(params, PRIVATE_KEY));
        return params;
    }
    
    // 必须由用户提供真实值
    private static final String PRIVATE_KEY = "";  // 用户私钥（PKCS8 base64）
}
```

---

### PHP

```php
<?php
/**
 * 天阙支付签名 - PHP
 * 依赖：openssl 扩展（内置）
 */

class TianqueSign {
    
    private static $PRIVATE_KEY = '';  // 用户必须提供
    
    private static function toPem($base64Key) {
        return "-----BEGIN PRIVATE KEY-----\n{$base64Key}\n-----END PRIVATE KEY-----";
    }
    
    private static function buildSignString($params) {
        $keys = array_keys($params);
        $keys = array_filter($keys, function($k) use ($params) {
            return $k !== 'sign' && $params[$k] !== null && $params[$k] !== '';
        });
        sort($keys);
        
        $parts = [];
        foreach ($keys as $k) {
            $v = $params[$k];
            if (is_array($v)) {
                // 中文不转义
                $v = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            $parts[] = "{$k}={$v}";
        }
        return implode('&', $parts);
    }
    
    public static function sign($params) {
        $pkey = openssl_pkey_get_private(self::toPem(self::$PRIVATE_KEY));
        if (!$pkey) throw new Exception("私钥加载失败");
        openssl_sign(self::buildSignString($params), $sig, $pkey, OPENSSL_ALGO_SHA1);
        return base64_encode($sig);
    }
    
    public static function buildRequest($orgId, $reqData, $version = '1.2') {
        // reqId：UUID去横线，确保32位
        $reqId = str_replace('-', '', sprintf(
            '%04x%04x%04x%04x%04x%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        ));
        
        $params = [
            'signType' => 'RSA',
            'version' => $version,
            'orgId' => $orgId,
            'reqId' => $reqId,
            'timestamp' => date('YmdHis'),
            'reqData' => $reqData
        ];
        $params['sign'] = self::sign($params);
        return $params;
    }
}
```

---

### Go

```go
/**
 * 天阙支付签名 - Go
 * 依赖：crypto/rsa、crypto/sha1（内置）
 */

package main

import (
    "crypto"
    "crypto/rand"
    "crypto/rsa"
    "crypto/sha1"
    "crypto/x509"
    "encoding/base64"
    "encoding/json"
    "encoding/pem"
    "fmt"
    mrand "math/rand"
    "sort"
    "strings"
    "time"
)

var privateKey = ""  // 用户必须提供（PKCS8 base64）

func loadPrivateKey(base64Key string) (*rsa.PrivateKey, error) {
    pemData := "-----BEGIN PRIVATE KEY-----\n" + base64Key + "\n-----END PRIVATE KEY-----"
    block, _ := pem.Decode([]byte(pemData))
    if block == nil { return nil, fmt.Errorf("PEM解析失败") }
    // Go 用 PKCS8
    key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil { return nil, err }
    return key.(*rsa.PrivateKey), nil
}

func buildSignString(params map[string]interface{}) string {
    keys := make([]string, 0)
    for k, v := range params {
        if k != "sign" && v != nil && v != "" { keys = append(keys, k) }
    }
    sort.Strings(keys)
    
    parts := make([]string, 0)
    for _, k := range keys {
        v := params[k]
        var str string
        if m, ok := v.(map[string]interface{}); ok {
            data, _ := json.Marshal(m)
            str = string(data)
        } else {
            str = fmt.Sprintf("%v", v)
        }
        parts = append(parts, fmt.Sprintf("%s=%s", k, str))
    }
    return strings.Join(parts, "&")
}

func sign(params map[string]interface{}, priv *rsa.PrivateKey) (string, error) {
    // Go 需要先计算 hash
    hashed := sha1.Sum([]byte(buildSignString(params)))
    sig, err := rsa.SignPKCS1v15(rand.Reader, priv, crypto.SHA1, hashed[:])
    if err != nil { return "", err }
    return base64.StdEncoding.EncodeToString(sig), nil
}

func buildRequest(orgId string, reqData map[string]interface{}, version string) (map[string]interface{}, error) {
    priv, err := loadPrivateKey(privateKey)
    if err != nil { return nil, err }
    
    // reqId：UUID去横线，确保32位
    reqId := fmt.Sprintf("%x", time.Now().UnixNano()) + fmt.Sprintf("%x", mrand.Int())
    if len(reqId) > 32 { reqId = reqId[:32] }
    if len(reqId) < 32 { reqId = reqId + strings.Repeat("0", 32-len(reqId)) }
    
    params := map[string]interface{}{
        "signType": "RSA",
        "version":  version,
        "orgId":    orgId,
        "reqId":    reqId,
        "timestamp": time.Now().Format("20060102150405"),
        "reqData":  reqData,
    }
    params["sign"], err = sign(params, priv)
    return params, err
}
```

---

### C# / .NET

```csharp
/**
 * 天阙支付签名 - C# / .NET
 * 依赖：System.Security.Cryptography（内置）
 * 自动兼容 PKCS8/PKCS1 格式私钥
 */

using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public class TianqueSign {
    
    private static readonly string PrivateKey = "";  // 用户必须提供（PKCS8 base64）
    
    private static RSA LoadPrivateKey(string base64Key) {
        var keyBytes = Convert.FromBase64String(base64Key);
        var rsa = RSA.Create();
        
        // 自动尝试 PKCS8 和 PKCS1 格式
        try {
            rsa.ImportPkcs8PrivateKey(keyBytes, out _);  // PKCS8
        } catch {
            rsa.ImportRSAPrivateKey(keyBytes, out _);    // PKCS1 fallback
        }
        return rsa;
    }
    
    private static string BuildSignString(Dictionary<string, object> @params) {
        var sortedKeys = @params.Keys
            .Where(k => k != "sign" && @params[k] != null && @params[k].ToString() != "")
            .OrderBy(k => k);
        
        var parts = new List<string>();
        foreach (var key in sortedKeys) {
            var value = @params[key];
            string strValue;
            if (value is Dictionary<string, object> dict) {
                var options = new JsonSerializerOptions {
                    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
                };
                strValue = JsonSerializer.Serialize(dict, options);
            } else {
                strValue = value.ToString();
            }
            parts.Add($"{key}={strValue}");
        }
        return string.Join("&", parts);
    }
    
    public static string Sign(Dictionary<string, object> @params) {
        var rsa = LoadPrivateKey(PrivateKey);
        var data = Encoding.UTF8.GetBytes(BuildSignString(@params));
        var sig = rsa.SignData(data, HashAlgorithmName.SHA1, RSASignaturePadding.Pkcs1);
        return Convert.ToBase64String(sig);
    }
    
    public static Dictionary<string, object> BuildRequest(string orgId, Dictionary<string, object> reqData, string version = "1.2") {
        var @params = new Dictionary<string, object> {
            ["signType"] = "RSA",
            ["version"] = version,
            ["orgId"] = orgId,
            ["reqId"] = Guid.NewGuid().ToString("N").Substring(0, 32),
            ["timestamp"] = DateTime.Now.ToString("yyyyMMddHHmmss"),
            ["reqData"] = reqData
        };
        @params["sign"] = Sign(@params);
        return @params;
    }
}
```

---

## 验签示例

> 响应验签必须执行，防止伪造响应

### Python

```python
def verify_sign(response, tianque_pub_key_pem):
    """验签响应"""
    params = {k: v for k, v in response.items() if k != 'sign'}
    keys = sorted(params.keys())
    parts = []
    for k in keys:
        v = params[k]
        if isinstance(v, dict):
            v = json.dumps(v, separators=(',', ':'), ensure_ascii=False)
        parts.append(f"{k}={v}")
    sign_string = '&'.join(parts)
    h = SHA.new(sign_string.encode('utf-8'))
    verifier = PKCS1_v1_5.new(RSA.import_key(tianque_pub_key_pem))
    return verifier.verify(h, base64.b64decode(response['sign']))
```

### Node.js

```javascript
function verifySign(response, tianquePubKeyPem) {
  const params = { ...response }
  delete params.sign
  
  const keys = Object.keys(params).sort()
  const signString = keys.map(k => {
    const v = params[k]
    if (typeof v === 'object') {
      return `${k}=${JSON.stringify(v)}`
    }
    return `${k}=${v}`
  }).join('&')
  
  const verifier = crypto.createVerify('RSA-SHA1')
  verifier.update(signString)
  verifier.end()
  return verifier.verify(tianquePubKeyPem, response.sign, 'base64')
}
```

### Java

```java
public static boolean verifySign(Map<String, Object> response, String tianquePubKey) throws Exception {
    byte[] keyBytes = Base64.getDecoder().decode(tianquePubKey);
    X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
    PublicKey pubKey = KeyFactory.getInstance("RSA").generatePublic(spec);
    
    TreeMap<String, Object> sorted = new TreeMap<>(response);
    sorted.remove("sign");
    StringBuilder sb = new StringBuilder();
    for (Map.Entry<String, Object> e : sorted.entrySet()) {
        if (sb.length() > 0) sb.append("&");
        if (e.getValue() instanceof Map) {
            sb.append(e.getKey()).append("=").append(mapper.writeValueAsString(e.getValue()));
        } else {
            sb.append(e.getKey()).append("=").append(e.getValue());
        }
    }
    
    Signature verifier = Signature.getInstance("SHA1withRSA");
    verifier.initVerify(pubKey);
    verifier.update(sb.toString().getBytes("UTF-8"));
    return verifier.verify(Base64.getDecoder().decode((String) response.get("sign")));
}
```

### PHP

```php
public static function verifySign($response, $tianquePubKey) {
    $params = array_filter($response, function($k) { return $k !== 'sign'; }, ARRAY_FILTER_USE_KEY);
    $keys = array_keys($params);
    sort($keys);
    
    $parts = [];
    foreach ($keys as $k) {
        $v = $params[$k];
        if (is_array($v)) {
            $v = json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        $parts[] = "{$k}={$v}";
    }
    $signString = implode('&', $parts);
    
    $pubKeyId = openssl_pkey_get_public("-----BEGIN PUBLIC KEY-----\n{$tianquePubKey}\n-----END PUBLIC KEY-----");
    $result = openssl_verify($signString, base64_decode($response['sign']), $pubKeyId, OPENSSL_ALGO_SHA1);
    return $result === 1;
}
```

### Go

```go
func verifySign(response map[string]interface{}, tianquePubKey string) (bool, error) {
    pubKeyPem := "-----BEGIN PUBLIC KEY-----\n" + tianquePubKey + "\n-----END PUBLIC KEY-----"
    block, _ := pem.Decode([]byte(pubKeyPem))
    if block == nil { return false, fmt.Errorf("PEM解析失败") }
    
    pub, err := x509.ParsePKIXPublicKey(block.Bytes)
    if err != nil { return false, err }
    
    // 构建签名字符串
    params := make(map[string]interface{})
    for k, v := range response {
        if k != "sign" { params[k] = v }
    }
    signString := buildSignString(params)
    
    hashed := sha1.Sum([]byte(signString))
    sigBytes, err := base64.StdEncoding.DecodeString(response["sign"].(string))
    if err != nil { return false, err }
    err = rsa.VerifyPKCS1v15(pub.(*rsa.PublicKey), crypto.SHA1, hashed[:], sigBytes)
    return err == nil, err
}
```

### C#

```csharp
public static bool VerifySign(Dictionary<string, object> response, string tianquePubKey) {
    var pubKeyBytes = Convert.FromBase64String(tianquePubKey);
    var rsa = RSA.Create();
    rsa.ImportRSAPublicKey(pubKeyBytes, out _);
    
    var params = new Dictionary<string, object>(response);
    params.Remove("sign");
    
    var keys = params.Keys.OrderBy(k => k).ToList();
    var parts = new List<string>();
    foreach (var key in keys) {
        var value = params[key];
        string strValue;
        if (value is Dictionary<string, object> dict) {
            var options = new JsonSerializerOptions {
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            };
            strValue = JsonSerializer.Serialize(dict, options);
        } else {
            strValue = value.ToString();
        }
        parts.Add($"{key}={strValue}");
    }
    var signString = string.Join("&", parts);
    
    var data = Encoding.UTF8.GetBytes(signString);
    var sig = Convert.FromBase64String((string)response["sign"]);
    return rsa.VerifyData(data, sig, HashAlgorithmName.SHA1, RSASignaturePadding.Pkcs1);
}
```

### 天阙公钥

| 环境 | 公钥 |
|------|------|
| 测试 | `MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCOmsrFtFPTnEzfpJ/hDl5RODBxw4i9Ex3NmmG/N7A1+by032zZZgLLpdNh8y5otjFY0E37Nyr4FGKFRSSuDiTk8vfx3pv6ImS1Rxjjg4qdVHIfqhCeB0Z2ZPuBD3Gbj8hHFEtXZq8+msAFu/5ZQjiVhgs5WWBjh54LYWSum+d9+wIDAQAB` |
| 生产 | `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAjo1+KBcvwDSIo+nMYLeOJ19Ju4ii0xH66ZxFd869EWFWk/EJa3xIA2+4qGf/Ic7m7zi/NHuCnfUtUDmUdP0JfaZiYwn+1Ek7tYAOc1+1GxhzcexSJLyJlR2JLMfEM+rZooW4Ei7q3a8jdTWUNoak/bVPXnLEVLrbIguXABERQ0Ze0X9Fs0y/zkQFg8UjxUN88g2CRfMC6LldHm7UBo+d+WlpOYH7u0OTzoLLiP/04N1cfTgjjtqTBI7qkOGxYs6aBZHG1DJ6WdP+5w+ho91sBTVajsCxAaMoExWQM2ipf/1qGdsWmkZScPflBqg7m0olOD87ymAVP/3Tcbvi34bDfwIDAQAB` |

---

## 语言陷阱速查

| 语言 | 陷阱 | 解决方案 |
|------|------|----------|
| **Python** | `json.dumps` 转义中文 -> `\uXXXX` | `ensure_ascii=False` |
| **Node.js** | `sign()` 返回 Buffer | `.toString('base64')` |
| **Java** | 私钥格式必须是PKCS8 | 用 `PKCS8EncodedKeySpec` |
| **PHP** | 私钥需 PEM 字符串 | 包装成 PEM 格式 |
| **Go** | `SignPKCS1v15` 需要 hash | `sha1.Sum()` 先计算 |
| **C#** | 自动兼容PKCS8/PKCS1 | `ImportPkcs8PrivateKey` 优先 |
