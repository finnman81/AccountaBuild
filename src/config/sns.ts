import { SNSClient } from '@aws-sdk/client-sns';

const region = process.env.AWS_REGION;

if (!region) {
  console.error("AWS_REGION environment variable is not set.");
  process.exit(1);
}

export const snsClient = new SNSClient({ region }); 