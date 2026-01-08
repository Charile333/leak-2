import { request } from 'http';

// 测试登录API
const testLogin = () => {
  const options = {
    hostname: 'localhost',
    port: 5173,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const req = request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('登录API测试结果:');
      console.log('状态码:', res.statusCode);
      try {
        const parsedData = JSON.parse(data);
        console.log('响应数据:', parsedData);
      } catch (error) {
        console.error('JSON解析失败:', error);
        console.log('原始响应:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('请求失败:', error);
  });

  // 发送请求体
  req.write(JSON.stringify({ email: 'konaa2651@gmail.com' }));
  req.end();
};

// 测试白名单API
const testWhitelist = () => {
  const options = {
    hostname: 'localhost',
    port: 5173,
    path: '/api/auth/whitelist',
    method: 'GET'
  };

  const req = request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('\n白名单API测试结果:');
      console.log('状态码:', res.statusCode);
      try {
        const parsedData = JSON.parse(data);
        console.log('响应数据:', parsedData);
      } catch (error) {
        console.error('JSON解析失败:', error);
        console.log('原始响应:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('请求失败:', error);
  });

  req.end();
};

// 运行测试
testLogin();
setTimeout(testWhitelist, 1000);
