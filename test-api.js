// 测试上游API响应
import https from 'https';

const options = {
  hostname: 'api.leakradar.io',
  path: '/stats',
  method: 'GET',
  headers: {
    'Accept': 'application/json'
  }
};

const req = https.request(options, (res) => {
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
      console.log('\n✅ Parsed JSON:', parsed);
      console.log('\n✅ Test passed: API returns valid JSON');
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

req.end();