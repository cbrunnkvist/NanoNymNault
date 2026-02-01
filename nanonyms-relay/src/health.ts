import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { getStats, getState } from './relay.js';

const server = Fastify({ logger: false });

server.register(cors, {
  origin: true,
  methods: ['GET']
});

server.get('/health', async () => {
  const state = getState();
  
  if (!state) {
    return {
      status: 'error',
      message: 'Relay not running',
    };
  }

  try {
    const stats = await getStats();
    return {
      status: 'ok',
      ...stats,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

server.get('/stats', async () => {
  const state = getState();
  
  if (!state) {
    throw { statusCode: 503, message: 'Relay not running' };
  }

  return getStats();
});

server.get('/', async () => {
  return {
    name: 'nanonyms-relay',
    version: '1.0.0',
    description: 'NanoNym payment notification relay (Tier-2 persistent storage)',
    endpoints: {
      health: '/health',
      stats: '/stats',
    },
  };
});

export async function startHealthServer(): Promise<void> {
  try {
    await server.listen({ port: config.ports.health, host: '0.0.0.0' });
    console.log(`[Health] HTTP server listening on http://0.0.0.0:${config.ports.health}`);
  } catch (error) {
    console.error('[Health] Failed to start HTTP server:', error);
    throw error;
  }
}

export async function stopHealthServer(): Promise<void> {
  await server.close();
  console.log('[Health] HTTP server stopped');
}
