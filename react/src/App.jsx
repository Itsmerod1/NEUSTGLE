import { useEffect, useRef, useState } from 'react';
import ChatHeader from './components/ChatHeader.jsx';
import ChatMessages from './components/ChatMessages.jsx';
import MessageInput from './components/MessageInput.jsx';
import ActionButtons from './components/ActionButtons.jsx';
import ReportModal from './components/ReportModal.jsx';
import MatchingScreen from './components/MatchingScreen.jsx';
import * as api from './services/api.js';
import {
  initSupabase,
  updateRealtimeToken,
  subscribeToMatches,
  subscribeToRoom,
} from './services/supabase.js';

const MAX_MESSAGE_LENGTH = 500;
const SEARCH_POLL_MS = 3000;           // backup check while searching
const ROOM_POLL_MS = 5000;             // backup check + "still here" heartbeat while chatting
const TOKEN_REFRESH_MS = 45 * 60 * 1000;

let systemCounter = 0;
const systemNote = (text) => ({ id: `sys-${++systemCounter}`, type: 'system', text });

export default function App() {
  // status: idle | searching | connected | disconnected | stopped
  const [status, setStatus] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [roomId, setRoomId] = useState(null);
  const [strangerTyping, setStrangerTyping] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState('');
  const [toast, setToast] = useState('');
  const [showGuidelines, setShowGuidelines] = useState(true);

  // Refs hold the "live" values so timers and realtime callbacks never see stale state
  const statusRef = useRef('idle');
  const roomRef = useRef(null);
  const sessionIdRef = useRef(null);
  const matchSubRef = useRef(null);
  const roomSubRef = useRef(null);
  const searchPollRef = useRef(null);
  const roomPollRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const lastCreatedRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const toastTimerRef = useRef(null);
  const opQueueRef = useRef(Promise.resolve());
  const actions = useRef({});

  // ------------------------------------------------------------ helpers
  function changeStatus(next) {
    statusRef.current = next;
    setStatus(next);
  }

  function showToast(text) {
    setToast(text);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(''), 4500);
  }

  function handleError(err) {
    if (err && err.status === 401) {
      setFatalError('Your session expired. Please reload the page.');
    } else {
      showToast((err && err.message) || 'Something went wrong. Please try again.');
    }
  }

  // Run find / next / stop one after another so they can never overlap
  function enqueue(fn) {
    const run = opQueueRef.current.then(fn);
    opQueueRef.current = run.catch(() => {});
    return run;
  }

  function addSystem(text) {
    setMessages((prev) => [...prev, systemNote(text)]);
  }

  function addMessage(m) {
    if (seenIdsRef.current.has(m.id)) return; // same message from Realtime + HTTP
    seenIdsRef.current.add(m.id);
    if (!lastCreatedRef.current || m.created_at > lastCreatedRef.current) {
      lastCreatedRef.current = m.created_at;
    }
    setMessages((prev) => [
      ...prev,
      { id: m.id, type: 'message', mine: m.mine, text: m.message, createdAt: m.created_at },
    ]);
  }

  function stopSearchPoll() {
    clearInterval(searchPollRef.current);
    searchPollRef.current = null;
  }

  function stopRoomPoll() {
    clearInterval(roomPollRef.current);
    roomPollRef.current = null;
  }

  function leaveRoomLocally() {
    if (roomSubRef.current) roomSubRef.current.unsubscribe();
    roomSubRef.current = null;
    stopRoomPoll();
    roomRef.current = null;
    setRoomId(null);
    setStrangerTyping(false);
    seenIdsRef.current = new Set();
    lastCreatedRef.current = null;
  }

  function resetChatView() {
    stopSearchPoll();
    leaveRoomLocally();
    setMessages([]);
  }

  // ------------------------------------------------------------ session
  async function bootSession() {
    const s = await api.createSession(false);
    sessionIdRef.current = s.session_id;
    initSupabase(s.supabase_url, s.supabase_anon_key, s.realtime_token);
    if (matchSubRef.current) matchSubRef.current.unsubscribe();
    matchSubRef.current = subscribeToMatches(s.session_id, (room) => actions.current.handleMatched(room));
  }

  // ------------------------------------------------------------ rooms
  async function enterRoom(room) {
    if (roomRef.current === room) return;
    stopSearchPoll();
    leaveRoomLocally();

    roomRef.current = room;
    setRoomId(room);
    setMessages([systemNote('Stranger connected! Say hi 👋')]);
    changeStatus('connected');

    roomSubRef.current = subscribeToRoom(room, {
      onMessage: (row) => actions.current.onRealtimeMessage(row),
      onEnded: () => actions.current.onRoomEnded(room),
      onTyping: () => actions.current.onStrangerTyping(),
    });

    stopRoomPoll();
    roomPollRef.current = setInterval(() => {
      if (roomRef.current === room && statusRef.current === 'connected') syncMessages(room);
    }, ROOM_POLL_MS);

    await syncMessages(room); // load anything sent before we subscribed
  }

  async function syncMessages(room) {
    try {
      const data = await api.getMessages(room, lastCreatedRef.current);
      if (roomRef.current !== room) return;
      data.messages.forEach((m) => addMessage(m));
      if (data.room_status === 'ended') onRoomEnded(room);
    } catch (err) {
      if (err.status === 401) handleError(err);
    }
  }

  function onRoomEnded(room) {
    if (roomRef.current !== room || statusRef.current !== 'connected') return;
    if (roomSubRef.current) roomSubRef.current.unsubscribe();
    roomSubRef.current = null;
    stopRoomPoll();
    changeStatus('disconnected');
    setStrangerTyping(false);
    addSystem('Stranger has disconnected.');
  }

  function onRealtimeMessage(row) {
    if (!row || row.room_id !== roomRef.current) return;
    const mine = row.sender_session_id === sessionIdRef.current;
    addMessage({ id: row.id, mine, message: row.message, created_at: row.created_at });
    if (!mine) setStrangerTyping(false);
  }

  function onStrangerTyping() {
    setStrangerTyping(true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => setStrangerTyping(false), 3000);
  }

  function handleMatched(room) {
    if (statusRef.current === 'searching') enterRoom(room);
  }

  // ------------------------------------------------------------ searching
  function handleSearchResult(res) {
    if (statusRef.current !== 'searching') return; // user already pressed Stop
    if (res.status === 'connected' && res.room_id) {
      enterRoom(res.room_id);
    } else if (res.status === 'searching') {
      startSearchPoll();
    } else {
      stopSearchPoll();
      changeStatus('idle');
      showToast('The search was interrupted. Please try again.');
    }
  }

  function startSearchPoll() {
    if (searchPollRef.current) return;
    searchPollRef.current = setInterval(async () => {
      if (statusRef.current !== 'searching') {
        stopSearchPoll();
        return;
      }
      try {
        const res = await api.findStranger(true);
        handleSearchResult(res);
      } catch (err) {
        if (err.status === 401) handleError(err);
      }
    }, SEARCH_POLL_MS);
  }

  // ------------------------------------------------------------ the 4 buttons
  async function findStranger() {
    if (!ready || !['idle', 'stopped', 'disconnected'].includes(statusRef.current)) return;
    resetChatView();
    changeStatus('searching');
    try {
      const res = await enqueue(() => api.findStranger(false));
      handleSearchResult(res);
    } catch (err) {
      if (statusRef.current === 'searching') {
        stopSearchPoll();
        changeStatus('idle');
      }
      handleError(err);
    }
  }

  async function nextStranger() {
    if (!ready || !['connected', 'disconnected'].includes(statusRef.current)) return;
    resetChatView();
    changeStatus('searching');
    try {
      const res = await enqueue(() => api.nextStranger());
      handleSearchResult(res);
    } catch (err) {
      if (statusRef.current === 'searching') {
        stopSearchPoll();
        changeStatus('idle');
      }
      handleError(err);
    }
  }

  async function stopChat() {
    if (!['searching', 'connected'].includes(statusRef.current)) return;
    resetChatView();
    changeStatus('stopped'); // no automatic new search
    try {
      await enqueue(() => api.stopChat());
    } catch (err) {
      handleError(err);
    }
  }

  async function submitReport(reason, details) {
    const room = roomRef.current;
    if (!room) return;
    setReportOpen(false);
    resetChatView();
    changeStatus('idle');
    try {
      await enqueue(() => api.reportStranger(room, reason, details));
      showToast('Report submitted. Thank you for keeping NEUSTGLE safe.');
    } catch (err) {
      handleError(err);
    }
  }

  // ------------------------------------------------------------ messaging
  async function sendMessage(text) {
    const room = roomRef.current;
    if (!room || statusRef.current !== 'connected') return false;
    try {
      const data = await api.sendMessage(room, text);
      addMessage({
        id: data.message.id,
        mine: true,
        message: data.message.message,
        created_at: data.message.created_at,
      });
      return true;
    } catch (err) {
      if (err.status !== 401 && err.status !== 429) syncMessages(room); // maybe the stranger left
      handleError(err);
      return false;
    }
  }

  function notifyTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    if (roomSubRef.current) roomSubRef.current.sendTyping();
  }

  // latest versions of the handlers, used by timers / realtime callbacks
  actions.current = { handleMatched, onRealtimeMessage, onRoomEnded, onStrangerTyping };

  // ------------------------------------------------------------ start-up
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await bootSession();
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setFatalError('Could not start an anonymous session. Please reload the page.');
      }
    })();

    // keep the realtime token fresh
    const refresh = setInterval(async () => {
      try {
        const s = await api.createSession(true);
        updateRealtimeToken(s.realtime_token);
      } catch {
        /* the next API call will report an expired session */
      }
    }, TOKEN_REFRESH_MS);

    // closing the tab ends the chat so the other stranger is told
    const onPageHide = (e) => {
      if (!e.persisted && ['searching', 'connected'].includes(statusRef.current)) api.stopChatBeacon();
    };
    window.addEventListener('pagehide', onPageHide);

    // coming back to the tab: catch up immediately
    const onVisible = () => {
      if (document.visibilityState === 'visible' && roomRef.current && statusRef.current === 'connected') {
        syncMessages(roomRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(refresh);
      stopSearchPoll();
      stopRoomPoll();
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------ screen
  const chatDisabled = status !== 'connected';

  return (
    <div className="app">
      <main className="chat-card">
        <ChatHeader status={status} />

        {showGuidelines && (
          <div className="guidelines">
            <span>🛡️ Be kind and respectful. Never share personal details. Use Report if someone makes you uncomfortable.</span>
            <button type="button" aria-label="Dismiss" onClick={() => setShowGuidelines(false)}>✕</button>
          </div>
        )}

        <div className="chat-body">
          {status === 'searching' && <MatchingScreen />}
          <ChatMessages messages={messages} strangerTyping={strangerTyping} status={status} />
        </div>

        <MessageInput
          disabled={chatDisabled}
          maxLength={MAX_MESSAGE_LENGTH}
          onSend={sendMessage}
          onTyping={notifyTyping}
        />

        <ActionButtons
          ready={ready}
          status={status}
          hasRoom={Boolean(roomId)}
          onNext={nextStranger}
          onFind={findStranger}
          onStop={stopChat}
          onReport={() => setReportOpen(true)}
        />
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}

      {reportOpen && <ReportModal onSubmit={submitReport} onClose={() => setReportOpen(false)} />}

      {fatalError && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true">
            <h2>Oops</h2>
            <p className="modal-sub">{fatalError}</p>
            <div className="modal-actions">
              <button type="button" className="modal-submit" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
