import { Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const getSignedUrlForUpload = async (req: Request, res: Response) => {
  const { fileType, folder } = req.body;

  if (!fileType || !folder) {
    return res.status(400).json({ message: 'Missing fileType or folder in request body' });
  }

  const fileName = `${folder}/${generateFileName()}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: fileName,
    ContentType: fileType,
  });

  try {
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // 5 minutes
    res.json({ uploadUrl, key: fileName });
  } catch (error) {
    console.error('Error creating signed URL:', error);
    res.status(500).json({ message: 'Error creating signed URL' });
  }
}; 