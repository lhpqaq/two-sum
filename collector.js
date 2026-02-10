/**
 * 数据采集脚本（Node.js）
 * 用于采集 LeetCode Two-Sum 的在线人数，并推送到 Cloudflare Worker
 *
 * 运行方式：
 * 1. 本地运行：node collector.js
 * 2. 服务器 cron：crontab -e，添加：* * * * * node /path/to/collector.js
 * 3. GitHub Actions：每分钟自动运行
 */

const WebSocket = require('ws');

// 配置
const CONFIG = {
  // Cloudflare Worker API 地址（本地开发默认 localhost:8787）
  WORKER_API: process.env.WORKER_API || 'http://localhost:8787/api/push',

  // API 密钥（用于验证）
  API_KEY: process.env.API_KEY || 'dev-secret-key-2024',

  // WebSocket 地址
  WS_URLS: {
    US: 'wss://collaboration-ws.leetcode.com/problems/two-sum',
    CN: 'wss://collaboration-ws.leetcode.cn/problems/two-sum'
  },

  // 请求头配置（绕过反爬虫）
  WS_HEADERS: {
    US: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      'Origin': 'https://leetcode.com',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    CN: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
      'Origin': 'https://leetcode.cn',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  },

  // 超时时间（毫秒）
  TIMEOUT: 10000
};

/**
 * 从 WebSocket 获取在线人数
 */
function getOnlineCount(region) {
  return new Promise((resolve) => {
    const url = CONFIG.WS_URLS[region];
    const headers = CONFIG.WS_HEADERS[region] || {};

    console.log(`[${region}] 连接中...`);

    const ws = new WebSocket(url, {
      headers: headers
    });
    let resolved = false;

    // 超时处理
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn(`[${region}] 超时`);
        ws.close();
        resolve(null);
      }
    }, CONFIG.TIMEOUT);

    ws.on('open', () => {
      console.log(`[${region}] 已连接`);
    });

    ws.on('message', (data) => {
      if (resolved) return;

      const message = data.toString();
      console.log(`[${region}] 收到消息: ${message}`);

      const count = parseInt(message, 10);
      if (!isNaN(count) && count >= 0) {
        resolved = true;
        clearTimeout(timeout);
        ws.close();
        console.log(`[${region}] ✅ 在线人数: ${count}`);
        resolve(count);
      }
    });

    ws.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.error(`[${region}] ❌ 错误:`, error.message);
        resolve(null);
      }
    });

    ws.on('close', () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        console.log(`[${region}] 连接已关闭`);
        resolve(null);
      }
    });
  });
}

/**
 * 推送数据到 Cloudflare Worker
 */
async function pushToWorker(data) {
  try {
    const response = await fetch(CONFIG.WORKER_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CONFIG.API_KEY
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('✅ 数据推送成功:', result);
    return true;
  } catch (error) {
    console.error('❌ 推送失败:', error.message);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('\n========== LeetCode 数据采集 ==========');
  console.log('时间:', new Date().toISOString());

  // 并行采集
  const [usCount, cnCount] = await Promise.all([
    getOnlineCount('US'),
    getOnlineCount('CN')
  ]);

  const timestamp = Date.now();
  const records = [];

  if (usCount !== null) {
    records.push({ region: 'US', count: usCount, timestamp });
  }

  if (cnCount !== null) {
    records.push({ region: 'CN', count: cnCount, timestamp });
  }

  if (records.length === 0) {
    console.error('❌ 没有采集到任何数据');
    process.exit(1);
  }

  console.log('\n准备推送数据:', records);

  // 推送到 Worker
  const success = await pushToWorker({ records });

  if (success) {
    console.log('\n✅ 采集完成！');
    process.exit(0);
  } else {
    console.error('\n❌ 采集失败');
    process.exit(1);
  }
}

// 运行
main().catch((error) => {
  console.error('❌ 意外错误:', error);
  process.exit(1);
});
