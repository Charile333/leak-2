// Test script to test the login API
import http from 'http';

const loginData = JSON.stringify({ email: 'Lysirsec@outlook.com' });

const options = {
  hostname: 'localhost',
  port: 3001, // 使用开发服务器端口
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\nResponse Body:', data);
    
    try {
      const parsed = JSON.parse(data);
      console.log('\nParsed JSON:', parsed);
      console.log('\n✅ Test passed: Response is valid JSON');
    } catch (error) {
      console.error('\n❌ JSON Parse Error:', error.message);
      console.error('Invalid JSON content:', JSON.stringify(data));
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error);
  process.exit(1);
});

// Write data to request body
req.write(loginData);
req.end();
