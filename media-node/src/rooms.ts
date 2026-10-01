import { roomKey } from '../../shared/auth';
import { Room } from './Room';

const rooms = new Map<string, Room>();
const creating = new Map<string, Promise<Room>>();

type RoomHook = (room: Room) => void;
let onCreated: RoomHook = () => {};

/** Called once per new room, e.g. to register it with the orchestrator and open cascade links. */
export function onRoomCreated(hook: RoomHook): void {
  onCreated = hook;
}

/** Returns the room, creating it on the least-loaded worker if needed. Safe under concurrent joins. */
export async function getOrCreateRoom(appId: string, channel: string): Promise<Room> {
  const key = roomKey(appId, channel);
  const existing = rooms.get(key);
  if (existing && !existing.isClosed) return existing;

  const pending = creating.get(key);
  if (pending) return pending;

  const promise = Room.create(key, appId, channel, (room) => {
    if (rooms.get(room.key) === room) rooms.delete(room.key);
  })
    .then((room) => {
      rooms.set(key, room);
      onCreated(room);
      return room;
    })
    .finally(() => creating.delete(key));

  creating.set(key, promise);
  return promise;
}

export function getRoom(key: string): Room | undefined {
  const room = rooms.get(key);
  return room && !room.isClosed ? room : undefined;
}

export function listRooms(): Room[] {
  return [...rooms.values()];
}

export function closeAllRooms(): void {
  for (const room of [...rooms.values()]) room.close();
}
