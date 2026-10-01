import type {
  NotificationFrame,
  NotificationMethod,
  Notifications,
  RequestMethod,
  Requests,
  ResponseFrame,
} from '../../protocol/index';
import { RtcError } from './errors';

type Pending = {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

type NotificationHandler = <M extends NotificationMethod>(method: M, data: Notifications[M]) => void;

/** Request/response over one WebSocket, with server notifications pushed to a single handler. */
export class Signaling {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private closedByUs = false;

  onNotification: NotificationHandler = () => {};
  /** Fires once when the socket closes for any reason other than close(). */
  onClose: (reason: string) => void = () => {};

  constructor(private readonly url: string) {}

  open(timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new RtcError('network', `Could not reach the media server at ${this.url}`));
      };
      const timer = setTimeout(() => {
        fail();
        ws.close();
      }, timeoutMs);

      ws.onopen = () => {
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = fail;
      ws.onclose = (event) => {
        fail();
        for (const p of this.pending.values()) {
          clearTimeout(p.timer);
          p.reject(new RtcError('network', 'Connection to the media server closed'));
        }
        this.pending.clear();
        if (!this.closedByUs) this.onClose(event.reason || `code ${event.code}`);
      };
      ws.onmessage = (event) => this.handleMessage(String(event.data));
    });
  }

  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  request<M extends RequestMethod>(method: M, data: Requests[M][0], timeoutMs = 10_000): Promise<Requests[M][1]> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new RtcError('network', 'Not connected to the media server'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RtcError('timeout', `Request "${method}" timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (d: unknown) => void, reject, timer });
      ws.send(JSON.stringify({ id, method, data }));
    });
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
  }

  private handleMessage(raw: string) {
    let frame: ResponseFrame | NotificationFrame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }
    if ('notification' in frame) {
      this.onNotification(frame.method, frame.data);
      return;
    }
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    this.pending.delete(frame.id);
    clearTimeout(pending.timer);
    if (frame.ok) pending.resolve(frame.data);
    else pending.reject(new RtcError(frame.code ?? 'server_error', frame.error));
  }
}
