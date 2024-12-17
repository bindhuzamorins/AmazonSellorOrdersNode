import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { S3Client } from '@aws-sdk/client-s3';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Hash } from '@aws-sdk/hash-node';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize S3 client (if needed for AWS-related operations)
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

// MySQL Database Connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'orders',
};

// Function to get the LWA Access Token
const getLwaAccessToken = async () => {
  const tokenUrl = 'https://api.amazon.com/auth/o2/token';
  const params = new URLSearchParams();
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', process.env.LWA_REFRESH_TOKEN);
  params.append('client_id', process.env.LWA_CLIENT_ID);
  params.append('client_secret', process.env.LWA_CLIENT_SECRET);

  try {
    const response = await axios.post(tokenUrl, params);
    return response.data.access_token;
  } catch (error) {
    throw new Error('Failed to obtain LWA Access Token');
  }
};
export const handler = async (event) => {
    try {
      const lwaAccessToken = await getLwaAccessToken();
  
      // Extract orderId from the event object
      const AmOrderId = event?.AmazonOrderId;
      const order_id = event?.order_id;
      const client_code = event?.client_code;
  
      if (!AmOrderId) {
        throw new Error('AmazonOrderId is required in the event.');
      }
      if (!order_id) {
        throw new Error('OrderId is required in the event.');
      }
      if (!client_code) {
        throw new Error('client_code is required in the event.');
      }
  
      // Define API URL for retrieving the order items
      const apiUrl = `https://sandbox.sellingpartnerapi-na.amazon.com/orders/v0/orders/${AmOrderId}/orderItems`;
  
      const signer = new SignatureV4({
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'execute-api',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        sha256: Hash.bind(null, 'sha256'),
      });
  
      const request = {
        method: 'GET',
        headers: {
          'x-amz-access-token': lwaAccessToken,
          'x-amz-date': new Date().toISOString(),
        },
        protocol: 'https:',
        hostname: 'sandbox.sellingpartnerapi-na.amazon.com',
        path: `/orders/v0/orders/${AmOrderId}/orderItems`,
      };
  
      const signedRequest = await signer.sign(request);
      const apiResponse = await axios({
        method: signedRequest.method,
        url: `${request.protocol}//${request.hostname}${request.path}`,
        headers: signedRequest.headers,
      });
  
      const orderData = apiResponse.data;
      const orderItems = orderData?.payload?.OrderItems;
  
      if (!orderItems || orderItems.length === 0) {
        throw new Error('No order items found in the response.');
      }
  
      // MySQL Connection
      const connection = await mysql.createConnection(dbConfig);
  
      // Iterate over order items and store each item in the database
      for (const item of orderItems) {
        const { ASIN, OrderItemId,SellerSKU, Title, QuantityOrdered, QuantityShipped, ProductInfo,ItemPrice,ItemTax,PromotionDiscount,IsGift, ConditionId, ConditionSubtypeId, IsTransparency,SerialNumberRequired,IossNumber,DeemedResellerCategory,StoreChainStoreId,BuyerRequestedCancel} = item;
  
        // Use a stored procedure or INSERT query
      const procedureCall = `CALL sp_add_update_order_items(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,@rcode,@message)`;
        const values = [
          client_code,              // Client code
          order_id,                 // Local order ID
          orderData?.payload?.AmazonOrderId,                // Amazon order ID
          ASIN,   
          OrderItemId,                  // ASIN of the product
          SellerSKU || '',          // Seller SKU
          Title || '',              // Product title
          QuantityOrdered || 0,     // Quantity ordered
          QuantityShipped || 0,     // Quantity shipped
          ProductInfo.NumberOfItems||0,
          ItemPrice?.CurrencyCode || '',
          ItemPrice?.Amount || 0,   // Item price amount
          ItemTax?.CurrencyCode ||'',
          ItemTax?.Amount ||0,
          PromotionDiscount?.CurrencyCode ||'',
          PromotionDiscount?.Amount ||0,
          IsGift ||0,
          ConditionId||'',
          ConditionSubtypeId||'',
          IsTransparency||0,
          SerialNumberRequired||0,
          IossNumber||'',
          DeemedResellerCategory||'',
          StoreChainStoreId||'',
          BuyerRequestedCancel?.IsBuyerRequestedCancel,
          BuyerRequestedCancel?.BuyerCancelReason

        ];
  
        await connection.execute(procedureCall, values);
        console.log(ASIN)
      }
  
      console.log('Order items inserted/updated successfully in the database.');
  
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Order items retrieved and saved successfully.',
          AmOrderId,
          orderItems,
        }),
      };
    } catch (error) {
      console.error('Error details:', error.response ? error.response.data : error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Error occurred while retrieving or saving order items.',
          error: error.message,
          details: error.response ? error.response.data : null,
        }),
      };
    }
  };
  
  // Simulate the Lambda function locally
  (async () => {
    try {
      const eventPath = path.resolve(__dirname, 'eventorderaddress.json');
      const event = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
      const result = await handler(event);
      console.log('Lambda Result:', JSON.parse(result.body));
    } catch (err) {
      console.error('Error during Lambda simulation:', err);
    }
  })();
  