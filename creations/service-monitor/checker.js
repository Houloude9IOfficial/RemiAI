import axios from 'axios';

const axiosInstance = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

async function checkService(url) {
  const startTime = Date.now();
  try {
    const response = await axiosInstance.get(url);
    const responseTime = Date.now() - startTime;
    return {
      isUp: response.status === 200,
      responseTime: responseTime,
      status: response.status
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      isUp: false,
      responseTime: responseTime,
      error: error.message
    };
  }
}

export default checkService;