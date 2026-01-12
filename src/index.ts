/* */
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { connectMongo } from './lib/mongo.js';
import { logger } from './lib/logger.js';
import { registerRoutes } from './routes/index.js';
import swaggerUi from 'swagger-ui-express';
import { buildSwaggerSpec } from './lib/swagger.js';

const app = express();

app.use(helmet());
app.use(cors());

// CRITICAL FIX: Increased limit to 10mb to allow image uploads (base64)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(morgan('dev'));

// Register all API routes (including the new Deals route)
registerRoutes(app);

// Swagger Documentation
const spec = buildSwaggerSpec();
app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

connectMongo()
  .then(() => {
    app.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
    });
  })
  .catch((err) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  });

export default app;