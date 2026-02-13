/* */
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path'; // ✅ Import path
import { connectMongo } from './lib/mongo.js';
import { logger } from './lib/logger.js';
import { registerRoutes } from './routes/index.js';
import swaggerUi from 'swagger-ui-express';
import { buildSwaggerSpec } from './lib/swagger.js';

const app = express();

// ✅ FIX 1: Configure Helmet to allow media/images (Fixes CSP Error)
app.use(helmet({
  contentSecurityPolicy: false, 
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors());

// CRITICAL FIX: Increased limit to 10mb to allow image uploads (base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(morgan('dev'));

// ✅ FIX 2: Serve Static Files (Fixes 404 for notification.mp3)
// This makes the 'public' folder accessible at the root URL
app.use(express.static(path.join(process.cwd(), 'public')));

// ✅ FIX 3: Add Health Check Endpoint (Render deployment fix)
// This endpoint responds immediately without waiting for MongoDB
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Register all API routes (including the new Deals route)
registerRoutes(app);

// Swagger Documentation
const spec = buildSwaggerSpec();
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

// ✅ FIX 4: Start server immediately to pass Render health checks
// Don't wait for MongoDB connection before starting the server
app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
  logger.info(`Static files being served from: ${path.join(process.cwd(), 'public')}`);
  logger.info('Health check available at /health');
});

// ✅ FIX 5: Connect to MongoDB asynchronously (don't block server startup)
// This prevents deployment timeouts if MongoDB is slow or unavailable
connectMongo()
  .then(() => {
    logger.info('MongoDB connected successfully');
  })
  .catch((err) => {
    logger.error({ err }, 'Failed to connect to MongoDB - some features may not work');
    // Don't exit - let the server keep running
    // You may want to retry the connection or handle this differently
  });

export default app;
