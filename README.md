
# Workers & Snippets deploy vless + trojan + shadowsocks

基于 Cloudflare Workers & Snippets 的高性能 vless + trojan + shadowsocks 代理服务

※Snippetsの場合、需要将env参数注释掉

※Cloudflare反代优选IP库 https://github.com/hst1189/IPDB




## 功能特性

- 🚀 基于 Cloudflare Workers 和 snippets 的高性能代理
- 🌐 vless + trojan 双协议支持
- 🔐 密码保护的主页访问
- 📱 支持多种客户端(v2rayN,shadowrocket,loon,karing,clash,sing-box等)
- 🌐 自动故障转移和负载均衡
- 📊 实时连接测试和状态监控
- 📊 默认禁用speedtest测速

## 环境变量配置

| 变量名 | 描述 |
|--------|------|
| `UUID` | 用户UUID `5dc15e15-f285-4a9d-959b-0e4fbdd77b63` |
| `PASSWORD` | 主页密码  `123456` |
| `PROXYIP` | 代理服务器IP列表  `13.230.34.30` |
| `SUB_PATH` | 订阅路径  `sub` |
| `DISABLE_TROJAN` | 是否关闭Trojan协议，true关闭，false开启， `false` 默认开启 |

## 部署步骤

1. **登录 Cloudflare Dashboard**
   - 访问 [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - 登录你的账户

2. **创建 Worker**
   - 点击 "Workers & Pages"
   - 点击 "Create application"
   - 选择 "Create Worker"
   - 输入 Worker 名称(不要带vless,proxy之类的关键词，建议默认)

3. **上传代码**
   - 将 `_worker.js` 文件内容复制到编辑器
   - 点击 右上角 "Deploy"

4. **配置环境变量**
   - 在 Worker 设置中找到 "Settings" → "Variables"
   - 添加所需的环境变量并绑定自定义域名
   - 点击 "Save"

5. **访问自定义域名**
   - 输入登录密码进入主页查看相关订阅链接

## 关于cloudns 双向解析
> [!TIP]
> cloudns 双向解析域名部署snippets统一使用的域名前缀
> _acme-challenge



## 客户端设置进阶用法

### 相关路径说明
| 类型 | 示例 |
|------|------|
| **默认路径**（使用服务器设置） | `/?ed=2560` |
| **带端口的 proxyip** | `/?ed=2560&proxyip=ip:port`  or  `/proxyip=ip:port`|
| **域名proxyip**| `/?ed=2560&proxyip=proxyip.domain.com`  or  `/proxyip=proxyip.domain.com`|
| **全局SOCKS5**| `/?ed=2560&proxyip=socks://user:pass@host:port`  or  `/proxyip=socks://user:pass@host:port` |
| **全局 HTTP/HTTPS**| `/?ed=2560&proxyip=http://user:pass@host:port`  or  `/proxyip=http://user:pass@host:port`|

<img width="700" height="600" alt="image" src="https://github.com/user-attachments/assets/86b3dd1d-bbca-4786-9bb3-430bf6700024" />


### shadowsocks 节点参数对照图
- 路径(path): SSpath或uuid开头，示例：`/5dc15e15-f285-4a9d-959b-0e4fbdd77b63/?ed=2560`   
- 带proxyip：`/5dc15e15-f285-4a9d-959b-0e4fbdd77b63/?ed=2560&proxyip=xxxx`  
- 小火箭可去掉`?ed=2560&` 来自定义proxyip或全局出站
<img width="1585" height="1420" alt="PixPin_2025-11-20_21-30-22" src="https://github.com/user-attachments/assets/1ce9060f-9a0d-4093-99e3-4548ee7ac869" />


