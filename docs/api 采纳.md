| IOC 类型   | Endpoint                                    | 说明                                                                                                                                                                                             |
| -------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IPv4     | `/indicators/IPv4/{ip}/{section}`           | 查询 IP 威胁情报                                                                                                                                                                                     |
| IPv6     | `/indicators/IPv6/{ip}/{section}`           | 同上                                                                                                                                                                                             |
| Domain   | `/indicators/domain/{domain}/{section}`     | 域名关联情报                                                                                                                                                                                         |
| Hostname | `/indicators/hostname/{hostname}/{section}` | 主机名                                                                                                                                                                                            |
| URL      | `/indicators/url/{url}/{section}`           | URL 威胁检测                                                                                                                                                                                       |
| CVE      | `/indicators/cve/{cve}/{section}`           | 漏洞相关情报                                                                                                                                                                                         |
|          | /pulses/activity                            | 查看实时动态                                                                                                                                                                                         |
|          | /search/pulses?q={关键词}                      | **搜索情报包**。查找包含该关键词的所有威胁报告。                                                                                                                                                                     |
|          | /pulses/events                              | # 获取从 2026年1月1日 之后发生的所有事件 curl -G "https://otx.alienvault.com/api/v1/pulses/events" \ --data-urlencode "since=2026-01-01T00:00:00" \ --data-urlencode "limit=10" \ -H "X-OTX-API-KEY: <您的KEY>" |


# LevelBlue (AlienVault) OTX API 完整参考手册

所有请求均需在 Header 中携带 API Key：
`X-OTX-API-KEY: <您的API_KEY>`

---

## 1. 核心资产与威胁查询 (Indicators API)

此类接口用于查询具体的“原子指标”（如 IP、域名、Hash），是使用频率最高的功能。

**接口通式:** `GET /indicators/{type}/{indicator}/{section}`

### 1.1 IPv4 / IPv6 查询
**接口:** `/indicators/IPv4/{ip}/{section}`  
**接口:** `/indicators/IPv6/{ip}/{section}`

| 可用 Section | 含义 | 实战场景 (Scenario) |
| :--- | :--- | :--- |
| **`general`** | **概览 (必查)** | 获取 IP 的 ASN 归属、地理位置、信誉评分。判断 IP 是否属于云厂商或恶意组织。 |
| **`passive_dns`** | **被动 DNS** | **[红队核心]** 查看该 IP 历史上绑定过哪些域名。用于挖掘虚拟主机上的隐蔽资产。 |
| **`malware`** | **恶意样本** | **[蓝队核心]** 查看有哪些病毒样本连接过该 IP (C2 研判)。 |
| **`url_list`** | **URL 列表** | 查看该 IP 下曾挂载的具体恶意链接（如 `/admin/login.php`）。 |

> **示例:** 查询 8.8.8.8 的历史解析记录
> ```bash
> curl -H "X-OTX-API-KEY: KEY" "[https://otx.alienvault.com/api/v1/indicators/IPv4/8.8.8.8/passive_dns](https://otx.alienvault.com/api/v1/indicators/IPv4/8.8.8.8/passive_dns)"
> ```

---

### 1.2 域名与主机名 (Domain & Hostname)
**接口:** `/indicators/domain/{domain}/{section}`  
**接口:** `/indicators/hostname/{hostname}/{section}` (针对具体子域名，如 `vpn.test.com`)

| 可用 Section | 含义 | 实战场景 (Scenario) |
| :--- | :--- | :--- |
| **`general`** | 概览 | 查看域名注册信息、Whois 摘要。 |
| **`passive_dns`** | **子域名挖掘** | **[红队核心]** 获取该域名的所有子域名记录（A记录、CNAME等），发现攻击面。 |
| **`whois`** | Whois 详情 | 查找注册人邮箱，进行社工库关联分析。 |
| **`malware`** | 关联样本 | 判断该域名是否被用于挂马或作为 C2 回连地址。 |

---

### 1.3 URL 检测
**接口:** `/indicators/url/{url}/{section}`

* **注意:** URL 必须进行 URL Encode 编码。
* **常用 Section:** `general` (查看扫描结果), `url_list` (关联的其他 URL)。
* **场景:** 收到可疑钓鱼链接，不直接点击，先通过 API 查看沙箱扫描结果和截图哈希。

---

### 1.4 CVE 漏洞情报
**接口:** `/indicators/cve/{cve_id}/{section}`

| 可用 Section | 含义 | 实战场景 (Scenario) |
| :--- | :--- | :--- |
| **`general`** | 漏洞详情 | 查看漏洞描述、CVSS 评分、受影响软件版本。 |
| **`top_n_pulses`**| 关联情报 | 查看哪些黑客组织（APT）正在利用这个漏洞，获取相关的 IOCs。 |

---

## 2. 威胁情报搜索与监控 (Threat Intel & Hunting)

此类接口用于宏观视角的威胁发现和搜索。

### 2.1 实时威胁流 (Activity)
**接口:** `GET /pulses/activity`

* **功能:** 类似 Twitter/微博的时间流，显示全球安全社区最新提交的威胁情报。
* **场景:**
    * **每日早报:** 安全分析师每天查看最新的攻击趋势。
    * **0-Day 预警:** 在漏洞爆发初期，第一时间获取社区共享的 IOC。

### 2.2 关键词搜索 (Search)
**接口:** `GET /search/pulses?q={keyword}`

* **参数:**
    * `q`: 关键词 (如 "Log4j", "Cobalt Strike", "APT28")。
    * `sort`: 排序，建议使用 `-modified` (按更新时间倒序)。
* **场景:**
    * **专项治理:** 老板问“我们要不要防范银狐组织？”，直接搜索 `q=Silver Fox`，下载所有相关的恶意 IP 并封禁。

> **示例:** 搜索关于 Log4j 的最新情报
> ```bash
> curl -G "[https://otx.alienvault.com/api/v1/search/pulses](https://otx.alienvault.com/api/v1/search/pulses)" \
>      --data-urlencode "q=Log4j" --data-urlencode "sort=-modified" \
>      -H "X-OTX-API-KEY: KEY"
> ```

---

## 3. 自动化与数据同步 (Automation)

此类接口专用于机器对接（SIEM/SOC），而非人工查询。

### 3.1 增量事件同步 (Events)
**接口:** `GET /pulses/events`

* **核心参数:**
    * `since`: 时间戳 (ISO 8601格式，如 `2026-01-01T00:00:00`)。如果不传，默认返回最近的数据。
    * `limit`: 返回条数。
* **功能:** 返回从指定时间点之后，所有发生**变动**的操作记录（新增情报、删除情报、修改情报）。
* **场景:**
    * **防火墙自动更新:** 编写脚本，每小时调用一次该接口，获取新增的恶意 IP 推送到防火墙黑名单；同时获取 `delete` 事件，从黑名单中移除误报 IP。

> **示例:** 获取 2026年1月1日之后的所有变动
> ```bash
> curl -G "[https://otx.alienvault.com/api/v1/pulses/events](https://otx.alienvault.com/api/v1/pulses/events)" \
>      --data-urlencode "since=2026-01-01T00:00:00" \
>      --data-urlencode "limit=100" \
>      -H "X-OTX-API-KEY: KEY"
> ```

---

## 4. 速查表 (Cheatsheet)

| 对象类别       | API 路径模板                                  | 核心用途          |
| :--------- | :---------------------------------------- | :------------ |
| **IPv4**   | `/indicators/IPv4/{ip}/general`           | IP 归属与画像      |
| **IPv4**   | `/indicators/IPv4/{ip}/passive_dns`       | **查历史域名 **    |
| **Domain** | `/indicators/domain/{domain}/passive_dns` |               |
| **CVE**    | `/indicators/cve/{cve}/general`           | 漏洞关联样本分析      |
| **Search** | `/search/pulses?q={kw}`                   | 搜索特定组织/漏洞的情报包 |
| **Sync**   | `/pulses/events?since={time}`             |               |
