import React, { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, Modal, Alert, ActivityIndicator,
  ScrollView, Linking, Share,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useTheme } from '../services/theme';
import { uploadMedia } from '../services/mediaUpload';
import ContactEditModal from '../components/ContactEditModal';
import ReplyPreview       from '../components/ReplyPreview';
import StagedPhotosPicker from '../components/StagedPhotosPicker';
import GifPickerModal     from '../components/GifPickerModal';
import { successFeedback, longPressFeedback, taptic, impactMedium } from '../services/haptics';
import SwipeableRow    from '../components/SwipeableRow';
import ZoomableImage   from '../components/ZoomableImage';
import ReactionPicker from '../components/ReactionPicker';
import ReactionBar    from '../components/ReactionBar';
import PinnedMessagePreview from '../components/PinnedMessagePreview';
import ReportMessageModal from '../components/ReportMessageModal';
import PremiumCrown from '../components/PremiumCrown';
import { supabase } from '../services/supabase';
import { placeCall } from '../services/placeCall';
import { usePresence } from '../services/presence';
import DateTimePicker from '@react-native-community/datetimepicker';
import { subscribeToRoom, subscribeToTyping, broadcastTyping, freshChannel } from '../services/realtimeMessages';
import { enqueue, flushQueue } from '../services/messageQueue';
import { markRoomAsRead, markDelivered, receiptIcon } from '../services/readReceipts';
import { ResolvedPhotoStack, ResolvedVideoCarousel } from '../components/MediaBubbles';
import VoiceNoteBubble from '../components/VoiceNoteBubble';
import ViewOncePhoto from '../components/ViewOncePhoto';
import { summarizeMessages, summaryToText } from '../services/chatSummary';
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import { Phone, Video as VideoIcon, Search, Mic } from 'lucide-react-native';
import {
  publishMyPublicKey,
  getPublicKey,
  resolveDirectRecipient,
} from '../services/keyExchange';
import {
  encryptMessageForPair,
  encryptForDevicesAndSelf,
  decryptMessage,
  decryptForMyDevice,
  decryptSelfEnvelope,
  isEncryptedEnvelope,
  isMultiDeviceEnvelope,
} from '../crypto/encryption';
import { getDeviceKeysForUser, publishMyDeviceKey } from '../services/deviceKeys';
import { getDeviceId } from '../services/deviceIdentity';
import { loadLatest, loadOlder } from '../services/messagePager';
import {
  publishMyRatchetPreKey,
  canUseRatchet,
  encryptForRatchet,
  decryptForRatchet,
  isRatchetEnvelope,
} from '../services/ratchetService';

// ── Phase YY: per-room sender-plaintext disk cache ────────────
// Ratchet wires can't be self-decrypted (the chain key has been
// rotated by the next send). To let the sender re-read their own
// history after a cold restart we mirror plaintext to AsyncStorage
// here. Wrapped in tiny try/catch helpers since this is best-effort.
const _plainKey = (roomId) => `vaultchat_plain_${roomId}`;

async function persistSenderPlaintext(roomId, msgId, plaintext) {
  try {
    const raw = await AsyncStorage.getItem(_plainKey(roomId));
    const map = raw ? JSON.parse(raw) : {};
    map[msgId] = plaintext;
    await AsyncStorage.setItem(_plainKey(roomId), JSON.stringify(map));
  } catch {}
}

// Pretty date label for the date-pill separator. iMessage convention:
//   - Today / Yesterday / weekday for messages from this week
//   - "MMM D" (Apr 30) for older messages this year
//   - "MMM D, YYYY" for messages from a different year
function formatDateLabel(d) {
  if (!d) return '';
  const now = new Date();
  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth() &&
    a.getDate()     === b.getDate();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, now))       return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function hydrateSenderPlaintext(roomId, cacheRef) {
  try {
    const raw = await AsyncStorage.getItem(_plainKey(roomId));
    if (!raw) return;
    const map = JSON.parse(raw);
    for (const [k, v] of Object.entries(map)) cacheRef.current.set(k, v);
  } catch {}
}

// ── GIFs & Emojis ─────────────────────────────────────────────
const GIFS = [
  { emoji: '😂', name: 'Haha',  msg: '😂' },
  { emoji: '🎉', name: 'Party', msg: '🎉' },
  { emoji: '👋', name: 'Wave',  msg: '👋' },
  { emoji: '🔥', name: 'Fire',  msg: '🔥' },
  { emoji: '💯', name: '100',   msg: '💯' },
  { emoji: '🤯', name: 'Wow',   msg: '🤯' },
  { emoji: '👀', name: 'Eyes',  msg: '👀' },
  { emoji: '💪', name: 'Flex',  msg: '💪' },
  { emoji: '😎', name: 'Cool',  msg: '😎' },
  { emoji: '🥳', name: 'Party', msg: '🥳' },
  { emoji: '❤️', name: 'Love',  msg: '❤️' },
  { emoji: '🏆', name: 'Win',   msg: '🏆' },
  { emoji: '😭', name: 'Cry',   msg: '😭' },
  { emoji: '🤣', name: 'Lol',   msg: '🤣' },
  { emoji: '💀', name: 'Dead',  msg: '💀' },
  { emoji: '🫶', name: 'Love',  msg: '🫶' },
];
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','☺️',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😏','😒','🙄','😬',
  '😌','😔','😪','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎',
  '😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱',
  '🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👻','👽','👾','🤖',
  '👋','✋','👌','✌️','🤞','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','👏','🙌','🫶','🙏','💪',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💗','💖','💘',
  '🎉','🎊','🎁','🎀','🏆','🥇','🎯','🎲','🎮','🎵','🎶',
  '🌸','🌺','🌻','🌹','💐','🌿','☘️','🍀','🦋','🐶','🐱',
  '🍕','🍔','🌮','🍜','🍣','🍦','🎂','🍰','☕',
  '🚀','✈️','🏠','🌍','🌈','⭐','🌙','☀️','⚡','🔥','💥','❄️','💎','💯','✨',
];

// ── Full-screen image viewer ──────────────────────────────────
function FullScreenImg({ uri, visible, onClose }) {
  return <ZoomableImage uri={uri} visible={visible} onClose={onClose} />;
}

// ── In-app video player (expo-video) ─────────────────────────
// VideoPlayerInner: hook must be at component top level
function VideoPlayerInner({ uri, style }) {
  const player = useVideoPlayer({ uri }, p => { p.play(); });
  return <VideoView player={player} style={style} nativeControls contentFit="contain" />;
}

function VideoModal({ uri, visible, onClose }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.fsWrap}>
        <TouchableOpacity style={s.fsClose} onPress={onClose}>
          <Text style={s.fsCloseTx}>✕  Close</Text>
        </TouchableOpacity>
        {uri ? <VideoPlayerInner uri={uri} style={s.fsVideo} /> : null}
      </View>
    </Modal>
  );
}

// ── Single lazy photo bubble ──────────────────────────────────
// Handles both IMG:https://... (remote, always available) and
// LOCALIMG:key (local AsyncStorage — only on sender's device/session).
// Long-press routes through onLongPress (opens the picker — quick emoji
// react row + "More" → Pin/Reply/Edit/Delete) so media bubbles get the
// same action surface as text bubbles. Earlier code wired this to a
// reply-only callback, which hid Pin and React behind a feature you
// couldn't see.
function SinglePhoto({ msgKey, isLocal, onOpen, onLongPress, accent }) {
  const [uri,    setUri]    = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUri(null); setFailed(false);
    if (!isLocal) {
      // Remote https:// URL — always available, load directly
      setUri(msgKey);
    } else {
      // Local key — look up in AsyncStorage
      AsyncStorage.getItem(msgKey)
        .then(v => {
          if (v) setUri(v);
          else   setFailed(true); // key not in this session's storage
        })
        .catch(() => setFailed(true));
    }
  }, [msgKey]);

  if (failed) return (
    <View style={{ width: 220, height: 100, borderRadius: 14, backgroundColor: '#1a1a2e',
        alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <Text style={{ fontSize: 22 }}>🖼️</Text>
      <Text style={{ fontSize: 11, color: '#555', textAlign: 'center', paddingHorizontal: 12 }}>
        Photo not available
      </Text>
    </View>
  );
  if (!uri) return (
    <View style={{ width: 220, height: 180, borderRadius: 14, backgroundColor: '#1a1a2e',
        alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="small" color="#555" />
    </View>
  );
  // Premium accent border + tinted shadow on the photo to match the
  // mockup. The Image's borderRadius is bumped slightly inside the
  // outer wrap so the inner photo sits cleanly within the border.
  return (
    <TouchableOpacity onPress={() => onOpen(uri)} onLongPress={onLongPress} delayLongPress={450} activeOpacity={0.88}>
      <View style={{
        borderRadius: 16, overflow: 'hidden',
        borderWidth: 1, borderColor: accent || 'rgba(255,255,255,0.2)',
        shadowColor: accent || '#000', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}>
        <Image source={{ uri }} style={{ width: 220, height: 180 }} resizeMode="cover" />
      </View>
    </TouchableOpacity>
  );
}

// ── Video bubble ──────────────────────────────────────────────
// Long-press routes through onLongPress for the same reason as
// SinglePhoto above — unifies the action surface across media.
function VideoBubble({ uri, onPlay, onLongPress }) {
  return (
    <TouchableOpacity
      style={{ width: 220, height: 130, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      onPress={() => onPlay(uri)} onLongPress={onLongPress} delayLongPress={450}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 26, marginLeft: 4, color: '#fff' }}>▶</Text>
      </View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>Tap to play</Text>
    </TouchableOpacity>
  );
}

// ── Message bubble ────────────────────────────────────────────
function Bubble({ item, myId, tx, sub, card, accent, bubbleOut, bubbleIn, bubbleOutTx, bubbleInTx, onOpenImg, onPlayVid, onReply, onLongPress, tappedId, onTap, reactions, onReact }) {
  const me      = item.sender_id === myId;
  const raw     = item.content || '';
  const nlIdx   = raw.indexOf('\n');
  const main    = nlIdx >= 0 ? raw.substring(0, nlIdx) : raw;
  const cap     = nlIdx >= 0 ? raw.substring(nlIdx + 1).trim() : '';
  const isMedia = main.startsWith('GALLERY:') || main.startsWith('LOCALIMG:') || main.startsWith('IMG:')
               || main.startsWith('VIDEOS:')  || main.startsWith('LOCALVID:') || main.startsWith('VID:')
               || main.startsWith('VOICE:')   || main.startsWith('VONCE:');

  const timeStr = (() => {
    try { return new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  })();
  const fullTimeStr = (() => {
    try {
      const d = new Date(item.created_at);
      const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${date} · ${time}`;
    } catch { return timeStr; }
  })();
  const showFull = tappedId === item.id;

  const body = () => {
    if (raw.startsWith('REPLY:')) {
      // Format: REPLY:{len}:{quotedContent}{actualMessage}
      // Length-prefix avoids | collision with GALLERY: keys
      const colonIdx = raw.indexOf(':', 6);
      const qLen     = parseInt(raw.substring(6, colonIdx)) || 0;
      const quoted   = raw.substring(colonIdx + 1, colonIdx + 1 + qLen);
      const actual   = raw.substring(colonIdx + 1 + qLen);
      return (
        <>
          <ReplyPreview
            content={quoted}
            textColor={me ? 'rgba(255,255,255,0.6)' : sub}
            borderColor={me ? 'rgba(255,255,255,0.5)' : accent}
          />
          <Text style={[s.msgTx, { color: me ? '#fff' : tx }]}>{actual}</Text>
        </>
      );
    }
    if (main.startsWith('GALLERY:')) {
      const keys = main.replace('GALLERY:', '').split('|');
      return <>
        <ResolvedPhotoStack keys={keys} onLongPress={() => onLongPress && onLongPress(item)} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('LOCALIMG:') || main.startsWith('IMG:')) {
      const key = main.replace('LOCALIMG:', '').replace('IMG:', '');
      return <>
        <SinglePhoto msgKey={key} isLocal={main.startsWith('LOCALIMG:')} onOpen={onOpenImg} onLongPress={() => onLongPress && onLongPress(item)} accent={accent} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('VOICE:')) {
      // Format: VOICE:<url>|<duration_sec>
      // Permissive parse so a malformed payload still renders a player
      // (it'll just show 0:00 and be silent on tap if the URL is bad).
      const rest = main.slice('VOICE:'.length);
      const sep  = rest.lastIndexOf('|');
      const url  = sep >= 0 ? rest.slice(0, sep) : rest;
      const dur  = sep >= 0 ? parseFloat(rest.slice(sep + 1)) || 0 : 0;
      return <>
        <VoiceNoteBubble url={url} durationSec={dur} accent={accent} isMe={me} bgColor={'transparent'} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('VONCE:')) {
      // Format: VONCE:<url>|<kind>  where kind is 'image' | 'video'
      const rest = main.slice('VONCE:'.length);
      const sep  = rest.lastIndexOf('|');
      const url  = sep >= 0 ? rest.slice(0, sep) : rest;
      const kind = sep >= 0 ? rest.slice(sep + 1) : 'image';
      return <>
        <ViewOncePhoto
          messageId={item.id}
          url={url}
          kind={kind}
          isMe={me}
          accent={accent}
          onOpenImage={onOpenImg}
          onPlayVideo={onPlayVid}
        />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('VIDEOS:')) {
      return <>
        <ResolvedVideoCarousel content={main} onLongPress={() => onLongPress && onLongPress(item)} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('LOCALVID:') || main.startsWith('VID:')) {
      const uri = main.replace('LOCALVID:', '').replace('VID:', '');
      return <>
        <VideoBubble uri={uri} onPlay={onPlayVid} onLongPress={() => onLongPress && onLongPress(item)} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('FILE:')) {
      const [fname, url] = main.replace('FILE:', '').split('|');
      return (
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          onPress={async () => {
            if (!url) return;
            // Try Share.share first — iOS routes to Word/PDF/Files app based on extension
            try {
              if (url.startsWith('http')) {
                await Linking.openURL(url);
              } else {
                // Local file — use Share sheet which triggers app picker (Word, Adobe, etc.)
                await Share.share({ url, message: fname }, { dialogTitle: 'Open with…' });
              }
            } catch { try { await Linking.openURL(url); } catch {} }
          }}
          onLongPress={() => onLongPress && onLongPress(item)} delayLongPress={450}>
          <Text style={{ fontSize: 26 }}>📄</Text>
          <View>
            <Text style={[s.msgTx, { color: me ? '#fff' : tx }]}>{fname}</Text>
            <Text style={{ fontSize: 11, color: me ? 'rgba(255,255,255,0.6)' : sub }}>Tap to open</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return <Text style={[s.msgTx, { color: me ? bubbleOutTx : bubbleInTx }]}>{raw}</Text>;
  };

  return (
    <SwipeableRow onReply={() => { taptic(); onReply && onReply(); }}>
      <View style={[s.bWrap, me ? s.myWrap : s.theirWrap]}>
        <TouchableOpacity
          style={[
            s.bubble,
            me
              ? [s.myBubble,    { backgroundColor: bubbleOut }]
              : [s.theirBubble, { backgroundColor: bubbleIn  }],
            isMedia && s.mediaPad,
            // Media-only bubbles (photo/video, no caption) get a
            // transparent background — the photo's own accent border
            // is the visual frame, the colored bubble was redundant
            // and looked like an iMessage chat bubble around an iMessage
            // photo. Caption messages keep the colored bubble so the
            // text still has a tinted ground to sit on.
            isMedia && !cap && { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0, padding: 0 },
          ]}
          onPress={() => onTap && onTap(item.id)}
          onLongPress={() => onLongPress && onLongPress(item)} delayLongPress={450} activeOpacity={0.88}>
          {body()}
        </TouchableOpacity>
        {reactions?.length > 0 && (
          <ReactionBar
            reactions={reactions}
            myUserId={myId}
            onReact={onReact}
            accent={accent}
            card={card}
          />
        )}
        <View style={[s.timeRow, me ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
          <Text style={[s.time, me ? s.tR : s.tL]}>
            {item.message_type === 'scheduled' && item.scheduled_at
              ? `⏰ Scheduled · ${new Date(item.scheduled_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
              : `${showFull ? fullTimeStr : timeStr}${item.edited ? '  ✎' : ''}`}
          </Text>
          {me && item.message_type !== 'scheduled' && (() => { const r = receiptIcon(item.status); return (
            <Text style={{ fontSize: 11, color: r.color, marginLeft: 3 }}>{r.icon}</Text>
          ); })()}
        </View>
      </View>
    </SwipeableRow>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function ChatRoomScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent,
          bubbleOut, bubbleIn, bubbleOutTx, bubbleInTx, isPremium } = useTheme();
  // Per Harold (2026-04-29): the call/video icons in the chat header
  // should pop in real gold for premium users to drive the "premium
  // feel" — purple makes them blend into the rest of the accent. Free
  // users keep the accent color so their UI doesn't change.
  const callIconColor = isPremium ? '#F5C518' : accent;
  // Safe-area insets — used to pad the long-press action sheet so
  // its bottom row clears the iPhone home-indicator + any custom
  // gestures area, instead of being hardcoded to 34px (which
  // could under-clear on Dynamic Island devices).
  const insets = useSafeAreaInsets();
  const { roomId, recipientPhone, recipientName, recipientPhoto, pendingMessage } = route.params || {};

  const [messages,     setMessages]     = useState([]);
  const [text,         setText]         = useState('');
  const [sending,      setSending]      = useState(false);
  // Phase NN: cursor-based pagination state. We hold onto the
  // oldest-loaded message timestamp so onEndReached can ask for
  // the next 50 older. `hasMore` flips false when the server
  // returns less than the page size — no further pages.
  const [oldestCursor, setOldestCursor] = useState(null);
  const [hasMore,      setHasMore]      = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // ── Voice notes (task #69) ─────────────────────────────────
  // useAudioRecorder returns a recorder object that lives across renders.
  // We control it imperatively (record / stop) and read recorder.uri once
  // the recording is finalized. RecordingPresets.HIGH_QUALITY uses .m4a
  // / AAC encoding which is universally compatible.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording,        setIsRecording]        = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const [recordingElapsed,   setRecordingElapsed]   = useState(0);
  const recordingTimerRef = useRef(null);
  const [myId,         setMyId]         = useState('');
  const [myHandle,     setMyHandle]     = useState('');
  const [replyTo,      setReplyTo]      = useState(null);
  const [tappedId,     setTappedId]     = useState(null); // for timestamp reveal
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  // Pinned message is derived from messages.is_pinned (Supabase-synced).
  // No separate state — the realtime UPDATE subscription already keeps `messages`
  // in sync across devices/users, so any is_pinned change propagates automatically.
  const [reactions,    setReactions]    = useState({});   // { messageId: [{ id, message_id, user_id, emoji }] }
  const [pickerMsg,    setPickerMsg]    = useState(null); // message to react to
  const [typingUsers,  setTypingUsers]  = useState([]);   // [{handle}] currently typing
  const [pendingCount, setPendingCount] = useState(0);    // queued messages awaiting send
  const [menuMsg,      setMenuMsg]      = useState(null);
  const [menuVis,      setMenuVis]      = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget,  setReportTarget]  = useState(null);
  const [editingMsg,   setEditingMsg]   = useState(null);   // message being edited
  const [editText,     setEditText]     = useState('');
  const [contactEditVis, setContactEditVis] = useState(false);
  const [contactData,    setContactData]    = useState(null);

  // ── Encryption state (1:1 DMs only) ───────────────────────────
  // recipientId + recipientPubKey get resolved on mount from rooms.member_ids.
  // If either is missing, we fall back to plaintext so the app never breaks.
  const [recipientId,     setRecipientId]     = useState(null);

  // Live presence — subscribes to user:status + polls every 30s for the
  // recipient's online / last-seen state. Renders 'Online' (green) or
  // 'Last seen 3h ago' in the header; falls back to the E2E label if
  // we don't know the recipient yet or they've never been seen.
  const presence = usePresence(recipientId);

  // ── Scheduled messages (#79) ────────────────────────────────
  // Long-press the send button to pick a future time. We insert the
  // message with scheduled_at + message_type='scheduled' and SKIP the
  // socket broadcast so the recipient doesn't see it yet. The sender's
  // own view hides it by default (shows a small Scheduled chip). On
  // chat open, we sweep overdue scheduled messages and release them —
  // flip message_type to 'text', set created_at=now(), update the row.
  // The recipient's existing 8s polling (or realtime subscription)
  // then picks it up as a normal message. Simple, no server cron.
  const [scheduleMode,    setScheduleMode]    = useState(false);  // picker visible?
  const [scheduledAt,     setScheduledAt]     = useState(new Date(Date.now() + 60 * 60 * 1000)); // default: 1 hour from now
  const [schedulePickerStep, setSchedulePickerStep] = useState('date'); // 'date' → 'time' → submit
  const [recipientPubKey, setRecipientPubKey] = useState(null);
  // Phase MM: list of recipient's device keys for multi-device E2E.
  // [{device_id, public_key}, ...]. Empty when peer is pre-Phase-MM
  // (no rows in user_device_keys yet) — we then fall back to
  // recipientPubKey for the legacy single-recipient envelope.
  const [recipientDevices, setRecipientDevices] = useState([]);
  // Phase ZZ: my OTHER devices (excluding this install). Included in
  // by_dev at send time so any of my installs can decrypt the row,
  // not just the one whose identity priv key matches ct_self.
  const [mySenderDevices, setMySenderDevices] = useState([]);
  // encryptionStatus gates the send button until we know whether we can
  // encrypt to the peer. States:
  //   'resolving' — useEffect still running (publish + lookup). Send blocked.
  //   'ready'     — peer pubkey known, messages will be encrypted.
  //   'plaintext' — peer has no pubkey (legacy or not yet published). Allow send,
  //                 but warn the user.
  //   'error'     — timeout / network failure. Allow send as last-resort plaintext.
  // We hard-cap resolution at 3s so a slow Supabase never permanently blocks sends.
  const [encryptionStatus, setEncryptionStatus] = useState('resolving');
  // Phase YY: Double Ratchet eligibility for THIS conversation. Set
  // by the recipient-resolution effect once we know whether both
  // sides are single-device + have published a ratchet bundle. When
  // true, postMsg routes via encryptForRatchet (forward-secret);
  // otherwise we keep using the multi-device (MD2) envelope.
  const [ratchetReady,         setRatchetReady]         = useState(false);
  const [ratchetPeerDeviceId,  setRatchetPeerDeviceId]  = useState(null);
  // Plaintext cache keyed by message id — lets the sender's own device render
  // history without re-hitting the crypto path for already-decrypted rows,
  // and lets optimistic (tempId) messages carry plaintext through to the
  // confirmed row once Supabase echoes it back encrypted.
  // Phase YY: ALSO doubles as the persistence layer for sender-side
  // ratchet plaintext — ratchet wires can't be self-decrypted (the
  // chain key has rotated), so we mirror the cache to AsyncStorage
  // under `vaultchat_plain_${roomId}` and hydrate it on screen mount.
  const plaintextCacheRef = useRef(new Map());

  // Staged media
  const [stagedPhotos, setStagedPhotos] = useState([]);  // { uri, key }
  const [stagedVideos, setStagedVideos] = useState([]);  // { uri }

  // Viewer modals
  const [fullImgUri,   setFullImgUri]   = useState(null);
  const [vidUri,       setVidUri]       = useState(null);

  // Attachment modals
  const [attachModal,  setAttachModal]  = useState(false);
  const [gifModal,     setGifModal]     = useState(false);
  const [emojiModal,   setEmojiModal]   = useState(false);
  const [emojiTab,     setEmojiTab]     = useState('emoji');

  const listRef       = useRef(null);
  const pendingAttach = useRef(null);

  // ── Decrypt a single message row for display ──────────────────
  // Returns a new row with `content` swapped to plaintext if the row was
  // encrypted by us; leaves the row alone for legacy plaintext rows.
  async function decryptRow(row) {
    if (!row || typeof row.content !== 'string') return row;
    // Plaintext cache hit (e.g., we just sent this — avoid re-decrypting).
    // For ratchet sender rows the cache IS the only path: the wire
    // can't be self-decrypted because the chain key has rotated.
    const cached = plaintextCacheRef.current.get(row.id);
    if (cached != null) return { ...row, content: cached };
    const isRatchet = isRatchetEnvelope(row.content);
    const isMulti   = isMultiDeviceEnvelope(row.content);
    if (!isRatchet && !isMulti && !isEncryptedEnvelope(row.content)) return row;
    try {
      let plaintext;
      if (isRatchet) {
        if (row.sender_id && row.sender_id === myId) {
          // Sender path: chain key is gone, no recovery from the
          // wire. The hydrated disk cache (vaultchat_plain_<roomId>)
          // covers cold restart; if it missed, mark the row locked.
          throw new Error('Ratchet sender plaintext not in local cache');
        }
        const peerDeviceId = row.metadata?.sender_device_id;
        if (!peerDeviceId) throw new Error('Ratchet wire missing sender_device_id');
        plaintext = await decryptForRatchet(row.sender_id, peerDeviceId, row.content);
      } else if (row.sender_id && row.sender_id === myId) {
        // I sent this — try the self-seal first (works for both
        // single and multi-device wire formats since ct_self is
        // independent), then fall back to opening my slot.
        //
        // ct_self is sealed with the SENDING DEVICE's identity priv
        // key. If the row was sent from a different install (or
        // before a key regen) the self-seal won't open on this
        // device — but the multi-device by_dev[<thisDeviceId>]
        // slot still will. So we treat ct_self as best-effort and
        // fall through to the per-device path on failure.
        const selfEnv = row.metadata?.ct_self;
        let opened = false;
        if (selfEnv) {
          try {
            plaintext = await decryptSelfEnvelope(selfEnv);
            opened = true;
          } catch (selfErr) {
            if (__DEV__) console.log('ct_self failed, falling back to by_dev:', selfErr?.message);
          }
        }
        if (!opened) {
          if (isMulti) {
            const myDeviceId = await getDeviceId();
            plaintext = await decryptForMyDevice(row.content, myDeviceId);
          } else {
            plaintext = await decryptMessage(row.content);
          }
        }
      } else if (isMulti) {
        // Peer sent a multi-device envelope — open the slot for
        // THIS device's id.
        const myDeviceId = await getDeviceId();
        plaintext = await decryptForMyDevice(row.content, myDeviceId);
      } else {
        plaintext = await decryptMessage(row.content);
      }
      plaintextCacheRef.current.set(row.id, plaintext);
      return { ...row, content: plaintext };
    } catch (e) {
      if (__DEV__) console.warn('decryptRow failed for', row.id, e?.message);
      return { ...row, content: '[Can\u2019t decrypt this message on this device]' };
    }
  }

  // Decrypt many in parallel. Preserves order.
  async function decryptRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return rows;
    return Promise.all(rows.map(decryptRow));
  }

  // ── Resolve recipient + publish my pubkey on mount ────────────
  useEffect(() => {
    if (!myId) return;
    let cancelled = false;

    // Hard timeout: if resolution hasn't finished in 3s, unblock sends as
    // plaintext so a slow/unavailable Supabase never strands the user.
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setEncryptionStatus(prev => (prev === 'resolving' ? 'error' : prev));
      }
    }, 3000);

    (async () => {
      try {
        // Publish our legacy single-recipient pubkey AND the per-
        // device key (Phase MM) so peers using either path can
        // encrypt to us. Both are best-effort — silent on failure
        // so a slow Supabase doesn't strand the user.
        publishMyPublicKey(myId).catch(() => {});
        publishMyDeviceKey(myId, recipientPhone).catch(() => {});
        // Phase YY: publish my ratchet pre-key bundle alongside the
        // device key so peers can bootstrap a Double Ratchet session.
        publishMyRatchetPreKey(myId).catch(() => {});
        // Find the other member of this room. Pass recipientPhone so legacy
        // chats (no rooms row yet) can fall back to a profile lookup.
        const otherId = await resolveDirectRecipient(roomId, myId, { recipientPhone });
        if (cancelled) return;
        setRecipientId(otherId);
        if (otherId) {
          // Resolve BOTH the multi-device list (preferred), the
          // legacy single pubkey (fallback), AND my own other
          // devices (so by_dev can fan out to them — Phase ZZ) in
          // parallel. Whichever returns usable data drives
          // encryptionStatus.
          const [devices, pk, myDevs, myThisDeviceId] = await Promise.all([
            getDeviceKeysForUser(otherId),
            getPublicKey(otherId),
            getDeviceKeysForUser(myId),
            getDeviceId(),
          ]);
          if (cancelled) return;
          setRecipientDevices(devices);
          setRecipientPubKey(pk);
          // Filter out THIS install (ct_self handles it more
          // efficiently). Anything left is another install of mine
          // that should also be able to read what I send here.
          const others = (myDevs || []).filter(d => d.device_id && d.device_id !== myThisDeviceId);
          setMySenderDevices(others);
          // Ready if peer has at least one published key (device or
          // legacy single). Otherwise plaintext gate fires.
          const ready = (devices && devices.length > 0) || !!pk;
          setEncryptionStatus(ready ? 'ready' : 'plaintext');
          // Phase YY: kick off ratchet eligibility check in the
          // background. We don't gate the UI on it — if it returns
          // false the existing MD2 path takes over silently.
          (async () => {
            try {
              const elig = await canUseRatchet(myId, otherId);
              if (cancelled) return;
              setRatchetReady(!!elig?.ok);
              setRatchetPeerDeviceId(elig?.peerDeviceId || null);
              if (__DEV__) {
                console.log('[ratchet] eligibility for', otherId.slice(0, 8),
                  '→', elig?.ok ? 'ENABLED' : `disabled (${elig?.reason})`);
              }
            } catch {}
          })();
        } else {
          setEncryptionStatus('plaintext');
        }
      } catch {
        if (!cancelled) setEncryptionStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [roomId, myId]);

  // ── Peer key polling ────────────────────────────────────────
  // The peer might not have published their NaCl public key yet
  // (signed up before encryption shipped, app never opened, etc).
  // Re-check every 15s while we're stuck in plaintext/error so the
  // chat unlocks automatically the moment they open VaultChat —
  // no manual refresh required from either side. getPublicKey only
  // caches HITS, so polling on misses re-queries the server cheaply.
  useEffect(() => {
    if (!recipientId) return;
    if (encryptionStatus !== 'plaintext' && encryptionStatus !== 'error') return;
    let cancelled = false;
    const tick = async () => {
      try {
        // Try BOTH the multi-device path and the legacy single-pubkey
        // path. Whichever returns usable data first unlocks the chat.
        const [devices, pk] = await Promise.all([
          getDeviceKeysForUser(recipientId),
          getPublicKey(recipientId),
        ]);
        if (cancelled) return;
        const hasAnything = (devices && devices.length > 0) || !!pk;
        if (!hasAnything) return;
        setRecipientDevices(devices || []);
        if (pk) setRecipientPubKey(pk);
        setEncryptionStatus('ready');
      } catch {}
    };
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [recipientId, encryptionStatus]);

  useEffect(() => {
    loadUser();
    // Phase YY: hydrate sender-plaintext disk cache BEFORE fetchMessages
    // so freshly-decrypted ratchet sender rows hit the cache instead of
    // tripping the "[Can't decrypt...]" placeholder.
    hydrateSenderPlaintext(roomId, plaintextCacheRef).then(() => {
      fetchMessages();
    });
    // Flush any queued messages from offline period
    flushQueue().catch(() => {});

    // Supabase Realtime — instant message delivery
    // (requires Realtime enabled on 'messages' table in Supabase Dashboard)
    const unsubRoom = subscribeToRoom(
      roomId,
      // onInsert: new message arrives instantly
      async (rawMsg) => {
        const newMsg = await decryptRow(rawMsg);
        setMessages(prev => {
          // Don't add if we already have it (temp or real).
          // Match by id, or — if the row is one of ours echoing back — by
          // sender + decrypted content matching the optimistic temp row.
          const dup = prev.find(m =>
            m.id === newMsg.id ||
            (m.sender_id === newMsg.sender_id && m.content === newMsg.content)
          );
          if (dup) {
            const updated = prev.map(m =>
              m.sender_id === newMsg.sender_id &&
              m.content === newMsg.content &&
              String(m.id).startsWith('temp_')
                ? newMsg : m
            );
            AsyncStorage.setItem(`vaultchat_msgs_${roomId}`, JSON.stringify(updated.filter(m => !String(m.id).startsWith('temp_')))).catch(() => {});
            return updated;
          }
          const next = [...prev, newMsg];
          AsyncStorage.setItem(`vaultchat_msgs_${roomId}`, JSON.stringify(next.filter(m => !String(m.id).startsWith('temp_')))).catch(() => {});
          // inverted FlatList — no scrollToEnd needed, new items appear at bottom automatically
          // Mark as delivered when we receive someone else's message
          markDelivered(newMsg.id, myId, newMsg.sender_id);
          return next;
        });
      },
      // onUpdate: message edited or status changed
      async (rawMsg) => {
        const updatedMsg = await decryptRow(rawMsg);
        setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
      }
    );

    // Typing indicator subscription
    const unsubTyping = subscribeToTyping(roomId, ({ userId, handle, isTyping }) => {
      setTypingUsers(prev => {
        if (isTyping && userId !== myId) {
          return prev.find(t => t.userId === userId) ? prev : [...prev, { userId, handle }];
        }
        return prev.filter(t => t.userId !== userId);
      });
    });

    // Realtime: reactions
    const reactionSub = freshChannel(`reactions:${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'message_reactions',
      }, payload => {
        if (payload.eventType === 'INSERT') {
          const r = payload.new;
          setReactions(prev => ({
            ...prev,
            [r.message_id]: [...(prev[r.message_id] || []).filter(x => x.id !== r.id), r],
          }));
        } else if (payload.eventType === 'DELETE') {
          const r = payload.old;
          setReactions(prev => ({
            ...prev,
            [r.message_id]: (prev[r.message_id] || []).filter(x => x.id !== r.id),
          }));
        }
      })
      .subscribe();

    // Fallback poll (slower) in case Realtime not enabled
    const poll = setInterval(fetchMessages, 8000);
    return () => {
      clearInterval(poll);
      unsubRoom();
      unsubTyping();
      supabase.removeChannel(reactionSub);
    };
  }, [roomId, myId]);

  // Auto-send media/message passed from NewMessageScreen
  useEffect(() => {
    if (pendingMessage && myId) {
      postMsg(pendingMessage);
    }
  }, [myId]);  // fires once myId is set (after loadUser)

  // Release overdue scheduled messages on chat open + every minute
  // while open. Recipient sees them as fresh messages on their next poll.
  useEffect(() => {
    if (!myId || !roomId) return;
    releaseOverdueScheduled();
    const t = setInterval(releaseOverdueScheduled, 60_000);
    return () => clearInterval(t);
  }, [myId, roomId]);

  useEffect(() => {
    if (!attachModal && pendingAttach.current) {
      const t = pendingAttach.current; pendingAttach.current = null;
      setTimeout(() => handleAttachType(t), 700);
    }
  }, [attachModal]);

  // Build contact data from route params for the edit form
  useEffect(() => {
    setContactData({
      firstName: recipientName?.split(' ')[0] || '',
      lastName:  recipientName?.split(' ').slice(1).join(' ') || '',
      name:      recipientName || '',
      phone:     recipientPhone || '',
      photo:     recipientPhoto || null,
      email:     '',
      address:   '',
      birthday:  '',
      url:       '',
      notes:     '',
    });
  }, [recipientName, recipientPhone, recipientPhoto]);

  // Override route-param recipientName with the LIVE local-contacts
  // entry when one exists. Lets a contact rename propagate to the
  // chat header without requiring a re-navigate. Match is by
  // last-10-digits of the phone since the route param is sometimes
  // raw and sometimes E.164.
  useEffect(() => {
    if (!recipientPhone) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('vaultchat_contacts');
        if (!raw) return;
        const list = JSON.parse(raw);
        if (!Array.isArray(list)) return;
        const norm = String(recipientPhone).replace(/\D/g, '').slice(-10);
        if (!norm) return;
        const match = list.find(c => {
          const p = String(c.phone || c.mobile || '').replace(/\D/g, '').slice(-10);
          return p && p === norm;
        });
        if (cancelled || !match) return;
        const merged = (match.name && match.name.trim())
          || `${match.firstName || ''} ${match.lastName || ''}`.trim()
          || recipientName;
        setContactData(prev => ({
          ...(prev || {}),
          firstName: match.firstName || merged?.split(' ')[0] || '',
          lastName:  match.lastName  || merged?.split(' ').slice(1).join(' ') || '',
          name:      merged,
          phone:     recipientPhone,
          photo:     match.photo  || prev?.photo  || null,
          email:     match.email  || prev?.email  || '',
          address:   match.address|| prev?.address|| '',
          birthday:  match.birthday|| prev?.birthday|| '',
          url:       match.url    || prev?.url    || '',
          notes:     match.notes  || prev?.notes  || '',
        }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [recipientPhone]);

  async function loadUser() {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      setMyId(data.user.id);
      // Fetch handle for typing indicator
      const { data: p } = await supabase.from('profiles').select('handle').eq('id', data.user.id).single().catch(() => ({ data: null }));
      if (p?.handle) setMyHandle(p.handle);
      // Mark existing messages as read
      markRoomAsRead(roomId, data.user.id);
      return;
    }
    const raw = await AsyncStorage.getItem('vaultchat_user');
    if (raw) {
      const u = JSON.parse(raw);
      const uid = u.id || u.phone || 'local';
      setMyId(uid);
      const h = await AsyncStorage.getItem('vaultchat_display_name');
      if (h) setMyHandle(h);
      markRoomAsRead(roomId, uid);
    }
  }

  async function fetchMessages() {
    if (!roomId) return;
    const MKEY = `vaultchat_msgs_${roomId}`;
    try {
      // Phase NN: fetch only the LATEST page (50 by default) instead
      // of the entire room history. The user can scroll to older
      // messages and the FlatList's onEndReached fires loadMoreOlder().
      const page = await loadLatest({ roomId, table: 'messages', roomColumn: 'room_id' });
      const data = page.items;
      if (data && data.length > 0) {
        const real = data.filter(m => m.id && !String(m.id).startsWith('temp_'));
        setOldestCursor(page.oldestCursor);
        setHasMore(page.hasMore);
        // Decrypt in parallel before rendering. Plaintext legacy rows pass through.
        const decrypted = await decryptRows(real);
        // Merge — preserve local optimistic temp_-id messages so a
        // freshly-sent reply doesn't briefly disappear when the
        // server poll arrives before the realtime INSERT echo. Same
        // rule as the reactions merge in Phase FF.
        setMessages(prev => {
          const serverIds = new Set(decrypted.map(m => m.id));
          const localPending = prev.filter(m =>
            String(m.id).startsWith('temp_') && !serverIds.has(m.id)
          );
          return [...decrypted, ...localPending];
        });
        AsyncStorage.setItem(MKEY, JSON.stringify(decrypted)).catch(() => {});
        // Load reactions for these messages.
        // MERGE rather than overwrite — preserve any local optimistic
        // entries (temp_-id reactions still being confirmed) so the
        // user's just-added emoji doesn't briefly disappear when the
        // poll arrives ahead of the server's read replica.
        setTimeout(() => {
          const ids = real.map(m => m.id).filter(Boolean);
          if (ids.length) {
            supabase.from('message_reactions').select('*').in('message_id', ids)
              .then(({ data: rdata }) => {
                if (!rdata) return;
                const grouped = {};
                rdata.forEach(r => {
                  if (!grouped[r.message_id]) grouped[r.message_id] = [];
                  grouped[r.message_id].push(r);
                });
                setReactions(prev => {
                  const next = { ...prev };
                  for (const mid of Object.keys(grouped)) {
                    const serverRows   = grouped[mid] || [];
                    const localPending = (prev[mid] || []).filter(r => String(r.id).startsWith('temp_'));
                    next[mid] = [...serverRows, ...localPending];
                  }
                  // KEEP local non-empty entries when the server returns
                  // empty (stale read replica). Realtime DELETE handles
                  // genuine removals, so trusting local here is safe and
                  // stops fresh emojis from flickering off.
                  for (const mid of ids) {
                    if (grouped[mid]) continue;
                    const localRows = prev[mid];
                    if (localRows && localRows.length > 0) next[mid] = localRows;
                    else delete next[mid];
                  }
                  return next;
                });
              }).catch(() => {});
          }
        }, 100);
        return;
      }
    } catch {}
    // Pinned message state is derived from messages.is_pinned — no local storage needed.
    // Fallback: AsyncStorage keeps messages even if Supabase is unreachable
    try {
      const raw = await AsyncStorage.getItem(MKEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }

  // Phase NN: pull the next page of OLDER messages when the user
  // scrolls to the top of the inverted FlatList. Inverted = bottom
  // of the list is "newest", top is "oldest", so onEndReached fires
  // when they reach the top edge. We load 50 more older + prepend.
  async function loadMoreOlder() {
    if (!roomId || !oldestCursor || !hasMore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await loadOlder({ roomId, table: 'messages', roomColumn: 'room_id', cursor: oldestCursor });
      if (page.items?.length) {
        const decrypted = await decryptRows(page.items);
        setMessages(prev => {
          const seen = new Set(prev.map(m => m.id));
          const fresh = decrypted.filter(m => !seen.has(m.id));
          return [...fresh, ...prev]; // prepend older to chronological list
        });
        setOldestCursor(page.oldestCursor);
      }
      setHasMore(!!page.hasMore);
    } catch (e) {
      if (__DEV__) console.warn('loadMoreOlder error:', e?.message);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function postMsg(content) {
    // ── Hard E2E gate ────────────────────────────────────────
    // VaultChat advertises end-to-end encryption. Refuse to send
    // when peer has neither device keys nor a legacy single pubkey.
    const hasDevices = recipientDevices && recipientDevices.length > 0;
    if (!hasDevices && !recipientPubKey) {
      try {
        Alert.alert(
          'Encrypted only',
          `${recipientName || 'This contact'} hasn’t set up encryption yet. Ask them to open VaultChat — your messages will be deliverable as soon as their key publishes.`,
          [{ text: 'OK' }],
        );
      } catch {}
      return;
    }

    const now = new Date().toISOString();
    const tempId = `temp_${Date.now()}`;
    // Optimistic row uses PLAINTEXT `content` so the sender sees their own
    // message immediately. We encrypt only the wire payload.
    const newMsg = { id: tempId, room_id: roomId, sender_id: myId, content, created_at: now };

    // Optimistic update
    setMessages(prev => [...prev, newMsg]);
    // inverted FlatList — new messages appear at bottom automatically

    // Build the insert payload.
    // Phase YY: prefer the Double Ratchet path if both sides are
    // single-device with a published bundle (forward-secret).
    // Phase MM: otherwise prefer the multi-device envelope when peer
    // has device keys published.
    // Pre-Phase-MM peers fall through to the legacy single-recipient
    // envelope.
    let insertPayload;
    let usedRatchet = false;
    try {
      if (ratchetReady && ratchetPeerDeviceId && recipientId) {
        const wire = await encryptForRatchet(recipientId, ratchetPeerDeviceId, content);
        const myDeviceId = await getDeviceId();
        insertPayload = {
          room_id:   roomId,
          sender_id: myId,
          content:   wire,
          // No ct_self — ratchet wires can't be self-decrypted (the
          // chain key has rotated). The sender persists their own
          // plaintext to AsyncStorage instead (see below).
          metadata: { encrypted: true, v: 'ratchet:v1', sender_device_id: myDeviceId },
        };
        usedRatchet = true;
      } else {
        let wireContent, metadataSelf;
        if (hasDevices) {
          // Phase ZZ: include my OTHER devices in by_dev so any of
          // my installs can read this row (not just the one whose
          // identity priv key matches ct_self).
          ({ content: wireContent, metadataSelf } =
            await encryptForDevicesAndSelf(content, recipientDevices, mySenderDevices));
        } else {
          ({ content: wireContent, metadataSelf } =
            await encryptMessageForPair(content, recipientPubKey));
        }
        insertPayload = {
          room_id:  roomId,
          sender_id: myId,
          content:  wireContent,
          metadata: { ct_self: metadataSelf, encrypted: true, v: hasDevices ? 'multi:1' : 2 },
        };
      }
    } catch (e) {
      if (__DEV__) console.warn('encrypt failed:', e?.message);
      try { Alert.alert('Send failed', 'Could not encrypt this message. Try again in a moment.'); } catch {}
      // Roll back the optimistic row.
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert(insertPayload)
        .select()
        .single();
      if (!error && data) {
        // Cache the plaintext under the confirmed row id so any future
        // re-render / realtime echo resolves instantly without re-decrypting.
        plaintextCacheRef.current.set(data.id, content);
        // Phase YY: for ratchet sends, ALSO persist plaintext to disk
        // so the sender can re-read their own history after a cold
        // restart (the wire isn't self-decryptable). Best-effort —
        // failure just means the sender sees a locked row next launch.
        if (usedRatchet) {
          persistSenderPlaintext(roomId, data.id, content).catch(() => {});
        }
        // Replace the temp row with the confirmed one, but keep plaintext
        // `content` in the visible state (not the wire ciphertext).
        const confirmedForUI = { ...data, content };
        setMessages(prev => {
          const updated = prev.map(m => m.id === tempId ? confirmedForUI : m);
          AsyncStorage.setItem(`vaultchat_msgs_${roomId}`, JSON.stringify(updated.filter(m => !String(m.id).startsWith('temp_')))).catch(() => {});
          return updated;
        });
      } else {
        // Persist temp as local message
        const raw = await AsyncStorage.getItem(`vaultchat_msgs_${roomId}`);
        const existing = raw ? JSON.parse(raw) : [];
        const saved = { ...newMsg, id: `local_${Date.now()}` };
        await AsyncStorage.setItem(`vaultchat_msgs_${roomId}`, JSON.stringify([...existing, saved])).catch(() => {});
      }
    } catch {
      // Network failure — queue the ciphertext for retry so the server never
      // sees plaintext even on delayed delivery.
      await enqueue({
        tempId,
        table: 'messages',
        payload: insertPayload,
      });
      const raw = await AsyncStorage.getItem(`vaultchat_msgs_${roomId}`);
      const existing = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(`vaultchat_msgs_${roomId}`, JSON.stringify([...existing, newMsg])).catch(() => {});
    }

    // Update chat preview
    try {
      const raw = await AsyncStorage.getItem('vaultchat_chats');
      if (raw) {
        const up = JSON.parse(raw).map(c =>
          c.roomId === roomId ? { ...c, lastMessage: (() => {
              // Strip REPLY:{len}:{quoted} prefix so chats list shows clean text
              if (content.startsWith('REPLY:')) {
                const ci = content.indexOf(':', 6);
                const qLen = parseInt(content.substring(6, ci)) || 0;
                return content.substring(ci + 1 + qLen, ci + 1 + qLen + 40) || '↩ Reply';
              }
              return content.substring(0, 40);
            })(),
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : c
        );
        await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(up));
      }
    } catch {}
  }

  // ── Edit a message (within 1 hour, own messages only) ──────
  async function doEditMessage() {
    if (!menuMsg || !editText.trim()) return;
    const newContent = editText.trim();
    setMessages(prev => prev.map(m => m.id === menuMsg.id ? { ...m, content: newContent, edited: true } : m));
    setEditingMsg(null); setEditText('');

    // Mirror the send path: encrypt the edit if this row was originally encrypted
    // (or if we have a recipient pubkey). Otherwise fall back to plaintext.
    let updatePayload = { content: newContent, edited: true };
    const wasEncrypted = menuMsg?.metadata?.encrypted || isEncryptedEnvelope(menuMsg?.content);
    if (recipientPubKey && (wasEncrypted || true)) {
      try {
        const { content: wireContent, metadataSelf } = await encryptMessageForPair(newContent, recipientPubKey);
        updatePayload = {
          content:  wireContent,
          edited:   true,
          metadata: { ...(menuMsg?.metadata || {}), ct_self: metadataSelf, encrypted: true, v: 2 },
        };
      } catch (e) {
        if (__DEV__) console.warn('edit encrypt failed, sending plaintext:', e?.message);
      }
    }

    try {
      await supabase.from('messages').update(updatePayload).eq('id', menuMsg.id);
      // Refresh plaintext cache for the edited row.
      plaintextCacheRef.current.set(menuMsg.id, newContent);
    } catch {}
    // Persist locally (plaintext in state so UI keeps rendering the text)
    try {
      const raw = await AsyncStorage.getItem(`vaultchat_msgs_${roomId}`);
      if (raw) {
        const msgs = JSON.parse(raw).map(m => m.id === menuMsg.id ? { ...m, content: newContent, edited: true } : m);
        await AsyncStorage.setItem(`vaultchat_msgs_${roomId}`, JSON.stringify(msgs));
      }
    } catch {}
  }

  async function doDeleteMessage() {
    if (!menuMsg) return;
    setMenuVis(false);
    setMessages(prev => prev.filter(m => m.id !== menuMsg.id));
    try {
      await supabase.from('messages').delete().eq('id', menuMsg.id);
    } catch {}
    try {
      const raw = await AsyncStorage.getItem(`vaultchat_msgs_${roomId}`);
      if (raw) {
        const msgs = JSON.parse(raw).filter(m => m.id !== menuMsg.id);
        await AsyncStorage.setItem(`vaultchat_msgs_${roomId}`, JSON.stringify(msgs));
      }
    } catch {}
  }

  async function sendText(override) {
    let content = override || text.trim();
    if (!content) return;
    if (replyTo && !override) {
      const qc = replyTo.content || '';
      content = `REPLY:${qc.length}:${qc}${content}`;
      setReplyTo(null);
    }
    setText(''); setSending(true);
    successFeedback(); // haptic feedback on send
    await postMsg(content);
    setSending(false);
  }

  // Save a message as "scheduled" — it sits in the messages table with
  // message_type='scheduled' + scheduled_at in the future until the
  // sender's release sweep flips it to a normal message at that time.
  async function scheduleText(at) {
    const content = text.trim();
    if (!content) return;
    if (!at || !(at instanceof Date) || at.getTime() <= Date.now() + 30_000) {
      Alert.alert('Pick a future time', 'Scheduled messages must be at least 30 seconds from now.');
      return;
    }
    setText(''); setSending(true);
    try {
      let payload = {
        room_id:      roomId,
        sender_id:    myId,
        content,
        message_type: 'scheduled',
        scheduled_at: at.toISOString(),
      };
      // Encrypt the body now so the ciphertext lives in the DB the whole
      // time — plaintext never touches Supabase even while scheduled.
      if (recipientPubKey) {
        try {
          const { content: wire, metadataSelf } = await encryptMessageForPair(content, recipientPubKey);
          payload = {
            ...payload,
            content:  wire,
            metadata: { ct_self: metadataSelf, encrypted: true, v: 2 },
          };
        } catch {}
      }
      const { data, error } = await supabase.from('messages').insert(payload).select().single();
      if (!error && data) {
        plaintextCacheRef.current?.set?.(data.id, content);
        // Surface it in the sender's local list with a 'Scheduled' marker.
        setMessages(prev => [...prev, { ...data, content }]);
        successFeedback();
        Alert.alert('Scheduled', `Message will send at ${at.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}.`);
      } else {
        Alert.alert('Scheduling failed', error?.message || 'Please try again.');
      }
    } catch (e) {
      Alert.alert('Scheduling failed', e?.message || 'Please try again.');
    } finally {
      setSending(false);
      setScheduleMode(false);
    }
  }

  // Release any scheduled messages the CURRENT user owns whose
  // scheduled_at has passed. Flips message_type='text' + stamps
  // created_at=now() so the recipient's normal message poll picks
  // them up as brand-new messages.
  async function releaseOverdueScheduled() {
    if (!myId || !roomId) return;
    try {
      const nowIso = new Date().toISOString();
      const { data: overdue } = await supabase
        .from('messages')
        .select('id')
        .eq('room_id',     roomId)
        .eq('sender_id',   myId)
        .eq('message_type', 'scheduled')
        .lte('scheduled_at', nowIso);
      if (!overdue?.length) return;
      for (const row of overdue) {
        await supabase
          .from('messages')
          .update({ message_type: 'text', scheduled_at: null, created_at: nowIso })
          .eq('id', row.id);
      }
      // Trigger a re-fetch so the sender's UI refreshes. (Recipient's
      // polling/realtime picks it up on their side.)
      fetchMessages?.();
    } catch (e) {
      if (__DEV__) console.warn('releaseOverdueScheduled failed:', e?.message || e);
    }
  }

  // ── Load reactions for all messages in this room ────────────
  // Uses the same merge-not-overwrite rule as the syncSupabase load
  // path so a refetch never wipes a freshly-added optimistic reaction.
  async function loadReactions() {
    try {
      const msgIds = messages.map(m => m.id).filter(Boolean);
      if (!msgIds.length) return;
      const { data } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', msgIds);
      if (!data) return;
      const grouped = {};
      data.forEach(r => {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r);
      });
      setReactions(prev => {
        const next = { ...prev };
        for (const mid of Object.keys(grouped)) {
          const serverRows   = grouped[mid] || [];
          const localPending = (prev[mid] || []).filter(r => String(r.id).startsWith('temp_'));
          next[mid] = [...serverRows, ...localPending];
        }
        // KEEP local non-empty entries when the server returned empty —
        // stale read replicas can omit a row that was just inserted.
        // Realtime DELETE catches genuine removals; this stops fresh
        // confirmed reactions from briefly disappearing on a refetch.
        for (const mid of msgIds) {
          if (grouped[mid]) continue;
          const localRows = prev[mid];
          if (localRows && localRows.length > 0) next[mid] = localRows;
          else delete next[mid];
        }
        return next;
      });
    } catch {}
  }

  // ── Toggle a reaction on a message ───────────────────────────
  // Same-emoji tap removes that reaction; different-emoji tap *adds*
  // a new one. Users (including the sender) can stack as many distinct
  // emoji on a message as they want — no one-per-message restriction.
  // Mirrors the group-chat behavior so the two surfaces feel uniform.
  async function toggleReaction(messageId, emoji) {
    if (!myId || !messageId) return;
    const current = reactions[messageId] || [];
    const existing = current.find(r => r.user_id === myId && r.emoji === emoji);
    if (existing) {
      // Remove reaction
      setReactions(prev => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter(r => r.id !== existing.id),
      }));
      try { await supabase.from('message_reactions').delete().eq('id', existing.id); } catch {}
    } else {
      // Add new reaction without clearing the user's previous one —
      // multiple distinct emoji per user per message are allowed.
      const optimistic = { id: `temp_${Date.now()}`, message_id: messageId, user_id: myId, emoji, created_at: new Date().toISOString() };
      setReactions(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), optimistic],
      }));
      try {
        const { data } = await supabase.from('message_reactions')
          .insert({ message_id: messageId, user_id: myId, emoji })
          .select().single();
        if (data) {
          setReactions(prev => ({
            ...prev,
            [messageId]: (prev[messageId] || []).map(r => r.id === optimistic.id ? data : r),
          }));
        }
      } catch {}
    }
  }

  // togglePin — writes is_pinned to the `messages` table so the pin syncs
  // across devices and to the other participant. Enforces a single-pin-per-
  // room model: pinning a new message unpins any previously pinned one.
  async function togglePin(msg) {
    if (!msg?.id) return;
    const newState = !msg.is_pinned;

    // Optimistic local update — the pin visibly toggles before the network
    // round-trip completes. Realtime UPDATE event will reconcile if anything
    // races.
    setMessages(prev => prev.map(m => {
      if (newState && m.is_pinned && m.id !== msg.id) return { ...m, is_pinned: false };
      if (m.id === msg.id) return { ...m, is_pinned: newState };
      return m;
    }));

    try { impactMedium(); } catch {}

    try {
      // When pinning a new message, clear any other pinned message in this
      // room first so only one pin exists at a time.
      if (newState) {
        await supabase
          .from('messages')
          .update({ is_pinned: false })
          .eq('room_id', roomId)
          .eq('is_pinned', true)
          .neq('id', msg.id);
      }
      await supabase
        .from('messages')
        .update({ is_pinned: newState })
        .eq('id', msg.id);
    } catch (err) {
      console.warn('togglePin failed:', err);
      // Realtime subscription will resync on next message update;
      // worst case the banner briefly shows stale state until it does.
    }
  }

  async function sendStagedPhotos() {
    if (!stagedPhotos.length) return;
    setSending(true);
    const caption = text.trim();
    try {
      // Upload all photos to Supabase Storage so any device can view them
      const urls = await Promise.all(stagedPhotos.map(async p => {
        const uploaded = await uploadMedia(p.uri, 'image');
        if (uploaded) return uploaded;          // https:// URL
        // Fallback: keep local key for sender's own device
        return `LOCALIMG:${p.key}`;
      }));
      // Filter out failed uploads that are still LOCALIMG keys
      const httpUrls   = urls.filter(u => u.startsWith('http'));
      const localFalls = urls.filter(u => u.startsWith('LOCALIMG:'));

      let content;
      if (httpUrls.length === urls.length) {
        // All uploaded successfully — use permanent URLs
        content = httpUrls.length === 1
          ? `IMG:${httpUrls[0]}`
          : `GALLERY:${httpUrls.join('|')}`;
      } else if (httpUrls.length > 0) {
        // Partial upload — use what we have
        content = httpUrls.length === 1
          ? `IMG:${httpUrls[0]}`
          : `GALLERY:${httpUrls.join('|')}`;
      } else {
        // All uploads failed — fall back to local (only visible on this device)
        content = stagedPhotos.length === 1
          ? `LOCALIMG:${stagedPhotos[0].key}`
          : `GALLERY:${stagedPhotos.map(p => p.key).join('|')}`;
      }
      if (caption) content += '\n' + caption;
      await postMsg(content);
    } catch {
      // Last-resort fallback
      let content = stagedPhotos.length === 1
        ? `LOCALIMG:${stagedPhotos[0].key}`
        : `GALLERY:${stagedPhotos.map(p => p.key).join('|')}`;
      if (caption) content += '\n' + caption;
      await postMsg(content);
    }
    setStagedPhotos([]); setText(''); setSending(false);
  }

  async function sendStagedVideos() {
    if (!stagedVideos.length) return;
    setSending(true);
    try {
      const caption = text.trim();
      if (stagedVideos.length === 1) {
        const url = await uploadMedia(stagedVideos[0].uri, 'video');
        let content = url ? `LOCALVID:${url}` : '🎥 Video';
        if (caption) content += '\n' + caption;
        await postMsg(content);
      } else {
        const urls  = await Promise.all(stagedVideos.map(v => uploadMedia(v.uri, 'video')));
        const valid = urls.filter(Boolean);
        let content = valid.length ? `VIDEOS:${valid.join('|')}` : '🎥 Videos';
        if (caption) content += '\n' + caption;
        await postMsg(content);
      }
    } catch {}
    setStagedVideos([]); setText(''); setSending(false);
  }

  // ── Voice notes (task #69) ─────────────────────────────────
  // startRecording prompts for mic permission (first time), prepares the
  // recorder, kicks it off, and starts a tick timer driving the elapsed
  // counter shown in the recording overlay. stopRecording uploads the
  // resulting .m4a, builds a VOICE:<url>|<seconds> payload, and posts
  // it through the normal postMsg path so it goes through encryption,
  // realtime fan-out, and read-receipt accounting like any other
  // message. cancelRecording discards locally — never uploaded.
  async function startRecording() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm?.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access in Settings to send voice notes.');
        return;
      }
      // Some platforms need an explicit "switch to record mode" before the
      // recorder can grab the mic — does nothing if already in that mode.
      try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch {}

      await recorder.prepareToRecordAsync();
      recorder.record();
      const startedAt = Date.now();
      setRecordingStartedAt(startedAt);
      setRecordingElapsed(0);
      setIsRecording(true);

      // Live timer for the recording UI (1s tick).
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingElapsed(Math.floor((Date.now() - startedAt) / 1000));
      }, 250);
    } catch (e) {
      Alert.alert('Recording failed', e?.message || 'Could not start the recorder.');
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  }

  async function stopRecording() {
    if (!isRecording) return;
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      const durSec = Math.max(1, Math.floor((Date.now() - recordingStartedAt) / 1000));
      if (__DEV__) console.log('[voice] recorder.uri =', uri, 'durSec =', durSec);
      // Pop back to listening mode so playback works at full volume.
      try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); } catch {}
      if (!uri) { Alert.alert('Recording empty', 'Nothing was captured. Try again.'); return; }

      setSending(true);
      const url = await uploadMedia(uri, 'voice');
      if (__DEV__) console.log('[voice] uploadMedia returned =', url);
      if (!url) {
        Alert.alert('Upload failed', 'Could not send the voice note. Check Metro logs — uploadMedia returned null.');
        setSending(false);
        return;
      }
      await postMsg(`VOICE:${url}|${durSec}`);
      setSending(false);
    } catch (e) {
      Alert.alert('Recording failed', e?.message || 'Could not finalize the recording.');
      setSending(false);
    }
  }

  async function cancelRecording() {
    if (!isRecording) return;
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
    try { await recorder.stop(); } catch {}
    try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); } catch {}
    // Intentionally don't upload — discarded.
  }

  function pickAttach(type) { pendingAttach.current = type; setAttachModal(false); }

  async function handleAttachType(type) {
    if (type === 'vonce') {
      // View-once flow: pick ONE photo (or video), upload, post
      // immediately as VONCE — bypasses staging since the whole point
      // of view-once is a single shot the recipient can open exactly
      // one time. Single-select keeps the UX a clean snap-and-send.
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      // quality: 0.7 → ~50% smaller upload payload than quality 1 with
      // no perceptible visual difference. Cuts Supabase Storage bills
      // when users send 12MP phone photos. iMessage uses similar.
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.7, allowsMultipleSelection: false,
      });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      const isVideo = (asset.type || '').startsWith('video') || /\.(mp4|mov|m4v)$/i.test(asset.uri || '');
      setSending(true);
      const url = await uploadMedia(asset.uri, isVideo ? 'video' : 'image');
      if (!url) {
        Alert.alert('Upload failed', 'Could not send the view-once media. Check Metro logs.');
        setSending(false);
        return;
      }
      await postMsg(`VONCE:${url}|${isVideo ? 'video' : 'image'}`);
      setSending(false);
      return;
    }
    if (type === 'photo') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', quality: 0.7, allowsMultipleSelection: true, selectionLimit: 20,
      });
      if (!r.canceled && r.assets?.length) {
        const newPhotos = await Promise.all(r.assets.map(async asset => {
          const key = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await AsyncStorage.setItem(key, asset.uri);
          return { uri: asset.uri, key };
        }));
        setStagedPhotos(prev => [...prev, ...newPhotos].slice(0, 20));
      }
    } else if (type === 'video') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'videos', quality: 0.7, allowsMultipleSelection: true, selectionLimit: 10,
      });
      if (!r.canceled && r.assets?.length) {
        setStagedVideos(prev => [...prev, ...r.assets.map(a => ({ uri: a.uri }))].slice(0, 10));
      }
    } else if (type === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      // Camera quality 0.7 = ~50% smaller files than quality 1, imperceptible visual diff
      const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!r.canceled && r.assets?.[0]) {
        const key = `img_${Date.now()}`;
        await AsyncStorage.setItem(key, r.assets[0].uri);
        setStagedPhotos(prev => [...prev, { uri: r.assets[0].uri, key }].slice(0, 20));
      }
    } else if (type === 'file') {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!r.canceled && r.assets?.[0]) {
        const f = r.assets[0]; setSending(true);
        try {
          const url = await uploadMedia(f.uri, 'file');
          await sendText(url ? `FILE:${f.name}|${url}` : `FILE:${f.name}|${f.uri}`);
        } catch {
          await sendText(`FILE:${f.name}|${f.uri}`);
        }
        setSending(false);
      }
    } else if (type === 'airdrop') {
      try {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo access to use AirDrop/Nearby Share.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'all', quality: 0.7, allowsMultipleSelection: false });
        if (!result.canceled && result.assets?.[0]) {
          await Share.share(
            { url: result.assets[0].uri, message: 'Shared via VaultChat — encrypted messaging' },
            { dialogTitle: 'Send via AirDrop or Nearby Share' }
          );
        }
      } catch {
        // Share dismissed or cancelled — not an error
      }
    } else if (type === 'location') {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const loc = await Location.getCurrentPositionAsync({});
      sendText(`📍 https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`);
    } else if (type === 'gif')   { setGifModal(true);
    } else if (type === 'emoji') { setEmojiModal(true); }
  }

  const hasStaged = stagedPhotos.length > 0 || stagedVideos.length > 0;

  const ATTACHMENTS = [
    { icon: '🖼️', label: 'Gallery',   type: 'photo'    },
    { icon: '🎥', label: 'Video',     type: 'video'    },
    { icon: '📸', label: 'Camera',    type: 'camera'   },
    { icon: '👁️', label: 'View Once', type: 'vonce'    },
    { icon: '📁', label: 'File',      type: 'file'     },
    { icon: '🎭', label: 'GIFs & Memes', type: 'gif'    },
    { icon: '😀', label: 'Emoji',     type: 'emoji'    },
    { icon: '🔵', label: 'AirDrop',   type: 'airdrop'  },
    { icon: '📍', label: 'Location',  type: 'location' },
  ];

  // Derive the currently-pinned message from the messages array.
  // Recomputed every render — cheap (O(n)) and always stays in sync with
  // realtime UPDATE events from Supabase.
  const pinnedMsg   = messages.find(m => m.is_pinned);
  const pinnedMsgId = pinnedMsg?.id || null;

  return (
    <KeyboardAvoidingView style={[s.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={[s.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}
          onPress={() => navigation.navigate('ContactView', { contact: contactData || { name: recipientName, phone: recipientPhone, photo: recipientPhoto } })}
          onLongPress={() => {
            // Long-press the chat header → on-device summary (task #91).
            // Pure JS algorithmic summary — no model file, no network.
            // Uses last 50 messages for the topic extractor's signal-
            // to-noise sweet spot.
            longPressFeedback();
            const summary = summarizeMessages(messages.slice(-50), { myUserId: myId, peerName: recipientName || 'them' });
            Alert.alert(`Summary of ${recipientName || 'this chat'}`, summaryToText(summary));
          }}
          delayLongPress={550}
          activeOpacity={0.7}>
          <View style={[s.hAvatar, { backgroundColor: accent }]}>
            {contactData?.photo
              ? <Image source={{ uri: contactData.photo }} style={s.hAvatarImg} />
              : <Text style={s.hAvatarTx}>{(recipientName || '?')[0]?.toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[s.hName, { color: tx }]}>{contactData?.name || recipientName || recipientPhone || 'Chat'}</Text>
              <PremiumCrown userId={recipientId} phone={recipientPhone} size={15} />
            </View>
            {/* Combined trust + presence line: lock icon is always visible
                so users see the E2E guarantee on every chat, and the
                presence state appears inline after it (green dot Online
                when connected, fuzzy 'last seen' when not). Falls back
                to just the E2E label while we're still figuring out the
                peer's presence. */}
            {/* Lock label — the 🔒 + "End-to-end encrypted" subtitle
                is tappable and routes to EncryptionInfoScreen so users
                can read what E2E actually means. The presence label
                (Online / last seen) stays non-tappable. RN fires the
                Text's onPress when the user taps directly on the label,
                and the parent TouchableOpacity (which navigates to
                ContactView) fires when they tap elsewhere on the row. */}
            <Text
              style={[s.hSub, { color: sub }]}
              onPress={() => navigation.navigate('EncryptionInfo')}>
              🔒  {presence.online ? (
                <Text style={{ color: '#34C759', fontWeight: '600' }}>● Online</Text>
              ) : presence.label ? (
                presence.label
              ) : (
                'End-to-end encrypted'
              )}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setSearchOpen(v => !v); setSearchQuery(''); }} style={s.callBtn}>
          <Search size={20} color={tx} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => placeCall({ navigation, peerUserId: recipientId, chatRoomId: roomId, recipientName, recipientPhone, type: 'voice' })} style={s.callBtn}>
          <Phone size={22} color={callIconColor} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => placeCall({ navigation, peerUserId: recipientId, chatRoomId: roomId, recipientName, recipientPhone, type: 'video' })} style={s.callBtn}>
          <VideoIcon size={22} color={callIconColor} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* Search bar — slides in when search icon tapped */}
      {searchOpen && (
        <View style={[s.searchBar, { backgroundColor: inputBg, borderColor: border }]}>
          <Text style={s.searchIcon}>🔍</Text>
          <TextInput
            style={[s.searchInput, { color: tx }]}
            placeholder="Search messages..."
            placeholderTextColor={sub}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={{ color: sub, fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Pinned message banner — uses PinnedMessagePreview which renders
          actual photo/video thumbnails for media messages instead of
          generic "📷 Photo" text labels. */}
      {pinnedMsgId && (() => {
        const pinned = messages.find(m => m.id === pinnedMsgId);
        if (!pinned) return null;
        return (
          <TouchableOpacity
            style={[s.pinBanner, { backgroundColor: card, borderBottomColor: border }]}
            onPress={() => {
              // Scroll to the pinned message
              const idx = [...messages].reverse().findIndex(m => m.id === pinnedMsgId);
              if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
            }}
            onLongPress={() => togglePin(pinned)}>
            <PinnedMessagePreview content={pinned.content || ''} accent={accent} tx={tx} sub={sub} />
            <TouchableOpacity onPress={() => togglePin(pinned)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: sub, fontSize: 14, marginLeft: 8 }}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })()}

      {/* Messages — performance tuning for the heaviest scroll
          surface in the app:
            - removeClippedSubviews trims off-screen bubbles from
              the native view tree (big win for media-heavy threads)
            - initialNumToRender / windowSize sized for typical
              viewport so first paint isn't blocked rendering 100+
              bubbles when entering an old chat
            - keyboardShouldPersistTaps lets long-press menu
              register when the keyboard is up
            - keyboardDismissMode='interactive' matches iMessage:
              swipe down on the message list to dismiss the keyboard */}
      <FlatList
        ref={listRef}
        data={(() => {
          const list = searchQuery.trim()
            ? messages.filter(m => (m.content || '').toLowerCase().includes(searchQuery.toLowerCase()))
            : messages;
          // Pre-enrich the message list with non-message rows that get
          // dispatched in renderItem:
          //   - 'date': "Today" / "Yesterday" / weekday separator pill
          //     inserted whenever two consecutive messages cross a
          //     calendar-day boundary
          //   - 'e2e':  "Messages and calls are end-to-end encrypted"
          //     banner pinned to the OLDEST end so it renders at the
          //     top of the inverted list, just like iMessage's intro
          // Sentinel rows have a `_type` discriminator and a synthetic
          // id prefixed with __ so keyExtractor still gives unique keys.
          const enriched = [];
          let lastDateKey = null;
          list.forEach((m, idx) => {
            const ts = m.created_at ? new Date(m.created_at) : null;
            const dateKey = ts ? `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}` : null;
            if (dateKey && dateKey !== lastDateKey) {
              enriched.push({ id: `__date_${dateKey}_${idx}`, _type: 'date', _date: ts });
              lastDateKey = dateKey;
            }
            enriched.push(m);
          });
          // E2E banner — only show in chats that haven't accumulated a
          // ton of messages yet. After ~50 messages the banner is just
          // visual noise; users have already established trust.
          if (list.length < 50) {
            enriched.unshift({ id: '__e2e_banner', _type: 'e2e' });
          }
          return [...enriched].reverse();
        })()}
        keyExtractor={(item, i) => String(item.id || i)}
        inverted
        contentContainerStyle={{ padding: 12, paddingTop: 8 }}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={11}
        updateCellsBatchingPeriod={40}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onEndReached={loadMoreOlder}
        onEndReachedThreshold={0.4}
        ListFooterComponent={hasMore && loadingOlder ? (
          <Text style={{ color: sub, textAlign: 'center', paddingVertical: 12, fontSize: 12 }}>Loading older…</Text>
        ) : null}
        renderItem={({ item }) => {
          // Sentinel rows injected upstream — date pill + E2E intro
          // banner. Real messages have no _type field and fall through
          // to the existing Bubble renderer.
          if (item._type === 'date') {
            return (
              <View style={s.datePillWrap}>
                <View style={[s.datePill, { backgroundColor: card, borderColor: border }]}>
                  <Text style={[s.datePillTx, { color: sub }]}>{formatDateLabel(item._date)}</Text>
                </View>
              </View>
            );
          }
          if (item._type === 'e2e') {
            return (
              <TouchableOpacity
                style={[s.e2eIntro, { backgroundColor: card, borderColor: border }]}
                onPress={() => navigation.navigate('EncryptionInfo')}
                activeOpacity={0.85}>
                <Text style={[s.e2eIntroTx, { color: sub }]}>
                  🔒  Messages and calls are end-to-end encrypted. Only you and {recipientName || 'this contact'} can read or listen to them.{' '}
                  <Text style={{ color: accent, fontWeight: '700' }}>Learn more.</Text>
                </Text>
              </TouchableOpacity>
            );
          }
          return (
            <Bubble
              item={item} myId={myId} tx={tx} sub={sub} card={card} accent={accent}
              bubbleOut={bubbleOut} bubbleIn={bubbleIn}
              bubbleOutTx={bubbleOutTx} bubbleInTx={bubbleInTx}
              onOpenImg={uri => setFullImgUri(uri)}
              onPlayVid={uri => setVidUri(uri)}
              onLongPress={item => { longPressFeedback(); setPickerMsg(item); }}
              onReply={() => setReplyTo(item)}
              tappedId={tappedId}
              onTap={id => setTappedId(prev => prev === id ? null : id)}
              reactions={reactions[item.id] || []}
              onReact={emoji => toggleReaction(item.id, emoji)}
            />
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔒</Text>
            <Text style={[s.emptyTx, { color: sub }]}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <View style={[s.typingBar, { backgroundColor: card, borderTopColor: border }]}>
          <View style={s.typingDots}>
            <View style={[s.dot, { backgroundColor: sub }]} />
            <View style={[s.dot, { backgroundColor: sub, opacity: 0.6 }]} />
            <View style={[s.dot, { backgroundColor: sub, opacity: 0.3 }]} />
          </View>
          <Text style={[s.typingTx, { color: sub }]}>
            {typingUsers.map(t => t.handle || 'Someone').join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
          </Text>
        </View>
      )}

      {/* Reply bar — shows the quoted content only, no "↩ Replying" label
          per user request. The ✕ button + the left-colored border still
          make it clear this is a pending-reply state. */}
      {replyTo && (
        <View style={[s.replyBar, { backgroundColor: card, borderTopColor: border }]}>
          <View style={{ flex: 1 }}>
            <ReplyPreview
              content={replyTo.content}
              textColor={sub}
              borderColor={accent}
            />
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 8 }}>
            <Text style={{ color: sub, fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Encryption status banner — visible during resolve + for unencrypted fallbacks */}
      {encryptionStatus === 'resolving' && (
        <View style={{
          backgroundColor: '#1A7AE8' + '1A',
          borderTopWidth: 1, borderTopColor: border,
          paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: 'row', alignItems: 'center',
        }}>
          <ActivityIndicator size="small" color="#1A7AE8" style={{ marginRight: 8 }} />
          <Text style={{ color: '#1A7AE8', fontSize: 12, fontWeight: '600' }}>
            🔒 Establishing secure channel…
          </Text>
        </View>
      )}
      {encryptionStatus === 'plaintext' && (
        // Hard E2E gate. The peer hasn't published their public key
        // yet (signed up before encryption shipped, or app never
        // opened). Sends are blocked entirely; we re-poll every 15s
        // so the chat unlocks the moment they open VaultChat. The
        // Retry button cuts that wait when the user knows the peer
        // just opened the app.
        <View style={{
          backgroundColor: '#F59E0B' + '1A',
          borderTopWidth: 1, borderTopColor: border,
          paddingHorizontal: 14, paddingVertical: 10,
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}>
          <Text style={{ fontSize: 14 }}>🔒</Text>
          <Text style={{ flex: 1, color: '#B45309', fontSize: 12, fontWeight: '600' }}>
            Waiting for {recipientName || 'this contact'} to set up encryption. Messages are end-to-end only.
          </Text>
          <TouchableOpacity
            onPress={async () => {
              if (!recipientId) return;
              const pk = await getPublicKey(recipientId);
              if (pk) { setRecipientPubKey(pk); setEncryptionStatus('ready'); }
            }}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#B45309' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {encryptionStatus === 'error' && (
        <View style={{
          backgroundColor: '#EF4444' + '1A',
          borderTopWidth: 1, borderTopColor: border,
          paddingHorizontal: 14, paddingVertical: 10,
          flexDirection: 'row', alignItems: 'center', gap: 10,
        }}>
          <Text style={{ fontSize: 14 }}>⚠️</Text>
          <Text style={{ flex: 1, color: '#B91C1C', fontSize: 12, fontWeight: '600' }}>
            Couldn't verify encryption. Messages can't be sent right now.
          </Text>
          <TouchableOpacity
            onPress={async () => {
              if (!recipientId) return;
              const pk = await getPublicKey(recipientId);
              if (pk) { setRecipientPubKey(pk); setEncryptionStatus('ready'); }
            }}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#B91C1C' }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Staged media compose area */}
      {hasStaged && (
        <View style={[s.stagedWrap, { borderTopColor: border }]}>
          {stagedPhotos.length > 0 && (
            <StagedPhotosPicker
              photos={stagedPhotos}
              onRemove={i => setStagedPhotos(prev => prev.filter((_, j) => j !== i))}
              onAddMore={() => handleAttachType('photo')}
              accent={accent} inputBg={inputBg} border={border} sub={sub} tx={tx}
            />
          )}
          {stagedVideos.length > 0 && (
            <View style={[s.vidPreview, { backgroundColor: inputBg }]}>
              <Text style={{ fontSize: 30 }}>🎥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: tx, fontWeight: '600', fontSize: 14 }}>
                  {stagedVideos.length} video{stagedVideos.length > 1 ? 's' : ''} ready
                </Text>
                <Text style={{ color: sub, fontSize: 12 }}>Will upload on send</Text>
              </View>
              <TouchableOpacity onPress={() => setStagedVideos([])} style={{ padding: 8 }}>
                <Text style={{ color: sub, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={[s.captionRow, { borderTopColor: border }]}>
            <TextInput
              style={[s.captionInput, { backgroundColor: inputBg, color: tx }]}
              placeholder="Add a caption… (optional)"
              placeholderTextColor={sub}
              value={text} onChangeText={setText} multiline
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: accent }]}
              onPress={() => { if (stagedVideos.length > 0) sendStagedVideos(); else sendStagedPhotos(); }}
              disabled={sending || encryptionStatus !== 'ready'}>
              {sending
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={{ color: '#000', fontWeight: '900', fontSize: 20 }}>➤</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Normal input bar */}
      {!hasStaged && (
        isRecording ? (
          // Recording-mode input bar — replaces the normal one for the
          // duration of the recording. Shows a pulsing red dot, the live
          // elapsed-seconds counter, a Cancel button (discard, no upload),
          // and a Send button (stops + uploads + posts as VOICE: message).
          <View style={[s.inputBar, { backgroundColor: card, borderTopColor: border }]}>
            <TouchableOpacity
              style={[s.plusBtn, { backgroundColor: inputBg, borderColor: '#ff3b30' }]}
              onPress={cancelRecording}
              accessibilityLabel="Cancel recording">
              <Text style={{ color: '#ff3b30', fontSize: 18, fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
            <View style={[s.input, { backgroundColor: inputBg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }]}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff3b30' }} />
              <Text style={{ color: tx, fontWeight: '600' }}>
                Recording…  {Math.floor(recordingElapsed / 60)}:{(recordingElapsed % 60).toString().padStart(2, '0')}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: accent }]}
              onPress={stopRecording}
              accessibilityLabel="Send voice note"
              disabled={sending}>
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>}
            </TouchableOpacity>
          </View>
        ) : (
        <View style={[s.inputBar, { backgroundColor: card, borderTopColor: border }]}>
          <TouchableOpacity style={[s.plusBtn, { backgroundColor: inputBg, borderColor: accent }]}
            onPress={() => setAttachModal(true)}>
            <Text style={[s.plusTx, { color: accent }]}>+</Text>
          </TouchableOpacity>
          <TextInput
            style={[s.input, { backgroundColor: inputBg, color: tx }]}
            placeholder={replyTo ? 'Type your reply...' : 'Message...'}
            placeholderTextColor={sub} value={text}
            onChangeText={v => {
              setText(v);
              broadcastTyping(roomId, myId, myHandle || 'them', v.length > 0);
            }}
            onBlur={() => broadcastTyping(roomId, myId, myHandle || 'them', false)}
            multiline
          />
          {/* When the input is empty, show a microphone that starts a
              voice-note recording. As soon as the user types anything,
              this swaps back to the normal Send/Schedule button so we
              don't lose the existing send + scheduled-message flow. */}
          {text.trim() ? (
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: accent }]}
              onPress={() => sendText()}
              onLongPress={() => {
                if (!text.trim()) return;
                longPressFeedback();
                if (scheduledAt.getTime() <= Date.now()) {
                  setScheduledAt(new Date(Date.now() + 60 * 60 * 1000));
                }
                setSchedulePickerStep('date');
                setScheduleMode(true);
              }}
              delayLongPress={450}
              disabled={sending || encryptionStatus !== 'ready'}>
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ color: '#000', fontSize: 18 }}>➤</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: accent }]}
              onPress={startRecording}
              accessibilityLabel="Record voice note"
              disabled={sending || encryptionStatus !== 'ready'}>
              <Mic size={20} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
        )
      )}

      {/* Viewer modals */}
      <FullScreenImg uri={fullImgUri} visible={!!fullImgUri} onClose={() => setFullImgUri(null)} />
      <VideoModal    uri={vidUri}     visible={!!vidUri}     onClose={() => setVidUri(null)} />

      {/* Attach sheet */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[s.sheet, { backgroundColor: card }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <Text style={[s.sheetTitle, { color: tx }]}>Attachments</Text>
            <View style={s.attachGrid}>
              {ATTACHMENTS.map((a, i) => (
                <TouchableOpacity key={i} style={s.attachItem} onPress={() => pickAttach(a.type)}>
                  <View style={[s.attachIcon, { backgroundColor: inputBg }]}>
                    <Text style={{ fontSize: 28 }}>{a.icon}</Text>
                  </View>
                  <Text style={[s.attachLabel, { color: sub }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* GIFs & Memes — real Giphy-powered search picker. Replaces
          the previous inline modal that only showed the static
          emoji-shortcut grid. URL-based GIFs are sent with the
          IMG: prefix so SinglePhoto renders them via React Native's
          <Image> (which handles animated GIFs natively); the
          fallback emoji shortcuts in GifPickerModal still send as
          plain text via sendText. */}
      <GifPickerModal
        visible={gifModal}
        onClose={() => setGifModal(false)}
        onSelectGif={(gif) => {
          setGifModal(false);
          if (!gif) return;
          if (gif.isEmoji) {
            // Fallback emoji — send as plain text
            sendText(gif.url);
          } else if (gif.url) {
            // Real Giphy GIF — send as IMG:<url> so SinglePhoto
            // picks it up and renders the animated frame
            sendText(`IMG:${gif.url}`);
          }
        }}
        colors={{ bg, card, tx, sub, border, inputBg, accent }}
      />

      {/* Emoji modal */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card, maxHeight: '65%' }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <View style={s.sheetHeaderRow}>
              <Text style={[s.sheetTitle, { color: tx }]}>Emoji & GIFs</Text>
              <TouchableOpacity style={[s.sheetXBtn, { backgroundColor: accent }]} onPress={() => setEmojiModal(false)}>
                <Text style={s.sheetXTx}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={[s.tabRow, { backgroundColor: inputBg }]}>
              {['emoji', 'gif'].map(t => (
                <TouchableOpacity key={t} style={[s.tab, emojiTab === t && { backgroundColor: card }]}
                  onPress={() => setEmojiTab(t)}>
                  <Text style={{ fontSize: 13, fontWeight: 'bold', color: tx }}>
                    {t === 'emoji' ? '😀 Emoji' : '🎭 GIF'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {emojiTab === 'gif' ? (
                <View style={s.gifGrid}>
                  {GIFS.map((g, i) => (
                    <TouchableOpacity key={i} style={[s.gifItem, { backgroundColor: inputBg }]}
                      onPress={() => { setEmojiModal(false); sendText(g.msg); }}>
                      <Text style={{ fontSize: 32 }}>{g.emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={s.emojiGrid}>
                  {EMOJIS.map((e, i) => (
                    <TouchableOpacity key={i} style={[s.emojiItem, { backgroundColor: inputBg }]}
                      onPress={() => { setEmojiModal(false); sendText(e); }}>
                      <Text style={{ fontSize: 26 }}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* Reaction picker — shown on long press. The "⋯" (More) button opens the
          full action menu (Pin/Reply/Edit/Delete), so both gestures live behind
          the same long-press. */}
      <ReactionPicker
        visible={!!pickerMsg}
        onClose={() => setPickerMsg(null)}
        onReact={emoji => { if (pickerMsg) toggleReaction(pickerMsg.id, emoji); }}
        onReply={() => { if (pickerMsg) setReplyTo(pickerMsg); }}
        onMore={() => { if (pickerMsg) { setMenuMsg(pickerMsg); setMenuVis(true); } }}
        myReaction={(reactions[pickerMsg?.id] || []).find(r => r.user_id === myId)?.emoji || null}
        card={card}
        accent={accent}
      />

      {/* Message long-press action menu */}
      {/* Scheduled-message picker — opened by long-pressing the send button.
          iOS shows a native spinner; we use a two-step flow (date → time)
          for clarity. "Send now" cancels and reverts to normal send. */}
      {scheduleMode && Platform.OS === 'ios' && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setScheduleMode(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 }}>
              <Text style={{ color: tx, fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
                Schedule Message
              </Text>
              <Text style={{ color: sub, fontSize: 12, textAlign: 'center', marginBottom: 14 }}>
                {schedulePickerStep === 'date' ? 'Pick a date' : `Pick a time on ${scheduledAt.toLocaleDateString()}`}
              </Text>
              <DateTimePicker
                value={scheduledAt}
                mode={schedulePickerStep === 'date' ? 'date' : 'time'}
                display="spinner"
                minimumDate={new Date()}
                onChange={(_, d) => { if (d) setScheduledAt(d); }}
                textColor={tx}
                themeVariant={card === '#ffffff' ? 'light' : 'dark'}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <TouchableOpacity
                  style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: inputBg, alignItems: 'center' }}
                  onPress={() => { setScheduleMode(false); }}>
                  <Text style={{ color: tx, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                {schedulePickerStep === 'date' ? (
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: accent, alignItems: 'center' }}
                    onPress={() => setSchedulePickerStep('time')}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Next: Time ›</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{ flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: accent, alignItems: 'center' }}
                    onPress={() => scheduleText(scheduledAt)}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Schedule</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      <Modal visible={menuVis} transparent animationType="fade" onRequestClose={() => setMenuVis(false)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setMenuVis(false)}>
          {/* maxHeight cap + ScrollView so the menu never overflows on
              short screens (iPhone SE, landscape). paddingBottom uses
              the safe-area inset so the bottom row always clears the
              home indicator instead of relying on a hardcoded 34px. */}
          <View style={[s.msgMenu, { backgroundColor: card, maxHeight: '85%', paddingBottom: Math.max(insets.bottom, 12) }]}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ flexGrow: 1 }}>
            <Text style={[s.menuPreview, { color: sub }]} numberOfLines={2}>
              {(() => {
                const raw = menuMsg?.content || '';
                if (!raw.startsWith('REPLY:')) return raw.substring(0, 80);
                const ci = raw.indexOf(':', 6);
                const qLen = parseInt(raw.substring(6, ci)) || 0;
                return raw.substring(ci + 1 + qLen, ci + 1 + qLen + 80);
              })()}
            </Text>
            {/* Reply */}
            <TouchableOpacity style={[s.menuOpt, { borderTopColor: border }]}
              onPress={() => { setReplyTo(menuMsg); setMenuVis(false); }}>
              <Text style={s.menuIcon}>↩️</Text>
              <Text style={[s.menuLabel, { color: tx }]}>Reply</Text>
            </TouchableOpacity>
            {/* Pin */}
            <TouchableOpacity style={[s.menuOpt, { borderTopColor: border }]}
              onPress={() => { togglePin(menuMsg); setMenuVis(false); }}>
              <Text style={s.menuIcon}>📌</Text>
              <Text style={[s.menuLabel, { color: tx }]}>{pinnedMsgId === menuMsg?.id ? 'Unpin' : 'Pin'}</Text>
            </TouchableOpacity>
            {/* Report — only other users' messages */}
            {menuMsg?.sender_id && menuMsg?.sender_id !== myId && (
              <TouchableOpacity style={[s.menuOpt, { borderTopColor: border }]}
                onPress={() => {
                  setReportTarget(menuMsg);
                  setMenuVis(false);
                  setTimeout(() => setReportVisible(true), 250);
                }}>
                <Text style={s.menuIcon}>🚩</Text>
                <Text style={[s.menuLabel, { color: '#FF9500' }]}>Report</Text>
              </TouchableOpacity>
            )}
            {/* Edit — own messages within 1 hour */}
            {menuMsg?.sender_id === myId && (Date.now() - new Date(menuMsg?.created_at).getTime()) < 3600000 && (
              <TouchableOpacity style={[s.menuOpt, { borderTopColor: border }]}
                onPress={() => {
                  const raw = (menuMsg.content || '').replace(/^REPLY:[^|]+\|/, '');
                  setEditText(raw);
                  setEditingMsg(menuMsg);
                  setMenuVis(false);
                }}>
                <Text style={s.menuIcon}>✏️</Text>
                <Text style={[s.menuLabel, { color: tx }]}>Edit</Text>
              </TouchableOpacity>
            )}
            {/* Delete — own messages only */}
            {menuMsg?.sender_id === myId && (
              <TouchableOpacity style={[s.menuOpt, { borderTopColor: border }]} onPress={doDeleteMessage}>
                <Text style={s.menuIcon}>🗑️</Text>
                <Text style={[s.menuLabel, { color: '#FF3B30' }]}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.menuCancel, { borderTopColor: border }]} onPress={() => setMenuVis(false)}>
              <Text style={[s.menuCancelTx, { color: sub }]}>Cancel</Text>
            </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report message modal */}
      <ReportMessageModal
        visible={reportVisible}
        onClose={() => { setReportVisible(false); setReportTarget(null); }}
        message={reportTarget}
        roomId={roomId}
        reporterId={myId}
        reporterHandle={myHandle}
      />

      {/* Edit message modal */}
      <Modal visible={!!editingMsg} transparent animationType="slide" onRequestClose={() => setEditingMsg(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={[s.editSheet, { backgroundColor: card, borderTopColor: border }]}>
            <View style={s.editHeader}>
              <TouchableOpacity onPress={() => setEditingMsg(null)}>
                <Text style={{ color: sub, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[s.editTitle, { color: tx }]}>Edit Message</Text>
              <TouchableOpacity onPress={doEditMessage}>
                <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.editInput, { backgroundColor: inputBg, color: tx, borderColor: border }]}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              placeholder="Edit your message…"
              placeholderTextColor={sub}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Contact edit modal — opened by tapping avatar/name in header */}
      <ContactEditModal
        visible={contactEditVis}
        contact={contactData}
        onClose={() => setContactEditVis(false)}
        onSave={(updated) => {
          setContactData(updated);
          setContactEditVis(false);
        }}
        colors={{ bg, card, tx, sub, border, inputBg, accent }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 8 },
  backBtn:     { padding: 4 },
  backTx:      { fontSize: 30, fontWeight: 'bold' },
  hAvatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  hAvatarImg:  { width: 40, height: 40, borderRadius: 20 },
  hAvatarTx:   { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  hName:       { fontWeight: 'bold', fontSize: 15 },
  hSub:        { fontSize: 11 },
  callBtn:     { padding: 4 },
  bWrap:       { marginBottom: 4, maxWidth: '80%' },
  myWrap:      { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirWrap:   { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble:      { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  myBubble:    { borderBottomRightRadius: 4 },
  theirBubble: { borderBottomLeftRadius: 4 },
  mediaPad:    { paddingHorizontal: 4, paddingVertical: 4 },
  msgTx:       { fontSize: 15, lineHeight: 21 },
  cap:         { fontSize: 13, lineHeight: 19, paddingHorizontal: 6, paddingTop: 5, paddingBottom: 2 },
  time:        { fontSize: 11, color: '#8e8e93', marginTop: 3, marginBottom: 8 },
  tR:          { alignSelf: 'flex-end',   marginRight: 4 },
  tL:          { alignSelf: 'flex-start', marginLeft: 4 },
  replyQ:      { borderLeftWidth: 3, paddingLeft: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 6 },
  replyLabel:  { fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  replyTx:     { fontSize: 12 },
  replyBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderLeftWidth: 4 },
  timeRow:     { flexDirection: 'row', alignItems: 'center', marginTop: 2, paddingHorizontal: 4 },
  emptyBox:    { alignItems: 'center', paddingTop: 80 },
  typingBar:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  typingDots:  { flexDirection: 'row', gap: 3, alignItems: 'center' },
  dot:         { width: 6, height: 6, borderRadius: 3 },
  typingTx:    { fontSize: 12, fontStyle: 'italic' },
  emptyTx:     { fontSize: 15, textAlign: 'center' },
  // Staged
  stagedWrap:  { borderTopWidth: 1 },
  thumb:       { width: 90, height: 90, borderRadius: 12 },
  removeBadge: { position: 'absolute', top: -7, right: -7, width: 22, height: 22, borderRadius: 11, backgroundColor: '#ff3b30', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  addMore:     { width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 3 },
  countBadge:  { position: 'absolute', top: 14, left: 14, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  vidPreview:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginHorizontal: 12, borderRadius: 14, marginBottom: 4 },
  captionRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, paddingBottom: 24, gap: 10, borderTopWidth: 1 },
  captionInput:{ flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 80, minHeight: 42 },
  // Input bar
  inputBar:    { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderTopWidth: 1, gap: 8, paddingBottom: 24, minHeight: 70 },
  plusBtn:     { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  plusTx:      { fontSize: 26, fontWeight: '300', lineHeight: 30 },
  input:       { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn:     { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // Viewer
  searchBar:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginVertical: 4, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10 },
  searchIcon: { fontSize: 14, marginRight: 6, opacity: 0.6 },
  searchInput:{ flex: 1, paddingVertical: 8, paddingHorizontal: 4, fontSize: 14 },
  pinBanner:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1 },

  // Date separator pill — centered between message clusters from
  // different days. Subtle pill so it doesn't compete with bubbles.
  datePillWrap: { alignItems: 'center', paddingVertical: 10 },
  datePill:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  datePillTx:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },

  // E2E intro banner pinned to the oldest end of new chats. Suppresses
  // itself once the chat has accumulated more than ~50 messages.
  e2eIntro:     { marginHorizontal: 24, marginVertical: 14, padding: 14, borderRadius: 12, borderWidth: 1 },
  e2eIntroTx:   { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  fsWrap:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' },
  menuOverlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  msgMenu:      { borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  menuPreview:  { fontSize: 13, textAlign: 'center', paddingHorizontal: 20, paddingVertical: 14, opacity: 0.7 },
  menuOpt:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 14 },
  menuIcon:     { fontSize: 18, width: 28, textAlign: 'center' },
  menuLabel:    { fontSize: 16 },
  menuCancel:   { paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  menuCancelTx: { fontSize: 16, fontWeight: '600' },
  editSheet:    { paddingBottom: 34, borderTopWidth: StyleSheet.hairlineWidth },
  editHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  editTitle:    { fontWeight: '700', fontSize: 16 },
  editInput:    { margin: 16, padding: 14, borderRadius: 14, borderWidth: 1, fontSize: 16, minHeight: 80, maxHeight: 160 },
  fsClose:     { position: 'absolute', top: 56, right: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  fsCloseTx:   { color: '#fff', fontWeight: 'bold' },
  fsImg:       { width: '100%', height: '80%' },
  fsVideo:     { width: '100%', height: 300 },
  // Modals
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44 },
  handle:      { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:  { fontWeight: 'bold', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  attachGrid:  { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16 },
  attachItem:  { alignItems: 'center', width: 72 },
  attachIcon:  { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  attachLabel: { fontSize: 11 },
  gifGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 12 },
  gifItem:     { width: '22%', borderRadius: 14, padding: 10, alignItems: 'center' },
  emojiGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 12 },
  emojiItem:   { width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  sheetXBtn:      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sheetXTx:       { color: '#000', fontWeight: '900', fontSize: 14 },
  cancelBtn:   { borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 8 },
  tabRow:      { flexDirection: 'row', marginBottom: 12, borderRadius: 12, padding: 4 },
  tab:         { flex: 1, padding: 8, borderRadius: 10, alignItems: 'center' },
});
