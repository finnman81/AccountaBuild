import { server } from './app';
import { prisma } from './config/db';

const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    // Test the database connection
    await prisma.$connect();
    console.log('Database connected successfully.');

    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exit(1);
  }
};

startServer(); 