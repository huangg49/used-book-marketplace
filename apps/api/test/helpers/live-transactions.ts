import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';

export function connectTransactions(app: INestApplication, token: string): Promise<Socket> {
  const { port } = app.getHttpServer().address() as { port: number };
  const socket = io(`http://127.0.0.1:${port}/transactions`, {
    autoConnect: false, reconnection: false, forceNew: true,
    auth: { token }, transports: ['websocket'], timeout: 1_500,
  });
  return new Promise<Socket>((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', error => {
      socket.disconnect();
      reject(error);
    });
    socket.connect();
  });
}
