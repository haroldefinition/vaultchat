import React, { useState, useEffect, useRef } from 'react';
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
import { successFeedback, longPressFeedback, taptic, impactMedium } from '../services/haptics';
import SwipeableRow    from '../components/SwipeableRow';
import ZoomableImage   from '../components/ZoomableImage';
import ReactionPicker from '../components/ReactionPicker';
import ReactionBar    from '../components/ReactionBar';
import ReportMessageModal from '../components/ReportMessageModal';
import { supabase } from '../services/supabase';
import { placeCall } from '../services/placeCall';
import { subscribeToRoom, subscribeToTyping, broadcastTyping } from '../services/realtimeMessages';
import { enqueue, flushQueue } from '../services/messageQueue';
import { markRoomAsRead, markDelivered, receiptIcon } from '../services/readReceipts';
import { ResolvedPhotoStack, ResolvedVideoCarousel } from '../components/MediaBubbles';
import {
  publishMyPublicKey,
  getPublicKey,
  resolveDirectRecipient,
} from '../services/keyExchange';
import {
  encryptMessageForPair,
  decryptMessage,
  decryptSelfEnvelope,
  isEncryptedEnvelope,
} from '../crypto/encryption';

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
function SinglePhoto({ msgKey, isLocal, onOpen, onReply }) {
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
  return (
    <TouchableOpacity onPress={() => onOpen(uri)} onLongPress={onReply} delayLongPress={450} activeOpacity={0.88}>
      <Image source={{ uri }} style={{ width: 220, height: 180, borderRadius: 14 }} resizeMode="cover" />
      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>Tap to expand</Text>
    </TouchableOpacity>
  );
}

// ── Video bubble ──────────────────────────────────────────────
function VideoBubble({ uri, onPlay, onReply }) {
  return (
    <TouchableOpacity
      style={{ width: 220, height: 130, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      onPress={() => onPlay(uri)} onLongPress={onReply} delayLongPress={450}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 26, marginLeft: 4, color: '#fff' }}>▶</Text>
      </View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }}>Tap to play</Text>
    </TouchableOpacity>
  );
}

// ── Message bubble ────────────────────────────────────────────
function Bubble({ item, myId, tx, sub, card, accent, onOpenImg, onPlayVid, onReply, onLongPress, tappedId, onTap, reactions, onReact }) {
  const me      = item.sender_id === myId;
  const raw     = item.content || '';
  const nlIdx   = raw.indexOf('\n');
  const main    = nlIdx >= 0 ? raw.substring(0, nlIdx) : raw;
  const cap     = nlIdx >= 0 ? raw.substring(nlIdx + 1).trim() : '';
  const isMedia = main.startsWith('GALLERY:') || main.startsWith('LOCALIMG:') || main.startsWith('IMG:')
               || main.startsWith('VIDEOS:')  || main.startsWith('LOCALVID:') || main.startsWith('VID:');

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
            label="↩ Reply"
            labelColor={me ? 'rgba(255,255,255,0.7)' : accent}
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
        <ResolvedPhotoStack keys={keys} onLongPress={onReply} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('LOCALIMG:') || main.startsWith('IMG:')) {
      const key = main.replace('LOCALIMG:', '').replace('IMG:', '');
      return <>
        <SinglePhoto msgKey={key} isLocal={main.startsWith('LOCALIMG:')} onOpen={onOpenImg} onReply={onReply} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('VIDEOS:')) {
      return <>
        <ResolvedVideoCarousel content={main} onLongPress={onReply} />
        {cap ? <Text style={[s.cap, { color: me ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}
      </>;
    }
    if (main.startsWith('LOCALVID:') || main.startsWith('VID:')) {
      const uri = main.replace('LOCALVID:', '').replace('VID:', '');
      return <>
        <VideoBubble uri={uri} onPlay={onPlayVid} onReply={onReply} />
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
          onLongPress={onReply} delayLongPress={450}>
          <Text style={{ fontSize: 26 }}>📄</Text>
          <View>
            <Text style={[s.msgTx, { color: me ? '#fff' : tx }]}>{fname}</Text>
            <Text style={{ fontSize: 11, color: me ? 'rgba(255,255,255,0.6)' : sub }}>Tap to open</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return <Text style={[s.msgTx, { color: me ? '#fff' : tx }]}>{raw}</Text>;
  };

  return (
    <SwipeableRow onReply={() => { taptic(); onReply && onReply(); }}>
      <View style={[s.bWrap, me ? s.myWrap : s.theirWrap]}>
        <TouchableOpacity
          style={[s.bubble, me ? s.myBubble : [s.theirBubble, { backgroundColor: card }], isMedia && s.mediaPad]}
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
            {showFull ? fullTimeStr : timeStr}{item.edited ? '  ✎' : ''}
          </Text>
          {me && (() => { const r = receiptIcon(item.status); return (
            <Text style={{ fontSize: 11, color: r.color, marginLeft: 3 }}>{r.icon}</Text>
          ); })()}
        </View>
      </View>
    </SwipeableRow>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function ChatRoomScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { roomId, recipientPhone, recipientName, recipientPhoto, pendingMessage } = route.params || {};

  const [messages,     setMessages]     = useState([]);
  const [text,         setText]         = useState('');
  const [sending,      setSending]      = useState(false);
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
  const [recipientPubKey, setRecipientPubKey] = useState(null);
  // encryptionStatus gates the send button until we know whether we can
  // encrypt to the peer. States:
  //   'resolving' — useEffect still running (publish + lookup). Send blocked.
  //   'ready'     — peer pubkey known, messages will be encrypted.
  //   'plaintext' — peer has no pubkey (legacy or not yet published). Allow send,
  //                 but warn the user.
  //   'error'     — timeout / network failure. Allow send as last-resort plaintext.
  // We hard-cap resolution at 3s so a slow Supabase never permanently blocks sends.
  const [encryptionStatus, setEncryptionStatus] = useState('resolving');
  // Plaintext cache keyed by message id — lets the sender's own device render
  // history without re-hitting the crypto path for already-decrypted rows,
  // and lets optimistic (tempId) messages carry plaintext through to the
  // confirmed row once Supabase echoes it back encrypted.
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
    const cached = plaintextCacheRef.current.get(row.id);
    if (cached != null) return { ...row, content: cached };
    if (!isEncryptedEnvelope(row.content)) return row;
    try {
      let plaintext;
      if (row.sender_id && row.sender_id === myId) {
        // I sent this — try the self-seal first, then fall back to main envelope
        // (some older sends may not have self-seal metadata).
        const selfEnv = row.metadata?.ct_self;
        if (selfEnv) {
          plaintext = await decryptSelfEnvelope(selfEnv);
        } else {
          plaintext = await decryptMessage(row.content);
        }
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
        // Publish our pubkey (best-effort) so the other side can encrypt to us.
        publishMyPublicKey(myId).catch(() => {});
        // Find the other member of this room. Pass recipientPhone so legacy
        // chats (no rooms row yet) can fall back to a profile lookup.
        const otherId = await resolveDirectRecipient(roomId, myId, { recipientPhone });
        if (cancelled) return;
        setRecipientId(otherId);
        if (otherId) {
          const pk = await getPublicKey(otherId);
          if (cancelled) return;
          setRecipientPubKey(pk);
          setEncryptionStatus(pk ? 'ready' : 'plaintext');
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

  useEffect(() => {
    loadUser();
    fetchMessages();
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
    const reactionSub = supabase
      .channel(`reactions:${roomId}`)
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
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        const real = data.filter(m => m.id && !String(m.id).startsWith('temp_'));
        // Decrypt in parallel before rendering. Plaintext legacy rows pass through.
        const decrypted = await decryptRows(real);
        setMessages(decrypted);
        AsyncStorage.setItem(MKEY, JSON.stringify(decrypted)).catch(() => {});
        // Load reactions for these messages
        setTimeout(() => {
          const ids = real.map(m => m.id).filter(Boolean);
          if (ids.length) {
            supabase.from('message_reactions').select('*').in('message_id', ids)
              .then(({ data: rdata }) => {
                if (rdata) {
                  const grouped = {};
                  rdata.forEach(r => {
                    if (!grouped[r.message_id]) grouped[r.message_id] = [];
                    grouped[r.message_id].push(r);
                  });
                  setReactions(grouped);
                }
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

  async function postMsg(content) {
    const now = new Date().toISOString();
    const tempId = `temp_${Date.now()}`;
    // Optimistic row uses PLAINTEXT `content` so the sender sees their own
    // message immediately. We encrypt only the wire payload.
    const newMsg = { id: tempId, room_id: roomId, sender_id: myId, content, created_at: now };

    // Optimistic update
    setMessages(prev => [...prev, newMsg]);
    // inverted FlatList — new messages appear at bottom automatically

    // Build the insert payload. If we have the recipient's public key, encrypt.
    // Otherwise, fall back to plaintext so existing rooms (or partners who
    // haven't published a key yet) still work.
    let insertPayload = { room_id: roomId, sender_id: myId, content };
    if (recipientPubKey) {
      try {
        const { content: wireContent, metadataSelf } = await encryptMessageForPair(content, recipientPubKey);
        insertPayload = {
          room_id:  roomId,
          sender_id: myId,
          content:  wireContent,
          metadata: { ct_self: metadataSelf, encrypted: true, v: 2 },
        };
      } catch (e) {
        if (__DEV__) console.warn('encrypt failed, sending plaintext:', e?.message);
      }
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

  // ── Load reactions for all messages in this room ────────────
  async function loadReactions() {
    try {
      const msgIds = messages.map(m => m.id).filter(Boolean);
      if (!msgIds.length) return;
      const { data } = await supabase
        .from('message_reactions')
        .select('*')
        .in('message_id', msgIds);
      if (data) {
        const grouped = {};
        data.forEach(r => {
          if (!grouped[r.message_id]) grouped[r.message_id] = [];
          grouped[r.message_id].push(r);
        });
        setReactions(grouped);
      }
    } catch {}
  }

  // ── Toggle a reaction on a message ───────────────────────────
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
      // Remove any existing reaction from this user on this message first (one reaction per message)
      const myOld = current.find(r => r.user_id === myId);
      if (myOld) {
        setReactions(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(r => r.id !== myOld.id),
        }));
        try { await supabase.from('message_reactions').delete().eq('id', myOld.id); } catch {}
      }
      // Add new reaction
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

  function pickAttach(type) { pendingAttach.current = type; setAttachModal(false); }

  async function handleAttachType(type) {
    if (type === 'photo') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', quality: 1, allowsMultipleSelection: true, selectionLimit: 20,
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
        mediaTypes: 'videos', quality: 1, allowsMultipleSelection: true, selectionLimit: 10,
      });
      if (!r.canceled && r.assets?.length) {
        setStagedVideos(prev => [...prev, ...r.assets.map(a => ({ uri: a.uri }))].slice(0, 10));
      }
    } else if (type === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 1 });
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
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'all', quality: 1, allowsMultipleSelection: false });
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
    { icon: '🖼️', label: 'Gallery',  type: 'photo'    },
    { icon: '🎥', label: 'Video',    type: 'video'    },
    { icon: '📸', label: 'Camera',   type: 'camera'   },
    { icon: '📁', label: 'File',     type: 'file'     },
    { icon: '🎭', label: 'GIF',      type: 'gif'      },
    { icon: '😀', label: 'Emoji',    type: 'emoji'    },
    { icon: '🔵', label: 'AirDrop',  type: 'airdrop'  },
    { icon: '📍', label: 'Location', type: 'location' },
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
          activeOpacity={0.7}>
          <View style={[s.hAvatar, { backgroundColor: accent }]}>
            {contactData?.photo
              ? <Image source={{ uri: contactData.photo }} style={s.hAvatarImg} />
              : <Text style={s.hAvatarTx}>{(recipientName || '?')[0]?.toUpperCase()}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.hName, { color: tx }]}>{contactData?.name || recipientName || recipientPhone || 'Chat'}</Text>
            <Text style={[s.hSub, { color: sub }]}>🔒 End-to-end encrypted</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setSearchOpen(v => !v); setSearchQuery(''); }} style={s.callBtn}>
          <Text style={{ fontSize: 20 }}>🔍</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => placeCall({ navigation, peerUserId: recipientId, chatRoomId: roomId, recipientName, recipientPhone, type: 'voice' })} style={s.callBtn}>
          <Text style={{ fontSize: 22 }}>📞</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => placeCall({ navigation, peerUserId: recipientId, chatRoomId: roomId, recipientName, recipientPhone, type: 'video' })} style={s.callBtn}>
          <Text style={{ fontSize: 22 }}>📹</Text>
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

      {/* Pinned message banner */}
      {pinnedMsgId && (() => {
        const pinned = messages.find(m => m.id === pinnedMsgId);
        if (!pinned) return null;
        const preview = (() => {
          const raw = pinned.content || '';
          if (raw.startsWith('REPLY:')) {
            const ci = raw.indexOf(':', 6);
            const qLen = parseInt(raw.substring(6, ci)) || 0;
            return raw.substring(ci + 1 + qLen, ci + 1 + qLen + 60) || '↩ Reply';
          }
          if (raw.startsWith('IMG:') || raw.startsWith('LOCALIMG:')) return '📷 Photo';
          if (raw.startsWith('GALLERY:')) return '🖼️ Gallery';
          if (raw.startsWith('VID:') || raw.startsWith('LOCALVID:')) return '🎥 Video';
          return raw.substring(0, 60);
        })();
        return (
          <TouchableOpacity
            style={[s.pinBanner, { backgroundColor: card, borderBottomColor: border }]}
            onPress={() => {
              // Scroll to the pinned message
              const idx = [...messages].reverse().findIndex(m => m.id === pinnedMsgId);
              if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
            }}
            onLongPress={() => togglePin(pinned)}>
            <Text style={{ fontSize: 14 }}>📌</Text>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={{ fontSize: 11, color: accent, fontWeight: '700', marginBottom: 1 }}>Pinned Message</Text>
              <Text style={{ fontSize: 13, color: tx }} numberOfLines={1}>{preview}</Text>
            </View>
            <TouchableOpacity onPress={() => togglePin(pinned)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: sub, fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        );
      })()}

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={(() => {
          const list = searchQuery.trim()
            ? messages.filter(m => (m.content || '').toLowerCase().includes(searchQuery.toLowerCase()))
            : messages;
          return [...list].reverse();
        })()}
        keyExtractor={(item, i) => String(item.id || i)}
        inverted
        contentContainerStyle={{ padding: 12, paddingTop: 8 }}
        renderItem={({ item }) => (
          <Bubble
            item={item} myId={myId} tx={tx} sub={sub} card={card} accent={accent}
            onOpenImg={uri => setFullImgUri(uri)}
            onPlayVid={uri => setVidUri(uri)}
            onLongPress={item => { longPressFeedback(); setPickerMsg(item); }}
            onReply={() => setReplyTo(item)}
            tappedId={tappedId}
            onTap={id => setTappedId(prev => prev === id ? null : id)}
          />
        )}
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

      {/* Reply bar */}
      {replyTo && (
        <View style={[s.replyBar, { backgroundColor: card, borderTopColor: border }]}>
          <View style={{ flex: 1 }}>
            <ReplyPreview
              content={replyTo.content}
              label="↩ Replying"
              labelColor={accent}
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
        <View style={{
          backgroundColor: '#F59E0B' + '1A',
          borderTopWidth: 1, borderTopColor: border,
          paddingHorizontal: 14, paddingVertical: 8,
        }}>
          <Text style={{ color: '#B45309', fontSize: 12, fontWeight: '600' }}>
            ⚠️ Peer hasn't set up encryption — messages will be sent in plaintext.
          </Text>
        </View>
      )}
      {encryptionStatus === 'error' && (
        <View style={{
          backgroundColor: '#EF4444' + '1A',
          borderTopWidth: 1, borderTopColor: border,
          paddingHorizontal: 14, paddingVertical: 8,
        }}>
          <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '600' }}>
            ⚠️ Couldn't verify encryption. Messages may be plaintext.
          </Text>
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
              disabled={sending || encryptionStatus === 'resolving'}>
              {sending
                ? <ActivityIndicator color="#000" size="small" />
                : <Text style={{ color: '#000', fontWeight: '900', fontSize: 20 }}>➤</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Normal input bar */}
      {!hasStaged && (
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
          <TouchableOpacity
            style={[s.sendBtn, { backgroundColor: text.trim() ? accent : inputBg }]}
            onPress={() => sendText()} disabled={!text.trim() || sending || encryptionStatus === 'resolving'}>
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: text.trim() ? '#000' : sub, fontSize: 18 }}>➤</Text>}
          </TouchableOpacity>
        </View>
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

      {/* GIF modal */}
      <Modal visible={gifModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: card, maxHeight: '60%' }]}>
            <View style={[s.handle, { backgroundColor: border }]} />
            <View style={s.sheetHeaderRow}>
              <Text style={[s.sheetTitle, { color: tx }]}>GIFs</Text>
              <TouchableOpacity style={[s.sheetXBtn, { backgroundColor: accent }]} onPress={() => setGifModal(false)}>
                <Text style={s.sheetXTx}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.gifGrid}>
              {GIFS.map((g, i) => (
                <TouchableOpacity key={i} style={[s.gifItem, { backgroundColor: inputBg }]}
                  onPress={() => { setGifModal(false); sendText(g.msg); }}>
                  <Text style={{ fontSize: 32 }}>{g.emoji}</Text>
                  <Text style={{ fontSize: 10, color: sub, marginTop: 4 }}>{g.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

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
        onMore={() => { if (pickerMsg) { setMenuMsg(pickerMsg); setMenuVis(true); } }}
        myReaction={(reactions[pickerMsg?.id] || []).find(r => r.user_id === myId)?.emoji || null}
        card={card}
        accent={accent}
      />

      {/* Message long-press action menu */}
      <Modal visible={menuVis} transparent animationType="fade" onRequestClose={() => setMenuVis(false)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setMenuVis(false)}>
          <View style={[s.msgMenu, { backgroundColor: card }]}>
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
  myBubble:    { backgroundColor: '#0057a8', borderBottomRightRadius: 4 },
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
  fsWrap:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' },
  menuOverlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  msgMenu:      { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
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
