import { prisma } from '../config/db';
import { snsClient } from '../config/sns';
import { CreatePlatformEndpointCommand, GetEndpointAttributesCommand, SetEndpointAttributesCommand } from '@aws-sdk/client-sns';

const getPlatformApplicationArn = (deviceType: string): string => {
  const platformArn = deviceType === 'ios' 
    ? process.env.SNS_IOS_PLATFORM_APPLICATION_ARN 
    : process.env.SNS_ANDROID_PLATFORM_APPLICATION_ARN;

  if (!platformArn) {
    throw new Error(`SNS platform application ARN for ${deviceType} is not configured.`);
  }
  return platformArn;
};

export const registerDeviceWithSNS = async (userId: string, deviceToken: string, deviceType: 'ios' | 'android') => {
  // Check if this device token already exists
  const existingToken = await prisma.pushToken.findUnique({
    where: { deviceToken },
  });

  if (existingToken) {
    // If the token exists, we need to check if the endpoint is still valid in SNS
    try {
      const getCmd = new GetEndpointAttributesCommand({ EndpointArn: existingToken.endpointArn });
      const attributes = await snsClient.send(getCmd);
      
      // If the endpoint is disabled, we should re-enable it and ensure it's up-to-date
      if (!attributes.Attributes?.Enabled || attributes.Attributes.Token !== deviceToken) {
        const setCmd = new SetEndpointAttributesCommand({
          EndpointArn: existingToken.endpointArn,
          Attributes: { Enabled: 'true', Token: deviceToken },
        });
        await snsClient.send(setCmd);
      }
      
      // If the user is different, update the association
      if (existingToken.userId !== userId) {
        return prisma.pushToken.update({
          where: { id: existingToken.id },
          data: { userId },
        });
      }
      
      return existingToken;
    } catch (error: any) {
      if (error.name !== 'NotFoundException') {
        throw error;
      }
      // Endpoint was not found in SNS, so we'll proceed to create a new one and delete the old record
      await prisma.pushToken.delete({ where: { id: existingToken.id }});
    }
  }

  // If we're here, we need to create a new endpoint
  const platformApplicationArn = getPlatformApplicationArn(deviceType);
  
  const createEndpointCmd = new CreatePlatformEndpointCommand({
    PlatformApplicationArn: platformApplicationArn,
    Token: deviceToken,
    CustomUserData: userId,
  });

  const { EndpointArn } = await snsClient.send(createEndpointCmd);
  if (!EndpointArn) {
    throw new Error('Failed to create SNS platform endpoint.');
  }

  // Store the new endpoint in our database
  return prisma.pushToken.create({
    data: {
      userId,
      deviceType,
      deviceToken,
      endpointArn: EndpointArn,
    },
  });
}; 