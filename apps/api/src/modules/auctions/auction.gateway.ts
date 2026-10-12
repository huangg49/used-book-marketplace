import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { AuctionBiddingService } from './auction-bidding.service.js';
import {
  AuctionLiveService,
  LIST_ROOM,
  auctionRoom,
} from './auction-live.service.js';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WATCHED = 20;

interface LiveSocket {
  connected: boolean;
  data: { watching?: Set<string>; pending?: Set<string>; list?: boolean };
  join(room: string): unknown;
  leave(room: string): unknown;
}
type Server = {
  to(room: string): { emit(event: string, payload: unknown): void };
};

// Public, read-only live channel for auctions (ADR 0031). It carries the same
// data as GET /auctions and GET /auctions/{id}; no token is read and no command
// is accepted here, so bidding still goes through the REST command protocol.
@WebSocketGateway({
  namespace: '/auctions',
  cors: { origin: true, credentials: false },
})
export class AuctionGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  constructor(
    private readonly live: AuctionLiveService,
    private readonly bidding: AuctionBiddingService,
  ) {}

  afterInit(server: Server) {
    this.live.attach((room, event, payload) =>
      server.to(room).emit(event, payload),
    );
  }

  /** Joins one auction; the ack carries the current snapshot to resync from. */
  @SubscribeMessage('auction:watch')
  async watch(
    @ConnectedSocket() socket: LiveSocket,
    @MessageBody() id: unknown,
  ) {
    if (typeof id !== 'string' || !UUID.test(id))
      return { ok: false, code: 'VALIDATION_ERROR' };
    const watching = (socket.data.watching ??= new Set());
    const pending = (socket.data.pending ??= new Set());
    if (watching.has(id) || pending.has(id)) return this.snapshot(id);
    if (watching.size + pending.size >= MAX_WATCHED)
      return { ok: false, code: 'RATE_LIMITED' };
    // Register before reading the snapshot: a change committed in between is
    // then pushed again (harmless) instead of being missed. A pending join is
    // undone here if the socket left or unwatched meanwhile.
    pending.add(id);
    const counted = this.live.watch(id); // counts synchronously
    await socket.join(auctionRoom(id));
    await counted;
    const reply = await this.snapshot(id);
    const kept = pending.delete(id) && reply.ok && socket.connected;
    if (!kept) {
      await socket.leave(auctionRoom(id));
      this.live.unwatch(id);
      return reply.ok ? { ok: false, code: 'CANCELLED' } : reply;
    }
    watching.add(id);
    return reply;
  }

  private async snapshot(id: string) {
    try {
      return { ok: true, auction: await this.bidding.readPublic(id) };
    } catch {
      return { ok: false, code: 'NOT_FOUND' };
    }
  }

  @SubscribeMessage('auction:unwatch')
  async unwatch(
    @ConnectedSocket() socket: LiveSocket,
    @MessageBody() id: unknown,
  ) {
    if (typeof id !== 'string') return { ok: false };
    if (socket.data.pending?.delete(id)) return { ok: true }; // join undoes itself
    if (!socket.data.watching?.delete(id)) return { ok: false };
    await socket.leave(auctionRoom(id));
    this.live.unwatch(id);
    return { ok: true };
  }

  @SubscribeMessage('auctions:watch')
  async watchList(@ConnectedSocket() socket: LiveSocket) {
    if (!socket.data.list) {
      socket.data.list = true;
      const counted = this.live.watchList(); // counts synchronously
      await socket.join(LIST_ROOM);
      await counted;
    }
    return { ok: true };
  }

  @SubscribeMessage('auctions:unwatch')
  async unwatchList(@ConnectedSocket() socket: LiveSocket) {
    if (!socket.data.list) return { ok: false };
    socket.data.list = false;
    await socket.leave(LIST_ROOM);
    this.live.unwatchList();
    return { ok: true };
  }

  handleDisconnect(socket: LiveSocket) {
    for (const id of socket.data.watching ?? []) this.live.unwatch(id);
    socket.data.watching?.clear();
    if (socket.data.list) this.live.unwatchList();
    socket.data.list = false;
  }
}
