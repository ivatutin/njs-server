import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.APP_PORT || '3000', 10),
  pathPrefix: process.env.APP_PATH_PREFIX,
  logLevel: process.env.LOG_LEVEL ?? 'info',
}));
