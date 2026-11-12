import { createServer } from 'node:http';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';

const rooms = new Map();
const PORT = Number(process.env.PORT || 3001);
const MAX_PLAYERS = 8;
const HOST_IP = Object.values(networkInterfaces()).flat().find((address) => (
  address?.family === 'IPv4' && !address.internal && isPrivateIpv4(address.address)
))?.address || '127.0.0.1';
const send = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
const roomView = (room) => ({ code: room.code, hostId: room.hostId, started: room.started, seed: room.seed ?? null, players: room.players, completedTasks: room.completedTasks, events: room.events });

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/rooms') {
      const body = await readBody(req);
      const playerId = String(body.playerId || randomUUID());
      let code;
      do { code = randomInt(0, 1_000_000).toString().padStart(6, '0'); } while (rooms.has(code));
      const room = { code, hostId: playerId, started: false, players: [{ id: playerId, name: clean(body.name), ready: true }], completedTasks: [], events: [] };
      rooms.set(code, room);
      return send(res, 201, { playerId, room: roomView(room) });
    }
    const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)(?:\/(join|ready|start|tasks|events))?$/i);
    if (!roomMatch) return send(res, 404, { error: 'Not found' });
    const [, rawCode, action] = roomMatch;
    const room = rooms.get(rawCode.toUpperCase());
    if (!room) return send(res, 404, { error: 'Room not found' });
    if (!action && req.method === 'GET') return send(res, 200, { room: roomView(room) });
    const body = await readBody(req);
    if (action === 'join' && req.method === 'POST') {
      if (room.started) return send(res, 409, { error: 'Mission already started' });
      const id = String(body.playerId || randomUUID());
      let player = room.players.find((entry) => entry.id === id);
      if (!player && room.players.length >= MAX_PLAYERS) return send(res, 409, { error: 'Room is full' });
      if (!player) { player = { id, name: clean(body.name), ready: false }; room.players.push(player); }
      return send(res, 200, { playerId: id, room: roomView(room) });
    }
    if (action === 'ready' && req.method === 'POST') {
      const player = room.players.find((entry) => entry.id === body.playerId);
      if (!player) return send(res, 403, { error: 'Player is not in this room' });
      player.ready = Boolean(body.ready);
      return send(res, 200, { room: roomView(room) });
    }
    if (action === 'start' && req.method === 'POST') {
      if (room.hostId !== body.playerId) return send(res, 403, { error: 'Only the host can start' });
      if (!room.players.length || room.players.some((player) => !player.ready)) return send(res, 409, { error: 'Everyone must be ready' });
      room.started = true;
      room.seed = Number.parseInt(randomBytes(4).toString('hex'), 16);
      room.events.push({ id: randomUUID(), type: 'mission-started', at: Date.now() });
      return send(res, 200, { room: roomView(room), seed: room.seed });
    }
    if (action === 'tasks' && req.method === 'POST') {
      const player = room.players.find((entry) => entry.id === body.playerId);
      if (!player || !room.started) return send(res, 403, { error: 'Player is not active in this mission' });
      const taskId = String(body.taskId || '');
      if (!taskId) return send(res, 400, { error: 'Task id is required' });
      if (!room.completedTasks.some((task) => task.taskId === taskId)) {
        const task = { taskId, title: clean(body.title), playerId: player.id, playerName: player.name, at: Date.now() };
        room.completedTasks.push(task);
        room.events.push({ id: randomUUID(), type: 'task-completed', ...task });
      }
      return send(res, 200, { room: roomView(room) });
    }
    if (action === 'events' && req.method === 'POST') {
      const player = room.players.find((entry) => entry.id === body.playerId);
      if (!player || !room.started) return send(res, 403, { error: 'Player is not active in this mission' });
      const occurrenceId = String(body.occurrenceId || '');
      if (!occurrenceId) return send(res, 400, { error: 'Event id is required' });
      const resolution = room.events.find((entry) => (
        ['event-decision', 'event-abandoned'].includes(entry.type) && entry.occurrenceId === occurrenceId
      ));
      if (resolution) return send(res, 200, { event: resolution });
      const abandoned = body.outcome === 'abandoned';
      const decisionId = String(body.decisionId || '');
      if (!abandoned && !decisionId) return send(res, 400, { error: 'Decision id is required' });
      const event = {
        id: randomUUID(), type: abandoned ? 'event-abandoned' : 'event-decision', occurrenceId,
        ...(abandoned ? {} : { decisionId, decisionLabel: clean(body.decisionLabel) }),
        eventName: clean(body.eventName), playerId: player.id, playerName: player.name, at: Date.now(),
      };
      room.events.push(event);
      return send(res, 200, { event });
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    return send(res, 400, { error: error.message || 'Invalid request' });
  }
});

function clean(value) { return String(value || '').trim().slice(0, 48) || 'Commander'; }
function isPrivateIpv4(ip) {
  const octets = ip.split('.').map(Number);
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}
async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Multiplayer room API listening on port ${PORT}`);
  console.log(`Room codes point to ${HOST_IP}:${PORT}`);
  for (const entries of Object.values(networkInterfaces())) {
    for (const address of entries ?? []) {
      if (address.family === 'IPv4' && !address.internal) console.log(`LAN API: http://${address.address}:${PORT}`);
    }
  }
});
