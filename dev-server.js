import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';

// 加载环境变量
dotenv.config();

// JWT配置
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '5m'; // 5分钟过期

// 邮件配置 - 支持SendGrid
const SMTP_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.sendgrid.net',
  port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
  secure: process.env.SMTP_SECURE === 'true', // 使用TLS
  auth: {
    user: process.env.SMTP_USER || 'apikey', // SendGrid使用apikey作为用户名
    pass: process.env.SMTP_PASS || '' // SendGrid API密钥
  }
};

// 创建邮件传输器
const transporter = nodemailer.createTransport(SMTP_CONFIG);

// 获取API密钥和白名单（从环境变量）
const LEAKRADAR_API_KEY = process.env.LEAKRADAR_API_KEY || process.env.VITE_LEAKRADAR_API_KEY;
const WHITELISTED_USERS = process.env.WHITELISTED_USERS 
  ? JSON.parse(process.env.WHITELISTED_USERS)
  : [];
const OTX_API_KEY = process.env.OTX_API_KEY || process.env.VITE_OTX_API_KEY;

console.log('🔍 环境变量检查：');
console.log('   LEAKRADAR_API_KEY:', LEAKRADAR_API_KEY ? '已找到' : '未找到');
console.log('   WHITELISTED_USERS:', WHITELISTED_USERS.length > 0 ? `已找到 ${WHITELISTED_USERS.length} 个用户` : '未找到');
console.log('   OTX_API_KEY:', OTX_API_KEY ? '已找到' : '未找到');

if (!LEAKRADAR_API_KEY) {
  console.error('❌ 错误：LEAKRADAR_API_KEY 或 VITE_LEAKRADAR_API_KEY 未在环境变量中设置');
  process.exit(1);
}

// 如果白名单为空，添加示例用户
if (WHITELISTED_USERS.length === 0) {
  console.warn('⚠️  警告：WHITELISTED_USERS 未设置，添加示例用户到白名单');
  WHITELISTED_USERS.push('konaa2651@gmail.com');
  console.log('   示例用户已添加：konaa2651@gmail.com');
}

// 创建HTTP服务器
const server = http.createServer((req, res) => {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-API-Key'
  );

  // 处理OPTIONS请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url;
  
  console.log(`[Dev Server] ${req.method} ${url}`);
  
  // 健康检查
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      message: 'Development server is running',
      whitelist: {
        count: WHITELISTED_USERS.length,
        users: WHITELISTED_USERS
      }
    }));
    return;
  }
  
  // 处理白名单API请求
  if (url === '/api/auth/whitelist') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        whitelist: WHITELISTED_USERS,
        count: WHITELISTED_USERS.length,
        lastUpdated: new Date().toISOString()
      }));
      return;
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Only GET requests are allowed for this endpoint'
      }));
      return;
    }
  }
  
  // 处理登录API请求 - 发送登录链接和验证登录链接
  if (url === '/api/auth/login') {
    if (req.method === 'POST') {
      // 读取请求体
      getRequestBody(req).then(body => {
        try {
          const { email } = JSON.parse(body);
          
          // 白名单验证
          if (!WHITELISTED_USERS.includes(email)) {
            console.log(`[Whitelist] User ${email} denied access (not in whitelist)`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error: 'Forbidden',
              message: '您的邮箱不在白名单中，无法登录'
            }));
            return;
          }
          
          console.log(`[Whitelist] User ${email} granted access (in whitelist), sending login link`);
          
          // 生成JWT令牌，用于登录链接验证
          const token = jwt.sign(
            { email, type: 'login' },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRY }
          );
          
          // 生成登录链接
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5174';
          const loginLink = `${frontendUrl}/login/verify?token=${token}`;
          
          // 发送登录邮件
          const mailOptions = {
            from: process.env.SMTP_FROM || 'noreply@example.com',
            to: email,
            subject: 'Lysir谍卫 - 登录链接',
            html: `
              <h1>Lysir谍卫</h1>
              <p>您好！</p>
              <p>您请求了登录Lysir谍卫平台的链接。</p>
              <p>请点击以下链接登录：</p>
              <p><a href="${loginLink}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">登录Lysir谍卫</a></p>
              <p>该链接将在5分钟后失效。</p>
              <p>如果您没有请求此链接，请忽略此邮件。</p>
              <p>--</p>
              <p>Lysir谍卫团队</p>
            `
          };
          
          // 发送邮件
          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error('[Mail Error] Failed to send login link:', error.message);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Internal Server Error',
                message: '发送登录链接失败，请稍后重试'
              }));
              return;
            }
            
            console.log(`[Mail] Login link sent to ${email}: ${info.messageId}`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              success: true,
              message: '登录链接已发送到您的邮箱，请检查并点击链接登录'
            }));
          });
          
          return;
        } catch (error) {
          console.error('[Dev Server Error] Invalid JSON:', error.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Bad Request',
            message: '无效的请求体格式'
          }));
        }
      }).catch(error => {
        console.error('[Dev Server Error] Reading request body:', error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Internal Server Error',
          message: '读取请求体失败'
        }));
      });
      return;
    } else if (req.method === 'GET') {
      // 提取令牌
      const urlObj = new URL(`http://localhost${url}`);
      const token = urlObj.searchParams.get('token');
      
      if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bad Request',
          message: '缺少登录令牌'
        }));
        return;
      }
      
      try {
        // 验证令牌
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // 检查令牌类型
        if (decoded.type !== 'login') {
          throw new Error('Invalid token type');
        }
        
        const { email } = decoded;
        
        console.log(`[Login Verify] User ${email} verified successfully`);
        
        // 返回登录成功响应
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: '登录验证成功',
          user: {
            email: email,
            name: email.split('@')[0],
            role: 'user'
          }
        }));
        return;
      } catch (error) {
        console.error('[Login Verify] Token verification failed:', error.message);
        
        // 检查是否是过期错误
        let message = '登录链接无效或已过期';
        if (error.name === 'TokenExpiredError') {
          message = '登录链接已过期，请重新请求登录';
        }
        
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Unauthorized',
          message: message
        }));
        return;
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Only POST and GET requests are allowed for this endpoint'
      }));
      return;
    }
  }
  
  // 处理登录链接验证API请求
  if (url.startsWith('/api/auth/login/verify')) {
    if (req.method === 'GET') {
      // 提取令牌
      const urlObj = new URL(`http://localhost${url}`);
      const token = urlObj.searchParams.get('token');
      
      if (!token) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bad Request',
          message: '缺少登录令牌'
        }));
        return;
      }
      
      try {
        // 验证令牌
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // 检查令牌类型
        if (decoded.type !== 'login') {
          throw new Error('Invalid token type');
        }
        
        const { email } = decoded;
        
        console.log(`[Login Verify] User ${email} verified successfully`);
        
        // 返回登录成功响应
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: '登录验证成功',
          user: {
            email: email,
            name: email.split('@')[0],
            role: 'user'
          }
        }));
        return;
      } catch (error) {
        console.error('[Login Verify] Token verification failed:', error.message);
        
        // 检查是否是过期错误
        let message = '登录链接无效或已过期';
        if (error.name === 'TokenExpiredError') {
          message = '登录链接已过期，请重新请求登录';
        }
        
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Unauthorized',
          message: message
        }));
        return;
      }
    } else {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Method Not Allowed',
        message: 'Only GET requests are allowed for this endpoint'
      }));
      return;
    }
  }
  
  // 只处理/api请求
  if (!url.startsWith('/api')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Not Found',
      message: 'The requested resource was not found'
    }));
    return;
  }
  
  // 处理其他API请求
  handleApiRequest(req, res);
});

// 处理API请求
async function handleApiRequest(req, res) {
  try {
    const url = req.url;
    
    // 构建目标URL
    let upstreamUrl;
    let targetUrl;
    let headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    
    // 处理OTX API请求
    if (url.startsWith('/api/otx')) {
      upstreamUrl = 'https://otx.alienvault.com/api/v1';
      targetUrl = `${upstreamUrl}${url.replace(/^\/api\/otx/, '')}`;
      headers['X-OTX-API-KEY'] = OTX_API_KEY;
    } else {
      // 处理LeakRadar API请求
      upstreamUrl = 'https://api.leakradar.io';
      let leakradarTargetUrl = `${upstreamUrl}${url.replace(/^\/api/, '')}`;
      
      // 演示模式：强制限制每次查询最多10条结果
      // 将targetUrl转换为URL对象，方便操作查询参数
      const urlObj = new URL(leakradarTargetUrl);
      urlObj.searchParams.set('page_size', '10');
      // 如果是解锁请求，添加限制参数
      // 根据API文档，解锁操作应该使用max参数，而不是limit参数
      if (leakradarTargetUrl.includes('/unlock')) {
        urlObj.searchParams.set('max', '10');
      }
      // 转换回字符串
      targetUrl = urlObj.toString();
      
      headers['Authorization'] = `Bearer ${LEAKRADAR_API_KEY}`;
      headers['X-API-Key'] = LEAKRADAR_API_KEY;
    }
    
    console.log(`[Dev Server] -> ${targetUrl}`);
    
    // 获取请求数据
    const body = await getRequestBody(req);
    
    // 发送请求到上游API
    const options = {
      method: req.method,
      headers: headers,
      timeout: 10000,
    };
    
    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }
    
    const protocol = upstreamUrl.startsWith('https') ? https : http;
    
    protocol.request(targetUrl, options, (upstreamRes) => {
      console.log(`[Dev Server] <- ${upstreamRes.statusCode} ${targetUrl}`);
      
      // 设置响应头
      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        res.setHeader(key, value);
      }
      
      // 设置CORS头
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // 设置响应状态码
      res.writeHead(upstreamRes.statusCode || 200);
      
      // 转发响应数据
      upstreamRes.pipe(res);
    })
    .on('error', (error) => {
      console.error(`[Dev Server Error] ${req.method} ${url}:`, error.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Proxy Error',
        message: '无法连接到上游服务器',
        details: error.message
      }));
    })
    .end(body);
    
  } catch (error) {
    console.error(`[Dev Server Error] ${req.method} ${req.url}:`, error.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Proxy Error',
      message: '无法处理API请求',
      details: error.message
    }));
  }
}

// 获取请求体
function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    
    req.on('data', (chunk) => {
      body += chunk;
    });
    
    req.on('end', () => {
      resolve(body);
    });
    
    req.on('error', (error) => {
      reject(error);
    });
  });
}

// 启动服务器
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 开发服务器已启动，监听端口 ${PORT}`);
  console.log(`📡 健康检查: http://localhost:${PORT}/health`);
  console.log(`🔑 LeakRadar API Key: ${LEAKRADAR_API_KEY ? '已配置' : '未配置'}`);
  console.log(`📋 白名单用户数量: ${WHITELISTED_USERS.length}`);
  console.log(`🔑 OTX API Key: ${OTX_API_KEY ? '已配置' : '未配置'}`);
  console.log(`✨ 服务已准备就绪，等待前端请求...`);
  console.log(`📝 白名单用户: ${WHITELISTED_USERS.join(', ')}`);
});
