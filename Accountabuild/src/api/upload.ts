import {API_BASE_URL} from '../config/constants';

export interface UploadResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface SignedUrlResponse {
  uploadUrl: string;
  imageUrl: string;
  fields: Record<string, string>;
}

class UploadAPI {
  private baseURL: string;

  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async getSignedUrl(fileName: string, fileType: string): Promise<SignedUrlResponse> {
    try {
      const response = await fetch(`${this.baseURL}/upload/signed-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await this.getAuthToken()}`,
        },
        body: JSON.stringify({
          fileName,
          fileType,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting signed URL:', error);
      throw error;
    }
  }

  async uploadToS3(signedUrl: string, fields: Record<string, string>, file: any): Promise<void> {
    try {
      const formData = new FormData();
      
      // Add the fields from the signed URL
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
      
      // Add the file
      formData.append('file', file);

      const response = await fetch(signedUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error uploading to S3:', error);
      throw error;
    }
  }

  async uploadImage(imageUri: string): Promise<UploadResponse> {
    try {
      // Get file info from URI
      const fileName = `image_${Date.now()}.jpg`;
      const fileType = 'image/jpeg';

      // Get signed URL from backend
      const signedUrlData = await this.getSignedUrl(fileName, fileType);

      // Create file object from URI
      const file = {
        uri: imageUri,
        type: fileType,
        name: fileName,
      };

      // Upload to S3
      await this.uploadToS3(signedUrlData.uploadUrl, signedUrlData.fields, file);

      return {
        success: true,
        imageUrl: signedUrlData.imageUrl,
      };
    } catch (error) {
      console.error('Error uploading image:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  private async getAuthToken(): Promise<string> {
    // This should get the auth token from your auth context or storage
    // For now, we'll return an empty string and handle auth in the component
    return '';
  }
}

export const uploadAPI = new UploadAPI(); 