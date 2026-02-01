import { connect } from 'cloudflare:sockets';

let subPath = '';     // 节点订阅路径,不修改将使用UUID作为订阅路径
let password = '';    // 节点UUID
let proxyIP = '';     // proxyIP 格式：ip、域名、ip:port、域名:port等,没填写port，默认使用443,也可以是socks5
let yourUUID = '';    // UUID | 建议添加环境变量
let SSpath = '';      // 路径验证，为空则使用UUID作为验证路径

// CDN 
let cfip = [ // 格式:优选域名:端口#备注名称、优选IP:端口#备注名称、[ipv6优选]:端口#备注名称、优选域名#备注 
    'mfa.gov.ua#SG', 'saas.sin.fan#HK', 'store.ubi.com#JP', 'cf.130519.xyz#KR', 'cf.008500.xyz#HK',
    'cf.090227.xyz#SG', 'cf.877774.xyz#HK', 'cdns.doon.eu.org#JP', 'sub.danfeng.eu.org#TW', 'cf.zhetengsha.eu.org#HK'
];  // 在此感谢各位大佬维护的优选域名

function closeSocketQuietly(socket) {
    try {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
            socket.close();
        }
    } catch (error) {}
}

function formatIdentifier(arr, offset = 0) {
    const hex = [...arr.slice(offset, offset + 16)].map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

function base64ToArray(b64Str) {
    if (!b64Str) return { error: null };
    try {
        const binaryString = atob(b64Str.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return { earlyData: bytes.buffer, error: null };
    } catch (error) {
        return { error };
    }
}

function isSpeedTestSite(hostname) {
    const speedTestDomains = ['speedtest.net','fast.com','speedtest.cn','speed.cloudflare.com','ovo.speedtestcustom.com'];
    if (speedTestDomains.includes(hostname)) {
        return true;
    }
    for (const domain of speedTestDomains) {
        if (hostname.endsWith('.' + domain) || hostname === domain) {
            return true;
        }
    }
    return false;
}

function parseProxyAddress(serverStr) {
    if (!serverStr) return null;
    serverStr = serverStr.trim();
    // 解析 S5
    if (serverStr.startsWith('socks://') || serverStr.startsWith('socks5://')) {
        const urlStr = serverStr.replace(/^socks:\/\//, 'socks5://');
        try {
            const url = new URL(urlStr);
            return {
                type: 'socks5',
                host: url.hostname,
                port: parseInt(url.port) || 1080,
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }

    // 解析 HTTP
    if (serverStr.startsWith('http://') || serverStr.startsWith('https://')) {
        try {
            const url = new URL(serverStr);
            return {
                type: 'http',
                host: url.hostname,
                port: parseInt(url.port) || (serverStr.startsWith('https://') ? 443 : 80),
                username: url.username ? decodeURIComponent(url.username) : '',
                password: url.password ? decodeURIComponent(url.password) : ''
            };
        } catch (e) {
            return null;
        }
    }

    // 处理 IPv6 格式 [host]:port
    if (serverStr.startsWith('[')) {
        const closeBracket = serverStr.indexOf(']');
        if (closeBracket > 0) {
            const host = serverStr.substring(1, closeBracket);
            const rest = serverStr.substring(closeBracket + 1);
            if (rest.startsWith(':')) {
                const port = parseInt(rest.substring(1), 10);
                if (!isNaN(port) && port > 0 && port <= 65535) {
                    return { type: 'direct', host, port };
                }
            }
            return { type: 'direct', host, port: 443 };
        }
    }

    const lastColonIndex = serverStr.lastIndexOf(':');

    if (lastColonIndex > 0) {
        const host = serverStr.substring(0, lastColonIndex);
        const portStr = serverStr.substring(lastColonIndex + 1);
        const port = parseInt(portStr, 10);

        if (!isNaN(port) && port > 0 && port <= 65535) {
            return { type: 'direct', host, port };
        }
    }

    return { type: 'direct', host: serverStr, port: 443 };
}


async function sha224(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    let H = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
    const msgLen = data.length;
    const bitLen = msgLen * 8;
    const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLen);
    padded.set(data);
    padded[msgLen] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLen - 4, bitLen, false);
    for (let chunk = 0; chunk < paddedLen; chunk += 64) {
        const W = new Uint32Array(64);

        for (let i = 0; i < 16; i++) {
            W[i] = view.getUint32(chunk + i * 4, false);
        }

        for (let i = 16; i < 64; i++) {
            const s0 = rightRotate(W[i - 15], 7) ^ rightRotate(W[i - 15], 18) ^ (W[i - 15] >>> 3);
            const s1 = rightRotate(W[i - 2], 17) ^ rightRotate(W[i - 2], 19) ^ (W[i - 2] >>> 10);
            W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
        }

        let [a, b, c, d, e, f, g, h] = H;

        for (let i = 0; i < 64; i++) {
            const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
            const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;

            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        H[0] = (H[0] + a) >>> 0;
        H[1] = (H[1] + b) >>> 0;
        H[2] = (H[2] + c) >>> 0;
        H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0;
        H[5] = (H[5] + f) >>> 0;
        H[6] = (H[6] + g) >>> 0;
        H[7] = (H[7] + h) >>> 0;
    }

    const result = [];
    for (let i = 0; i < 7; i++) {
        result.push(
            ((H[i] >>> 24) & 0xff).toString(16).padStart(2, '0'),
            ((H[i] >>> 16) & 0xff).toString(16).padStart(2, '0'),
            ((H[i] >>> 8) & 0xff).toString(16).padStart(2, '0'),
            (H[i] & 0xff).toString(16).padStart(2, '0')
        );
    }
    return result.join('');
}

function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
}

export default {
    /**
     * @param {import("@cloudflare/workers-types").Request} request
     * @param {{UUID: string, uuid: string, PROXYIP: string, PASSWORD: string, PASSWD: string, password: string, proxyip: string, proxyIP: string, SUB_PATH: string, subpath: string, DISABLE_TROJAN: string, CLOSE_TROJAN: string}} env
     * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
     * @returns {Promise<Response>}
     */
    async fetch(request, env) {
        try {
            // ************* snippets 没有环境变量，将env注释掉 ************* 
            if (subPath === 'link' || subPath === '') {
                subPath = password;
            }
            if (env.PROXYIP || env.proxyip || env.proxyIP) {
                const servers = (env.PROXYIP || env.proxyip || env.proxyIP).split(',').map(s => s.trim());
                proxyIP = servers[0];
            }
            password = env.PASSWORD || env.password || env.uuid || env.UUID || password;
            subPath = env.SUB_PATH || env.subpath || subPath;
            SSpath = env.SSPATH || env.sspath || SSpath;
            if (SSpath === '') { SSpath = password; }
            let validPath = `/${SSpath}`;
            // ************* snippets 没有环境变量，将env注释掉 ************* 

            const method = 'none';
            const url = new URL(request.url);
            const pathname = url.pathname;
            let pathProxyIP = null;
            if (pathname.startsWith('/proxyip=')) {
                try {
                    pathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                } catch (e) {
                    // 忽略错误
                }

                if (pathProxyIP && !request.headers.get('Upgrade')) {
                    proxyIP = pathProxyIP;
                    return new Response(`set proxyIP to: ${proxyIP}\n\n`, {
                        headers: {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        },
                    });
                }
            }

            if (request.headers.get('Upgrade') === 'websocket') {
                let wsPathProxyIP = null;
                if (pathname.startsWith('/proxyip=')) {
                    try {
                        wsPathProxyIP = decodeURIComponent(pathname.substring(9)).trim();
                    } catch (e) {
                        // 忽略错误
                    }
                }

                const customProxyIP = wsPathProxyIP || url.searchParams.get('proxyip') || request.headers.get('proxyip');
                return await handleSSRequest(request, customProxyIP);
            } else if (request.method === 'GET') {
                if (url.pathname === '/') {
                    return getSimplePage(request);
                }
                if (url.pathname.toLowerCase() === `/${password.toLowerCase()}`) {
                    const sheader = 's' + 's';
                    const typelink = 'c' + 'l' + 'a' + 's' + 'h';
                    const currentDomain = url.hostname;
                    const baseUrl = `https://${currentDomain}`;
                    const vUrl = `${baseUrl}/sub/${subPath}`;
                    const qxConfig = `shadowsocks=mfa.gov.ua:443,method=none,password=${password},obfs=wss,obfs-host=${currentDomain},obfs-uri=/${SSpath}/?ed=2560,fast-open=true, udp-relay=true,tag=SS`;
                    const claLink = `https://sub.ssss.xx.kg/${typelink}?config=${vUrl}`;
                    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Shadowsocks 订阅中心</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:20px;background:linear-gradient(135deg,#7dd3ca 0%,#a17ec4 100%);color:#333}.container{height:1080px;max-width:800px;margin:0 auto}.header{margin-bottom:30px}.header h1{text-align:center;color:#007fff;border-bottom:2px solid #3498db;padding-bottom:10px}.section{margin-bottom:0px}.section h2{color:#b33ce7;margin-bottom:5px;font-size:1.1em}.link-box{background:#f0fffa;border:1px solid #ddd;border-radius:8px;padding:15px;margin-bottom:15px;display:flex;justify-content:space-between;align-items:flex-start}.lintext{flex:1;word-break:break-all;font-family:monospace;color:#2980b9;margin:10px;}.clesh-config{flex:1;word-break:break-all;font-family:monospace;color:#2980b9;margin:10px;white-space:pre-wrap;background:#f8f9fa;padding:10px;border-radius:4px;border:1px solid #e9ecef}.button-group{display:flex;gap:10px;flex-shrink:0}.copy-btn{background:#27aea2;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;transition:all 0.3s ease}.copy-btn:hover{background:#219652}.copy-btn.copied{background:#0e981d}.qrcode-btn{background:#e67e22;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer}.qrcode-btn:hover{background:#d35400}.footer{text-align:center;color:#7f8c8d;border-top:1px solid #e1d9fb;}.footer a{color:#c311ffs;text-decoration:none;margin:0 15px}.footer a:hover{text-decoration:underline}#qrModal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000}.modal-content{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;text-align:center;max-width:90%}.modal-content h3{margin-bottom:15px;color:#2c3e50}.modal-content img{max-width:300px;height:auto;margin:10px 0}.close-btn{background:#e74c3c;color:white;border:none;padding:8px 15px;border-radius:4px;cursor:pointer;margin-top:15px}.close-btn:hover{background:#c0392b}@media (max-width:600px){.link-box{flex-direction:column}.button-group{margin-top:10px;align-self:flex-end}}</style></head><body><div class="container"><div class="header"><h1>Shadowsocks 订阅中心</h1></div><div class="section"><h2>V2rayN(7.16.4)/Nekobox/小火箭/v2rayng(安卓1.8.25)/kraing(1.2.8.1100以上) 订阅链接</h2><div class="link-box"><div class="lintext">${vUrl}</div><div class="button-group"><button class="copy-btn" onclick="copyToClipboard(this,'${vUrl}')">复制</button><button class="qrcode-btn" onclick="showQRCode('${vUrl}','V2rayN(7.16.4)/nekobox/小火箭/V2rayng(安卓1.8.25) 订阅链接')">二维码</button></div></div></div><div class="section"><h2>${typelink}订阅链接</h2><div class="link-box"><div class="lintext">${claLink}</div><div class="button-group"><button class="copy-btn" onclick="copyToClipboard(this,'${claLink}')">复制</button><button class="qrcode-btn" onclick="showQRCode('${claLink}','${typelink} 订阅链接')">二维码</button></div></div></div><div class="section"><h2>Quantumult X节点配置</h2><div class="link-box"><div class="lintext">${qxConfig}</div><div class="button-group"><button class="copy-btn" onclick="copyToClipboard(this,'${qxConfig}')">复制</button></div></div></div><div class="section"><h2>客户端下载链接</h2><div class="link-box"><div class="lintext">v2rayN (Windows): <a href="https://github.com/2dust/v2rayN/releases/tag/7.16.4" target="_blank">7.16.4版本下载</a><br>v2rayNG (Android): <a href="https://github.com/2dust/v2rayNG/releases/tag/1.8.25" target="_blank">1.8.25版本下载</a><br>Karing (测试版): <a href="https://github.com/KaringX/karing/releases/tag/v1.2.8.1101" target="_blank">1.2.8.1101版本下载</a></div></div></div><div class="footer"><p><a href="https://github.com/eooce/CF-workers-and-snip-VLESS" target="_blank">GitHub</a> | <a href="https://check-proxyip.ssss.nyc.mn" target="_blank">Proxyip检测</a> | <a href="https://t.me/+vtZ8GLzjksA4OTVl" target="_blank">TG交流群</a></p></div></div><div id="qrModal"><div class="modal-content"><h3 id="modalTitle">二维码</h3><img id="qrImage" src="" alt="QR Code"><p id="qrText" style="word-break:break-all;margin:10px 0"></p><button class="close-btn" onclick="closeQRModal()">关闭</button></div></div><script>function copyToClipboard(button,text){const originalText=button.textContent;const decodedText=text.replace(/\\\\n/g,'\\n').replace(/&quot;/g,'"');navigator.clipboard.writeText(decodedText).then(()=>{button.textContent='已复制';button.classList.add('copied');setTimeout(()=>{button.textContent=originalText;button.classList.remove('copied')},2000)}).catch(()=>{const e=document.createElement('textarea');e.value=decodedText;document.body.appendChild(e);e.select();document.execCommand('copy');document.body.removeChild(e);button.textContent='已复制';button.classList.add('copied');setTimeout(()=>{button.textContent=originalText;button.classList.remove('copied')},2000)})}function showQRCode(text,title){document.getElementById('modalTitle').textContent=title;document.getElementById('qrText').textContent=text;const e='https://tool.oschina.net/action/qrcode/generate?data='+encodeURIComponent(text)+'&output=image%2Fpng&error=L&type=0&margin=4&size=4';fetch(e).then(t=>t.blob()).then(t=>{const n=URL.createObjectURL(t);document.getElementById('qrImage').src=n}).catch(()=>{document.getElementById('qrImage').src=e});document.getElementById('qrModal').style.display='block'}function closeQRModal(){document.getElementById('qrModal').style.display='none'}document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.copy-btn[data-config]').forEach(btn=>{btn.addEventListener('click',function(){copyToClipboard(this,this.getAttribute('data-config'))})})});</script></body></html>`;
                    return new Response(html, {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/html;charset=utf-8',
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                        },
                    });
                }
                // sub path /sub/UUID
                if (url.pathname.toLowerCase() === `/sub/${subPath.toLowerCase()}` || url.pathname.toLowerCase() === `/sub/${subPath.toLowerCase()}/`) {
                    const currentDomain = url.hostname;
                    const ssHeader = 's' + 's';
                    const ssLinks = cfip.map(cdnItem => {
                        let host, port = 443, nodeName = '';
                        if (cdnItem.includes('#')) {
                            const parts = cdnItem.split('#');
                            cdnItem = parts[0];
                            nodeName = parts[1];
                        }

                        if (cdnItem.startsWith('[') && cdnItem.includes(']:')) {
                            const ipv6End = cdnItem.indexOf(']:');
                            host = cdnItem.substring(0, ipv6End + 1);
                            const portStr = cdnItem.substring(ipv6End + 2);
                            port = parseInt(portStr) || 443;
                        } else if (cdnItem.includes(':')) {
                            const parts = cdnItem.split(':');
                            host = parts[0];
                            port = parseInt(parts[1]) || 443;
                        } else {
                            host = cdnItem;
                        }
                        const ssConfig = `${method}:${password}`;
                        const ssNodeName = nodeName ? `${nodeName}-${ssHeader}` : `${ssHeader}`;
                        const encodedConfig = btoa(ssConfig);
                        return `${ssHeader}://${encodedConfig}@${host}:${port}?plugin=v2ray-plugin;mode%3Dwebsocket;host%3D${currentDomain};path%3D${validPath}/?ed%3D2560;tls;sni%3D${currentDomain};skip-cert-verify%3Dtrue;mux%3D0#${ssNodeName}`;
                    });
                    const linksText = ssLinks.join('\n');
                    const base64Content = btoa(unescape(encodeURIComponent(linksText)));
                    return new Response(base64Content, {
                        headers: {
                            'Content-Type': 'text/plain; charset=utf-8',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                        },
                    });
                }
            }
            return new Response('Not Found', { status: 404 });
        } catch (err) {
            return new Response('Internal Server Error', { status: 500 });
        }
    },
};

/**
 * 
 * @param {import("@cloudflare/workers-types").Request} request
 */
async function handleSSRequest(request, customProxyIP) {
    const wsPair = new WebSocketPair();
    const [clientSock, serverSock] = Object.values(wsPair);
    serverSock.accept();
    let remoteConnWrapper = { socket: null };
    let isDnsQuery = false;
    const earlyData = request.headers.get('sec-websocket-protocol') || '';
    const readable = makeReadableStream(serverSock, earlyData);

    readable.pipeTo(new WritableStream({
        async write(chunk) {
            if (isDnsQuery) return await forwardUDP(chunk, serverSock, null);
            if (remoteConnWrapper.socket) {
                const writer = remoteConnWrapper.socket.writable.getWriter();
                await writer.write(chunk);
                writer.releaseLock();
                return;
            }
            const { hasError, message, addressType, port, hostname, rawIndex } = parseSSPacketHeader(chunk);
            if (hasError) throw new Error(message);

            if (isSpeedTestSite(hostname)) {
                throw new Error('Speedtest site is blocked');
            }

            if (addressType === 2) {
                if (port === 53) isDnsQuery = true;
                else throw new Error('UDP is not supported');
            }
            const rawData = chunk.slice(rawIndex);
            if (isDnsQuery) return forwardUDP(rawData, serverSock, null);
            await forwardTCP(hostname, port, rawData, serverSock, null, remoteConnWrapper, customProxyIP);
        },
    })).catch((err) => {
        // console.error('Readable pipe error:', err);
    });
    return new Response(null, { status: 101, webSocket: clientSock });
}

function parseSSPacketHeader(chunk) {
    if (chunk.byteLength < 7) return { hasError: true, message: 'Invalid data' };
    try {
        const view = new Uint8Array(chunk);
        const addressType = view[0];
        let addrIdx = 1, addrLen = 0, addrValIdx = addrIdx, hostname = '';
        switch (addressType) {
            case 1: // IPv4
                addrLen = 4;
                hostname = new Uint8Array(chunk.slice(addrValIdx, addrValIdx + addrLen)).join('.');
                addrValIdx += addrLen;
                break;
            case 3: // Domain
                addrLen = view[addrIdx];
                addrValIdx += 1;
                hostname = new TextDecoder().decode(chunk.slice(addrValIdx, addrValIdx + addrLen));
                addrValIdx += addrLen;
                break;
            case 4: // IPv6
                addrLen = 16;
                const ipv6 = [];
                const ipv6View = new DataView(chunk.slice(addrValIdx, addrValIdx + addrLen));
                for (let i = 0; i < 8; i++) ipv6.push(ipv6View.getUint16(i * 2).toString(16));
                hostname = ipv6.join(':');
                addrValIdx += addrLen;
                break;
            default:
                return { hasError: true, message: `Invalid address type: ${addressType}` };
        }
        if (!hostname) return { hasError: true, message: `Invalid address: ${addressType}` };
        const port = new DataView(chunk.slice(addrValIdx, addrValIdx + 2)).getUint16(0);
        return { hasError: false, addressType, port, hostname, rawIndex: addrValIdx + 2 };
    } catch (e) {
        return { hasError: true, message: 'Failed to parse SS packet header' };
    }
}

async function connect2Socks5(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username, password } = proxyConfig;
    let socket;
    try {
        socket = connect({ hostname: host, port: port });
        const writer = socket.writable.getWriter();
        const reader = socket.readable.getReader();

        try {
            const authMethods = username && password ?
                new Uint8Array([0x05, 0x02, 0x00, 0x02]) :
                new Uint8Array([0x05, 0x01, 0x00]);

            await writer.write(authMethods);
            const methodResponse = await reader.read();
            if (methodResponse.done || methodResponse.value.byteLength < 2) {
                throw new Error('S5 method selection failed');
            }

            const selectedMethod = new Uint8Array(methodResponse.value)[1];
            if (selectedMethod === 0x02) {
                if (!username || !password) {
                    throw new Error('S5 requires authentication');
                }

                const userBytes = new TextEncoder().encode(username);
                const passBytes = new TextEncoder().encode(password);
                const authPacket = new Uint8Array(3 + userBytes.length + passBytes.length);
                authPacket[0] = 0x01;
                authPacket[1] = userBytes.length;
                authPacket.set(userBytes, 2);
                authPacket[2 + userBytes.length] = passBytes.length;
                authPacket.set(passBytes, 3 + userBytes.length);
                await writer.write(authPacket);
                const authResponse = await reader.read();
                if (authResponse.done || new Uint8Array(authResponse.value)[1] !== 0x00) {
                    throw new Error('S5 authentication failed');
                }
            } else if (selectedMethod !== 0x00) {
                throw new Error(`S5 unsupported auth method: ${selectedMethod}`);
            }

            const hostBytes = new TextEncoder().encode(targetHost);
            const connectPacket = new Uint8Array(7 + hostBytes.length);
            connectPacket[0] = 0x05;
            connectPacket[1] = 0x01;
            connectPacket[2] = 0x00;
            connectPacket[3] = 0x03;
            connectPacket[4] = hostBytes.length;
            connectPacket.set(hostBytes, 5);
            new DataView(connectPacket.buffer).setUint16(5 + hostBytes.length, targetPort, false);
            await writer.write(connectPacket);
            const connectResponse = await reader.read();
            if (connectResponse.done || new Uint8Array(connectResponse.value)[1] !== 0x00) {
                throw new Error('S5 connection failed');
            }

            await writer.write(initialData);
            writer.releaseLock();
            reader.releaseLock();
            return socket;
        } catch (error) {
            writer.releaseLock();
            reader.releaseLock();
            throw error;
        }
    } catch (error) {
        if (socket) {
            try {
                socket.close();
            } catch (e) {
                // throw e;
            }
        }
        throw error;
    }
}

async function connect2Http(proxyConfig, targetHost, targetPort, initialData) {
    const { host, port, username, password } = proxyConfig;
    let socket;
    try {
        socket = connect({ hostname: host, port: port });
        const writer = socket.writable.getWriter();
        const reader = socket.readable.getReader();
        try {
            let connectRequest = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n`;
            connectRequest += `Host: ${targetHost}:${targetPort}\r\n`;

            if (username && password) {
                const auth = btoa(`${username}:${password}`);
                connectRequest += `Proxy-Authorization: Basic ${auth}\r\n`;
            }

            connectRequest += `User-Agent: Mozilla/5.0\r\n`;
            connectRequest += `Connection: keep-alive\r\n`;
            connectRequest += '\r\n';
            await writer.write(new TextEncoder().encode(connectRequest));
            let responseBuffer = new Uint8Array(0);
            let headerEndIndex = -1;
            let bytesRead = 0;
            const maxHeaderSize = 8192;
            const startTime = Date.now();
            const timeoutMs = 10000;

            while (headerEndIndex === -1 && bytesRead < maxHeaderSize) {
                if (Date.now() - startTime > timeoutMs) {
                    throw new Error('connection timeout');
                }

                const { done, value } = await reader.read();
                if (done) {
                    throw new Error('Connection closed before receiving HTTP response');
                }

                const newBuffer = new Uint8Array(responseBuffer.length + value.length);
                newBuffer.set(responseBuffer);
                newBuffer.set(value, responseBuffer.length);
                responseBuffer = newBuffer;
                bytesRead = responseBuffer.length;

                for (let i = 0; i < responseBuffer.length - 3; i++) {
                    if (responseBuffer[i] === 0x0d && responseBuffer[i + 1] === 0x0a &&
                        responseBuffer[i + 2] === 0x0d && responseBuffer[i + 3] === 0x0a) {
                        headerEndIndex = i + 4;
                        break;
                    }
                }
            }

            if (headerEndIndex === -1) {
                throw new Error('Invalid HTTP response or response too large');
            }

            const headerText = new TextDecoder().decode(responseBuffer.slice(0, headerEndIndex));
            const statusLine = headerText.split('\r\n')[0];
            const statusMatch = statusLine.match(/HTTP\/\d\.\d\s+(\d+)/);

            if (!statusMatch) {
                throw new Error(`Invalid response: ${statusLine}`);
            }

            const statusCode = parseInt(statusMatch[1]);
            if (statusCode < 200 || statusCode >= 300) {
                throw new Error(`Connection failed with status ${statusCode}: ${statusLine}`);
            }

            await writer.write(initialData);
            writer.releaseLock();
            reader.releaseLock();

            return socket;
        } catch (error) {
            try {
                writer.releaseLock();
            } catch (e) { }
            try {
                reader.releaseLock();
            } catch (e) { }
            throw error;
        }
    } catch (error) {
        if (socket) {
            try {
                socket.close();
            } catch (e) {
            }
        }
        throw error;
    }
}

async function forwardUDP(udpChunk, webSocket, respHeader) {
    try {
        const tcpSocket = connect({ hostname: '8.8.4.4', port: 53 });
        let vlessHeader = respHeader;
        const writer = tcpSocket.writable.getWriter();
        await writer.write(udpChunk);
        writer.releaseLock();
        await tcpSocket.readable.pipeTo(new WritableStream({
            async write(chunk) {
                if (webSocket.readyState === WebSocket.OPEN) {
                    if (vlessHeader) {
                        const response = new Uint8Array(vlessHeader.length + chunk.byteLength);
                        response.set(vlessHeader, 0);
                        response.set(chunk, vlessHeader.length);
                        webSocket.send(response.buffer);
                        vlessHeader = null;
                    } else {
                        webSocket.send(chunk);
                    }
                }
            },
        }));
    } catch (error) {
        // console.error('UDP forward error:', error);
    }
}

async function forwardTCP(host, portNum, rawData, ws, respHeader, remoteConnWrapper, customProxyIP) {
    async function connectDirect(address, port, data) {
        const remoteSock = connect({ hostname: address, port: port });
        const writer = remoteSock.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
        return remoteSock;
    }

    let proxyConfig = null;
    let shouldUseProxy = false;
    if (customProxyIP) {
        proxyConfig = parseProxyAddress(customProxyIP);
        if (proxyConfig && (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https')) {
            shouldUseProxy = true;
        } else if (!proxyConfig) {
            proxyConfig = parseProxyAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        }
    } else {
        proxyConfig = parseProxyAddress(proxyIP) || { type: 'direct', host: proxyIP, port: 443 };
        if (proxyConfig.type === 'socks5' || proxyConfig.type === 'http' || proxyConfig.type === 'https') {
            shouldUseProxy = true;
        }
    }

    async function connecttoPry() {
        let newSocket;
        if (proxyConfig.type === 'socks5') {
            newSocket = await connect2Socks5(proxyConfig, host, portNum, rawData);
        } else if (proxyConfig.type === 'http' || proxyConfig.type === 'https') {
            newSocket = await connect2Http(proxyConfig, host, portNum, rawData);
        } else {
            newSocket = await connectDirect(proxyConfig.host, proxyConfig.port, rawData);
        }

        remoteConnWrapper.socket = newSocket;
        newSocket.closed.catch(() => {}).finally(() => closeSocketQuietly(ws));
        connectStreams(newSocket, ws, respHeader, null);
    }

    if (shouldUseProxy) {
        try {
            await connecttoPry();
        } catch (err) {
            throw err;
        }
    } else {
        try {
            const initialSocket = await connectDirect(host, portNum, rawData);
            remoteConnWrapper.socket = initialSocket;
            connectStreams(initialSocket, ws, respHeader, connecttoPry);
        } catch (err) {
            await connecttoPry();
        }
    }
}

function makeReadableStream(socket, earlyDataHeader) {
    let cancelled = false;
    return new ReadableStream({
        start(controller) {
            socket.addEventListener('message', (event) => {
                if (!cancelled) controller.enqueue(event.data);
            });
            socket.addEventListener('close', () => {
                if (!cancelled) {
                    closeSocketQuietly(socket);
                    controller.close();
                }
            });
            socket.addEventListener('error', (err) => controller.error(err));
            const { earlyData, error } = base64ToArray(earlyDataHeader);
            if (error) controller.error(error);
            else if (earlyData) controller.enqueue(earlyData);
        },
        cancel() {
            cancelled = true;
            closeSocketQuietly(socket);
        }
    });
}

async function connectStreams(remoteSocket, webSocket, headerData, retryFunc) {
    let header = headerData, hasData = false;
    await remoteSocket.readable.pipeTo(
        new WritableStream({
            async write(chunk, controller) {
                hasData = true;
                if (webSocket.readyState !== WebSocket.OPEN) controller.error('ws.readyState is not open');
                if (header) {
                    const response = new Uint8Array(header.length + chunk.byteLength);
                    response.set(header, 0);
                    response.set(chunk, header.length);
                    webSocket.send(response.buffer);
                    header = null;
                } else {
                    webSocket.send(chunk);
                }
            },
            abort() {},
        })
    ).catch((err) => {
        console.error('Stream pipe error:', err);
        closeSocketQuietly(webSocket);
    });
    if (!hasData && retryFunc) {
        console.log('No data received, retrying...');
        await retryFunc();
    }
}

/**
 * @param {import("@cloudflare/workers-types").Request} request
 * @returns {Response}
 */
function getSimplePage(request) {
    const url = request.headers.get('Host');
    const baseUrl = `https://${url}`;
    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Shadowsocks Cloudflare Service</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#7dd3ca 0%,#a17ec4 100%);height:100vh;display:flex;align-items:center;justify-content:center;color:#333;margin:0;padding:0;overflow:hidden;}.container{background:rgba(255,255,255,0.95);backdrop-filter:blur(10px);border-radius:20px;padding:40px;box-shadow:0 20px 40px rgba(0,0,0,0.1);max-width:800px;width:95%;text-align:center;}.logo{margin-bottom:-20px;}.title{font-size:2rem;margin-bottom:30px;color:#2d3748;}.tip-card{background:#fff3cd;border-radius:12px;padding:20px;margin:20px 0;text-align:center;border-left:4px solid #ffc107;}.tip-title{font-weight:600;color:#856404;margin-bottom:10px;}.tip-content{color:#856404;font-size:1rem;}.highlight{font-weight:bold;color:#000;background:#fff;padding:2px 6px;border-radius:4px;}@media (max-width:768px){.container{padding:20px;}}</style></head><body><div class="container"><div class="logo"><img src="https://img.icons8.com/color/96/cloudflare.png" alt="Logo" width="96" height="96"></div><h1 class="title">Hello shodowsocks！</h1><div class="tip-content">访问 <span class="highlight">${baseUrl}/你的UUID</span> 进入订阅中心</div></div></div></body></html>`;
    return new Response(html, {
        status: 200,
        headers: {
            'Content-Type': 'text/html;charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
    });
}
