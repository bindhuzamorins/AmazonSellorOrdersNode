import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { S3Client } from '@aws-sdk/client-s3';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Hash } from '@aws-sdk/hash-node';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
// Load environment variables
dotenv.config();

// Get __dirname equivalent in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'orders',
  };
  
// Initialize S3 client (v3)
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});
console.log('AWS SDK Loaded:', !!s3);

// AWS Credentials from environment variables
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const service = 'execute-api'; // For signing requests to API Gateway
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID);
// Function to get the LWA Access Token

const getLwaAccessToken = async () => {
  const tokenUrl = 'https://api.amazon.com/auth/o2/token';
  const params = new URLSearchParams();

  // Log the client ID and client secret to verify they're being loaded
  //console.log('Client ID:', process.env.LWA_CLIENT_ID);
  //console.log('Client Secret:', process.env.LWA_CLIENT_SECRET);

  // Set the required parameters for the refresh token request
  params.append('grant_type', 'refresh_token');
  params.append('refresh_token', process.env.LWA_REFRESH_TOKEN); // Your refresh token
  params.append('client_id', process.env.LWA_CLIENT_ID); // Your LWA Client ID
  params.append('client_secret', process.env.LWA_CLIENT_SECRET); // Your LWA Client Secret

  try {
    // Make the token request
    const response = await axios.post(tokenUrl, params);
    // Return the access token
    return response.data.access_token;
  } catch (error) {
   // console.error('Error obtaining LWA Access Token:', error.response ? error.response.data : error.message);
    throw new Error('Failed to obtain LWA Access Token');
  }
};

// Example usage
(async () => {
  try {
    const accessToken = await getLwaAccessToken();
    console.log('Obtained LWA Access Token:', accessToken);
  } catch (err) {
    console.error('Error:', err);
  }
})();

// Lambda handler function
export const handler = async (event) => {
  try {
    // Get the LWA access token
    const lwaAccessToken = await getLwaAccessToken();
    console.log('lwaAccessToken:', lwaAccessToken);
    // Define the API URL
    const apiUrl = 'https://sandbox.sellingpartnerapi-na.amazon.com/orders/v0/orders';
    const MarketplaceIds = event?.MarketplaceIds ;
    const CreatedAfter = event?.CreatedAfter;
    const client_code = event?.client_code;
    // Set up request parameters
    // const params = {
    //   MarketplaceIds: event?.MarketplaceIds?.join(',') || 'ATVPDKIKX0DER', // Convert array to a comma-separated string
    //   CreatedAfter: event?.CreatedAfter || new Date().toISOString(), // ISO timestamp
    // };
    const params = {
     // MarketplaceIds: 'ATVPDKIKX0DER', // Single marketplace ID
     // CreatedAfter: 'TEST_CASE_200', // Ensure valid ISO format
     MarketplaceIds: MarketplaceIds,
     CreatedAfter: CreatedAfter,
    };

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error('AWS credentials are not set in the environment.');
    }

    // Create the signer instance (AWS SDK v3 Signer)
    const signer = new SignatureV4({
      region: process.env.AWS_REGION || 'us-east-1',
      service: service,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
      sha256: Hash.bind(null, 'sha256'), // Correct binding for the SHA256 function
    });

    // Prepare the request to be signed
    const request = {
      method: 'GET',
      headers: {
        'x-amz-access-token': lwaAccessToken, // Use the dynamically obtained LWA access token
        'x-amz-date': new Date().toISOString(),
      },
      protocol: 'https:',
      hostname: 'sandbox.sellingpartnerapi-na.amazon.com',
      path: '/orders/v0/orders',
      query: params,
    };

    // Sign the request using the Signer
    const signedRequest = await signer.sign(request);

    // Make the signed request using Axios
    const apiResponse = await axios({
      method: signedRequest.method,
      url: `${request.protocol}//${request.hostname}${request.path}`,
      headers: signedRequest.headers,
      params: signedRequest.query,
    });

    const orderData = apiResponse.data;
    const Orders = orderData?.payload?.Orders;

     const connection = await mysql.createConnection(dbConfig);
      
          // Iterate over order items and store each item in the database
          for (const order of Orders) {
           const {

                AmazonOrderId,
                PurchaseDate,
                LastUpdateDate,
                OrderStatus,
                FulfillmentChannel,
        
                SalesChannel,
                ShipServiceLevel,
                
                OrderTotal,
                NumberOfItemsShipped,
                NumberOfItemsUnshipped,
        
                PaymentMethod,
                PaymentMethodDetails,
                IsReplacementOrder,        
                MarketplaceId,
                ShipmentServiceLevelCategory,
        
                OrderType,        
                EarliestShipDate,
                LatestShipDate,
                EarliestDeliveryDate,
                LatestDeliveryDate,
        
                IsBusinessOrder,
                IsPrime,
                IsGlobalExpressEnabled,
                IsPremiumOrder,
                 IsSoldByAB,
        
                 IsIBA,
                 FulfillmentSupplySourceId,
                IsISPU,
                IsAccessPointOrder,
                HasAutomatedShippingSettings,
        
                EasyShipShipmentStatus,
                ElectronicInvoiceStatus,
               
        
              
              } = order;
        
              const procedureCall = `CALL sp_add_update_order(?, ?, ?, ?, ?,  ?, ?, ?, ?, ?,   ?, ?, ?, ?, ?,  ?, ?, ?, ?, ?,  ?,?,?,?,?,  ?,?,?,?,?,  ?,?,?,?,@p1,@p2)`;
              const values = [
                client_code, // Client code
                AmazonOrderId,               
                PurchaseDate || null,
                LastUpdateDate ||null,
                OrderStatus || '',

                FulfillmentChannel || '',
                SalesChannel || '',
                ShipServiceLevel || '',
                OrderTotal?.CurrencyCode || '',
                OrderTotal?.Amount || 0,
               

                NumberOfItemsShipped||0,
                NumberOfItemsUnshipped||0,
                PaymentMethod||'',
                PaymentMethodDetails.standard||'',
                IsReplacementOrder||false,

                MarketplaceId || '',        
                ShipmentServiceLevelCategory || '',
                OrderType||'',
                EarliestShipDate || null,
                LatestShipDate || null,

                EarliestDeliveryDate || null,
                LatestDeliveryDate || null,
                IsBusinessOrder || false,
                IsPrime || false,
                IsGlobalExpressEnabled||false,

                IsPremiumOrder || false,
                IsSoldByAB || false,
                IsIBA ||false,
                FulfillmentSupplySourceId||'',
                IsISPU || false,

                IsAccessPointOrder || false,
                HasAutomatedShippingSettings ||0,
                EasyShipShipmentStatus||'',
                ElectronicInvoiceStatus||''
                
              ];
        
              await connection.execute(procedureCall, values);
          }
      
          console.log('Order items inserted/updated successfully in the database.');


    // Return success response
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Hello from Lambda!',
        params,
        apiData: apiResponse.data,Orders: apiResponse.data.payload?.Orders || [],
      }),
    };
  } catch (error) {
    console.error('Error details:', error.response ? error.response.data : error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error occurred while calling the API.',
        error: error.message,
        details: error.response ? error.response.data : null,
      }),
    };
  }
};

// Simulate the Lambda function locally
(async () => {
  try {
    // Read the event JSON file
    const eventPath = path.resolve(__dirname, 'event.json');
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));

    // Invoke the handler function with the simulated event
    const result = await handler(event);

    // Log the result
    console.log('Lambda Result:', JSON.parse(result.body));
  } catch (err) {
    console.error('Error during Lambda simulation:', err);
  }
})();