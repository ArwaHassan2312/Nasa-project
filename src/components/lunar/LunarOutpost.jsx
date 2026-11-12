import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createLunarEngine } from './lunarOutpostEngine';
import EventModal from '../EventModal';
import EndGameReport from '../EndGameReport';
import DailyTaskExperience from './DailyTaskExperience';
import { getDailyTaskExperience } from '../../data/dailyTaskExperiences';
import { getChapterReply, getEventNarration, getStoryCallback, LOCATION_STORY_CARDS, MOON_FACTS, SCIENCE_DISCOVERIES, STORY_CHAPTERS, STORY_DAY_BEATS } from '../../data/missionStory';
import { IceSampleActivity, MissionArchive, MissionStoryMoment, RadioCall } from '../MissionStoryPanels';
import { createLumiSpeech } from '../../utils/missionVoice';
import MissionEventCall from './MissionEventCall';
import MissionStoryReward from '../MissionStoryReward';
import { fetchLocalNetwork } from '../../utils/localNetworkFetch';
import './LunarOutpost.css';
import '../../simulation.css';

const RESOURCE_ITEMS = [
  ['power', 'Power', '⚡'],
  ['battery', 'Battery', '🔋'],
  ['oxygen', 'Oxygen', '🫧'],
  ['water', 'Water', '💧'],
  ['food', 'Food', '🥕'],
  ['health', 'Commander safety', '💚'],
  ['science', 'Science', '🔬'],
];

// Combine suit, habitat, and radiation protection into one commander safety meter.
function getCommanderSafety(resources) {
  return Math.round((resources.health + resources.habitat + resources.radProtection) / 3);
}

const TASK_EVENT_TESTS = [
  ['workshop-equipment-maintenance', 'Workshop maintenance', 'Habitat fire'],
  ['solar-array-inspection', 'Solar array inspection', 'Power failure'],
  ['habitat-waterline-inspection', 'Waterline inspection', 'Water leak'],
];
const MULTIPLAYER_API = (sessionStorage.getItem('lunar-room-api') || import.meta.env.VITE_MULTIPLAYER_API_URL || `http://${window.location.hostname}:3001`).replace(/\/$/, '');
const RESOURCE_LABELS = {
  power: 'Power', battery: 'Battery', oxygen: 'Oxygen', water: 'Water', food: 'Food',
  habitat: 'Commander safety', equipment: 'Commander safety', health: 'Commander safety',
  radProtection: 'Commander safety', comms: 'Power', science: 'Science',
  emergencyReserve: 'Water', potentialWater: 'Water',
};
const EVENT_LOCATIONS = {
  fire_lab: { componentId: '010', name: 'Workshop' },
  solar_storm: { componentId: '011', name: 'Solar Array' },
  power_failure: { componentId: '011', name: 'Solar Array' },
  water_leak: { componentId: '001', name: 'Cylinder Habitat' },
  lunar_night: { componentId: '011', name: 'Solar Array' },
  water_ice_exploration: { componentId: '018', name: 'Regolith Excavator' },
};
const COMPONENT_TASK_FACTS = {
  '001': ['A habitat’s air, water, and temperature systems have to work together to keep astronauts safe.', 'Lunar dust is sharp and clingy, so seals and filters need careful checks around a habitat.', 'A small leak can matter in a sealed habitat because air and water are limited supplies.'],
  '010': ['A workshop lets astronauts maintain tools and equipment instead of waiting for supplies from Earth.', 'On the Moon, dust can get into moving parts, so clean work areas help equipment last longer.', 'Good tool checks save time when a repair has to happen far from Earth.'],
  '011': ['Solar panels make electricity from sunlight, while batteries store energy for later.', 'The Moon’s day and night each last about two Earth weeks, so power needs careful planning.', 'Dust on a solar panel can block some sunlight and reduce the energy it collects.'],
  '015': ['Batteries store energy so important outpost systems can keep running when solar power is low.', 'Battery temperature affects how well it can store and deliver energy.', 'Checking a battery early can help prevent a small power issue from growing.'],
  '008': ['Plants can help provide fresh food, but they need carefully measured water and light.', 'Growing plants in space also helps scientists learn how living things respond to a new environment.', 'A greenhouse needs its water and air systems to stay steady for healthy plant growth.'],
  '017': ['Radio signals let astronauts and mission control share plans and important updates.', 'A clear antenna path helps a radio send and receive a stronger signal.', 'Communication equipment can help a crew get advice from Earth during a repair.'],
  '018': ['A rover can reach places that are difficult or unsafe for astronauts to visit on foot.', 'A rover’s wheels need traction to cross loose lunar soil.', 'Robotic tools let scientists study lunar ground while keeping astronauts at a safer distance.'],
  '020': ['Apollo 15 was the first mission to use a lunar rover on the Moon.', 'Rovers can carry tools and samples, helping crews explore farther from their landing site.', 'Careful route planning helps a rover save power and avoid rough terrain.'],
};

function getUniqueTaskFact(task, tasks) {
  const facts = COMPONENT_TASK_FACTS[task.targetComponentId];
  if (!facts?.length) return getDailyTaskExperience(task).fact;
  const sameLocation = tasks.filter((entry) => entry.targetComponentId === task.targetComponentId).sort((a, b) => a.id.localeCompare(b.id));
  const slot = Math.max(0, sameLocation.findIndex((entry) => entry.id === task.id));
  return facts[slot % facts.length];
}

function createLumiDiscoveryMessage(titles) {
  if (titles.length === 1) return `I have a new discovery for you: ${titles[0]}! It’s saved in your Science Notebook.`;
  return `I have ${titles.length} new discoveries for you: ${titles.join(', ')}! They’re saved in your Science Notebook.`;
}

function getTaskStartMessage(task) {
  return task.priority === 'critical'
    ? `You’ve started a critical task at ${task.targetComponentName}. We have two minutes to finish it. Let’s go!`
    : `You’ve started ${task.title}. This helps keep ${task.targetComponentName} ready. Let’s do it together.`;
}

function playLumiMessageChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, startAt);
    oscillator.frequency.setValueAtTime(1046, startAt + 0.075);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.035, startAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.19);
    oscillator.connect(gain);
    gain.connect(context.destination);
    const resumePromise = context.resume?.();
    if (resumePromise) void resumePromise.catch(() => {});
    oscillator.start(startAt);
    oscillator.stop(startAt + 0.2);
    oscillator.onended = () => { void context.close(); };
  } catch { /* Keep the chat usable when audio is unavailable. */ }
}

function getEventLocation(event) {
  return EVENT_LOCATIONS[event?.sourceEventId ?? event?.id] ?? null;
}

function getSystemConditionLevel(value) {
  if (value === 0) return 'failed';
  if (value < 20) return 'severe';
  if (value < 40) return 'critical';
  if (value < 60) return 'degraded';
  if (value < 80) return 'stable';
  return 'healthy';
}

function getTaskStatusLabel(status) {
  if (status === 'inProgress') return 'Started';
  if (status === 'completed') return 'Done';
  if (status === 'overdue') return 'Late';
  return 'Ready';
}

function getTaskButtonName(task) {
  const title = task?.title?.trim();
  return title?.split(/\s+[—–-]\s+/)[0]?.trim() || title || 'Open Task';
}

function formatRemainingTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getEventOccurrenceKey(event) {
  return event?.occurrenceId ?? (event ? `${event.id}-${event.day ?? 0}` : null);
}

// Both maps poll the engine on a timer. Ignore sub-cell jitter in the player and
// the rover fleet so an idle frame never re-renders an unchanged map.
const SNAPSHOT_PLAYER_TOLERANCE = 0.35;
const SNAPSHOT_YAW_TOLERANCE = 0.06;

function snapshotsMatch(current, next) {
  if (!current || !next) return false;
  if (current.components !== next.components || current.cameraMode !== next.cameraMode) return false;

  const currentPlayer = current.player;
  const nextPlayer = next.player;
  const samePlayer = (currentPlayer === null && nextPlayer === null)
    || Boolean(currentPlayer && nextPlayer
      && Math.abs(currentPlayer.x - nextPlayer.x) < SNAPSHOT_PLAYER_TOLERANCE
      && Math.abs(currentPlayer.z - nextPlayer.z) < SNAPSHOT_PLAYER_TOLERANCE
      && Math.abs(currentPlayer.yaw - nextPlayer.yaw) < SNAPSHOT_YAW_TOLERANCE
      && currentPlayer.location === nextPlayer.location);
  if (!samePlayer) return false;

  const currentRovers = current.rovers ?? [];
  const nextRovers = next.rovers ?? [];
  if (currentRovers.length !== nextRovers.length) return false;
  for (let index = 0; index < currentRovers.length; index += 1) {
    const a = currentRovers[index];
    const b = nextRovers[index];
    if (Math.abs(a.x - b.x) >= SNAPSHOT_PLAYER_TOLERANCE) return false;
    if (Math.abs(a.z - b.z) >= SNAPSHOT_PLAYER_TOLERANCE) return false;
    if (Math.abs(a.heading - b.heading) >= SNAPSHOT_YAW_TOLERANCE) return false;
  }
  return true;
}

export default function LunarOutpost({ onExitToOrbit, simulation, commanderProfile }) {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const presentedEventRef = useRef(null);
  const returningEventRef = useRef(null);
  const queuedPresentationsRef = useRef(new Set());
  const endOfDayPresentationsRef = useRef(new Set());
  const previousEndOfDayPresentationIdsRef = useRef([]);
  const previousEventPresentationIdsRef = useRef([]);
  const eventOptionsEventIdRef = useRef(null);
  const eventAlertMenuRef = useRef(null);
  const dayStartCameraDayRef = useRef(null);
  const alertPanelDayRef = useRef(simulation.day);
  const setSceneReady = simulation.setSceneReady;
  const visibleNotifications = simulation.eventFailureNotices
    .filter((notice) => notice.day <= simulation.day);
  const isPersistentCriticalFeedback = simulation.challengeFeedback?.startsWith('Initial deadline missed');
  const visibleTaskFailureNotices = simulation.taskFailureNotices ?? [];
  const visibleEndOfDayNotices = simulation.endOfDayNoticeHistory.filter((event) => (
    simulation.endOfDayNoticePresentationIds.includes(getEventOccurrenceKey(event))
  ));
  const hasPendingCriticalTaskNotice = (simulation.taskFailureNotices ?? []).length > 0
    || simulation.endOfDayNoticeHistory.length > 0;

  const [isLoading, setIsLoading] = useState(true);
  const [cameraMode, setCameraMode] = useState('free');
  const [roverReady, setRoverReady] = useState(false);
  const [roverCameraActive, setRoverCameraActive] = useState(false);
  const [roverLink, setRoverLink] = useState(null);
  const [prompt, setPrompt] = useState({ type: null, data: null });
  const [insidePanel, setInsidePanel] = useState({
    visible: false,
    label: '',
    buttonText: '',
    componentId: null
  });
  const [statusOpen, setStatusOpen] = useState(false);
  const [dailyTasksOpen, setDailyTasksOpen] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState(null);
  const [eventOptionsOpen, setEventOptionsOpen] = useState(false);
  const [eventAlertListOpen, setEventAlertListOpen] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapOpenedAtDecisionCount, setMapOpenedAtDecisionCount] = useState(0);
  const [selectedMapTaskId, setSelectedMapTaskId] = useState(null);
  const [selectedMapComponentId, setSelectedMapComponentId] = useState(null);
  const [taskExperienceId, setTaskExperienceId] = useState(null);
  const [taskExperienceStage, setTaskExperienceStage] = useState('idea');
  const [taskJourneys, setTaskJourneys] = useState({});
  const [taskOutcomeStart, setTaskOutcomeStart] = useState(null);
  const [crewTaskNotification, setCrewTaskNotification] = useState(null);
  const [taskRecapSpeaking, setTaskRecapSpeaking] = useState(false);
  const [storyMoment, setStoryMoment] = useState(null);
  const [dayOpeningMessage, setDayOpeningMessage] = useState('');
  const [dayOpeningMessages, setDayOpeningMessages] = useState([]);
  const [dayOpeningIndex, setDayOpeningIndex] = useState(0);
  const [storyRewardDay, setStoryRewardDay] = useState(null);
  const [dayReportReadyDay, setDayReportReadyDay] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTab, setArchiveTab] = useState('notebook');
  const [iceSampleOpen, setIceSampleOpen] = useState(false);
  const [radioOpen, setRadioOpen] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [lumiGuideCollapsed, setLumiGuideCollapsed] = useState(false);
  const [lumiVoiceSupported, setLumiVoiceSupported] = useState(true);
  const [lumiVoiceEnabled, setLumiVoiceEnabled] = useState(true);
  const [lumiSpeechInProgress, setLumiSpeechInProgress] = useState(false);
  const lumiSpeechTimerRef = useRef(null);
  const lumiVoiceEnabledRef = useRef(true);
  const lumiSpeechActiveRef = useRef(false);
  const lumiSpeechQueueRef = useRef([]);
  const lumiSpeechRunRef = useRef(0);
  const pendingNoorCallRef = useRef(null);
  const noorCallActiveRef = useRef(false);
  const previousLumiMessageRef = useRef('');
  const [noorCall, setNoorCall] = useState(null);
  const [routeEventId, setRouteEventId] = useState(null);
  const [lumiMilestoneMessage, setLumiMilestoneMessage] = useState('');
  const handledNoorCallsRef = useRef(new Set());
  const shownStoryDayRef = useRef(null);
  const dayOpeningStartedRef = useRef(null);
  const dayOpeningCompleteRef = useRef(null);
  const pendingDayBeatRef = useRef(null);
  const rewardedStoryDayRef = useRef(null);
  const announcedFailureNoticesRef = useRef(new Set());
  const dayStartClockRef = useRef({ day: simulation.day, at: Date.now() });
  const pendingScienceTitlesRef = useRef([]);
  const queuedScienceIdsRef = useRef(new Set());
  const multiplayerEventIdsRef = useRef(new Set());
  const crewNotificationTimerRef = useRef(null);
  const observedTaskDayRef = useRef(simulation.day);
  const [taskMarkerTargets, setTaskMarkerTargets] = useState([]);
  const [mapSnapshot, setMapSnapshot] = useState(null);
  const [miniSnapshot, setMiniSnapshot] = useState(null);
  const {
    eventPhase,
    currentEvent,
    beginPresentation,
    completePresentation,
    completeQueuedPresentation,
    completeResolution,
    startDailyChallenge,
    completeDailyChallenge,
    dismissChallengeFeedback,
  } = simulation;
  const showCrewNotification = useCallback((id, message) => {
    setCrewTaskNotification({ id, message });
    window.clearTimeout(crewNotificationTimerRef.current);
    crewNotificationTimerRef.current = window.setTimeout(() => {
      setCrewTaskNotification((current) => current?.id === id ? null : current);
    }, 2000);
  }, []);
  const stopLumiSpeech = useCallback(() => {
    lumiSpeechRunRef.current += 1;
    lumiSpeechQueueRef.current = [];
    lumiSpeechActiveRef.current = false;
    setLumiSpeechInProgress(false);
    window.clearTimeout(lumiSpeechTimerRef.current);
    window.speechSynthesis?.cancel();
    setTaskRecapSpeaking(false);
    if (pendingNoorCallRef.current) {
      noorCallActiveRef.current = true;
      setNoorCall({ event: pendingNoorCallRef.current, stage: 'incoming' });
      pendingNoorCallRef.current = null;
    }
  }, []);
  const speakLumi = useCallback((text, onEnd, queueIfBusy = false, onStart) => {
    if (!text) { onEnd?.(); return; }
    if (!lumiVoiceEnabledRef.current) { setLumiSpeechInProgress(false); onStart?.(); onEnd?.(); return; }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      setLumiVoiceSupported(false);
      setLumiSpeechInProgress(false);
      onStart?.();
      onEnd?.();
      return;
    }
    if (pendingNoorCallRef.current && !queueIfBusy) return;
    if (queueIfBusy && (lumiSpeechActiveRef.current || window.speechSynthesis.speaking)) {
      lumiSpeechQueueRef.current.push({ text, onEnd, onStart });
      return;
    }
    if (!queueIfBusy) {
      lumiSpeechRunRef.current += 1;
      lumiSpeechQueueRef.current = [];
      lumiSpeechActiveRef.current = false;
      window.speechSynthesis.cancel();
    }
    const run = lumiSpeechRunRef.current;
    const play = (line, onDone, onBegin) => {
      if (run !== lumiSpeechRunRef.current || !lumiVoiceEnabledRef.current) return;
      const speech = createLumiSpeech(line);
      lumiSpeechActiveRef.current = true;
      setLumiSpeechInProgress(true);
      onBegin?.();
      const finish = () => {
        if (run !== lumiSpeechRunRef.current) return;
        lumiSpeechActiveRef.current = false;
        const next = lumiSpeechQueueRef.current.shift();
        if (next) play(next.text, next.onEnd, next.onStart);
        else setLumiSpeechInProgress(false);
        onDone?.();
      };
      speech.onend = finish;
      speech.onerror = finish;
      window.speechSynthesis.speak(speech);
    };
    play(text, onEnd, onStart);
  }, []);
  const interruptLumiForEvent = useCallback(() => {
    lumiSpeechRunRef.current += 1;
    lumiSpeechQueueRef.current = [];
    lumiSpeechActiveRef.current = false;
    setLumiSpeechInProgress(false);
    setTaskRecapSpeaking(false);
    window.clearTimeout(lumiSpeechTimerRef.current);
    window.speechSynthesis?.cancel();
    setDayOpeningMessages([]);
    setDayOpeningIndex(0);
    setDayOpeningMessage('');
  }, []);
  useEffect(() => {
    if (commanderProfile) simulation.setMissionProfile(commanderProfile);
  }, [commanderProfile, simulation.setMissionProfile]);
  useEffect(() => {
    if (!commanderProfile?.multiplayer || !commanderProfile.roomCode) return undefined;
    let live = true;
    const pollCrew = async () => {
      try {
        const response = await fetchLocalNetwork(`${MULTIPLAYER_API}/api/rooms/${encodeURIComponent(commanderProfile.roomCode)}`);
        if (!response.ok) return;
        const { room } = await response.json();
        if (!live) return;
        for (const event of room.events ?? []) {
          if (multiplayerEventIdsRef.current.has(event.id)) continue;
          if (event.playerId === commanderProfile.playerId) {
            multiplayerEventIdsRef.current.add(event.id);
            continue;
          }
          if (event.type === 'task-completed') {
            const task = simulation.dailyChallenges.find((entry) => entry.id === event.taskId);
            if (!task) continue;
            multiplayerEventIdsRef.current.add(event.id);
            simulation.completeDailyChallenge(task.id, task.targetComponentId, undefined, event.playerName);
            showCrewNotification(event.id, `${event.playerName} completed ${task.title}`);
          } else if (event.type === 'event-decision' || event.type === 'event-abandoned') {
            const eventEntry = [simulation.currentEvent, ...simulation.queuedEvents.map((entry) => entry.event)]
              .find((entry) => getEventOccurrenceKey(entry) === event.occurrenceId);
            if (!eventEntry) continue;
            if (event.type === 'event-decision'
              && getEventOccurrenceKey(simulation.currentEvent) === event.occurrenceId
              && simulation.eventPhase !== 'awaitingDecision') continue;
            if (event.type === 'event-abandoned') {
              multiplayerEventIdsRef.current.add(event.id);
              simulation.abandonEvent(event.occurrenceId);
              showCrewNotification(event.id, `${event.playerName} closed ${event.eventName}`);
              continue;
            }
            const decision = eventEntry.decisions.find((entry) => entry.id === event.decisionId);
            if (!decision) { multiplayerEventIdsRef.current.add(event.id); continue; }
            multiplayerEventIdsRef.current.add(event.id);
            simulation.makeDecision(decision, event.occurrenceId);
            showCrewNotification(event.id, `${event.playerName} chose “${event.decisionLabel}” for ${event.eventName}`);
          }
        }
      } catch { /* The local mission remains playable while the relay reconnects. */ }
    };
    void pollCrew();
    const timer = window.setInterval(pollCrew, 1200);
    return () => { live = false; window.clearInterval(timer); };
  }, [commanderProfile, simulation.dailyChallenges, simulation.completeDailyChallenge, simulation.currentEvent, simulation.queuedEvents, simulation.eventPhase, simulation.makeDecision, simulation.abandonEvent, showCrewNotification]);
  useEffect(() => () => window.clearTimeout(crewNotificationTimerRef.current), []);
  useEffect(() => {
    if (!storyMoment && storyRewardDay === null && !archiveOpen && !iceSampleOpen && !radioOpen && !noorCall) return undefined;
    simulation.setStoryPaused(true);
    return () => simulation.setStoryPaused(false);
  }, [simulation.setStoryPaused, storyMoment, storyRewardDay, archiveOpen, iceSampleOpen, radioOpen, noorCall]);

  useEffect(() => {
    const reportDay = simulation.dayPhase === 'report' ? simulation.dayReport?.day : null;
    if (reportDay === null || reportDay === undefined) {
      setDayReportReadyDay(null);
      return undefined;
    }
    let cancelled = false;
    let timerId;
    setDayReportReadyDay(null);
    const waitForLumi = () => {
      if (cancelled) return;
      if (taskRecapSpeaking || lumiSpeechInProgress || lumiSpeechActiveRef.current || lumiSpeechQueueRef.current.length > 0 || window.speechSynthesis?.speaking) {
        timerId = window.setTimeout(waitForLumi, 100);
        return;
      }
      setDayReportReadyDay(reportDay);
    };
    timerId = window.setTimeout(waitForLumi, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [simulation.dayPhase, simulation.dayReport?.day, taskRecapSpeaking, lumiSpeechInProgress]);

  useEffect(() => {
    if (simulation.dayPhase === 'active' && dayStartClockRef.current.day !== simulation.day) {
      dayStartClockRef.current = { day: simulation.day, at: Date.now() };
    }
  }, [simulation.day, simulation.dayPhase]);

  useEffect(() => {
    const jobs = simulation.dailyChallenges;
    if (!jobs.length || jobs.some((task) => task.status !== 'completed') || rewardedStoryDayRef.current === simulation.day || taskRecapSpeaking) return;
    const reportIsReady = simulation.dayPhase === 'report';
    if ((!reportIsReady && simulation.dayPhase !== 'active') || simulation.currentEvent || simulation.queuedEvents.length || noorCall || storyMoment || (!reportIsReady && taskExperienceId) || eventOptionsOpen || simulation.warningTaskId || lumiSpeechInProgress || lumiSpeechActiveRef.current || lumiSpeechQueueRef.current.length > 0 || window.speechSynthesis?.speaking) return;
    rewardedStoryDayRef.current = simulation.day;
    setLumiMilestoneMessage('You are amazing, Commander! You finished every job today! I’m so proud of you. You kept the outpost safer, learned new things, and earned story time with me!');
    setStoryRewardDay(simulation.day);
  }, [simulation.dailyChallenges, simulation.day, simulation.dayPhase, simulation.currentEvent, simulation.queuedEvents, noorCall, storyMoment, taskExperienceId, eventOptionsOpen, simulation.warningTaskId, taskRecapSpeaking, lumiSpeechInProgress]);
  useEffect(() => {
    if (simulation.dayPhase !== 'transition' || shownStoryDayRef.current === simulation.day) return;
    shownStoryDayRef.current = simulation.day;
    const chapter = STORY_CHAPTERS.find((entry) => entry.firstDay === simulation.day);
    const beat = STORY_DAY_BEATS[simulation.day];
    if (!chapter && !beat) return;
    let beatText = beat?.text ?? '';
    if (simulation.day === 13 && simulation.collectedIceSamples.length === 0
      && !simulation.eventOutcomeHistory.some((entry) => entry.status === 'resolved' && /ice/i.test(`${entry.eventId} ${entry.eventName}`))) {
      beatText = 'The crater readings are not clear yet. Keep observing and collecting samples so we can check the ice clues.';
    }
    if (!chapter && beat) {
      pendingDayBeatRef.current = beatText;
      simulation.addMissionLogEntry(`Day ${simulation.day}: ${beatText}`, 'Story');
      return;
    }
    const character = chapter ? 'noor' : beat?.character ?? 'noor';
    setStoryMoment({
      character,
      eyebrow: chapter ? `CHAPTER ${chapter.id} · DAYS ${chapter.firstDay}–${chapter.lastDay}` : undefined,
      title: chapter ? chapter.title : `Day ${simulation.day} update`,
      text: chapter ? chapter.introduction : beatText,
      extra: chapter && beatText ? beatText : '',
    });
    simulation.addMissionLogEntry(`Day ${simulation.day}: ${chapter ? `Chapter ${chapter.id} — ${chapter.title} began.` : beatText}`, 'Story');
  }, [simulation.day, simulation.dayPhase, simulation.collectedIceSamples.length, simulation.eventOutcomeHistory, simulation.addMissionLogEntry]);
  useEffect(() => {
    if (!insidePanel.visible || !insidePanel.componentId || taskExperienceId || simulation.eventPhase !== 'idle') return;
    const locationId = insidePanel.componentId;
    if (simulation.visitedLocationIds.includes(locationId)) return;
    const name = insidePanel.label.replace(/^INSIDE\s+/i, '').split(/\s*[·|]\s*/)[0].trim();
    const card = LOCATION_STORY_CARDS[locationId] ?? {
      name: name || 'Outpost location',
      what: `${name || 'This area'} is part of your lunar outpost.`,
      why: 'Keeping each area ready helps the whole base work safely.',
      fact: 'Every part of a Moon base must work together because help is far away.',
    };
    simulation.markLocationVisited(locationId, card.name);
    setStoryMoment({ character: 'lumi', eyebrow: 'LOCATION DISCOVERED · LUMI', title: card.name, location: card });
  }, [insidePanel.visible, insidePanel.componentId, insidePanel.label, taskExperienceId, simulation.eventPhase, simulation.visitedLocationIds, simulation.markLocationVisited]);
  useEffect(() => {
    const iceDataFound = simulation.collectedIceSamples.length > 0
      || simulation.eventOutcomeHistory.some((entry) => entry.status === 'resolved' && /ice/i.test(`${entry.eventId} ${entry.eventName}`));
    const newlyAvailable = SCIENCE_DISCOVERIES.filter((entry) => (
      !simulation.scienceNotebookIds.includes(entry.id)
      && simulation.day >= entry.day
      && simulation.resources.science >= entry.science
      && (entry.id !== 'water-ice' || iceDataFound)
    ));
    newlyAvailable.forEach((entry) => simulation.unlockScienceDiscovery(entry.id, entry.title));
    if (newlyAvailable.length) {
      newlyAvailable.forEach((entry) => {
        if (queuedScienceIdsRef.current.has(entry.id)) return;
        queuedScienceIdsRef.current.add(entry.id);
        pendingScienceTitlesRef.current.push(entry.title);
      });
    }
  }, [simulation.day, simulation.resources.science, simulation.scienceNotebookIds, simulation.collectedIceSamples, simulation.eventOutcomeHistory, simulation.unlockScienceDiscovery]);
  useEffect(() => {
    if (isLoading || !simulation.sceneReady || simulation.dayPhase !== 'active' || !pendingScienceTitlesRef.current.length) return undefined;
    if (dayOpeningStartedRef.current === simulation.day && dayOpeningCompleteRef.current !== simulation.day) return undefined;
    const timeout = window.setTimeout(() => {
      const titles = pendingScienceTitlesRef.current.splice(0);
      if (!titles.length) return;
      const message = createLumiDiscoveryMessage(titles);
      setLumiMilestoneMessage(message);
      speakLumi(message);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [isLoading, simulation.sceneReady, simulation.day, simulation.dayPhase, simulation.scienceNotebookIds.length, speakLumi]);
  useEffect(() => {
    if (observedTaskDayRef.current === simulation.day) return;
    observedTaskDayRef.current = simulation.day;
    setTaskJourneys({});
    setTaskExperienceId(null);
    stopLumiSpeech();
    setLumiMilestoneMessage('');
  }, [simulation.day, stopLumiSpeech]);
  const eventGameplayActive = eventPhase === 'idle' || eventPhase === 'awaitingDecision';
  const stopDayOpeningQueue = () => {
    window.clearTimeout(lumiSpeechTimerRef.current);
    setDayOpeningMessages([]);
    setDayOpeningIndex(0);
    setDayOpeningMessage('');
    dayOpeningCompleteRef.current = simulation.day;
  };
  const openTaskIdea = (challenge) => {
    if (taskJourneys[challenge.id]?.solution) {
      showTaskLocation(challenge.id);
      return;
    }
    stopDayOpeningQueue();
    startDailyChallenge(challenge.id);
    const startMessage = getTaskStartMessage(challenge);
    setLumiMilestoneMessage(startMessage);
    speakLumi(startMessage);
    setTaskExperienceId(challenge.id);
    setTaskExperienceStage('idea');
  };
  const openTaskAtLocation = (challengeId) => {
    const journey = taskJourneys[challengeId];
    setTaskExperienceId(challengeId);
    setTaskExperienceStage(journey?.solution ? 'perform' : 'discover');
  };
  const chooseTaskSolution = (challengeId, solution) => setTaskJourneys((items) => ({ ...items, [challengeId]: { ...items[challengeId], solution } }));
  const openMissionArchive = (tab) => {
    setArchiveTab(tab);
    setArchiveOpen(true);
  };
  const talkToLumi = () => {
    const resources = simulation.resources;
    const message = resources.power < 35
      ? 'Beep! Power is getting low. Let’s check today’s jobs and look after the batteries.'
      : resources.water < 35
        ? 'Drip alert, Commander! Water is running low. Let’s see if there is a water job to do.'
        : simulation.day >= 11
          ? 'Crater time! Let’s take the rover out and look for clues about Moon ice.'
          : simulation.day >= 8
            ? 'The long dark days are coming. Let’s save some power for later!'
            : 'Ready for a Moon mystery? Pick a job, follow the map, and let’s learn something new!';
    setStoryMoment({
      character: 'lumi',
      eyebrow: 'LUMI · YOUR BASE BUDDY',
      title: 'Let’s do this together!',
      text: message,
      extra: `Moon fact: ${MOON_FACTS[(simulation.day - 1) % MOON_FACTS.length]}`,
    });
  };
  const captureMissionPhoto = () => {
    try {
      const data = engineRef.current?.capturePhoto?.();
      if (!data) return;
      setPendingPhoto({ id: `photo-${Date.now()}`, day: simulation.day, data, caption: '' });
      setArchiveTab('photos');
      setArchiveOpen(true);
    } catch (error) {
      console.warn('Could not capture a Moonbase photo.', error);
    }
  };
  const saveMissionPhoto = (photo) => {
    setPhotos((items) => [{ ...photo, caption: photo.caption.trim() }, ...items]);
    setPendingPhoto(null);
  };
  const showTaskLocation = (challengeId) => {
    const challenge = simulation.dailyChallenges.find((task) => task.id === challengeId);
    if (!challenge) return;
    setTaskExperienceId(null);
    setDailyTasksOpen(false);
    setSelectedMapTaskId(challenge.id);
    setSelectedMapComponentId(challenge.targetComponentId);
    setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
    setMapOpen(true);
  };
  // Unfinished jobs assigned to this location are shown as in-world markers.
  const insideComponentTasks = insidePanel.componentId
    ? simulation.dailyChallenges.filter(
        (challenge) => challenge.targetComponentId === insidePanel.componentId
          && (challenge.status === 'available' || challenge.status === 'inProgress' || challenge.status === 'overdue'),
      )
    : [];
  const nearbyTaskMarker = taskMarkerTargets
    .filter((marker) => marker.nearby)
    .sort((a, b) => a.distance - b.distance)[0];
  const nearbyTask = nearbyTaskMarker
    ? insideComponentTasks.find((task) => task.id === nearbyTaskMarker.taskId)
    : null;
  const nearbyTaskJourney = nearbyTask ? taskJourneys[nearbyTask.id] : null;
  const nearbyTaskButtonLabel = nearbyTask?.recoveryStatus === 'available'
    ? 'Try Again'
    : nearbyTaskJourney?.solution
      ? 'Continue'
      : getTaskButtonName(nearbyTask);
  const taskMarkerSignature = insideComponentTasks
    .map((task) => `${task.id}:${task.status}:${task.recoveryStatus ?? ''}`)
    .join('|');
  const promptedChallenge = simulation.dailyChallenges.find(
    (challenge) => (challenge.status === 'available' || challenge.status === 'inProgress' || challenge.status === 'overdue')
      && challenge.targetComponentId === prompt.data?.id,
  );
  const taskActionRef = useRef(null);
  taskActionRef.current = (componentId, taskId) => {
    const challenge = taskId
      ? simulation.dailyChallenges.find((entry) => entry.id === taskId)
      : simulation.dailyChallenges.find(
        (entry) => (entry.status === 'inProgress' || entry.status === 'overdue')
          && entry.targetComponentId === componentId,
      );
    if (challenge && (challenge.status === 'inProgress' || challenge.status === 'overdue')) {
      openTaskAtLocation(challenge.id);
    }
  };
  const [consoleEdit, setConsoleEdit] = useState(false);
  const [consoleInfo, setConsoleInfo] = useState(null);
  // Wall display viewpoint scaler, only available inside the command center.
  const [displayView, setDisplayView] = useState(null);
  const [displayTunerOpen, setDisplayTunerOpen] = useState(false);
  const displayTunerVisible = displayTunerOpen
    && insidePanel.visible
    && insidePanel.componentId === '024';

  const applyDisplayView = (patch) => {
    const next = engineRef.current?.setOutpostFeedView?.(patch);
    if (next) setDisplayView(next);
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    const canvas = document.createElement('canvas');
    canvas.className = 'lunar-canvas';
    container.prepend(canvas);

    let engine = null;
    try {
      engine = createLunarEngine(canvas, {
        onLoading: (state) => setIsLoading(state.active),
        onModeChange: (mode) => setCameraMode(mode),
        onRoverReady: (ready) => setRoverReady(ready),
        onRoverCameraChange: (active, info) => {
          setRoverCameraActive(active);
          setRoverLink(active ? (info ?? null) : null);
        },
        onPromptChange: (type, data) => setPrompt({ type, data }),
        onInsidePanelChange: (panel) => setInsidePanel(panel),
        onTaskAction: (componentId, taskId) => taskActionRef.current?.(componentId, taskId),
        onTaskTimerClick: (taskId) => {
          setFocusedTaskId(taskId);
          setDailyTasksOpen(true);
        },
        onConsoleEdit: (info) => setConsoleInfo(info),
        onSceneReady: () => setSceneReady(true),
      });
    } catch (error) {
      console.error('[LunarOutpost] Engine failed to start, retry on next mount.', error);
      if (canvas.parentNode) canvas.remove();
      return undefined;
    }

    engineRef.current = engine;

    return () => {
      try {
        engine?.destroy?.();
      } catch (error) {
        console.error('[LunarOutpost] Engine destroy failed.', error);
      }
      engineRef.current = null;
      setSceneReady(false);
      if (canvas.parentNode) canvas.remove();
    };
  }, [setSceneReady]);

  useEffect(() => {
    if (alertPanelDayRef.current === simulation.day) return;
    alertPanelDayRef.current = simulation.day;
    eventOptionsEventIdRef.current = null;
    setSelectedAlertId(null);
    setEventOptionsOpen(false);
  }, [simulation.day]);

  // Press C inside the command center to open the display scaler. The pointer
  // lock has to be released so the sliders are actually clickable.
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return;
      if ((event.key || '').toLowerCase() !== 'c') return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (!insidePanel.visible || insidePanel.componentId !== '024') return;
      event.preventDefault();
      setDisplayTunerOpen((open) => {
        if (open) return false;
        // Seed the sliders from the engine's current viewpoint on open.
        const view = engineRef.current?.getOutpostFeedView?.();
        if (view) setDisplayView(view);
        if (document.pointerLockElement) document.exitPointerLock?.();
        return true;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [insidePanel.visible, insidePanel.componentId]);

  useEffect(() => {
    if (simulation.dayPhase !== 'transition') {
      dayStartCameraDayRef.current = null;
      return;
    }
    if (dayStartCameraDayRef.current === simulation.day) return;

    dayStartCameraDayRef.current = simulation.day;
    engineRef.current?.returnToOutpostOverview();
  }, [simulation.day, simulation.dayPhase]);

  useEffect(() => {
    engineRef.current?.setTaskTargets?.(
      simulation.dailyChallenges.map((challenge) => ({
        componentId: challenge.targetComponentId,
        taskId: challenge.id,
        label: challenge.actionLabel,
        status: challenge.status,
          isActive: simulation.activeChallengeId === challenge.id,
      }))
    );
  }, [simulation.dailyChallenges, simulation.activeChallengeId]);

  useEffect(() => {
    if (
      !insidePanel.visible
      || !insideComponentTasks.length
      || !taskMarkerSignature
      || simulation.gameStatus !== 'playing'
      || simulation.dayPhase !== 'active'
      || simulation.warningTaskId
      || taskExperienceId
    ) {
      setTaskMarkerTargets([]);
      engineRef.current?.hideTaskGuide?.();
      return undefined;
    }
    const allowedTaskIds = new Set(insideComponentTasks.map((task) => task.id));
    if (allowedTaskIds.size === 0) {
      setTaskMarkerTargets([]);
      return undefined;
    }
    const updateMarkers = () => {
      const next = (engineRef.current?.getTaskMarkerTargets?.() ?? [])
        .filter((marker) => allowedTaskIds.has(marker.taskId));
      setTaskMarkerTargets((current) => {
        const same = current.length === next.length && current.every((marker, index) => (
          marker.taskId === next[index]?.taskId
          && marker.nearby === next[index]?.nearby
          && Math.abs(marker.distance - next[index].distance) < 0.3
        ));
        return same ? current : next;
      });
    };
    updateMarkers();
    const intervalId = window.setInterval(updateMarkers, 80);
    return () => window.clearInterval(intervalId);
  }, [
    insidePanel.visible,
    insidePanel.componentId,
    taskMarkerSignature,
    insideComponentTasks.length,
    simulation.gameStatus,
    simulation.dayPhase,
    simulation.warningTaskId,
    taskExperienceId,
  ]);

  useEffect(() => {
    if (!dailyTasksOpen || !focusedTaskId) return;
    document.getElementById(`lunar-task-${focusedTaskId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [dailyTasksOpen, focusedTaskId]);

  useEffect(() => {
    engineRef.current?.setConsoleEditMode?.(consoleEdit);
  }, [consoleEdit]);

  // Keep interiors clean: entering a component closes the drawers, leaving
  // only the inside label, EXIT and MOVE buttons. Leaving resets console edit.
  const [prevInsidePanelVisible, setPrevInsidePanelVisible] = useState(false);
  if (prevInsidePanelVisible !== insidePanel.visible) {
    setPrevInsidePanelVisible(insidePanel.visible);
    if (insidePanel.visible) {
      setDailyTasksOpen(false);
      setStatusOpen(false);
    } else {
      setConsoleEdit(false);
    }
  }

  // Fallback: guarantee Enter works while a proximity prompt is visible,
  // even if the engine key handler missed it (e.g. focus quirks).
  useEffect(() => {
    if (!prompt.type || !['idle', 'awaitingDecision'].includes(simulation.eventPhase) || simulation.warningTaskId) return undefined;
    const onKey = (event) => {
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const key = (event.key || '').toLowerCase();
      const code = event.code || '';
      if (key !== 'enter' && code !== 'Enter' && code !== 'NumpadEnter') return;
      event.preventDefault();
      if (prompt.type === 'component') engineRef.current?.enterNearbyComponent();
      else if (prompt.type === 'airlock') engineRef.current?.enterAirlock();
      else if (prompt.type === 'greenhouseDoor') engineRef.current?.leaveGreenhouse();
      else if (prompt.type === 'roverMonitor') engineRef.current?.controlRover(prompt.data?.roverId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prompt.type, prompt.data?.roverId, simulation.eventPhase, simulation.warningTaskId]);

  // Press M to open/close the full outpost map (same gating as the map entry points).
  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return;
      if ((event.key || '').toLowerCase() !== 'm') return;
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (
        simulation.gameStatus !== 'playing'
        || simulation.warningTaskId
      ) return;
      event.preventDefault();
      if (mapOpen) {
        setMapOpen(false);
      } else {
        setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
        setMapOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    mapOpen,
    simulation.decisionHistory.length,
    simulation.gameStatus,
    simulation.warningTaskId,
  ]);

  useEffect(() => {
    if (isLoading || simulation.gameStatus !== 'playing') return undefined;

    const updateMiniSnapshot = () => {
      const nextSnapshot = engineRef.current?.getMapSnapshot() ?? null;
      if (!nextSnapshot) return;
      setMiniSnapshot((currentSnapshot) => (
        snapshotsMatch(currentSnapshot, nextSnapshot) ? currentSnapshot : nextSnapshot
      ));
    };

    updateMiniSnapshot();
    const miniIntervalId = window.setInterval(updateMiniSnapshot, 250);
    return () => window.clearInterval(miniIntervalId);
  }, [isLoading, simulation.gameStatus]);

  useEffect(() => {
    if (
      !mapOpen
      || mapOpenedAtDecisionCount !== simulation.decisionHistory.length
      || simulation.gameStatus !== 'playing'
    ) return undefined;

    const updateMapSnapshot = () => {
      const nextSnapshot = engineRef.current?.getMapSnapshot() ?? null;
      if (!nextSnapshot) return;
      setMapSnapshot((currentSnapshot) => (
        snapshotsMatch(currentSnapshot, nextSnapshot) ? currentSnapshot : nextSnapshot
      ));
    };

    updateMapSnapshot();
    const intervalId = window.setInterval(updateMapSnapshot, 200);
    return () => window.clearInterval(intervalId);
  }, [mapOpen, mapOpenedAtDecisionCount, simulation.decisionHistory.length, simulation.gameStatus]);

  useEffect(() => {
    const event = currentEvent;
    if (!event) {
      presentedEventRef.current = null;
      returningEventRef.current = null;
      eventOptionsEventIdRef.current = null;
      return;
    }
    const occurrenceId = getEventOccurrenceKey(event);

    if (eventPhase === 'pending') {
      interruptLumiForEvent();
      beginPresentation(occurrenceId);
      return;
    }

    if (
      eventPhase === 'presenting' &&
      presentedEventRef.current !== event
    ) {
      presentedEventRef.current = event;
      engineRef.current?.presentEvent(event.sourceEventId ?? event.id, occurrenceId, () => {
        completePresentation(occurrenceId);
      });
      return;
    }

    if (
      eventPhase === 'resolving' &&
      returningEventRef.current !== event
    ) {
      returningEventRef.current = event;
      engineRef.current?.returnFromEvent(occurrenceId, () => {
        completeResolution(occurrenceId);
      });
    }
  }, [
    beginPresentation,
    completePresentation,
    completeQueuedPresentation,
    completeResolution,
    currentEvent,
    eventPhase,
    interruptLumiForEvent,
  ]);

  useEffect(() => {
    simulation.queuedEvents.forEach(({ event }) => {
      const occurrenceId = getEventOccurrenceKey(event);
      if (!occurrenceId || queuedPresentationsRef.current.has(occurrenceId)) return;
      queuedPresentationsRef.current.add(occurrenceId);
      engineRef.current?.presentEvent(
        event.sourceEventId ?? event.id,
        occurrenceId,
        () => completeQueuedPresentation(occurrenceId),
      );
    });
  }, [completeQueuedPresentation, simulation.queuedEvents, simulation.sceneReady]);

  useEffect(() => {
    if (!simulation.sceneReady) return;
    simulation.endOfDayEvents.forEach((event) => {
      const occurrenceId = getEventOccurrenceKey(event);
      if (!occurrenceId || endOfDayPresentationsRef.current.has(occurrenceId)) return;
      endOfDayPresentationsRef.current.add(occurrenceId);
      engineRef.current?.presentEvent(
        event.sourceEventId ?? event.id,
        occurrenceId,
        () => simulation.presentEndOfDayTaskNotice(occurrenceId),
      );
    });
  }, [simulation.endOfDayEvents, simulation.presentEndOfDayTaskNotice, simulation.sceneReady]);

  useEffect(() => {
    const currentIds = simulation.endOfDayEvents
      .map((event) => getEventOccurrenceKey(event))
      .filter(Boolean);
    const currentSet = new Set(currentIds);
    const removedIds = previousEndOfDayPresentationIdsRef.current
      .filter((occurrenceId) => !currentSet.has(occurrenceId));
    if (removedIds.length > 0) {
      engineRef.current?.clearEventPresentations(removedIds);
      removedIds.forEach((occurrenceId) => endOfDayPresentationsRef.current.delete(occurrenceId));
    }
    previousEndOfDayPresentationIdsRef.current = currentIds;
  }, [simulation.endOfDayEvents]);

  const selectedMapTask = simulation.dailyChallenges.find(
    (challenge) => challenge.id === selectedMapTaskId,
  );
  const mapIsOpen = mapOpen
    && mapOpenedAtDecisionCount === simulation.decisionHistory.length
    && simulation.gameStatus === 'playing';
  const mapSpan = mapSnapshot
    ? Math.max(
      mapSnapshot.bounds.maxX - mapSnapshot.bounds.minX,
      mapSnapshot.bounds.maxZ - mapSnapshot.bounds.minZ,
    )
    : 1;
  const mapPadding = mapSpan * 0.09;
  const mapViewBox = mapSnapshot
    ? `${mapSnapshot.bounds.minX - mapPadding} ${-mapSnapshot.bounds.maxZ - mapPadding} ${mapSnapshot.bounds.maxX - mapSnapshot.bounds.minX + mapPadding * 2} ${mapSnapshot.bounds.maxZ - mapSnapshot.bounds.minZ + mapPadding * 2}`
    : undefined;
  const miniFitBounds = (() => {
    if (!miniSnapshot) return null;
    const base = miniSnapshot.bounds;
    const player = miniSnapshot.player;
    return {
      minX: Math.min(base.minX, player?.x ?? Number.POSITIVE_INFINITY),
      maxX: Math.max(base.maxX, player?.x ?? Number.NEGATIVE_INFINITY),
      minZ: Math.min(base.minZ, player?.z ?? Number.POSITIVE_INFINITY),
      maxZ: Math.max(base.maxZ, player?.z ?? Number.NEGATIVE_INFINITY),
    };
  })();
  const miniSpan = miniFitBounds
    ? Math.max(
      miniFitBounds.maxX - miniFitBounds.minX,
      miniFitBounds.maxZ - miniFitBounds.minZ,
    )
    : 1;
  const miniPadding = miniSpan * 0.3;
  const miniViewBox = miniFitBounds
    ? `${miniFitBounds.minX - miniPadding} ${-miniFitBounds.maxZ - miniPadding} ${miniFitBounds.maxX - miniFitBounds.minX + miniPadding * 2} ${miniFitBounds.maxZ - miniFitBounds.minZ + miniPadding * 2}`
    : undefined;
  const miniMarkerMargin = miniSpan * 0.04;
  const miniPlayerX = miniSnapshot?.player && miniFitBounds
    ? Math.min(
      Math.max(miniSnapshot.player.x, miniFitBounds.minX - miniPadding + miniMarkerMargin),
      miniFitBounds.maxX + miniPadding - miniMarkerMargin,
    )
    : 0;
  const miniPlayerZ = miniSnapshot?.player && miniFitBounds
    ? Math.min(
      Math.max(miniSnapshot.player.z, miniFitBounds.minZ - miniPadding + miniMarkerMargin),
      miniFitBounds.maxZ + miniPadding - miniMarkerMargin,
    )
    : 0;
  const showMinimap = miniSnapshot && miniViewBox
    && !isLoading
    && !mapIsOpen
    && simulation.gameStatus === 'playing';
  const systemEntries = [
    ['power', 'Power'],
    ['lifeSupport', 'Air'],
    ['water', 'Water'],
    ['equipment', 'Outpost tools'],
  ];
  const lowestSystem = systemEntries.reduce((lowest, entry) => (
    simulation.systemConditions[entry[0]] < simulation.systemConditions[lowest[0]]
      ? entry
      : lowest
  ), systemEntries[0]);
  const averageCondition = systemEntries.reduce(
    (total, [system]) => total + simulation.systemConditions[system],
    0,
  ) / systemEntries.length;
  const overdueTasks = simulation.dailyChallenges.filter((task) => task.status === 'overdue');
  const activeTask = simulation.dailyChallenges.find(
    (task) => task.status === 'inProgress' || task.status === 'overdue',
  );
  const vitalRisk = simulation.resources.power <= 20
    || simulation.resources.oxygen <= 20
    || simulation.resources.water <= 20;
  const averageVitalReserve = (
    simulation.resources.power + simulation.resources.oxygen + simulation.resources.water
  ) / 3;
  const overallReadiness = Math.max(
    0,
    Math.round(averageCondition * 0.7 + averageVitalReserve * 0.3 - overdueTasks.length * 3),
  );
  const readinessLevel = vitalRisk
    || simulation.systemConditions[lowestSystem[0]] <= 25
    || overallReadiness < 45
    ? 'Critical'
    : overdueTasks.length > 0 || overallReadiness < 75
      ? 'At Risk'
      : 'Ready';
  const readinessForecast = vitalRisk
    ? 'Some resources are very low. Protect the base and your suit.'
    : simulation.systemConditions[lowestSystem[0]] < 75
    ? `${lowestSystem[1]} may need help.`
    : overdueTasks.length > 0
      ? 'Finish late jobs to help keep the outpost safe.'
      : 'Things are going well. Keep up the regular checks.';
  const matchingSystemTask = simulation.dailyChallenges.find(
    (task) => task.affectedSystem === lowestSystem[0] && task.status !== 'completed',
  );
  const readinessRecommendation = overdueTasks[0]
    ? `Try the late job again: ${overdueTasks[0].title}.`
    : vitalRisk
      ? 'Help save power, air, and water. Start with an important job.'
      : matchingSystemTask
        ? `Try this important job: ${matchingSystemTask.title}.`
        : `Check the ${lowestSystem[1].toLowerCase()}.`;
  const incompleteTaskTitles = (simulation.dayReport?.overdueTasks ?? [])
    .map((title) => title.trim())
    .filter((title) => title.toLowerCase() !== 'base cycle service');
  const allActiveEventEntries = [
    ...(simulation.currentEvent ? [{
      event: simulation.currentEvent,
      deadlineAtMs: simulation.eventDeadlineAtMs,
      isCurrent: true,
      isPresented: simulation.eventPhase === 'awaitingDecision',
    }] : []),
    ...simulation.queuedEvents.map((entry) => ({
      event: entry.event,
      deadlineAtMs: entry.deadlineAtMs,
      isCurrent: false,
      isPresented: entry.presented,
    })),
  ];
  const activeEventEntries = allActiveEventEntries;
  useEffect(() => {
    if (eventPhase !== 'awaitingDecision' || !currentEvent) return;
    const occurrenceId = getEventOccurrenceKey(currentEvent);
    if (!occurrenceId || handledNoorCallsRef.current.has(occurrenceId)) return;
    handledNoorCallsRef.current.add(occurrenceId);
    interruptLumiForEvent();
    const callMessage = `Commander, you have a call from Dr. Noor.`;
    speakLumi(
      callMessage,
      () => { pendingNoorCallRef.current = null; },
      false,
      () => {
        playLumiMessageChime();
        pendingNoorCallRef.current = currentEvent;
        noorCallActiveRef.current = true;
        setNoorCall({ event: currentEvent, stage: 'incoming' });
      },
    );
  }, [eventPhase, currentEvent, speakLumi, interruptLumiForEvent]);
  useEffect(() => {
    simulation.eventFailureNotices.filter((notice) => (
      notice.expired && !announcedFailureNoticesRef.current.has(`event:${notice.id}`)
    )).forEach((notice) => {
      announcedFailureNoticesRef.current.add(`event:${notice.id}`);
      const message = `We ran out of time for that event. That’s okay—we can try again next time!`;
      setLumiMilestoneMessage(message);
      speakLumi(message, undefined, true);
    });
    (simulation.taskFailureNotices ?? []).filter((notice) => (
      !announcedFailureNoticesRef.current.has(`task:${notice.id}`)
    )).forEach((notice) => {
      announcedFailureNoticesRef.current.add(`task:${notice.id}`);
      const message = `We ran out of time for that critical task. That’s okay—let’s try again!`;
      setLumiMilestoneMessage(message);
      speakLumi(message, undefined, true);
    });
  }, [simulation.eventFailureNotices, simulation.taskFailureNotices, speakLumi]);
  useEffect(() => {
    if (!routeEventId) return;
    if (!activeEventEntries.some(({ event }) => getEventOccurrenceKey(event) === routeEventId)) {
      setRouteEventId(null);
    }
  }, [activeEventEntries, routeEventId]);
  useEffect(() => {
    if (activeEventEntries.length === 0) setEventAlertListOpen(false);
  }, [activeEventEntries.length]);
  useEffect(() => {
    if (!eventAlertListOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!eventAlertMenuRef.current?.contains(event.target)) setEventAlertListOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setEventAlertListOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [eventAlertListOpen]);
  useEffect(() => {
    if (!eventOptionsOpen) return;
    const selectedEventIsActive = activeEventEntries.some(
      ({ event }) => getEventOccurrenceKey(event) === selectedAlertId,
    );
    if (selectedEventIsActive) return;
    eventOptionsEventIdRef.current = null;
    setSelectedAlertId(null);
    setEventOptionsOpen(false);
  }, [activeEventEntries, eventOptionsOpen, selectedAlertId]);
  const activeEventVisuals = useMemo(() => [
    ...(simulation.currentEvent && simulation.eventPhase !== 'resolving'
      ? [{
        occurrenceId: getEventOccurrenceKey(simulation.currentEvent),
        eventId: simulation.currentEvent.sourceEventId ?? simulation.currentEvent.id,
      }]
      : []),
    ...simulation.queuedEvents.map(({ event }) => ({
      occurrenceId: getEventOccurrenceKey(event),
      eventId: event.sourceEventId ?? event.id,
    })),
    ...simulation.endOfDayEvents.map((event) => ({
      occurrenceId: getEventOccurrenceKey(event),
      eventId: event.sourceEventId ?? event.id,
    })),
  ], [simulation.currentEvent, simulation.eventPhase, simulation.queuedEvents, simulation.endOfDayEvents]);
  const activeEventPresentationIds = useMemo(() => [
    getEventOccurrenceKey(simulation.currentEvent),
    ...simulation.queuedEvents.map(({ event }) => getEventOccurrenceKey(event)),
  ].filter(Boolean), [simulation.currentEvent, simulation.queuedEvents]);
  useEffect(() => {
    engineRef.current?.setEventEffects(activeEventVisuals);
  }, [activeEventVisuals, simulation.sceneReady]);
  useEffect(() => {
    const currentIds = new Set(activeEventPresentationIds);
    const removedIds = previousEventPresentationIdsRef.current
      .filter((occurrenceId) => !currentIds.has(occurrenceId));
    if (removedIds.length > 0) {
      engineRef.current?.clearEventPresentations(removedIds);
      removedIds.forEach((occurrenceId) => queuedPresentationsRef.current.delete(occurrenceId));
    }
    previousEventPresentationIdsRef.current = activeEventPresentationIds;
  }, [activeEventPresentationIds]);
  const selectedEventEntry = activeEventEntries.find(
    ({ event }) => getEventOccurrenceKey(event) === selectedAlertId,
  ) ?? (eventOptionsOpen ? null : activeEventEntries[0] ?? null);
  const selectedEventCanDecide = Boolean(selectedEventEntry)
    && (!selectedEventEntry.isCurrent || simulation.eventPhase === 'awaitingDecision')
    && (selectedEventEntry.event.triggerSource !== 'task'
      || selectedEventEntry.isCurrent
      || simulation.queuedEvents.find(({ event }) => (
        getEventOccurrenceKey(event) === getEventOccurrenceKey(selectedEventEntry.event)
      ))?.presented === true);
  const nearbyEventComponentId = prompt.type === 'component'
    ? prompt.data?.id
    : (() => {
      const player = miniSnapshot?.player;
      if (!player || !['exterior', 'interior'].includes(player.location)) return null;
      return activeEventEntries
        .map(({ event }) => getEventLocation(event)?.componentId)
        .filter((componentId, index, componentIds) => componentId && componentIds.indexOf(componentId) === index)
        .map((componentId) => {
          const component = miniSnapshot.components?.find((entry) => entry.id === componentId);
          if (!component) return null;
          const radius = Math.max(7, Math.min(18, Math.max(
            component.maxX - component.minX,
            component.maxZ - component.minZ,
          ) * 0.55));
          return {
            componentId,
            distance: Math.hypot(player.x - component.x, player.z - component.z),
            radius,
          };
        })
        .filter((entry) => entry && entry.distance <= entry.radius)
        .sort((a, b) => a.distance - b.distance)[0]?.componentId ?? null;
    })();
  const eventsAtPromptLocation = nearbyEventComponentId
    ? activeEventEntries.filter(({ event, isCurrent, isPresented }) => (
      getEventLocation(event)?.componentId === nearbyEventComponentId
      && (isCurrent ? simulation.eventPhase === 'awaitingDecision' : isPresented)
      && !simulation.eventResolutionLocked
      && !simulation.warningTaskId
      && simulation.gameStatus === 'playing'
    ))
    : [];
  const reportChapter = simulation.dayReport
    ? STORY_CHAPTERS.find((chapter) => chapter.lastDay === simulation.dayReport.day)
    : null;
  const chapterStartDay = reportChapter?.firstDay ?? 1;
  const chapterEndDay = simulation.dayReport?.day ?? simulation.day;
  const chapterJobsFinished = reportChapter
    ? simulation.challengeHistory.filter((entry) => entry.day >= chapterStartDay && entry.day <= chapterEndDay).length
    : 0;
  const chapterProblemsFixed = reportChapter
    ? simulation.eventOutcomeHistory.filter((entry) => entry.day >= chapterStartDay && entry.day <= chapterEndDay && entry.status === 'resolved').length
    : 0;
  const criticalGuideTask = simulation.dailyChallenges.find((task) => task.priority === 'critical' && task.status !== 'completed');
  const currentGuideTask = criticalGuideTask ?? simulation.dailyChallenges.find((task) => task.status !== 'completed');
  const routeEventEntry = routeEventId
    ? activeEventEntries.find(({ event }) => getEventOccurrenceKey(event) === routeEventId)
    : null;
  const routeEventLocation = routeEventEntry ? getEventLocation(routeEventEntry.event) : null;
  const locationLabel = insidePanel.label.replace(/^INSIDE\s+/i, '').split(/\s*[·|]\s*/)[0].trim();
  let lumiGuide = {
    view: cameraMode === 'free' ? 'Outpost overview' : cameraMode === 'interior' ? `Inside ${locationLabel || 'the base'}` : 'Walking outside',
    message: lumiMilestoneMessage || dayOpeningMessage || (criticalGuideTask
      ? 'A critical task needs attention. Let’s check the task list and take care of it first.'
      : currentGuideTask
        ? 'Ready to explore? Open the task list when you want to get started.'
        : `All today’s tasks are complete. Your notebook has ${simulation.scienceNotebookIds.length} science discoveries. Take a look around when you’re ready.`),
    action: currentGuideTask ? (criticalGuideTask ? 'Open critical job' : 'Open today’s jobs') : 'Open Science Notebook',
    onAction: currentGuideTask
      ? () => { setFocusedTaskId(currentGuideTask.id); setDailyTasksOpen(true); }
      : () => openMissionArchive('notebook'),
  };
  if (routeEventEntry) {
    lumiGuide = {
      view: `Route to ${routeEventLocation?.name ?? 'the issue'}`,
      message: `Let’s go together to ${routeEventLocation?.name ?? 'the place marked on the map'}. That’s where ${routeEventEntry.event.name} needs attention.`,
      action: mapOpen ? 'Close the map' : `Show ${routeEventLocation?.name ?? 'event'} on the map`,
      onAction: () => {
        if (mapOpen) { setMapOpen(false); return; }
        setSelectedMapTaskId(null);
        setSelectedMapComponentId(routeEventLocation?.componentId ?? null);
        setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
        setMapOpen(true);
      },
    };
  } else if (mapOpen) {
    lumiGuide = { ...lumiGuide, view: 'Outpost map', action: 'Close map', onAction: () => setMapOpen(false) };
  } else if (roverCameraActive) {
    lumiGuide = { ...lumiGuide, view: 'Rover view', action: 'Back to Commander', onAction: () => engineRef.current?.toggleRoverCamera() };
  } else if (insidePanel.visible) {
    const taskAtLocation = insideComponentTasks[0];
    lumiGuide = {
      ...lumiGuide,
      view: `Inside ${locationLabel || 'the base'}`,
      action: taskAtLocation ? 'Open this job' : 'Open today’s jobs',
      onAction: taskAtLocation
        ? () => openTaskAtLocation(taskAtLocation.id)
        : () => setDailyTasksOpen(true),
    };
  } else if (prompt.type === 'component') {
    lumiGuide = {
      ...lumiGuide,
      view: 'Outside the base',
      action: 'Go inside',
      onAction: () => engineRef.current?.enterNearbyComponent(),
    };
  } else if (cameraMode === 'free') {
    lumiGuide = {
      ...lumiGuide,
      view: 'Outpost overview',
      action: 'Start walking',
      onAction: () => engineRef.current?.toggleCameraMode(),
    };
  } else if (cameraMode === 'first-person') {
    lumiGuide = {
      ...lumiGuide,
      view: 'Walking outside',
      action: currentGuideTask ? 'Open the map' : 'Open Science Notebook',
      onAction: currentGuideTask
        ? () => { setMapOpenedAtDecisionCount(simulation.decisionHistory.length); setMapOpen(true); }
        : () => openMissionArchive('notebook'),
    };
  }
  if (lumiMilestoneMessage) lumiGuide = { ...lumiGuide, message: lumiMilestoneMessage };
  const showLumiGuide = !isLoading && simulation.gameStatus === 'playing'
    && simulation.dayPhase === 'active'
    && !storyMoment && !archiveOpen && !iceSampleOpen && !radioOpen;
  useEffect(() => {
    const message = lumiGuide.message;
    if (!showLumiGuide || !message) return;
    if (previousLumiMessageRef.current && previousLumiMessageRef.current !== message) playLumiMessageChime();
    previousLumiMessageRef.current = message;
  }, [showLumiGuide, lumiGuide.message]);
  useEffect(() => {
    if (simulation.dayPhase !== 'active' || simulation.gameStatus !== 'playing'
      || isLoading || !simulation.sceneReady || dayOpeningStartedRef.current === simulation.day) return undefined;
    dayOpeningStartedRef.current = simulation.day;
    dayOpeningCompleteRef.current = null;
    setLumiMilestoneMessage('');
    const dayMessage = simulation.day === 1
      ? `We’re on Day One at ${simulation.baseName}, Commander. This is the start of our mission!`
      : `We’re on Day ${simulation.day} at ${simulation.baseName}, Commander. Let’s get started!`;
    const exploreMessage = `Come on, let’s explore the outpost and see what we can discover today!`;
    const jobs = simulation.dailyChallenges.filter((task) => task.status !== 'completed');
    const critical = jobs.find((task) => task.priority === 'critical' && task.status !== 'completed');
    const jobMessage = critical
      ? `We have ${jobs.length} tasks today. One is critical, so we need to start with that one. Let’s get going!`
      : jobs.length
        ? `We have ${jobs.length} tasks today. Let’s get started and work through them together!`
        : `We have no tasks waiting today. Let’s explore and see what we discover!`;
    const openingMessages = [dayMessage, exploreMessage];
    if (pendingDayBeatRef.current) openingMessages.push(pendingDayBeatRef.current);
    pendingDayBeatRef.current = null;
    const availableDiscoveries = pendingScienceTitlesRef.current.splice(0);
    if (availableDiscoveries.length) openingMessages.push(createLumiDiscoveryMessage(availableDiscoveries));
    openingMessages.push(jobMessage);
    setDayOpeningMessages(openingMessages);
    setDayOpeningIndex(0);
    setDayOpeningMessage(openingMessages[0]);
    return undefined;
  }, [simulation.day, simulation.dayPhase, simulation.gameStatus, simulation.sceneReady, simulation.baseName, isLoading, speakLumi]);
  useEffect(() => {
    if (simulation.dayPhase !== 'report') return;
    window.clearTimeout(lumiSpeechTimerRef.current);
    setDayOpeningMessages([]);
    setDayOpeningIndex(0);
    setDayOpeningMessage('');
  }, [simulation.dayPhase]);
  useEffect(() => {
    if (!dayOpeningMessages.length || dayOpeningIndex >= dayOpeningMessages.length) return undefined;
    const currentMessage = dayOpeningMessages[dayOpeningIndex];
    let cancelled = false;
    const advance = () => {
      if (cancelled) return;
      if (pendingNoorCallRef.current || noorCallActiveRef.current) {
        lumiSpeechTimerRef.current = window.setTimeout(advance, 300);
        return;
      }
      const nextIndex = dayOpeningIndex + 1;
      if (nextIndex < dayOpeningMessages.length) {
        setDayOpeningIndex(nextIndex);
        setDayOpeningMessage(dayOpeningMessages[nextIndex]);
        return;
      }
      const discoveries = pendingScienceTitlesRef.current.splice(0);
      if (discoveries.length) {
        setDayOpeningMessages((messages) => [...messages, createLumiDiscoveryMessage(discoveries)]);
        setDayOpeningIndex(nextIndex);
        return;
      }
      dayOpeningCompleteRef.current = simulation.day;
      setDayOpeningMessages([]);
      setDayOpeningIndex(0);
      setDayOpeningMessage('');
    };
    speakLumi(currentMessage, () => {
      lumiSpeechTimerRef.current = window.setTimeout(advance, 1000);
    });
    return () => {
      cancelled = true;
      window.clearTimeout(lumiSpeechTimerRef.current);
    };
  }, [dayOpeningMessages, dayOpeningIndex, simulation.day, speakLumi, lumiVoiceEnabled]);
  const toggleLumiVoice = () => {
    const next = !lumiVoiceEnabled;
    lumiVoiceEnabledRef.current = next;
    setLumiVoiceEnabled(next);
    if (!next) stopLumiSpeech();
  };
  const openEventAtLocation = (event) => {
    const occurrenceId = getEventOccurrenceKey(event);
    if (!occurrenceId || simulation.eventResolutionLocked) return;
    eventOptionsEventIdRef.current = occurrenceId;
    setSelectedAlertId(occurrenceId);
    setMapOpen(false);
    setDailyTasksOpen(false);
    setEventOptionsOpen(true);
  };
  const handleEventDecision = async (decision, occurrenceId) => {
    if (!commanderProfile?.multiplayer || !commanderProfile.roomCode) {
      simulation.makeDecision(decision, occurrenceId);
      return;
    }
    try {
      const response = await fetchLocalNetwork(`${MULTIPLAYER_API}/api/rooms/${encodeURIComponent(commanderProfile.roomCode)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: commanderProfile.playerId,
          occurrenceId,
          eventName: [simulation.currentEvent, ...simulation.queuedEvents.map((entry) => entry.event)]
            .find((entry) => getEventOccurrenceKey(entry) === occurrenceId)?.name || 'Mission event',
          decisionId: decision.id,
          decisionLabel: decision.label,
        }),
      });
      if (!response.ok) throw new Error('The crew relay did not accept the event decision.');
      const { event: sharedDecision } = await response.json();
      const sourceEvent = [simulation.currentEvent, ...simulation.queuedEvents.map((entry) => entry.event)]
        .find((entry) => getEventOccurrenceKey(entry) === occurrenceId);
      if (sharedDecision.type === 'event-abandoned') {
        simulation.abandonEvent(occurrenceId);
        if (sharedDecision.playerId !== commanderProfile.playerId) {
          showCrewNotification(sharedDecision.id, `${sharedDecision.playerName} closed ${sharedDecision.eventName}`);
        }
        return;
      }
      const agreedDecision = sourceEvent?.decisions.find((entry) => entry.id === sharedDecision.decisionId);
      if (sharedDecision.playerId !== commanderProfile.playerId) {
        showCrewNotification(sharedDecision.id, `${sharedDecision.playerName} chose “${sharedDecision.decisionLabel}” for ${sharedDecision.eventName}`);
      }
      if (agreedDecision) simulation.makeDecision(agreedDecision, occurrenceId);
    } catch {
      simulation.makeDecision(decision, occurrenceId);
    }
  };
  const handleEventAbandon = async (occurrenceId) => {
    if (!commanderProfile?.multiplayer || !commanderProfile.roomCode) {
      simulation.abandonEvent(occurrenceId);
      return;
    }
    try {
      const response = await fetchLocalNetwork(`${MULTIPLAYER_API}/api/rooms/${encodeURIComponent(commanderProfile.roomCode)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: commanderProfile.playerId,
          occurrenceId,
          outcome: 'abandoned',
          eventName: [simulation.currentEvent, ...simulation.queuedEvents.map((entry) => entry.event)]
            .find((entry) => getEventOccurrenceKey(entry) === occurrenceId)?.name || 'Mission event',
        }),
      });
      if (!response.ok) throw new Error('The crew relay did not accept the event resolution.');
      const { event: resolution } = await response.json();
      if (resolution.type === 'event-decision') {
        const sourceEvent = [simulation.currentEvent, ...simulation.queuedEvents.map((entry) => entry.event)]
          .find((entry) => getEventOccurrenceKey(entry) === occurrenceId);
        const agreedDecision = sourceEvent?.decisions.find((entry) => entry.id === resolution.decisionId);
        if (agreedDecision) simulation.makeDecision(agreedDecision, occurrenceId);
      } else {
        simulation.abandonEvent(occurrenceId);
      }
    } catch {
      simulation.abandonEvent(occurrenceId);
    }
  };
  return (
    <div
      className={`lunar-root${insidePanel.visible ? ' is-inside' : ''}`}
      ref={containerRef}
    >
      <div className="lunar-grain" />
      <div className="lunar-shade" />
      {crewTaskNotification && <div key={crewTaskNotification.id} className="lunar-crew-task-notification" role="status" aria-live="polite">{crewTaskNotification.message}</div>}
      {simulation.day >= 8 && simulation.day < 10 && simulation.dayPhase === 'active' && <div className="lunar-story-night-overlay" aria-hidden="true" />}
      {simulation.day === 10 && simulation.dayPhase === 'active' && <div className="lunar-story-sunrise-overlay" aria-hidden="true" />}
    {activeEventVisuals.some(({ eventId }) => eventId === 'lunar_night') && (
      <div className="lunar-night-overlay" aria-hidden="true" />
    )}

      {/* Simple Loading Indicator */}
      {isLoading && (
        <div className="lunar-simple-loader">
          <div className="lunar-simple-spinner" />
          <span>LOADING LUNAR OUTPOST...</span>
        </div>
      )}

      {showLumiGuide && (
        <aside className={`lunar-lumi-guide${lumiGuideCollapsed ? ' is-collapsed' : ''}${noorCall ? ' is-call-active' : eventOptionsOpen || eventPhase !== 'idle' ? ' is-event-active' : ''}`} aria-live="polite" aria-label="Lumi's gameplay guide">
          <header><div className="lunar-lumi-guide-avatar" aria-hidden="true"><svg className="lunar-lumi-robot-icon" viewBox="0 0 48 56"><path d="M24 5v5" stroke="#91efd1" strokeWidth="2.5" strokeLinecap="round"/><circle cx="24" cy="4" r="2.5" fill="#67d8b7" stroke="#c9ffed" strokeWidth="1"/><path d="M8 21H6a3 3 0 0 0 0 6h2m32-6h2a3 3 0 0 1 0 6h-2" fill="none" stroke="#78d9bc" strokeWidth="2.5"/><rect x="9" y="12" width="30" height="26" rx="8" fill="#c9f6e8" stroke="#ecfff7" strokeWidth="1.5"/><rect x="13" y="16" width="22" height="17" rx="5" fill="#153744"/><circle cx="19" cy="23" r="1.8" fill="#a4ffe0"/><circle cx="29" cy="23" r="1.8" fill="#a4ffe0"/><path d="M20 28q4 3 8 0" fill="none" stroke="#62d8b5" strokeWidth="1.5" strokeLinecap="round"/><path d="M21 38v3m6-3v3" stroke="#9cebd4" strokeWidth="2.5" strokeLinecap="round"/><rect x="13" y="41" width="22" height="11" rx="5" fill="#80d8be" stroke="#c9ffed" strokeWidth="1.5"/><circle cx="24" cy="46.5" r="2" fill="#236c68"/><path d="M16 52v2m16-2v2" stroke="#9cebd4" strokeWidth="2.5" strokeLinecap="round"/></svg></div><div><strong>Lumi</strong><small>Day {simulation.day} · {lumiGuide.view}</small></div><button type="button" className="lunar-lumi-guide-replay" aria-label="Hear Lumi say that again" title="Hear Lumi again" onClick={() => speakLumi(lumiGuide.message)}>Hear</button><button type="button" className="lunar-lumi-guide-voice-toggle" aria-pressed={!lumiVoiceEnabled} aria-label={lumiVoiceEnabled ? 'Mute Lumi' : 'Let Lumi speak'} onClick={toggleLumiVoice}>{lumiVoiceEnabled ? 'Mute' : 'Talk'}</button><button type="button" aria-label={lumiGuideCollapsed ? 'Expand Lumi guide' : 'Collapse Lumi guide'} aria-expanded={!lumiGuideCollapsed} onClick={() => setLumiGuideCollapsed((collapsed) => !collapsed)}>{lumiGuideCollapsed ? '+' : '−'}</button></header>
          {!lumiGuideCollapsed && <><div className="lunar-lumi-guide-message"><p>{lumiGuide.message}</p></div><button type="button" className="lunar-lumi-guide-action" onClick={lumiGuide.onAction}>{lumiGuide.action}<span aria-hidden="true">→</span></button>{!lumiVoiceSupported && <small className="lunar-lumi-voice-note">Audio voice is unavailable in this browser.</small>}</>}
        </aside>
      )}

      {/* Crosshair in First Person / interior - needed to aim at the task console */}
      {(cameraMode === 'interior' || (eventGameplayActive && !insidePanel.visible)) && (
        <div className="lunar-crosshair" />
      )}

      {/* Clean HUD: Mission Control & Camera Mode Toggle */}
      <div className="lunar-hud-clean">
        {onExitToOrbit && (
          <button
            type="button"
            className="lunar-orbit-btn"
            onClick={onExitToOrbit}
            title="Return to Mission Control"
          >
            <span>←</span> MISSION CONTROL
          </button>
        )}

        <div className="lunar-mission-status" aria-live="polite">
          <span className="lunar-status-dot" />
          <span>Day {simulation.day} of {simulation.maxDays}</span>
          <span className="lunar-status-divider">·</span>
          <span className="lunar-day-countdown" aria-label="Time left today">Ends in {formatRemainingTime(simulation.dayRemainingMs)}</span>
          <span className="lunar-status-divider">·</span>
          <span>{simulation.dayPhase === 'closing' || simulation.dayPhase === 'report' ? '24:00' : simulation.timeOfDay} Moon time</span>
          <span className="lunar-status-divider">·</span>
          <span>{simulation.remainingDays} days left</span>
          <span className="lunar-status-divider">·</span>
          <span>
            {simulation.warningTaskId
                  ? 'Paused for a choice'
              : simulation.isPaused
                ? 'Paused for a choice'
                : simulation.gameStatus === 'playing'
                  ? readinessLevel === 'Ready' ? 'All good' : readinessLevel === 'At Risk' ? 'Needs care' : 'Needs help'
                  : 'Mission ended'}
          </span>
        </div>


        <div className="lunar-actions-group">
          <button type="button" className="lunar-story-archive-button" onClick={() => openMissionArchive('notebook')}>
            Science Notebook <span>{simulation.scienceNotebookIds.length}/{SCIENCE_DISCOVERIES.length}</span>
          </button>
          <button type="button" className="lunar-story-photo-button" onClick={() => openMissionArchive('photos')}>Photo Mode</button>
          <button type="button" className="lunar-story-lumi-button" onClick={talkToLumi}>Talk to Lumi</button>
          {roverCameraActive && simulation.day >= 12 && (
            <button type="button" className="lunar-story-sample-button" onClick={() => setIceSampleOpen(true)}>Collect Sample</button>
          )}
          {activeEventEntries.length > 0 && (
            <div className="lunar-event-alert-menu-anchor" ref={eventAlertMenuRef}>
              <button
                type="button"
                className="lunar-event-alert-button lunar-event-alert-counter"
                aria-expanded={eventAlertListOpen}
                aria-haspopup="true"
                aria-controls="lunar-active-event-list"
                onClick={() => setEventAlertListOpen((open) => !open)}
              >
                <span className="lunar-event-alert-pulse" aria-hidden="true" />
                {activeEventEntries.length} {activeEventEntries.length === 1 ? 'Problem' : 'Problems'}
              </button>
              {eventAlertListOpen && (
                <div className="lunar-event-alert-dropdown" id="lunar-active-event-list" role="status" aria-label="Active events">
                  <div className="lunar-event-alert-dropdown-header">
                    <div>
                      <strong>Outpost problems</strong>
                      <small>Choose a problem to help fix it</small>
                    </div>
                    <span>{activeEventEntries.length} ACTIVE</span>
                  </div>
                  <div className="lunar-event-alert-dropdown-list" role="list">
                    {activeEventEntries.map(({ event }) => {
                      const location = getEventLocation(event);
                      return (
                        <div className="lunar-event-alert-dropdown-item" key={getEventOccurrenceKey(event)} role="listitem">
                          <span className="lunar-event-alert-item-marker" aria-hidden="true" />
                          <div>
                            <strong>{event.name}</strong>
                            <small><span>At</span>{location?.name ?? 'Outpost'}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
          {!insidePanel.visible && (
            <>
              <button
                type="button"
                className="lunar-btn lunar-status-toggle"
                aria-expanded={dailyTasksOpen}
                aria-controls="lunar-daily-tasks"
                disabled={simulation.gameStatus !== 'playing' || simulation.dayPhase !== 'active'}
                onClick={() => setDailyTasksOpen((open) => !open)}
              >
                Today’s jobs
                {simulation.dailyChallenges.some((task) => (
                  task.priority === 'critical' && task.status !== 'completed'
                )) && (
                  <span className="lunar-critical-task-indicator" aria-label="Critical task requires attention">
                    Help first
                  </span>
                )}
              </button>
              <button
                type="button"
                className="lunar-btn lunar-status-toggle"
                aria-expanded={statusOpen}
                aria-controls="lunar-status-drawer"
                disabled={simulation.dayPhase !== 'active'}
                onClick={() => setStatusOpen((open) => !open)}
              >
                 Resources
              </button>
            </>
          )}
          {insidePanel.visible ? (
            <div className="lunar-inside-panel">
              <span>{insidePanel.label}</span>
              {nearbyTask && (
                <button
                  type="button"
                  className="lunar-inside-action-button lunar-task-entry-button"
                  title={nearbyTask.title}
                  aria-label={nearbyTask.recoveryStatus === 'available' ? 'Try Again' : nearbyTaskJourney?.solution ? 'Continue' : getTaskButtonName(nearbyTask)}
                  onClick={() => {
                    if (nearbyTask.recoveryStatus === 'available') {
                      simulation.startCriticalTaskRecovery(nearbyTask.id);
                      setTaskJourneys((items) => { const next = { ...items }; delete next[nearbyTask.id]; return next; });
                      const retryMessage = `Let’s try this critical task again at ${nearbyTask.targetComponentName}. We have 45 seconds to finish it!`;
                      setLumiMilestoneMessage(retryMessage);
                      speakLumi(retryMessage);
                      setTaskExperienceId(nearbyTask.id);
                      setTaskExperienceStage('solutions');
                      return;
                    }
                    if (nearbyTask.status === 'available') {
                      stopDayOpeningQueue();
                      simulation.startDailyChallenge(nearbyTask.id);
                      const startMessage = getTaskStartMessage(nearbyTask);
                      setLumiMilestoneMessage(startMessage);
                      speakLumi(startMessage);
                      setTaskExperienceId(nearbyTask.id);
                      setTaskExperienceStage('idea');
                      return;
                    }
                    openTaskAtLocation(nearbyTask.id);
                  }}
                >
                  {nearbyTaskButtonLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => engineRef.current?.exitAirlock()}
              >
                {insidePanel.buttonText || 'EXIT'}
              </button>
              {insidePanel.componentId === '017' && <button type="button" className="lunar-inside-action-button lunar-radio-call-button" onClick={() => setRadioOpen(true)}>Call Earth</button>}
              <button
                type="button"
                className={consoleEdit ? 'lunar-console-edit-active' : ''}
                title="Move / resize the task console"
                onClick={() => setConsoleEdit((editing) => !editing)}
              >
                {consoleEdit ? 'DONE' : 'MOVE'}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`lunar-btn ${cameraMode === 'first-person' ? 'active' : ''}`}
                disabled={roverCameraActive || !['idle', 'awaitingDecision'].includes(simulation.eventPhase) || simulation.gameStatus !== 'playing'}
                onClick={() => engineRef.current?.toggleCameraMode()}
              >
                {cameraMode === 'free' ? 'Walk around' : 'Look around'}
              </button>
              <button
                type="button"
                className={`lunar-btn ${roverCameraActive ? 'active' : ''}`}
                aria-pressed={roverCameraActive}
                disabled={!roverCameraActive && (!roverReady || cameraMode === 'interior' || !eventGameplayActive || simulation.gameStatus !== 'playing')}
                onClick={() => engineRef.current?.toggleRoverCamera()}
                title={
                  roverCameraActive
                    ? (roverLink?.remote
                      ? `Disconnect the ${roverLink.roverLabel} downlink and return to the command center`
                      : 'Switch back to the player view')
                    : 'Switch between player view and rover follow camera'
                }
              >
                {roverCameraActive
                  ? (roverLink?.remote ? 'Back to base' : 'Back to commander')
                  : roverReady ? 'Drive rover' : 'Rover getting ready'}
              </button>
            </>
          )}
        </div>
      </div>

      {simulation.dayPhase === 'active' && (
        <aside className={`lunar-countdown-panel${statusOpen ? ' is-status-open' : ''}${simulation.currentEvent?.triggerSource === 'task' ? ' is-task-event' : ''}`} aria-label="Active task and event timers">
          {simulation.dailyChallenges
            .filter((task) => task.status === 'inProgress' && task.urgentDeadlineAtMs !== null)
            .map((task) => (
              <button
                type="button"
                className="lunar-countdown-item lunar-countdown-task"
                key={task.id}
                disabled={simulation.gameStatus !== 'playing'}
                onClick={() => {
                  setFocusedTaskId(task.id);
                  setDailyTasksOpen(true);
                }}
              >
                <span className="lunar-countdown-kind">Current job</span>
                <span className="lunar-countdown-title">{task.title}</span>
                <strong className="lunar-countdown-time">
                  {formatRemainingTime(Math.max(0, task.urgentDeadlineAtMs - simulation.campaignElapsedMs))}
                </strong>
              </button>
            ))}
          {simulation.dailyChallenges
            .filter((task) => task.recoveryStatus === 'active' && task.recoveryDeadlineAtMs !== null)
            .map((task) => (
              <button
                type="button"
                className="lunar-countdown-item lunar-countdown-task"
                key={`recovery-${task.id}`}
                onClick={() => {
                  setFocusedTaskId(task.id);
                  setDailyTasksOpen(true);
                }}
              >
                <span className="lunar-countdown-kind">Try-again job</span>
                <span className="lunar-countdown-title">{task.title}</span>
                <strong className="lunar-countdown-time">
                  {formatRemainingTime(Math.max(0, task.recoveryDeadlineAtMs - simulation.campaignElapsedMs))}
                </strong>
              </button>
            ))}
            {activeEventEntries
            .filter(({ deadlineAtMs }) => deadlineAtMs !== null)
            .map(({ event, deadlineAtMs }) => (
              <div
                className="lunar-countdown-item lunar-countdown-event"
                key={getEventOccurrenceKey(event)}
              >
                <span className="lunar-countdown-kind">Problem timer</span>
                <span className="lunar-countdown-title">{event.name}</span>
                <strong className="lunar-countdown-time">
                  {formatRemainingTime(Math.max(0, deadlineAtMs - simulation.campaignElapsedMs))}
                </strong>
              </div>
            ))}
        </aside>
      )}

      {(cameraMode !== 'interior' || roverCameraActive) && (
        <div className="lunar-rover-help" role="note" aria-label="Rover keyboard controls">
          {roverCameraActive ? (
            <>
              <strong>{roverLink?.roverLabel || 'ROVER'}{roverLink?.remote ? ' · REMOTE LINK' : ''}</strong>
              <span>DRAG MOUSE TO ORBIT</span>
              <span>SCROLL TO ZOOM</span>
              <span><kbd>↑</kbd>/<kbd>W</kbd> DRIVE</span>
              <span><kbd>←</kbd> <kbd>→</kbd> STEER</span>
              <span><kbd>↓</kbd>/<kbd>S</kbd> REVERSE</span>
              <span><kbd>V</kbd> {roverLink?.remote ? 'RETURN TO COMMAND CENTER' : 'PLAYER CAMERA'}</span>
            </>
          ) : (
            <span>PLAYER CAMERA · ARROWS MOVE PLAYER · PRESS V OR SELECT ROVER CAMERA TO DRIVE</span>
          )}
        </div>
      )}

      {import.meta.env.DEV && (
        <details className="lunar-event-test-tools">
          <summary>TEST TASK ↔ EVENT LINKS</summary>
          {TASK_EVENT_TESTS.map(([challengeId, taskLabel, eventLabel]) => (
            <div className="lunar-event-test-row" key={challengeId}>
              <span>{taskLabel} / {eventLabel}</span>
              <button
                type="button"
                disabled={simulation.gameStatus !== 'playing' || Boolean(simulation.currentEvent) || Boolean(simulation.warningTaskId)}
                onClick={() => simulation.testTaskEventTrigger(challengeId)}
              >
                TEST OVERDUE TRIGGER
              </button>
              <button
                type="button"
                disabled={simulation.gameStatus !== 'playing' || Boolean(simulation.currentEvent) || Boolean(simulation.warningTaskId)}
                onClick={() => simulation.testTaskEventPrevention(challengeId)}
              >
                TEST COMPLETION BLOCK
              </button>
            </div>
          ))}
        </details>
      )}

      {/* Task console editor (positioning only, no coordinates) */}
      {consoleEdit && insidePanel.visible && (
        <div className="lunar-console-editor" role="status" aria-label="Task console position editor">
          <div className="lunar-console-editor-title">
            <span>CONSOLE · {consoleInfo?.kind ? consoleInfo.kind.toUpperCase() : ''}</span>
          </div>
          <small>Drag to move the button · scroll to resize · saved automatically</small>
          <button
            type="button"
            onClick={() => engineRef.current?.resetConsolePlacement?.()}
          >
            RESET POSITION
          </button>
        </div>
      )}

      {/* Wall display scaler — command center only, toggled with C */}
      {displayTunerVisible && displayView && (
        <aside className="lunar-display-tuner" aria-label="Wall display scaler">
          <header>
            <span>DISPLAY VIEW</span>
            <button type="button" onClick={() => setDisplayTunerOpen(false)}>CLOSE</button>
          </header>
          <label>
            <span>AZIMUTH</span>
            <input
              type="range"
              min="0"
              max="360"
              step="1"
              value={Math.round(displayView.azimuthDeg)}
              onChange={(event) => applyDisplayView({ azimuthDeg: Number(event.target.value) })}
            />
            <b>{Math.round(displayView.azimuthDeg)}°</b>
          </label>
          <label>
            <span>ELEVATION</span>
            <input
              type="range"
              min="2"
              max="88"
              step="1"
              value={Math.round(displayView.elevationDeg)}
              onChange={(event) => applyDisplayView({ elevationDeg: Number(event.target.value) })}
            />
            <b>{Math.round(displayView.elevationDeg)}°</b>
          </label>
          <label>
            <span>LENS</span>
            <input
              type="range"
              min="15"
              max="90"
              step="1"
              value={Math.round(displayView.fov)}
              onChange={(event) => applyDisplayView({ fov: Number(event.target.value) })}
            />
            <b>{Math.round(displayView.fov)}°</b>
          </label>
          <footer>
            <button
              type="button"
              onClick={() => {
                const next = engineRef.current?.resetOutpostFeedView?.();
                if (next) setDisplayView(next);
              }}
            >
              RESET VIEW
            </button>
            <small>Press <kbd>C</kbd> to close · click the view to look around</small>
          </footer>
        </aside>
      )}

      {/* Live opacity minimap - top-left under Mission Control, realtime player tracking */}
      {showMinimap && (
        <div
          className="lunar-minimap"
          role="button"
          tabIndex={0}
          title="Open full outpost map (M)"
          aria-label="Live outpost minimap. Activate or press M to open the full map."
          onClick={() => {
            setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
            setMapOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
              setMapOpen(true);
            }
          }}
        >          <div className="lunar-minimap-header">
            <span>LIVE MAP</span>
            <i className={miniSnapshot.player ? 'on' : 'off'} />
          </div>
          <svg className="lunar-minimap-svg" viewBox={miniViewBox} aria-hidden="true">
            {miniSnapshot.components.map((component) => {
              const x = (component.minX + component.maxX) / 2;
              const y = -(component.minZ + component.maxZ) / 2;
              const width = Math.max(component.maxX - component.minX, miniSpan * 0.035);
              const height = Math.max(component.maxZ - component.minZ, miniSpan * 0.035);
              const task = simulation.dailyChallenges.find(
                (challenge) => challenge.targetComponentId === component.id
                  && (challenge.status === 'inProgress' || challenge.status === 'overdue'),
              );
              const eventsAtComponent = activeEventEntries.filter(({ event }) => (
                getEventLocation(event)?.componentId === component.id
              ));
              return (
                <g key={component.id} className={`lunar-minimap-component lunar-minimap-${component.category}`}>
                  {component.category === 'equipment' ? (
                    <circle cx={x} cy={y} r={Math.max(miniSpan * 0.028, 1.1)} className="lunar-minimap-equipment" />
                  ) : (
                    <rect
                      x={x - width / 2}
                      y={y - height / 2}
                      width={width}
                      height={height}
                      rx={Math.max(miniSpan * 0.008, 0.35)}
                      className="lunar-minimap-footprint"
                    />
                  )}
                  {component.category !== 'equipment' && (
                    <text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(miniSpan * 0.035, 1)}
                      textLength={Math.max(2, Math.min(miniSpan * 0.22, component.name.length * miniSpan * 0.016))}
                      lengthAdjust="spacingAndGlyphs"
                      className="lunar-minimap-room-label"
                    >
                      {component.name}
                    </text>
                  )}
                  {task && (
                    <circle cx={x} cy={y} r={miniSpan * 0.02} className="lunar-minimap-task-dot" />
                  )}
                  {eventsAtComponent.map(({ event }, index) => {
                    const anchorX = component.category === 'equipment' ? x : x + width / 2;
                    const anchorY = component.category === 'equipment' ? y : y - height / 2;
                    const markerStep = Math.max(miniSpan * 0.04, 1.6);
                    const markerRadius = Math.max(miniSpan * 0.022, 1.15);
                    const markerX = anchorX + markerRadius * 1.2 + index * markerStep;
                    const markerY = anchorY - markerRadius * 1.2;
                    return (
                      <g
                        className="lunar-minimap-event-marker"
                        key={getEventOccurrenceKey(event)}
                        transform={`translate(${markerX} ${markerY})`}
                      >
                        <title>{event.name} · Location: {getEventLocation(event)?.name ?? 'Outpost'}</title>
                        <circle r={markerRadius} />
                        <text textAnchor="middle" dominantBaseline="central" fontSize={markerRadius * 1.4}>!</text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {miniSnapshot.rovers?.map((rover) => (
              <g
                key={`rover-${rover.id}`}
                className="lunar-minimap-rover"
                transform={`translate(${rover.x} ${-rover.z})`}
                style={{ color: rover.tint }}
              >
                <title>{rover.label} · x {Math.round(rover.x)} · z {Math.round(rover.z)}</title>
                <circle r={miniSpan * 0.045} className="lunar-minimap-rover-halo" />
                <path
                  d="M 0 -1.7 L 1.15 0.95 L 0.5 0.95 L 0 0.45 L -0.5 0.95 L -1.15 0.95 Z"
                  transform={`rotate(${rover.heading * 180 / Math.PI + 90}) scale(${miniSpan * 0.022})`}
                  className="lunar-minimap-rover-arrow"
                />
              </g>
            ))}
            {miniSnapshot.player && miniFitBounds && (
              <g
                className="lunar-minimap-player"
                transform={`translate(${miniPlayerX} ${-miniPlayerZ})`}
              >
                <circle r={miniSpan * 0.055} className="lunar-minimap-player-halo" />
                <path
                  d="M 0 -1.8 L 1.25 1.15 L 0 0.55 L -1.25 1.15 Z"
                  transform={`rotate(${miniSnapshot.player.yaw * 180 / Math.PI + 180}) scale(${miniSpan * 0.026})`}
                  className="lunar-minimap-player-arrow"
                />
              </g>
            )}
          </svg>
          {!miniSnapshot.player && (
            <div className="lunar-minimap-note">FREE CAM</div>
          )}
        </div>
      )}

      {mapIsOpen && (
        <div className="lunar-map-backdrop" onClick={() => setMapOpen(false)}>
          <section
            className="lunar-map-panel"
            id="lunar-map-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lunar-map-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="lunar-map-header">
              <div>
                <span className="lunar-modal-kicker">OUTPOST NAVIGATION · LIVE POSITION</span>
                <h2 id="lunar-map-title">Lunar Outpost Map</h2>
              </div>
              <button
                type="button"
                className="lunar-map-close"
                aria-label="Close map"
                onClick={() => setMapOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="lunar-map-content">
              <div className="lunar-map-canvas">
                {mapSnapshot && mapViewBox ? (
                  <svg
                    className="lunar-map-svg"
                    viewBox={mapViewBox}
                    role="img"
                    aria-label="Top-down map generated from the named outpost model components"
                  >
                    <defs>
                      <pattern id="lunar-map-grid" width={mapSpan / 18} height={mapSpan / 18} patternUnits="userSpaceOnUse">
                        <path
                          d={`M ${mapSpan / 18} 0 L 0 0 0 ${mapSpan / 18}`}
                          fill="none"
                          stroke="rgba(127, 240, 255, 0.075)"
                          strokeWidth={Math.max(mapSpan / 900, 0.04)}
                        />
                      </pattern>
                    </defs>
                    <rect
                      x={mapSnapshot.bounds.minX - mapPadding}
                      y={-mapSnapshot.bounds.maxZ - mapPadding}
                      width={mapSnapshot.bounds.maxX - mapSnapshot.bounds.minX + mapPadding * 2}
                      height={mapSnapshot.bounds.maxZ - mapSnapshot.bounds.minZ + mapPadding * 2}
                      fill="url(#lunar-map-grid)"
                    />

                    {mapSnapshot.components.map((component) => {
                      const selected = selectedMapTask?.targetComponentId === component.id;
                      const selectedLocation = selectedMapComponentId === component.id;
                      const x = (component.minX + component.maxX) / 2;
                      const y = -(component.minZ + component.maxZ) / 2;
                      const width = Math.max(component.maxX - component.minX, mapSpan * 0.012);
                      const height = Math.max(component.maxZ - component.minZ, mapSpan * 0.012);
                      const task = simulation.dailyChallenges.find(
                        (challenge) => challenge.targetComponentId === component.id,
                      );
                      const taskOverdue = task?.status === 'overdue';

                      return (
                        <g
                          key={component.id}
                          className={`lunar-map-component lunar-map-${component.category}${selected || selectedLocation ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedMapComponentId(component.id);
                            setSelectedMapTaskId(
                              simulation.dailyChallenges.find(
                                (challenge) => challenge.targetComponentId === component.id,
                              )?.id ?? null,
                            );
                          }}
                        >
                          <title>{component.id} · {component.name}{selected ? ' · selected task destination' : ''}</title>
                          {component.category === 'equipment' ? (
                            <circle
                              cx={x}
                              cy={y}
                              r={Math.max(mapSpan * 0.012, 0.7)}
                              className="lunar-map-equipment"
                            />
                          ) : (
                            <rect
                              x={x - width / 2}
                              y={y - height / 2}
                              width={width}
                              height={height}
                              rx={Math.max(mapSpan * 0.006, 0.25)}
                              className="lunar-map-footprint"
                            />
                          )}
                          {component.category !== 'equipment' && (
                            <text
                              x={x}
                              y={y}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={Math.max(mapSpan * 0.018, 0.55)}
                              textLength={Math.max(2, Math.min(mapSpan * 0.12, component.name.length * mapSpan * 0.009))}
                              lengthAdjust="spacingAndGlyphs"
                              className="lunar-map-room-label"
                            >
                              {component.name}
                            </text>
                          )}
                          {task && (
                            <g
                              className={`lunar-map-task-marker status-${taskOverdue ? 'overdue' : task.status}`}
                              onClick={() => {
                                setSelectedMapTaskId(task.id);
                                setSelectedMapComponentId(component.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedMapTaskId(task.id);
                                  setSelectedMapComponentId(component.id);
                                }
                              }}
                              role="button"
                              aria-label={`${task.title}, ${taskOverdue ? 'overdue' : task.status}, ${component.name}`}
                              tabIndex={0}
                            >
                              <circle cx={x} cy={y} r={mapSpan * 0.023} className="lunar-map-task-halo" />
                              <circle cx={x} cy={y} r={mapSpan * 0.012} className="lunar-map-task-dot" />
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {mapSnapshot.rovers?.map((rover) => (
                      <g
                        key={`rover-${rover.id}`}
                        className="lunar-map-rover"
                        transform={`translate(${rover.x} ${-rover.z})`}
                        style={{ color: rover.tint }}
                      >
                        <title>{rover.label} · x {Math.round(rover.x)} · z {Math.round(rover.z)}</title>
                        <circle r={mapSpan * 0.019} className="lunar-map-rover-halo" />
                        <path
                          d="M 0 -1.7 L 1.15 0.95 L 0.5 0.95 L 0 0.45 L -0.5 0.95 L -1.15 0.95 Z"
                          transform={`rotate(${rover.heading * 180 / Math.PI + 90}) scale(${mapSpan * 0.011})`}
                          className="lunar-map-rover-arrow"
                        />
                      </g>
                    ))}

                    {mapSnapshot.player && (
                      <g
                        className="lunar-map-player"
                        transform={`translate(${mapSnapshot.player.x} ${-mapSnapshot.player.z})`}
                      >
                        <circle r={mapSpan * 0.025} className="lunar-map-player-halo" />
                        <path
                          d="M 0 -1.8 L 1.25 1.15 L 0 0.55 L -1.25 1.15 Z"
                          transform={`rotate(${mapSnapshot.player.yaw * 180 / Math.PI + 180}) scale(${mapSpan * 0.012})`}
                          className="lunar-map-player-arrow"
                        />
                      </g>
                    )}
                  </svg>
                ) : (
                  <div className="lunar-map-loading">
                    <span>OUTPOST MODEL IS STILL LOADING</span>
                    <small>The map will populate from the scene component bounds.</small>
                  </div>
                )}
              </div>

              <aside className="lunar-map-details" aria-label="Map locations and task destinations">
                <h3>Task destinations</h3>
                <div className="lunar-map-task-list">
                  {simulation.dailyChallenges.map((task) => {
                    const status = task.status;
                    return (
                      <button
                        type="button"
                        key={task.id}
                        className={`lunar-map-task lunar-map-task-${status}${selectedMapTaskId === task.id ? ' is-selected' : ''}`}
                        onClick={() => {
                          setSelectedMapTaskId(task.id);
                          setSelectedMapComponentId(task.targetComponentId);
                        }}
                      >
                        <strong>{task.title}</strong>
                        <span>{status === 'inProgress' ? 'In progress' : status === 'available' ? 'Available' : status === 'completed' ? 'Completed' : 'Overdue'} · {task.priority} priority</span>
                        <small>{task.targetComponentName} · component {task.targetComponentId}</small>
                      </button>
                    );
                  })}
                </div>
                {mapSnapshot?.components && (
                  <div className="lunar-map-location-list">
                    <h3>Outpost locations</h3>
                    <div>
                      {mapSnapshot.components.map((component) => (
                        <button
                          type="button"
                          key={component.id}
                          className={selectedMapComponentId === component.id ? 'is-selected' : ''}
                          onClick={() => {
                            setSelectedMapComponentId(component.id);
                            setSelectedMapTaskId(
                              simulation.dailyChallenges.find(
                                (task) => task.targetComponentId === component.id,
                              )?.id ?? null,
                            );
                          }}
                        >
                          <span>{component.name}</span>
                          <small>{component.id} · {component.category}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {mapSnapshot?.rovers?.length > 0 && (
                  <div className="lunar-map-location-list lunar-map-rover-list">
                    <h3>Rover fleet</h3>
                    <div>
                      {mapSnapshot.rovers.map((rover) => (
                        <span key={rover.id} className="lunar-map-rover-row">
                          <i style={{ background: rover.tint, color: rover.tint }} />
                          <span>{rover.label}</span>
                          <small>x {Math.round(rover.x)} · z {Math.round(rover.z)}</small>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="lunar-map-legend" aria-label="Map legend">
                  <h3>Legend</h3>
                  <span><i className="legend-player" /> You · facing direction</span>
                  <span><i className="legend-rover" /> Rover · facing direction</span>
                  <span><i className="legend-structure" /> Command center</span>
                  <span><i className="legend-task legend-available" /> Available task</span>
                  <span><i className="legend-task legend-progress" /> In progress</span>
                  <span><i className="legend-task legend-overdue" /> Overdue (still completable)</span>
                  <span><i className="legend-task legend-completed" /> Completed</span>
                  <span><i className="legend-equipment" /> Equipment</span>
                </div>
                {!mapSnapshot?.player && (
                  <p className="lunar-map-note">
                    Switch to first-person mode to see your live position. Free camera is an observer, not a player location.
                  </p>
                )}
                {mapSnapshot?.player?.location === 'interior' && (
                  <p className="lunar-map-note">
                    Interior position is shown at the actual exterior footprint of the entered component.
                  </p>
                )}
                {selectedMapTask && (
                  <p className="lunar-map-selected-note">
                    Highlighted destination: {selectedMapTask.targetComponentName}. No route is shown because room-to-room connections are not defined as reliable navigation data.
                  </p>
                )}
                {!selectedMapTask && routeEventEntry && routeEventLocation && (
                  <p className="lunar-map-selected-note">Lumi is taking you to {routeEventLocation.name} for {routeEventEntry.event.name}. The highlighted location is where to go next.</p>
                )}
              </aside>
            </div>
          </section>
        </div>
      )}

      {dailyTasksOpen && simulation.gameStatus === 'playing' && simulation.dayPhase === 'active' && (
        <aside className="lunar-daily-tasks" id="lunar-daily-tasks" aria-label="Daily tasks">
          <div className="lunar-drawer-heading">
            <div>
              <span className="lunar-modal-kicker">Day {simulation.day}</span>
              <h2>Today’s jobs</h2>
            </div>
            <button type="button" aria-label="Close daily tasks" onClick={() => setDailyTasksOpen(false)}>×</button>
          </div>
          <p className="lunar-task-intro">Keep the outpost ready by finishing these jobs before the day ends.</p>
          <div className="lunar-task-list">
            {[...simulation.dailyChallenges].sort((first, second) => (
              (first.status === 'completed' ? 1 : 0) - (second.status === 'completed' ? 1 : 0)
              || (first.priority === 'critical' ? -1 : 0) - (second.priority === 'critical' ? -1 : 0)
              || (first.priority === 'high' ? -1 : 0) - (second.priority === 'high' ? -1 : 0)
            )).map((challenge) => {
              const isActive = challenge.status === 'inProgress' || challenge.status === 'overdue';
              const isUnfinished = challenge.status !== 'completed';

              return (
                <article id={`lunar-task-${challenge.id}`} className={`lunar-task-card lunar-task-${challenge.status}${focusedTaskId === challenge.id ? ' is-focused' : ''}`} key={challenge.id}>
                  <div className="lunar-task-title-row">
                    <h3>{challenge.title}</h3>
                    <span>{getTaskStatusLabel(challenge.status)}</span>
                  </div>
                  <div className="lunar-task-meta">
                    <span className={`lunar-task-priority lunar-task-priority-${challenge.priority}`}>
                      {challenge.priority === 'critical' ? 'Do this first' : challenge.priority === 'high' ? 'Important' : 'When you can'}
                    </span>
                  <span>Go to: {challenge.targetComponentName}</span>
                    <span>{challenge.status === 'overdue'
                      ? `Late since day ${challenge.scheduledDay}`
                      : challenge.scheduledDay < simulation.day
                        ? `From day ${challenge.scheduledDay}`
                        : 'Due today'}</span>
                  </div>
                  <p>{challenge.description}</p>
                  {challenge.status === 'available' && (
                    <button
                      type="button"
                      className="lunar-task-action"
                      onClick={() => openTaskIdea(challenge)}
                    >
                      {challenge.priority === 'critical' ? 'Start Task' : 'Start task'}
                    </button>
                  )}
                  {isActive && challenge.recoveryStatus !== 'available' && (
                    <button
                      type="button"
                      className="lunar-task-action"
                      onClick={() => openTaskIdea(challenge)}
                    >
                      {simulation.activeChallengeId === challenge.id ? 'Working on this' : 'Choose this job'}
                    </button>
                  )}
                  {challenge.status === 'overdue' && challenge.recoveryStatus === 'available' && (
                    <button
                      type="button"
                      className="lunar-task-action"
                      onClick={() => {
                        simulation.startCriticalTaskRecovery(challenge.id);
                        setTaskJourneys((items) => { const next = { ...items }; delete next[challenge.id]; return next; });
                        const retryMessage = `Let’s try this critical task again at ${challenge.targetComponentName}. We have 45 seconds to finish it!`;
                        setLumiMilestoneMessage(retryMessage);
                        speakLumi(retryMessage);
                        setTaskExperienceId(challenge.id);
                        setTaskExperienceStage('idea');
                      }}
                    >
                      Try again
                    </button>
                  )}
                  {challenge.status === 'overdue' && challenge.recoveryStatus !== 'available'
                    && challenge.recoveryStatus !== 'active'
                    && challenge.recoveryStatus !== 'expired' && (
                    <button
                      type="button"
                      className="lunar-task-action"
                      onClick={() => openTaskIdea(challenge)}
                    >Try this job again</button>
                  )}
                  {challenge.urgentDeadlineAtMs !== null && isUnfinished && (
                    <div className={`lunar-task-countdown ${
                      challenge.status === 'overdue' ? 'is-overdue' : ''
                    } ${
                      challenge.recoveryStatus === 'active'
                        ? challenge.recoveryDeadlineAtMs - simulation.campaignElapsedMs
                          <= Math.round(simulation.dayDurationMs * 10 / (24 * 60))
                        : challenge.urgentDeadlineAtMs - simulation.campaignElapsedMs <= 30_000
                        ? 'is-imminent'
                        : ''
                    }`}>
                      {challenge.recoveryStatus === 'active'
                        ? `RECOVERY · ${formatRemainingTime(challenge.recoveryDeadlineAtMs - simulation.campaignElapsedMs)} remaining`
                        : challenge.recoveryStatus === 'available'
                          ? 'INITIAL PENALTY APPLIED · Recovery available'
                          : challenge.status === 'overdue'
                        ? 'This job is late'
                        : `Time left · ${formatRemainingTime(
                          challenge.urgentDeadlineAtMs - simulation.campaignElapsedMs,
                        )} remaining`}
                    </div>
                  )}
                  {challenge.urgentDeadlineAtMs !== null && isUnfinished && (
                    <small className="lunar-task-risk">If we wait: {challenge.riskIfDelayed}</small>
                  )}
                  <button
                    type="button"
                    className="lunar-task-locate"
                    onClick={() => {
                      setDailyTasksOpen(false);
                      setSelectedMapTaskId(challenge.id);
                      setSelectedMapComponentId(challenge.targetComponentId);
                      setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
                      setMapOpen(true);
                    }}
                  >
                    Show me where
                  </button>
                  {isActive && (
                    <div className="lunar-task-current">
                      {challenge.status === 'overdue' ? 'Late · You can still try again' : 'In progress'}
                      {challenge.startedDay !== null ? ` · Started on day ${challenge.startedDay}` : ''}
                    </div>
                  )}
                  {challenge.status === 'completed' && (
                    <div className="lunar-task-current">
                      Done on day {challenge.completedDay}
                      {challenge.completedAfterDeadline === true ? ' · Finished late' : ''}
                      {challenge.emergencyPrevented ? ' · Problem avoided' : ''}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {simulation.challengeHistory.length > 0 && (
            <p className="lunar-task-history">
              Completed tasks this mission: {simulation.challengeHistory.length}
            </p>
          )}
          {simulation.challengeFeedback && !visibleNotifications.length && !isPersistentCriticalFeedback && (
            <p className="lunar-task-feedback" role="status">{simulation.challengeFeedback}</p>
          )}
        </aside>
      )}

      {statusOpen && eventGameplayActive && !simulation.warningTaskId && (
        <aside className="lunar-status-drawer" id="lunar-status-drawer" aria-label="Outpost readiness and systems overview">
          <div className="lunar-drawer-heading">
            <div>
              <span className="lunar-modal-kicker">Day {simulation.day}</span>
              <h2>Outpost resources</h2>
            </div>
            <button type="button" aria-label="Close outpost status" onClick={() => setStatusOpen(false)}>×</button>
          </div>
          <section className={`lunar-readiness lunar-readiness-${readinessLevel.toLowerCase().replace(' ', '-')}`}>
            <div className="lunar-readiness-summary">
              <strong>{readinessLevel}</strong>
              <span>Overall readiness · {overallReadiness}/100</span>
            </div>
            <p>{readinessForecast}</p>
            <p><b>Recommended:</b> {readinessRecommendation}</p>
            <div className="lunar-readiness-task">
              <span>Active task</span>
              <strong>{activeTask ? activeTask.title : 'None'}</strong>
              {activeTask && <small>Deadline Day {activeTask.deadlineDay} · {activeTask.status === 'overdue' ? 'Overdue' : 'In progress'}</small>}
            </div>
            {overdueTasks.length > 0 && (
              <div className="lunar-readiness-overdue">
                Overdue: {overdueTasks.map((task) => task.title).join(', ')}
              </div>
            )}
          </section>
          <h3 className="lunar-system-heading">System condition · reliability</h3>
          <div className="lunar-system-condition-list">
            {systemEntries.map(([key, label]) => {
              const value = simulation.systemConditions[key];
              const level = getSystemConditionLevel(value);
              return (
                <div className={`lunar-system-condition lunar-system-${level}`} key={key}>
                  <div className="lunar-resource-heading">
                    <span>{label}</span>
                    <strong>{value}/100 · {level}</strong>
                  </div>
                  <div className="lunar-resource-meter">
                    <span style={{ width: `${value}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <h3 className="lunar-system-heading">Outpost and commander safety</h3>
          <div className="lunar-resource-list">
            {RESOURCE_ITEMS.map(([key, label, icon]) => {
              const value = key === 'health'
                ? getCommanderSafety(simulation.resources)
                : Math.round(simulation.resources[key]);
              const meterValue = Math.max(0, Math.min(100, value));
              const level = value <= 25 ? 'critical' : value <= 50 ? 'low' : 'healthy';

              return (
                <div className={`lunar-resource lunar-resource-${level}`} key={key}>
                  <div className="lunar-resource-heading">
                    <span>{icon} {label}</span>
                    <strong>{value}%</strong>
                  </div>
                  <div className="lunar-resource-meter">
                    <span style={{ width: `${meterValue}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="lunar-resource-footnote">Keep each bar out of the red to protect yourself and the outpost.</p>
        </aside>
      )}

      {activeEventVisuals.some(({ eventId }) => eventId === 'solar_storm') && (
        <div className="lunar-storm-overlay" aria-hidden="true" />
      )}

      {simulation.challengeFeedback && !isPersistentCriticalFeedback && (
        <div className={`lunar-task-toast${simulation.dailyChallenges.some((task) => task.status === 'completed' && simulation.challengeFeedback.startsWith(`${task.title} completed.`)) ? ' is-task-success' : ''}`} role="status">
          <span>{simulation.challengeFeedback}</span>
          <button
            type="button"
            aria-label="Dismiss task feedback"
            onClick={dismissChallengeFeedback}
          >
            ×
          </button>
        </div>
      )}

      {/* Proximity prompts - small bottom toast, pointer lock stays active */}
      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'airlock' && (
        <div className="lunar-proximity-prompt" role="dialog" aria-live="polite" aria-label="Airlock prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Enter the airlock?'}</strong>
            <small>Press <kbd>Enter</kbd> to go in · <kbd>N</kbd> to stay here</small>
          </div>
          <button
            type="button"
            className="lunar-proximity-enter"
            onClick={() => engineRef.current?.enterAirlock()}
          >
            ENTER ⏎
          </button>
        </div>
      )}

      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'airlockEnd' && (
        <div className="lunar-proximity-prompt" role="dialog" aria-live="polite" aria-label="Airlock direction prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Choose a direction'}</strong>
            <small>Press <kbd>A</kbd>/<kbd>←</kbd> for the greenhouse · <kbd>D</kbd>/<kbd>→</kbd> for the workshop</small>
          </div>
          <div className="lunar-proximity-split">
            <button
              type="button"
              className="lunar-proximity-enter"
              onClick={() => engineRef.current?.enterGreenhouse()}
            >
              ◀ GREEN
            </button>
            <button
              type="button"
              className="lunar-proximity-enter"
              onClick={() => engineRef.current?.enterWorkshop()}
            >
              WORK ▶
            </button>
          </div>
        </div>
      )}

      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'greenhouseDoor' && (
        <div className="lunar-proximity-prompt" role="dialog" aria-live="polite" aria-label="Greenhouse door prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Return to the airlock?'}</strong>
            <small>Press <kbd>Enter</kbd> to go back · <kbd>N</kbd> to stay here</small>
          </div>
          <button
            type="button"
            className="lunar-proximity-enter"
            onClick={() => engineRef.current?.leaveGreenhouse()}
          >
            ENTER ⏎
          </button>
        </div>
      )}

      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'component' && (
        <div className={`lunar-proximity-prompt${eventsAtPromptLocation.length > 0 ? ' has-event-action' : ''}`} role="dialog" aria-live="polite" aria-label="Component prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Enter this module?'}{promptedChallenge ? ' ★' : ''}</strong>
            <small>Press <kbd>Enter</kbd> to go in · <kbd>N</kbd> to stay{promptedChallenge ? ` · Job: ${promptedChallenge.actionLabel}` : ''}</small>
          </div>
          {eventsAtPromptLocation.length > 0 ? (
            <div className="lunar-proximity-split">
              <button
                type="button"
                className="lunar-proximity-enter"
                onClick={() => engineRef.current?.enterNearbyComponent()}
              >
                ENTER ⏎
              </button>
              {eventsAtPromptLocation.map(({ event }) => (
                <button
                  type="button"
                  className="lunar-proximity-resolve-event"
                  key={getEventOccurrenceKey(event)}
                  aria-label={`Resolve issue: ${event.name}`}
                  onClick={() => openEventAtLocation(event)}
                >
                  Resolve Issue
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              className="lunar-proximity-enter"
              onClick={() => engineRef.current?.enterNearbyComponent()}
            >
              ENTER ⏎
            </button>
          )}
        </div>
      )}

      {['idle', 'awaitingDecision'].includes(simulation.eventPhase)
        && prompt.type !== 'component' && eventsAtPromptLocation.length > 0 && (
        <div className="lunar-proximity-prompt has-event-action" role="group" aria-label="Event issue actions">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{getEventLocation(eventsAtPromptLocation[0].event)?.name ?? 'Outpost'} · Active Issue</strong>
            <small>Help fix the problem here.</small>
          </div>
          <div className="lunar-proximity-split">
            {eventsAtPromptLocation.map(({ event }) => (
              <button
                type="button"
                className="lunar-proximity-resolve-event"
                key={getEventOccurrenceKey(event)}
                aria-label={`Resolve issue: ${event.name}`}
                onClick={() => openEventAtLocation(event)}
              >
                Resolve Issue
              </button>
            ))}
          </div>
        </div>
      )}

      {['idle', 'awaitingDecision'].includes(simulation.eventPhase) && prompt.type === 'roverMonitor' && (
        <div className="lunar-proximity-prompt" role="dialog" aria-live="polite" aria-label="Command center rover monitor prompt">
          <span className="lunar-proximity-dot" aria-hidden="true" />
          <div className="lunar-proximity-text">
            <strong>{prompt.data?.title || 'Link to rover?'}</strong>
            <small>
              Press <kbd>Enter</kbd> to drive · <kbd>N</kbd> to cancel · <kbd>V</kbd> to come back
            </small>
          </div>
          <button
            type="button"
            className="lunar-proximity-enter"
            onClick={() => engineRef.current?.controlRover(prompt.data?.roverId)}
          >
            DRIVE ⏎
          </button>
        </div>
      )}

      <EventModal
        event={eventOptionsOpen
          && !dailyTasksOpen
          && !mapOpen
          && !simulation.warningTaskId
          && selectedEventCanDecide
          ? selectedEventEntry?.event ?? null
          : null}
        events={eventOptionsOpen && selectedEventEntry
          ? [selectedEventEntry.event]
          : activeEventEntries.map(({ event }) => event)}
        onSelectEvent={(entry) => setSelectedAlertId(getEventOccurrenceKey(entry))}
        taskTitles={Object.fromEntries(simulation.dailyChallenges.map((task) => [task.id, task.title]))}
        narration={selectedEventEntry?.event ? getEventNarration(selectedEventEntry.event) : undefined}
        remainingMs={simulation.eventResolutionLocked || selectedEventEntry?.deadlineAtMs == null
          ? null
          : Math.max(0, selectedEventEntry.deadlineAtMs - simulation.campaignElapsedMs)}
        locked={simulation.eventResolutionLocked}
        canDecide={selectedEventCanDecide}
        onSelectDecision={handleEventDecision}
        onClose={() => {
          const selectedEventId = selectedEventEntry
            ? getEventOccurrenceKey(selectedEventEntry.event)
            : eventOptionsEventIdRef.current;
          eventOptionsEventIdRef.current = null;
          setSelectedAlertId(null);
          if (!simulation.eventResolutionLocked) handleEventAbandon(selectedEventId);
          setEventOptionsOpen(false);
        }}
      />
      <MissionEventCall
        call={noorCall}
        narration={noorCall?.event ? getEventNarration(noorCall.event) : null}
        location={noorCall?.event ? getEventLocation(noorCall.event) : null}
        onAnswer={() => setNoorCall((call) => call ? { ...call, stage: 'connected' } : null)}
        onContinue={() => {
          const event = noorCall?.event;
          if (!event) { noorCallActiveRef.current = false; setNoorCall(null); return; }
          const occurrenceId = getEventOccurrenceKey(event);
          const location = getEventLocation(event);
          setNoorCall(null);
          noorCallActiveRef.current = false;
          setRouteEventId(occurrenceId);
          setSelectedMapTaskId(null);
          setSelectedMapComponentId(location?.componentId ?? null);
          setMapOpenedAtDecisionCount(simulation.decisionHistory.length);
          setMapOpen(true);
          setEventAlertListOpen(false);
          speakLumi(`Let’s go to ${location?.name ?? 'the outpost'} and fix the ${event.name} problem together!`);
        }}
      />
      {taskExperienceId
        && simulation.gameStatus === 'playing'
        && simulation.dayPhase === 'active'
        && (() => {
        const experienceTask = simulation.dailyChallenges.find((task) => task.id === taskExperienceId);
        return experienceTask ? (
          <DailyTaskExperience
            key={`${experienceTask.id}-${taskExperienceStage}`}
            task={experienceTask}
            taskFact={getUniqueTaskFact(experienceTask, simulation.dailyChallenges)}
            startMessage={getTaskStartMessage(experienceTask)}
            initialStage={taskExperienceStage}
            progressState={taskJourneys[experienceTask.id] ?? {}}
            suspended={eventPhase !== 'idle' || Boolean(noorCall) || Boolean(simulation.warningTaskId)}
            onClose={() => {
              setTaskExperienceId(null);
              if (experienceTask.status === 'completed') {
                stopLumiSpeech();
                const remaining = simulation.dailyChallenges.filter((task) => task.id !== experienceTask.id && task.status !== 'completed').length;
                const message = [
                  `Great job! You finished ${experienceTask.title}.`,
                  `You made a thoughtful choice. I’m proud of you!`,
                  remaining > 0
                    ? `${remaining} ${remaining === 1 ? 'task' : 'tasks'} left. Let’s keep going!`
                    : 'You finished all today’s tasks. Amazing work!',
                ].join(' ');
                setLumiMilestoneMessage(message);
                setTaskRecapSpeaking(true);
                speakLumi(message, () => setTaskRecapSpeaking(false));
              } else {
                stopLumiSpeech();
              }
            }}
            onFindLocation={() => {
              stopLumiSpeech();
              if (insidePanel.visible && insidePanel.componentId === experienceTask.targetComponentId) {
                setTaskExperienceStage('discover');
              } else {
                showTaskLocation(experienceTask.id);
              }
            }}
            onSelectSolution={(solution) => chooseTaskSolution(experienceTask.id, solution)}
            resourceChanges={taskOutcomeStart?.taskId === experienceTask.id && experienceTask.status === 'completed'
              ? Object.fromEntries(Object.entries(simulation.resources).map(([key, value]) => [key, Math.round(value - taskOutcomeStart.resources[key])]).filter(([, amount]) => amount !== 0))
              : null}
            componentChange={taskOutcomeStart?.taskId === experienceTask.id && experienceTask.status === 'completed'
              ? simulation.systemConditions[experienceTask.affectedSystem] - taskOutcomeStart.condition
              : null}
            onComplete={(solution) => {
              setTaskOutcomeStart({ taskId: experienceTask.id, resources: simulation.resources, condition: simulation.systemConditions[experienceTask.affectedSystem] });
              completeDailyChallenge(experienceTask.id, experienceTask.targetComponentId, solution);
              if (commanderProfile?.multiplayer && commanderProfile.roomCode) {
                void fetchLocalNetwork(`${MULTIPLAYER_API}/api/rooms/${encodeURIComponent(commanderProfile.roomCode)}/tasks`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ playerId: commanderProfile.playerId, taskId: experienceTask.id, title: experienceTask.title }),
                }).catch(() => {});
              }
            }}
          />
        ) : null;
      })()}
      <MissionStoryMoment
        moment={storyMoment}
        voiceEnabled={lumiVoiceEnabled}
        onClose={() => setStoryMoment(null)}
        onContinue={() => setStoryMoment((current) => current?.next ?? null)}
      />
      {storyRewardDay !== null && <MissionStoryReward day={storyRewardDay} voiceEnabled={lumiVoiceEnabled} onClose={() => setStoryRewardDay(null)} />}
      <MissionArchive
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        activeTab={archiveTab}
        setActiveTab={setArchiveTab}
        simulation={simulation}
        photos={photos}
        pendingPhoto={pendingPhoto}
        setPendingPhoto={setPendingPhoto}
        onCapturePhoto={captureMissionPhoto}
        onSavePhoto={saveMissionPhoto}
      />
      <IceSampleActivity
        open={iceSampleOpen}
        samples={simulation.collectedIceSamples}
        onCollect={simulation.collectIceSample}
        onClose={() => setIceSampleOpen(false)}
      />
      <RadioCall
        open={radioOpen}
        onClose={() => setRadioOpen(false)}
        commanderName={simulation.commanderName}
        baseName={simulation.baseName}
        day={simulation.day}
      />
      {visibleEndOfDayNotices.length > 0 && (
          <div className="lunar-end-of-day-event-messages" role="status" aria-live="assertive">
            {visibleEndOfDayNotices.map((event) => (
              <aside className="lunar-end-of-day-event-message" key={getEventOccurrenceKey(event)}>
                <button
                  type="button"
                  className="lunar-end-of-day-event-dismiss"
                  aria-label="Dismiss Critical Task Missed message"
                  onClick={() => {
                    const occurrenceId = getEventOccurrenceKey(event);
                    if (occurrenceId) simulation.dismissEndOfDayTaskNotice(occurrenceId);
                  }}
                >×</button>
                <strong>Let’s try this job earlier next time</strong>
                <p>
                  You couldn’t finish “{event.missedTaskTitle}” in time, so {event.name} happened. Remember this job for next time—you’re learning how to protect the outpost!
                </p>
              </aside>
            ))}
          </div>
        )}
      {(visibleNotifications.length > 0 || visibleTaskFailureNotices.length > 0 || isPersistentCriticalFeedback) && (
        <div
          className="lunar-notification-stack lunar-notification-stack-right"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {isPersistentCriticalFeedback && (
            <div className="lunar-task-toast is-recovery-notice" role="status">
              <span>{simulation.challengeFeedback}</span>
              <button type="button" aria-label="Dismiss task feedback" onClick={dismissChallengeFeedback}>×</button>
            </div>
          )}
          {visibleTaskFailureNotices.map((notice) => (
            <aside className="lunar-persistent-notice lunar-task-failure-notice" key={notice.id} role="alert">
              <button
                type="button"
                className="lunar-notice-close"
                aria-label="Dismiss critical task notice"
                onClick={() => simulation.dismissTaskFailureNotice(notice.id)}
              >×</button>
              <strong>A job to try sooner next time</strong>
              <p>You couldn’t finish {notice.task} in time, so {notice.event} happened. You can use what you learned to act sooner next time.</p>
            </aside>
          ))}
          {visibleNotifications.map((notice) => (
            <aside className="lunar-persistent-notice lunar-event-failure-notice" role="alert" key={notice.id}>
              <button
                type="button"
                className="lunar-notice-close"
                aria-label="Dismiss event notice"
                onClick={() => simulation.dismissEventFailureNotice(notice.id)}
              >×</button>
              <strong>
                {notice.status === 'resolved'
                  ? `${notice.name} — Fixed!`
                  : `${notice.name} — ${notice.expired ? 'Let’s try sooner next time' : 'Ready for another try'}`}
              </strong>
              <p>{notice.status === 'resolved'
                ? `You chose: ${notice.decision}. ${notice.feedback}`
                : notice.feedback}</p>
              {Object.entries(notice.changes).length > 0
                ? Object.entries(notice.changes).map(([resource, change]) => (
                  <span key={resource}>{RESOURCE_LABELS[resource] ?? resource}: {change > 0 ? '+' : ''}{change}%</span>
                ))
                : <span>No resources changed</span>}
            </aside>
          ))}
        </div>
      )}
      {simulation.dayPhase === 'transition' && (
        <div className="lunar-day-transition" role="status" aria-live="polite">
          <section className="lunar-day-transition-opening">
            <span className="lunar-day-report-kicker">NEXT MISSION DAY</span>
            <h2>Day {simulation.day}</h2>
            <p>Welcome to Day {simulation.day}. A new day is beginning at the outpost!</p>
          </section>
        </div>
      )}
      {simulation.dayPhase === 'report' && simulation.dayReport && dayReportReadyDay === simulation.dayReport.day && storyRewardDay === null && !hasPendingCriticalTaskNotice && (
        <div className="lunar-day-transition" role="dialog" aria-modal="true" aria-labelledby="day-report-title">
          <section className="lunar-day-report">
            <span className="lunar-day-report-kicker">Commander’s report · Day {simulation.dayReport.day}</span>
            <h2 id="day-report-title">Day {simulation.dayReport.day} is done!</h2>
            <article className="mission-day-dispatch">
              <span>TO: MISSION CONTROL</span><span>FROM: COMMANDER {simulation.commanderName.toUpperCase()} · {simulation.baseName.toUpperCase()}</span><span>DAY {simulation.dayReport.day}</span>
              <p>Today we finished {simulation.dayReport.completedTasks.length} job{simulation.dayReport.completedTasks.length === 1 ? '' : 's'} and handled {simulation.dayReport.totalEvents} problem{simulation.dayReport.totalEvents === 1 ? '' : 's'}. The outpost is {overallReadiness >= 45 ? 'still operational' : 'in need of care'}.</p>
              {simulation.scienceNotebookIds.length > 0 && <p>Science Notebook: {SCIENCE_DISCOVERIES.filter((entry) => simulation.scienceNotebookIds.includes(entry.id)).slice(-1).map((entry) => entry.title).at(-1)} · Science {Math.round(simulation.dayReport.resources.science)}%.</p>}
            </article>
            {reportChapter && <section className="lunar-chapter-report" aria-label={`Chapter ${reportChapter.id} report`}>
              <span>CHAPTER {reportChapter.id} REPORT · DAYS {reportChapter.firstDay}–{reportChapter.lastDay}</span>
              <h3>{reportChapter.title}</h3>
              <p>{reportChapter.goal}</p>
              <div><b>{chapterJobsFinished}</b><small>jobs finished</small><b>{chapterProblemsFixed}</b><small>problems fixed</small><b>{simulation.scienceNotebookIds.length}/{SCIENCE_DISCOVERIES.length}</b><small>discoveries saved</small></div>
              <p className="lunar-chapter-report-note">This report adds up your progress across the whole chapter.</p>
            </section>}
            <article className="mission-noor-reply"><span>DR. NOOR · MISSION CONTROL REPLIES</span><p>{getChapterReply(simulation.dayReport.day, simulation.dayReport.completedTasks.length, simulation.dayReport.totalEvents, simulation.dayReport.resources.science)}</p></article>
            {getStoryCallback(simulation.decisionHistory.filter((entry) => entry.day <= simulation.dayReport.day), simulation.dayReport.resources) && <p className="mission-story-callback">{getStoryCallback(simulation.decisionHistory.filter((entry) => entry.day <= simulation.dayReport.day), simulation.dayReport.resources)}</p>}
            <p className="lunar-day-report-summary">{simulation.dayReport.overdueTasks.length} job{simulation.dayReport.overdueTasks.length === 1 ? '' : 's'} still need attention · {simulation.dayReport.expiredEvents} problem{simulation.dayReport.expiredEvents === 1 ? '' : 's'} still need a response</p>
            {simulation.dayReport.eventOutcomes.length > 0 && (
              <div className="lunar-day-report-events">
                <h3>Problems and choices</h3>
                <ul>{simulation.dayReport.eventOutcomes.map((outcome) => (
                  <li key={outcome.occurrenceId}>
                  <strong>{outcome.eventName} · {outcome.status === 'resolved' ? 'Fixed' : outcome.status === 'expired' ? 'Let’s try sooner next time' : 'Ready for another try'}</strong>
                    <span>{outcome.decision ? `Response: ${outcome.decision}. ` : ''}{outcome.feedback}</span>
                  </li>
                ))}</ul>
              </div>
            )}
            <div className="lunar-day-report-grid">
              <div>
                <h3>Jobs finished</h3>
                {simulation.dayReport.completedTasks.length > 0 ? (
                  <ul>{simulation.dayReport.completedTasks.map((title) => <li key={title}>{title}</li>)}</ul>
                ) : <p>No jobs finished today. You can try again tomorrow!</p>}
              </div>
              <div>
                <h3>Jobs to finish</h3>
                {incompleteTaskTitles.length > 0 ? (
                  <ul>{incompleteTaskTitles.map((title) => <li key={title}>{title}</li>)}</ul>
                ) : <p>All caught up!</p>}
              </div>
            </div>
            <h3 className="lunar-day-report-impact-title">Your resources</h3>
            <div className="lunar-day-report-resources">
              {RESOURCE_ITEMS.map(([resource, label]) => {
                const start = Math.round(simulation.dayReport.resourceStart[resource]);
                const end = Math.round(simulation.dayReport.resources[resource]);
                const change = end - start;
                return (
              <span className={change > 0 ? 'resource-gain' : change < 0 ? 'resource-loss' : 'resource-steady'} key={resource}>
                  {label} <strong>{start}% → {end}% ({change > 0 ? '+' : ''}{change}%)</strong>
                </span>
                );
              })}
            </div>
            <button type="button" className="lunar-day-advance" onClick={simulation.advanceDay}>
              {simulation.dayReport.day >= simulation.maxDays ? 'Finish mission' : 'Next day'}
            </button>
          </section>
        </div>
      )}
      {simulation.gameStatus !== 'playing' && simulation.eventPhase !== 'resolving'
        && !hasPendingCriticalTaskNotice && (
        <EndGameReport
          status={simulation.gameStatus}
          day={simulation.day}
          maxDays={simulation.maxDays}
          resources={simulation.resources}
          failureReason={simulation.failureReason}
          decisionHistory={simulation.decisionHistory}
          dailyChallenges={simulation.dailyChallenges}
          systemConditions={simulation.systemConditions}
          faultHistory={simulation.faultHistory}
          postponementHistory={simulation.postponementHistory}
          eventHistory={simulation.eventHistory}
          eventOutcomeHistory={simulation.eventOutcomeHistory}
          taskMissionHistory={simulation.taskMissionHistory}
          commanderName={simulation.commanderName}
          baseName={simulation.baseName}
          scienceNotebookIds={simulation.scienceNotebookIds}
          onRestart={() => {
            setMapOpen(false);
            setTaskExperienceId(null);
            simulation.restart();
          }}
        />
      )}
    </div>
  );
}
