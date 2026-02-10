/**
 * LeetCode Two-Sum 在线人数监控 Worker
 * 功能：
 * 1. 定时采集 US 和 CN 区的在线人数（Cron）
 * 2. 提供 API 给前端查询历史数据（Fetch）
 */

export default {
  /**
   * HTTP 请求处理器
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 头设置
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    // 处理 OPTIONS 预检请求
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // API 路由
      if (url.pathname === "/api/data") {
        return await handleDataAPI(env, url, corsHeaders);
      }

      // 新增：按粒度聚合数据 API
      if (url.pathname === "/api/aggregated") {
        return await handleAggregatedAPI(env, url, corsHeaders);
      }

      if (url.pathname === "/api/latest") {
        return await handleLatestAPI(env, corsHeaders);
      }

      if (url.pathname === "/api/stats") {
        return await handleStatsAPI(env, corsHeaders);
      }

      // 接收采集器推送的数据
      if (url.pathname === "/api/push" && request.method === "POST") {
        return await handlePushAPI(request, env, corsHeaders);
      }

      // 手动触发采集（已废弃，Worker 不支持 WebSocket 客户端）
      if (url.pathname === "/api/collect") {
        return jsonResponse({
          error: "Deprecated",
          message: "请使用独立的采集脚本：node collector.js"
        }, corsHeaders, 410);
      }

      // 默认响应
      return jsonResponse({
        name: "LeetCode Two-Sum Monitor API",
        version: "1.0.0",
        endpoints: {
          "/api/data": "获取历史数据（支持 ?hours=24 参数）",
          "/api/latest": "获取最新数据",
          "/api/stats": "获取统计信息",
          "/api/collect": "手动触发数据采集"
        }
      }, corsHeaders);

    } catch (error) {
      console.error("Error handling request:", error);
      return jsonResponse({
        error: "Internal Server Error",
        message: error.message
      }, corsHeaders, 500);
    }
  },

  /**
   * 定时任务处理器（已废弃）
   * 注意：由于 Workers 不支持 WebSocket 客户端，定时任务已移至外部采集脚本
   */
  async scheduled(event, env, ctx) {
    console.log("Cron triggered at:", new Date(event.scheduledTime).toISOString());
    console.log("Note: Data collection is now handled by external collector script");
    // 可以在这里添加其他定时任务，如数据清理等
  }
};

/**
 * 获取历史数据 API
 */
async function handleDataAPI(env, url, corsHeaders) {
  const hours = parseInt(url.searchParams.get('hours')) || 24;
  const limit = Math.min(hours * 60 * 2, 10000); // 限制最多 10000 条

  const { results } = await env.DB.prepare(
    `SELECT region, count, timestamp
     FROM records
     ORDER BY timestamp DESC
     LIMIT ?`
  ).bind(limit).all();

  return jsonResponse(results.reverse(), corsHeaders);
}

/**
 * 按粒度聚合数据 API
 * 支持按分钟、半小时、小时、天、月聚合
 */
async function handleAggregatedAPI(env, url, corsHeaders) {
  const granularity = url.searchParams.get('granularity') || 'hour'; // minute, halfhour, hour, day, month
  const limit = parseInt(url.searchParams.get('limit')) || 168; // 默认限制

  let timeFormat, groupBy;

  switch (granularity) {
    case 'minute':
      // 按分钟聚合：格式为 "YYYY-MM-DD HH:MM"
      timeFormat = "strftime('%Y-%m-%d %H:%M', datetime(timestamp/1000, 'unixepoch'))";
      groupBy = timeFormat;
      break;
    case 'halfhour':
      // 按半小时聚合：格式为 "YYYY-MM-DD HH:00" 或 "YYYY-MM-DD HH:30"
      // 使用 CASE 将分钟数归类到 00 或 30
      timeFormat = `strftime('%Y-%m-%d %H:', datetime(timestamp/1000, 'unixepoch')) ||
                    CASE
                      WHEN CAST(strftime('%M', datetime(timestamp/1000, 'unixepoch')) AS INTEGER) < 30 THEN '00'
                      ELSE '30'
                    END`;
      groupBy = timeFormat;
      break;
    case 'hour':
      // 按小时聚合：格式为 "YYYY-MM-DD HH:00"
      timeFormat = "strftime('%Y-%m-%d %H:00', datetime(timestamp/1000, 'unixepoch'))";
      groupBy = timeFormat;
      break;
    case 'day':
      // 按天聚合：格式为 "YYYY-MM-DD"
      timeFormat = "strftime('%Y-%m-%d', datetime(timestamp/1000, 'unixepoch'))";
      groupBy = timeFormat;
      break;
    case 'month':
      // 按月聚合：格式为 "YYYY-MM"
      timeFormat = "strftime('%Y-%m', datetime(timestamp/1000, 'unixepoch'))";
      groupBy = timeFormat;
      break;
    default:
      return jsonResponse({ error: 'Invalid granularity. Use: minute, halfhour, hour, day, or month' }, corsHeaders, 400);
  }

  const { results } = await env.DB.prepare(
    `SELECT
       region,
       ${timeFormat} as time,
       AVG(count) as avg_count,
       MIN(count) as min_count,
       MAX(count) as max_count,
       COUNT(*) as sample_count
     FROM records
     GROUP BY region, ${groupBy}
     ORDER BY timestamp DESC
     LIMIT ?`
  ).bind(limit).all();

  return jsonResponse(results.reverse(), corsHeaders);
}

/**
 * 获取最新数据 API
 */
async function handleLatestAPI(env, corsHeaders) {
  const { results } = await env.DB.prepare(
    `SELECT region, count, timestamp
     FROM records
     WHERE region IN ('US', 'CN')
     ORDER BY timestamp DESC
     LIMIT 2`
  ).all();

  const latest = {
    US: results.find(r => r.region === 'US') || null,
    CN: results.find(r => r.region === 'CN') || null,
    updated_at: new Date().toISOString()
  };

  return jsonResponse(latest, corsHeaders);
}

/**
 * 获取统计信息 API
 */
async function handleStatsAPI(env, corsHeaders) {
  const { results: counts } = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM records`
  ).all();

  const { results: regions } = await env.DB.prepare(
    `SELECT region, COUNT(*) as count,
            MIN(count) as min,
            MAX(count) as max,
            AVG(count) as avg
     FROM records
     GROUP BY region`
  ).all();

  return jsonResponse({
    total_records: counts[0]?.total || 0,
    by_region: regions
  }, corsHeaders);
}

/**
 * 处理数据推送 API（接收来自采集脚本的数据）
 */
async function handlePushAPI(request, env, corsHeaders) {
  try {
    // 验证 API Key
    const apiKey = request.headers.get('X-API-Key');
    // 注意：在生产环境应该使用 Worker Secrets
    const expectedKey = env.API_KEY || 'your-secret-key-here';

    if (apiKey !== expectedKey) {
      return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
    }

    // 解析请求体
    const body = await request.json();
    const { records } = body;

    if (!Array.isArray(records) || records.length === 0) {
      return jsonResponse({ error: 'Invalid data format' }, corsHeaders, 400);
    }

    // 写入数据库
    const promises = [];
    for (const record of records) {
      const { region, count, timestamp } = record;

      if (!region || typeof count !== 'number' || !timestamp) {
        continue;
      }

      console.log(`Saving: ${region} = ${count} at ${new Date(timestamp).toISOString()}`);

      promises.push(
        env.DB.prepare("INSERT INTO records (region, count, timestamp) VALUES (?, ?, ?)")
          .bind(region, count, timestamp).run()
      );
    }

    await Promise.all(promises);

    return jsonResponse({
      success: true,
      saved: promises.length,
      message: `Successfully saved ${promises.length} records`
    }, corsHeaders);

  } catch (error) {
    console.error('Error in handlePushAPI:', error);
    return jsonResponse({
      error: 'Internal Server Error',
      message: error.message
    }, corsHeaders, 500);
  }
}

// WebSocket 采集逻辑已移至 collector.js
// Workers 不支持作为 WebSocket 客户端

/**
 * 辅助函数：返回 JSON 响应
 */
function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
