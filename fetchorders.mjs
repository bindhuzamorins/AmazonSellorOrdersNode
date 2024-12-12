import axios from 'axios';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { Sha256 } from '@aws-crypto/sha256-browser';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

let accessToken = null;
let accessTokenExpiryTime = null;

/**
 * Get or refresh the SP-API access token
 */
async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiryTime) {
    return accessToken;
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', process.env.SP_API_REFRESH_TOKEN);
  params.append('client_id', process.env.SP_API_CLIENT_ID);
  params.append('client_secret', process.env.SP_API_CLIENT_SECRET);

  try {
    const response = await axios.post('https://api.amazon.com/auth/o2/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    accessToken = response.data.access_token;
    accessTokenExpiryTime = Date.now() + response.data.expires_in * 1000;

    console.log('New Access Token:', accessToken);
    return accessToken;
  } catch (error) {
    console.error('Error fetching access token:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Fetch orders from Amazon Selling Partner API
 */
async function getOrders() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const marketplaceId = 'ATVPDKIKX0DER'; // US Marketplace ID
  const createdAfter = '2023-12-01T00:00:00Z'; // Example date

  try {
    const token = await getAccessToken();

    const request = new HttpRequest({
      method: 'GET',
      protocol: 'https',
      hostname: 'sellingpartnerapi-na.amazon.com',
      path: '/orders/v0/orders',
      query: {
        MarketplaceIds: marketplaceId,
        CreatedAfter: createdAfter,
      },
      headers: {
        host: 'sellingpartnerapi-na.amazon.com',
        'x-amz-access-token': token,
        'content-type': 'application/json',
      },
    });

    const signer = new SignatureV4({
      service: 'execute-api',
      region: region,
      credentials: defaultProvider(),
      sha256: Sha256,
    });

    const signedRequest = await signer.sign(request);

    const response = await axios({
      method: signedRequest.method,
      url: `https://${signedRequest.hostname}${signedRequest.path}?${new URLSearchParams(
        signedRequest.query
      )}`,
      headers: request.headers,
    });

    console.log('Orders:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching orders:', error.response?.data || error.message);
    throw error;
  }
}

// Simulate local execution
(async () => {
  try {
    const orders = await getOrders();
    console.log('Fetched Orders:', orders);
  } catch (err) {
    console.error('Error during execution:', err.message);
  }
})();
