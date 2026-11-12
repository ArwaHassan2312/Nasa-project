import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './MultiplayerLobby.css';
import { fetchLocalNetwork } from '../utils/localNetworkFetch';

const DEFAULT_API = (import.meta.env.VITE_MULTIPLAYER_API_URL || `http://${window.location.hostname}:3001`).replace(/\/$/, '');
const playerIdForTab = () => {
  let id = sessionStorage.getItem('lunar-player-id');
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('lunar-player-id', id); }
  return id;
};

async function request(path, body, api = DEFAULT_API) {
  const response = await fetchLocalNetwork(`${api}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not contact the room server.');
  return result;
}

export default function MultiplayerLobby({ onStart }) {
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomApi, setRoomApi] = useState(DEFAULT_API);
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const playerId = useMemo(playerIdForTab, []);
  const missionLaunchedRef = useRef(false);

  const showError = (err) => setError(err instanceof Error ? err.message : 'Room server is unavailable.');
  const enterRoom = async (code, create) => {
    if (!name.trim()) { setError('Enter your name first.'); return; }
    setBusy(true); setError('');
    try {
      const result = create
        ? await request('/api/rooms', { playerId, name: name.trim() })
        : await request(`/api/rooms/${encodeURIComponent(code)}/join`, { playerId, name: name.trim() });
      const selectedCode = result.room.code;
      sessionStorage.setItem('lunar-room-code', selectedCode);
      sessionStorage.setItem('lunar-player-id', result.playerId);
      const selectedApi = DEFAULT_API;
      sessionStorage.setItem('lunar-room-api', selectedApi);
      setRoomApi(selectedApi);
      setRoomCode(selectedCode); setRoom(result.room);
    } catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const refresh = useCallback(async () => {
    if (!roomCode) return;
    try {
      const result = await request(`/api/rooms/${encodeURIComponent(roomCode)}`, undefined, roomApi);
      setRoom(result.room);
      if (result.room.started && !missionLaunchedRef.current) {
        missionLaunchedRef.current = true;
        const ownName = result.room.players.find((p) => p.id === playerId)?.name || name.trim();
        onStart({ commanderName: ownName, baseName: 'Moonbase Alpha', multiplayer: true, roomCode, playerId, seed: result.room.seed });
      }
    } catch (err) { showError(err); }
  }, [roomCode, roomApi, playerId, name, onStart]);

  useEffect(() => {
    if (!roomCode) return undefined;
    void refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [roomCode, refresh]);

  const changeReady = async () => {
    const own = room?.players.find((p) => p.id === playerId);
    if (!own) return;
    try { const result = await request(`/api/rooms/${roomCode}/ready`, { playerId, ready: !own.ready }, roomApi); setRoom(result.room); }
    catch (err) { showError(err); }
  };

  const startMission = async () => {
    try { await request(`/api/rooms/${roomCode}/start`, { playerId }, roomApi); await refresh(); }
    catch (err) { showError(err); }
  };

  return <main className="crew-lobby">
    <div className="crew-lobby__card">
      <span className="crew-lobby__eyebrow">LUNAR OUTPOST · CREW LINK</span>
      <h1>{room ? 'Mission crew' : 'Play together'}</h1>
      <p className="crew-lobby__intro">Team up to keep the outpost running. Create a room or join a crew with its invite code. Your browser may ask to allow this game to connect to the host on your local network.</p>
      {!room ? <>
        <label className="crew-lobby__label">Your callsign<input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" /></label>
        <button className="crew-lobby__primary" disabled={busy} onClick={() => enterRoom('', true)}>Create a crew room</button>
        <div className="crew-lobby__divider"><span>OR JOIN A CREW</span></div>
        <div className="crew-lobby__join"><input aria-label="Room code" value={codeInput} inputMode="numeric" pattern="[0-9]*" maxLength={6} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))} placeholder="6-DIGIT ROOM CODE" /><button disabled={busy} onClick={() => enterRoom(codeInput.trim(), false)}>Join</button></div>
      </> : <>
        <div className="crew-lobby__code"><span>ROOM CODE</span><strong>{roomCode}</strong><small>Share this code with your crew</small></div>
        <div className="crew-lobby__roster"><div className="crew-lobby__roster-head"><span>CREW MANIFEST</span><span>{room.players.length}/8</span></div>
          {room.players.map((p) => <div className="crew-lobby__player" key={p.id}><span className="crew-lobby__avatar">{p.name.slice(0, 1).toUpperCase()}</span><span>{p.name}{p.id === room.hostId && <small> · HOST</small>}</span><b className={p.ready ? 'is-ready' : ''}>{p.ready ? 'READY' : 'NOT READY'}</b></div>)}
        </div>
        <button className="crew-lobby__primary" onClick={changeReady}>{room.players.find((p) => p.id === playerId)?.ready ? 'Cancel ready' : 'I’m ready'}</button>
        {room.hostId === playerId ? <button className="crew-lobby__start" disabled={!room.players.length || room.players.some((p) => !p.ready)} onClick={startMission}>Start mission</button> : <p className="crew-lobby__waiting">Waiting for the host to start the mission…</p>}
      </>}
      {error && <p className="crew-lobby__error">{error} Configure <code>VITE_MULTIPLAYER_API_URL</code> to use a remote server.</p>}
    </div>
  </main>;
}
