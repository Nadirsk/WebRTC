import type { types } from 'mediasoup';
import type {
  NotificationFrame,
  NotificationMethod,
  Notifications,
  PeerInfo,
  RemovedReason,
  Role,
} from '../../protocol/index';

type SendFrame = (frame: unknown) => void;

/** One connected client (one WebSocket) in one room. */
export class Peer {
  displayName = '';
  role: Role = 'audience';
  joined = false;
  joinedAt = 0;
  rtpCapabilities: types.RtpCapabilities | undefined;
  /** Unix seconds when the access token runs out; null for testing-mode projects. */
  sessionExp: number | null = null;

  readonly transports = new Map<string, types.WebRtcTransport>();
  readonly producers = new Map<string, types.Producer>();
  readonly consumers = new Map<string, types.Consumer>();

  /** Time with at least one video track sent or received, for video metering. */
  private videoMs = 0;
  private videoSince: number | null = null;

  constructor(
    /** Internal session ID (one per connection). */
    readonly sid: string,
    /** The customer's user ID, from the ticket. */
    readonly uid: string,
    /** Highest role the token allows. */
    public maxRole: Role,
    private readonly send: SendFrame,
    /** Closes the WebSocket. */
    readonly disconnect: (code: number, reason: string) => void,
  ) {}

  notify<M extends NotificationMethod>(method: M, data: Notifications[M]): void {
    const frame: NotificationFrame<M> = { notification: true, method, data };
    this.send(frame);
  }

  /** Tell the client why its session ends, then close the connection. */
  remove(reason: RemovedReason, by?: string): void {
    this.notify('removed', { reason, by });
    // Give the frame a moment to flush before the close frame.
    setTimeout(() => this.disconnect(4000, reason), 50);
  }

  info(): PeerInfo {
    return { uid: this.uid, displayName: this.displayName, role: this.role };
  }

  /** Call after any video producer or consumer is added or removed. */
  updateVideoUsage(): void {
    let active = false;
    for (const p of this.producers.values()) if (p.kind === 'video' && !p.closed) active = true;
    for (const c of this.consumers.values()) if (c.kind === 'video' && !c.closed) active = true;
    const now = Date.now();
    if (active && this.videoSince === null) this.videoSince = now;
    if (!active && this.videoSince !== null) {
      this.videoMs += now - this.videoSince;
      this.videoSince = null;
    }
  }

  totalVideoMs(): number {
    return this.videoMs + (this.videoSince === null ? 0 : Date.now() - this.videoSince);
  }

  /** Closing the transports also closes every producer and consumer on them. */
  closeMedia(): void {
    for (const transport of this.transports.values()) transport.close();
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
    this.updateVideoUsage();
  }
}
