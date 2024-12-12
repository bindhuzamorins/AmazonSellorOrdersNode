import dotenv from 'dotenv';
import axios from 'axios';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { Sha256 } from '@aws-crypto/sha256-browser';

dotenv.config();

let accessToken = null;
let accessTokenExpiryTime = null;

// Function to get the access token and refresh if necessary
async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiryTime) {
    return accessToken;
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', process.env.SP_API_REFRESH_TOKEN);
  params.append('client_id', process.env.SP_API_CLIENT_ID);
  params.append('client_secret', process.env.SP_API_CLIENT_SECRET);
  params.append('AWS_SELLING_PARTNER_ROLE', process.env.AWS_SELLING_PARTNER_ROLE);
  try {
    const response = await axios.post('https://api.amazon.com/auth/o2/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    accessToken = response.data.access_token;
    let refreshToken = response.data.refresh_token;
    accessTokenExpiryTime = Date.now() + response.data.expires_in * 1000; // Expiry time in ms

    console.log('New Access Token:', accessToken);
    console.log('New refresh Token:', refreshToken);
    return accessToken;

  } catch (error) {
    console.error('Error fetching access token:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to call the Amazon Seller API (Get Orders)
async function getOrders() {
  const baseUrl = 'https://sellingpartnerapi-na.amazon.com/orders/v0/orders';
  const queryParams = {
    MarketplaceIds: 'ATVPDKIKX0DER', // US Marketplace ID
    CreatedAfter: 'TEST_CASE_200', // Adjust the date range
  };

  try {
    const token = await getAccessToken();

    // Construct the HTTP request
    const request = new HttpRequest({
      method: 'GET',
      protocol: 'https',
      hostname: 'sellingpartnerapi-na.amazon.com',
      path: '/orders/v0/orders',
      query: queryParams,
      headers: {
        'host': 'sellingpartnerapi-na.amazon.com',
        'x-amz-access-token': token,
        'content-type': 'application/json',
      },
    });

    // Sign the request using SignatureV4
    const signer = new SignatureV4({
      service: 'execute-api',
      region: process.env.AWS_REGION,
      credentials: defaultProvider(),
      sha256: Sha256,
    });

    const signedRequest = await signer.sign(request);

    console.log('Signed Request:', signedRequest);

    // Send the signed request with Axios
    const response = await axios({
      method: signedRequest.method,
      url: `https://${signedRequest.hostname}${signedRequest.path}?${new URLSearchParams(signedRequest.query)}`,
      headers: signedRequest.headers,
    });

    console.log('Orders:', response.data);
  } catch (error) {
    console.error('Error fetching orders:', error.response ? error.response.data : error.message);
  }
}
//export const handler = async (event) => {
getOrders();
//}
