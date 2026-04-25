import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput,
  KeyboardAvoidingView, Platform, Image, Modal, Alert, Linking,
  ActivityIndicator, ScrollView, Vibration, Share,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../services/theme';
import { supabase } from '../services/supabase';
import { subscribeToGroup, subscribeToTyping, broadcastTyping } from '../services/realtimeMessages';
import { enqueue, flushQueue } from '../services/messageQueue';
// adsService used only in Discover/OfferInbox — not in private chats
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { uploadMedia } from '../services/mediaUpload';
import GifPickerModal from '../components/GifPickerModal';
import ReplyPreview       from '../components/ReplyPreview';
import StagedPhotosPicker from '../components/StagedPhotosPicker';
import { successFeedback, longPressFeedback, taptic, impactMedium } from '../services/haptics';
import SwipeableRow   from '../components/SwipeableRow';
import ZoomableImage  from '../components/ZoomableImage';
import ReactionPicker from '../components/ReactionPicker';
import ReactionBar    from '../components/ReactionBar';
import ContactEditModal from '../components/ContactEditModal';
import PremiumModal from '../components/PremiumModal';
import ReportMessageModal from '../components/ReportMessageModal';
import { ResolvedPhotoStack, ResolvedVideoCarousel } from '../components/MediaBubbles';
import VoiceNoteBubble from '../components/VoiceNoteBubble';
import {
  useAudioRecorder,
  RecordingPresets,
  AudioModule,
  setAudioModeAsync,
} from 'expo-audio';
import { Phone, Video as VideoIcon, Mic } from 'lucide-react-native';
import { makeCallId } from '../services/placeCall';
import { getMyDisplayName } from '../services/vaultHandle';

// ── Media helpers ─────────────────────────────────────────────
function SinglePhoto({ msgKey, isLocal, onOpen, onLongPress }) {
  const [uri,    setUri]    = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUri(null); setFailed(false);
    if (!isLocal) {
      setUri(msgKey); // Remote https:// URL — always available
    } else {
      AsyncStorage.getItem(msgKey)
        .then(v => { if (v) setUri(v); else setFailed(true); })
        .catch(() => setFailed(true));
    }
  }, [msgKey]);

  if (failed) return (
    <View style={{ width: 200, height: 90, borderRadius: 14, backgroundColor: '#111',
        alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <Text style={{ fontSize: 20 }}>🖼️</Text>
      <Text style={{ fontSize: 11, color: '#555', textAlign: 'center', paddingHorizontal: 12 }}>
        Photo not available
      </Text>
    </View>
  );
  if (!uri) return (
    <View style={{ width: 200, height: 160, borderRadius: 14, backgroundColor: '#111',
        alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#555" />
    </View>
  );
  return (
    <TouchableOpacity onPress={() => onOpen(uri)} onLongPress={onLongPress} delayLongPress={450}>
      <Image source={{ uri }} style={{ width: 200, height: 160, borderRadius: 14 }} resizeMode="cover" />
    </TouchableOpacity>
  );
}

function VideoBubble({ uri, onPlay, onLongPress }) {
  return (
    <TouchableOpacity style={{ width: 200, height: 120, borderRadius: 14, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      onPress={() => onPlay(uri)} onLongPress={onLongPress} delayLongPress={450}>
      <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 22, marginLeft: 3, color: '#fff' }}>▶</Text>
      </View>
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>Tap to play</Text>
    </TouchableOpacity>
  );
}

function FullScreenImg({ uri, onClose }) {
  return <ZoomableImage uri={uri} visible={!!uri} onClose={onClose} />;
}

// VideoPlayerInner: useVideoPlayer hook must live at component top level
function VideoPlayerInner({ uri }) {
  const player = useVideoPlayer({ uri }, p => { p.play(); });
  return <VideoView player={player} style={{ width: '100%', height: 300 }} nativeControls contentFit="contain" />;
}

function VideoModal({ uri, onClose }) {
  if (!uri) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        <TouchableOpacity style={{ position: 'absolute', top: 56, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }} onPress={onClose}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>✕  Close</Text>
        </TouchableOpacity>
        <VideoPlayerInner uri={uri} />
      </View>
    </Modal>
  );
}

// ── Message bubble ────────────────────────────────────────────
function Bubble({ item, currentUserId, colors, onFullScreen, onPlay, onLongPress, tappedId, onTap, onReply, reactions, onReact }) {
  const { tx, sub, card, accent } = colors;
  const isMe = item.sender_id === currentUserId;
  const raw  = item.text || '';
  const nlIdx = raw.indexOf('\n');
  const main  = nlIdx >= 0 ? raw.substring(0, nlIdx) : raw;
  const cap   = nlIdx >= 0 ? raw.substring(nlIdx + 1).trim() : '';
  const isMedia = ['GALLERY:', 'LOCALIMG:', 'IMG:', 'VIDEOS:', 'LOCALVID:', 'VID:', 'VOICE:'].some(p => main.startsWith(p));

  // Split a message body into alternating plain-text and @mention spans
  // so we can style the mentions in the accent color without
  // re-parsing at render time every frame.
  const renderWithMentions = (body, baseColor, mentionColor) => {
    const out = [];
    const re  = /@[a-z0-9_]{2,}/gi;
    let last  = 0;
    let match;
    let i     = 0;
    while ((match = re.exec(body)) !== null) {
      if (match.index > last) {
        out.push(<Text key={`t${i}`} style={{ color: baseColor }}>{body.slice(last, match.index)}</Text>);
      }
      out.push(
        <Text
          key={`m${i}`}
          style={{ color: mentionColor, fontWeight: '700' }}>
          {match[0]}
        </Text>,
      );
      last = match.index + match[0].length;
      i++;
    }
    if (last < body.length) {
      out.push(<Text key={`t${i}`} style={{ color: baseColor }}>{body.slice(last)}</Text>);
    }
    return out.length ? out : [<Text key="t0" style={{ color: baseColor }}>{body}</Text>];
  };

  const body = () => {
    if (item.type === 'gif') return <Image source={{ uri: raw }} style={{ width: 200, height: 150, borderRadius: 12 }} resizeMode="contain" />;
    if (main.startsWith('GALLERY:')) return <><ResolvedPhotoStack keys={main.replace('GALLERY:', '').split('|')} onLongPress={onLongPress} />{cap ? <Text style={[g.cap, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    if (main.startsWith('LOCALIMG:') || main.startsWith('IMG:')) return <><SinglePhoto msgKey={main.replace('LOCALIMG:', '').replace('IMG:', '')} isLocal={main.startsWith('LOCALIMG:')} onOpen={onFullScreen} onLongPress={onLongPress} />{cap ? <Text style={[g.cap, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    if (main.startsWith('VOICE:')) {
      // Format: VOICE:<url>|<duration_sec>. Permissive parse — falls
      // back to a player with 0 duration if the duration suffix is
      // missing or malformed.
      const rest = main.slice('VOICE:'.length);
      const sep  = rest.lastIndexOf('|');
      const url  = sep >= 0 ? rest.slice(0, sep) : rest;
      const dur  = sep >= 0 ? parseFloat(rest.slice(sep + 1)) || 0 : 0;
      return <><VoiceNoteBubble url={url} durationSec={dur} accent={accent} isMe={isMe} bgColor={'transparent'} />{cap ? <Text style={[g.cap, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    }
    if (main.startsWith('VIDEOS:')) return <><ResolvedVideoCarousel content={main} onLongPress={onLongPress} />{cap ? <Text style={[g.cap, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    if (main.startsWith('LOCALVID:') || main.startsWith('VID:')) return <><VideoBubble uri={main.replace('LOCALVID:', '').replace('VID:', '')} onPlay={onPlay} onLongPress={onLongPress} />{cap ? <Text style={[g.cap, { color: isMe ? 'rgba(255,255,255,0.9)' : tx }]}>{cap}</Text> : null}</>;
    if (main.startsWith('FILE:')) {
      const [fname, url] = main.replace('FILE:', '').split('|');
      return <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => url && Linking.openURL(url)} onLongPress={onLongPress} delayLongPress={450}><Text style={{ fontSize: 24 }}>📄</Text><View><Text style={[g.msgTx, { color: isMe ? '#fff' : tx }]}>{fname}</Text><Text style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.6)' : sub }}>Tap to open</Text></View></TouchableOpacity>;
    }
    if (item.reply_to_id) return (
      <>
        <ReplyPreview
          content={item.reply_to_text}
          label={item.reply_to_sender ? `↩ ${item.reply_to_sender}` : '↩ Reply'}
          labelColor={isMe ? 'rgba(255,255,255,0.8)' : accent}
          textColor={isMe ? 'rgba(255,255,255,0.65)' : sub}
          borderColor={isMe ? 'rgba(255,255,255,0.5)' : accent}
        />
        <Text style={g.msgTx}>{renderWithMentions(raw, isMe ? '#fff' : tx, isMe ? '#ffe27a' : accent)}</Text>
      </>
    );
    return <Text style={g.msgTx}>{renderWithMentions(raw, isMe ? '#fff' : tx, isMe ? '#ffe27a' : accent)}</Text>;
  };
  const showFull = tappedId === item.id;
  const fullTimeStr = (() => {
    try {
      const d    = new Date(item.created_at);
      const date = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `${date} · ${time}`;
    } catch { return ''; }
  })();
  const shortTimeStr = (() => {
    try { return new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  })();

  return (
    <SwipeableRow onReply={() => { taptic(); onReply && onReply(); }}>
      <TouchableOpacity activeOpacity={0.85}
        onPress={() => onTap && onTap(item.id)}
        onLongPress={onLongPress} delayLongPress={450}
        style={[g.msgWrapper, isMe ? g.right : g.left]}>
        {!isMe && <Text style={[g.senderHandle, { color: accent }]}>@{item.sender_handle || 'member'}</Text>}
        <View style={[
          g.bubble,
          isMedia && g.mediaPad,
          { backgroundColor: isMe ? '#0057a8' : card },
          // Media-only (no caption) → transparent so the photo's own
          // accent border IS the visual frame. Same treatment as 1:1.
          isMedia && !cap && { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0, padding: 0 },
        ]}>
          {body()}
          <Text style={[g.msgTime, { color: isMe ? 'rgba(255,255,255,0.6)' : sub }]}>
            {showFull ? fullTimeStr : shortTimeStr}{item.edited ? '  ✎' : ''}
          </Text>
        </View>
        {reactions?.length > 0 && (
          <ReactionBar
            reactions={reactions}
            myUserId={currentUserId}
            onReact={onReact}
            accent={accent}
            card={card}
          />
        )}
      </TouchableOpacity>
    </SwipeableRow>
  );
}

// ── Main screen ───────────────────────────────────────────────
export default function GroupChatScreen({ route, navigation }) {
  const { groupId, groupName: initialGroupName } = route.params || {};
  const colors = useTheme();
  const { bg, card, tx, sub, border, inputBg, accent } = colors;

  // ── Group identity (#75) — loaded from AsyncStorage on mount ─
  // Keep these in state so live edits (name/photo/description via the
  // info modal) re-render the header immediately without a round-trip.
  const [groupName,    setGroupName]    = useState(initialGroupName || 'Group');
  const [groupPhoto,   setGroupPhoto]   = useState(null);
  const [groupDesc,    setGroupDesc]    = useState('');
  const [groupMembers, setGroupMembers] = useState([]); // array of member descriptors

  // ── @mentions (#80) ─────────────────────────────────────────
  // Detect when the user is mid-@-mention in the composer so we can
  // pop up an autocomplete list of group members. `mentionQuery` holds
  // whatever's between the '@' and the cursor/space — e.g. typing
  // 'hey @al' sets mentionQuery='al'. null means no mention in progress.
  const [mentionQuery, setMentionQuery] = useState(null);

  const [messages,      setMessages]      = useState([]);
  const [inputText,     setInputText]     = useState('');
  const [replyingTo,    setReplyingTo]    = useState(null);
  const [tappedId,      setTappedId]      = useState(null);
  const [reactions,     setReactions]     = useState({});
  const [pickerMsg,     setPickerMsg]     = useState(null);
  const [selectedMsg,   setSelectedMsg]   = useState(null);
  const [msgMenuVis,    setMsgMenuVis]    = useState(false);
  const [gifVisible,    setGifVisible]    = useState(false);
  const [premiumVis,    setPremiumVis]    = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentHandle, setCurrentHandle] = useState('');
  const [sending,       setSending]       = useState(false);
  const [stagedPhotos,  setStagedPhotos]  = useState([]);

  // ── Voice notes (parity with 1:1 ChatRoomScreen) ───────────
  // Same recorder lifecycle as the 1:1 chat: hook is mounted once,
  // controlled imperatively from start/stop/cancel functions below.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording,        setIsRecording]        = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState(0);
  const [recordingElapsed,   setRecordingElapsed]   = useState(0);
  const recordingTimerRef = useRef(null);
  const [stagedVideos,  setStagedVideos]  = useState([]);
  const [fullImgUri,    setFullImgUri]    = useState(null);
  const [vidUri,        setVidUri]        = useState(null);
  const [attachModal,   setAttachModal]   = useState(false);
  const [infoEditModal, setInfoEditModal] = useState(false);
  const [emojiModal,    setEmojiModal]    = useState(false);
  const [typingUsers,  setTypingUsers]  = useState([]);
  const [editingMsg,    setEditingMsg]    = useState(null);
  const [editText,      setEditText]      = useState('');
  const [reportVisible, setReportVisible] = useState(false);
  const [reportTarget,  setReportTarget]  = useState(null);

  const flatRef      = useRef(null);
  const pollRef      = useRef(null);
  const pendingRef   = useRef(null);
  const SKEY         = `vaultchat_gmsgs_${groupId}`;

  // ── Load messages from AsyncStorage first, then sync with Supabase ──
  useEffect(() => {
    initUser();
    loadLocal();        // show cached messages immediately
    syncSupabase();
    flushQueue().catch(() => {});

    // Realtime subscription for instant group messages
    const unsubGroup = subscribeToGroup(
      groupId,
      (newMsg) => {
        setMessages(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev;
          // Replace matching temp message
          const replaced = prev.map(m =>
            m.sender_id === newMsg.sender_id && m.text === newMsg.text && String(m.id).startsWith('temp_')
              ? newMsg : m
          );
          const hasTemp = replaced.some(m => m.id === newMsg.id);
          const next = hasTemp ? replaced : [...replaced, newMsg];
          AsyncStorage.setItem(SKEY, JSON.stringify(next.filter(m => !String(m.id).startsWith('temp_')))).catch(() => {});
          return next;
        });
      },
      (updatedMsg) => {
        setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m));
      }
    );

    // Typing indicators for group
    const unsubTyping = subscribeToTyping(groupId, ({ userId, handle, isTyping }) => {
      setTypingUsers(prev => {
        if (isTyping && userId !== currentUserId) {
          return prev.find(t => t.userId === userId) ? prev : [...prev, { userId, handle }];
        }
        return prev.filter(t => t.userId !== userId);
      });
    });

    pollRef.current = setInterval(syncSupabase, 10000); // slower fallback

    // Realtime: reactions on group messages
    const reactionSub = supabase
      .channel(`group_reactions:${groupId}`)
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

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      unsubGroup();
      unsubTyping();
      supabase.removeChannel(reactionSub);
    };
  }, [groupId]);

  useEffect(() => {
    if (!attachModal && pendingRef.current) {
      const t = pendingRef.current; pendingRef.current = null;
      setTimeout(() => handleAttach(t), 700);
    }
  }, [attachModal]);

  // Load the group's stored identity (name/photo/desc/members) on mount
  // and whenever a focus event tells us the user may have edited it in
  // another screen. AsyncStorage is the source of truth for groups today.
  useEffect(() => {
    let cancelled = false;
    async function loadGroup() {
      try {
        const raw = await AsyncStorage.getItem('vaultchat_groups');
        if (!raw) return;
        const gs = JSON.parse(raw);
        const g = gs.find(x => x.id === groupId);
        if (!g || cancelled) return;
        setGroupName(g.name || initialGroupName || 'Group');
        setGroupPhoto(g.photo || null);
        setGroupDesc(g.desc || '');
        setGroupMembers(Array.isArray(g.members) ? g.members : []);
      } catch {}
    }
    loadGroup();
    const unsub = navigation.addListener('focus', loadGroup);
    return () => { cancelled = true; unsub && unsub(); };
  }, [groupId, navigation]);

  // Kick off a group voice/video call from the group chat header.
  //
  // Today group members are stored as bare name strings (see GroupScreen
  // ManageMembersModal — only a name is persisted), so we can't resolve
  // them to auth.users.id rows up-front to pre-populate the conference.
  // Instead we hand the conference engine an empty participant list and
  // rely on the existing "+ Add Call" modal in ActiveCallScreen to let
  // the user invite each person by @handle or phone. Once group members
  // carry userIds (future schema upgrade), pass them here as
  // initialParticipants and they'll all ring at once.
  //
  // roomId uses the groupId directly — same room for chat and call keeps
  // signaling routes aligned and avoids spinning up a parallel room.
  async function startGroupCall(type /* 'voice' | 'video' */) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const myUserId = session?.user?.id || null;
      if (!myUserId) {
        Alert.alert('Sign in required', 'Log back in before starting a group call.');
        return;
      }
      const myName = await getMyDisplayName();
      const callId = makeCallId();

      navigation.navigate('ActiveCall', {
        mode:        'outgoing-conference',
        callId,
        roomId:      groupId,
        myUserId,
        myName,
        recipientName: groupName || 'Group',
        callType:    type === 'video' ? 'video' : 'voice',
        isConference: true,
        initialParticipants: [], // populated via Add Participant during the call
      });
    } catch (e) {
      Alert.alert('Call failed', e?.message || 'Unable to start the group call.');
    }
  }

  // Leave group — remove from own AsyncStorage groups list. Does not
  // delete the underlying group_messages rows (other members keep the
  // group intact); just drops this device's reference to it.
  async function leaveGroup() {
    Alert.alert(
      'Leave group',
      `You will stop receiving messages from "${groupName}". Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              const raw = await AsyncStorage.getItem('vaultchat_groups');
              if (raw) {
                const filtered = JSON.parse(raw).filter(g => g.id !== groupId);
                await AsyncStorage.setItem('vaultchat_groups', JSON.stringify(filtered));
              }
            } catch {}
            navigation.goBack();
          },
        },
      ],
    );
  }

  async function initUser() {
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        setCurrentUserId(data.user.id);
        const { data: p } = await supabase.from('profiles').select('handle').eq('id', data.user.id).single();
        if (p?.handle) setCurrentHandle(p.handle);
        return;
      }
    } catch {}
    const raw  = await AsyncStorage.getItem('vaultchat_user');
    const name = await AsyncStorage.getItem('vaultchat_display_name');
    if (raw)  { const u = JSON.parse(raw); setCurrentUserId(u.id || u.phone || 'local'); }
    if (name) setCurrentHandle(name);
  }

  // Always load local cache first so messages never disappear on re-enter
  async function loadLocal() {
    try {
      const raw = await AsyncStorage.getItem(SKEY);
      if (raw) {
        const msgs = JSON.parse(raw);
        if (msgs.length > 0) setMessages(msgs);
      }
    } catch {}
  }

  // Merge Supabase data on top — never wipe local messages
  async function syncSupabase() {
    try {
      const { data, error } = await supabase
        .from('group_messages')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        const real = data.filter(m => m.id);
        setMessages(real);
        AsyncStorage.setItem(SKEY, JSON.stringify(real)).catch(() => {});
        // Load reactions for these messages
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
      }
    } catch {}
  }

  async function saveLocal(msgs) {
    const toSave = msgs.filter(m => m.id && !String(m.id).startsWith('temp_'));
    if (toSave.length > 0) AsyncStorage.setItem(SKEY, JSON.stringify(toSave)).catch(() => {});
  }

  async function postMsg(text, type = 'text') {
    const tempId  = `temp_${Date.now()}`;
    const payload = {
      group_id: groupId,
      sender_id: currentUserId,
      sender_handle: currentHandle,
      text, type,
      reply_to_id:     replyingTo?.id     || null,
      reply_to_text:   replyingTo?.text   || null,
      reply_to_sender: replyingTo?.sender || null,
      created_at: new Date().toISOString(),
    };
    const tempMsg = { ...payload, id: tempId };
    setMessages(prev => {
      const next = [...prev, tempMsg];
      // Save including temp so the user never sees empty on re-enter
      AsyncStorage.setItem(SKEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setInputText('');
    setReplyingTo(null);
    // inverted FlatList — new messages appear at bottom automatically

    try {
      const { data, error } = await supabase.from('group_messages').insert(payload).select().single();
      if (!error && data) {
        setMessages(prev => {
          const next = prev.map(m => m.id === tempId ? data : m);
          saveLocal(next);
          return next;
        });
      }
    } catch {
      // Queue for retry when connection returns
      await enqueue({
        tempId,
        table: 'group_messages',
        payload: { group_id: groupId, sender_id: currentUserId, sender_handle: currentHandle, text, type },
      }).catch(() => {});
    }
    // Update group preview
    try {
      const raw = await AsyncStorage.getItem('vaultchat_groups');
      if (raw) {
        const gs = JSON.parse(raw).map(g =>
          g.id === groupId ? { ...g, lastMessage: text.substring(0, 40), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } : g
        );
        AsyncStorage.setItem('vaultchat_groups', JSON.stringify(gs)).catch(() => {});
      }
    } catch {}
  }

  // ── Toggle a reaction on a group message ─────────────────────
  async function toggleGroupReaction(messageId, emoji) {
    if (!currentUserId || !messageId) return;
    const current  = reactions[messageId] || [];
    const existing = current.find(r => r.user_id === currentUserId && r.emoji === emoji);
    if (existing) {
      // Remove own reaction
      setReactions(prev => ({
        ...prev,
        [messageId]: (prev[messageId] || []).filter(r => r.id !== existing.id),
      }));
      try { await supabase.from('message_reactions').delete().eq('id', existing.id); } catch {}
    } else {
      // Remove previous reaction from this user (one per message)
      const myOld = current.find(r => r.user_id === currentUserId);
      if (myOld) {
        setReactions(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(r => r.id !== myOld.id),
        }));
        try { await supabase.from('message_reactions').delete().eq('id', myOld.id); } catch {}
      }
      // Add new reaction optimistically
      const optimistic = {
        id: `temp_${Date.now()}`,
        message_id: messageId,
        user_id: currentUserId,
        emoji,
        created_at: new Date().toISOString(),
      };
      setReactions(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), optimistic],
      }));
      try {
        const { data } = await supabase
          .from('message_reactions')
          .insert({ message_id: messageId, user_id: currentUserId, emoji })
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

  async function sendText(override) {
    const text = override ?? inputText.trim();
    if (!text) return;
    successFeedback(); // haptic on send
    await postMsg(text);
  }

  async function sendStagedPhotos() {
    if (!stagedPhotos.length) return;
    setSending(true);
    const cap = inputText.trim();
    try {
      const urls = await Promise.all(stagedPhotos.map(async p => {
        const uploaded = await uploadMedia(p.uri, 'image');
        return uploaded || null;
      }));
      const httpUrls = urls.filter(Boolean);
      let content;
      if (httpUrls.length > 0) {
        content = httpUrls.length === 1
          ? `IMG:${httpUrls[0]}`
          : `GALLERY:${httpUrls.join('|')}`;
      } else {
        // Upload failed — fall back to local (only visible on this device)
        content = stagedPhotos.length === 1
          ? `LOCALIMG:${stagedPhotos[0].key}`
          : `GALLERY:${stagedPhotos.map(p => p.key).join('|')}`;
      }
      if (cap) content += '\n' + cap;
      await postMsg(content);
    } catch {
      let content = stagedPhotos.length === 1
        ? `LOCALIMG:${stagedPhotos[0].key}`
        : `GALLERY:${stagedPhotos.map(p => p.key).join('|')}`;
      if (cap) content += '\n' + cap;
      await postMsg(content);
    }
    setStagedPhotos([]); setInputText(''); setSending(false);
  }

  async function sendStagedVideos() {
    if (!stagedVideos.length) return;
    setSending(true);
    const cap = inputText.trim();
    try {
      if (stagedVideos.length === 1) {
        const url = await uploadMedia(stagedVideos[0].uri, 'video');
        let content = url ? `LOCALVID:${url}` : '🎥 Video';
        if (cap) content += '\n' + cap;
        await postMsg(content);
      } else {
        const urls  = await Promise.all(stagedVideos.map(v => uploadMedia(v.uri, 'video')));
        let content = urls.filter(Boolean).length ? `VIDEOS:${urls.filter(Boolean).join('|')}` : '🎥 Videos';
        if (cap) content += '\n' + cap;
        await postMsg(content);
      }
    } catch {}
    setStagedVideos([]); setInputText(''); setSending(false);
  }

  // ── Voice notes (parity with 1:1 ChatRoomScreen) ───────────
  // Same flow as ChatRoomScreen.startRecording / stopRecording /
  // cancelRecording: prompt mic permission once, prepare + record,
  // tick the timer for the recording overlay, stop + upload + post
  // as VOICE:<url>|<seconds>. Cancel discards locally.
  async function startRecording() {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm?.granted) {
        Alert.alert('Microphone needed', 'Allow microphone access in Settings to send voice notes.');
        return;
      }
      try { await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }); } catch {}

      await recorder.prepareToRecordAsync();
      recorder.record();
      const startedAt = Date.now();
      setRecordingStartedAt(startedAt);
      setRecordingElapsed(0);
      setIsRecording(true);
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
      try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); } catch {}
      if (!uri) { Alert.alert('Recording empty', 'Nothing was captured. Try again.'); return; }

      setSending(true);
      const url = await uploadMedia(uri, 'voice');
      if (!url) {
        Alert.alert('Upload failed', 'Could not send the voice note. Check Metro logs.');
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
  }

  function pickAttach(type) { pendingRef.current = type; setAttachModal(false); }

  async function handleAttach(type) {
    if (type === 'photo') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1, allowsMultipleSelection: true, selectionLimit: 20 });
      if (!r.canceled && r.assets?.length) {
        const newPhotos = await Promise.all(r.assets.map(async a => {
          const key = `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await AsyncStorage.setItem(key, a.uri);
          return { uri: a.uri, key };
        }));
        setStagedPhotos(prev => [...prev, ...newPhotos].slice(0, 20));
      }
    } else if (type === 'video') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'videos', quality: 1, allowsMultipleSelection: true, selectionLimit: 10 });
      if (!r.canceled && r.assets?.length) setStagedVideos(prev => [...prev, ...r.assets.map(a => ({ uri: a.uri }))].slice(0, 10));
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
    } else if (type === 'gif') {
      setGifVisible(true);
    } else if (type === 'emoji') {
      setEmojiModal(true);
    }
  }

  function openMenu(msg) { setSelectedMsg(msg); setMsgMenuVis(true); }

  async function doDelete() {
    setMsgMenuVis(false);
    if (!selectedMsg) return;
    const next = messages.filter(m => m.id !== selectedMsg.id);
    setMessages(next);
    saveLocal(next);
    try { await supabase.from('group_messages').delete().eq('id', selectedMsg.id); } catch {}
  }

  // togglePin — writes is_pinned to `group_messages` so the pin syncs across
  // devices and to every member of the group. One pin per group: pinning a new
  // message clears any previously pinned one. The realtime UPDATE subscription
  // already propagates is_pinned flips to every other member.
  async function togglePin(msg) {
    if (!msg?.id) return;
    const newState = !msg.is_pinned;

    // Optimistic local update — flip the pin before the round-trip finishes.
    // The realtime UPDATE event will reconcile if anything races.
    setMessages(prev => prev.map(m => {
      if (newState && m.is_pinned && m.id !== msg.id) return { ...m, is_pinned: false };
      if (m.id === msg.id) return { ...m, is_pinned: newState };
      return m;
    }));

    try { impactMedium(); } catch {}

    try {
      if (newState) {
        await supabase
          .from('group_messages')
          .update({ is_pinned: false })
          .eq('group_id', groupId)
          .eq('is_pinned', true)
          .neq('id', msg.id);
      }
      await supabase
        .from('group_messages')
        .update({ is_pinned: newState })
        .eq('id', msg.id);
    } catch (err) {
      console.warn('togglePin (group) failed:', err);
    }
  }

  async function doEditGroupMessage() {
    if (!editingMsg || !editText.trim()) return;
    const newText = editText.trim();
    setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, text: newText, edited: true } : m));
    setEditingMsg(null); setEditText('');
    try {
      await supabase.from('group_messages').update({ text: newText, edited: true }).eq('id', editingMsg.id);
    } catch {}
    const raw = await AsyncStorage.getItem(SKEY).catch(() => null);
    if (raw) {
      const msgs = JSON.parse(raw).map(m => m.id === editingMsg.id ? { ...m, text: newText, edited: true } : m);
      AsyncStorage.setItem(SKEY, JSON.stringify(msgs)).catch(() => {});
    }
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

  const EMOJIS = [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
    '😘','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😏',
    '😒','🙄','😬','😌','😔','😪','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','😵',
    '🤯','🤠','🥳','😎','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨',
    '😰','😥','😢','😭','😱','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡',
    '👋','✋','👌','✌️','🤞','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','👏',
    '🙌','🫶','🙏','💪','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕',
    '🎉','🎊','🎁','🎀','🏆','🥇','🎯','🎲','🎮','🎵','🎶','🌸','🌺','🌻','🌹',
    '💐','🌿','☘️','🍀','🦋','🐶','🐱','🍕','🍔','🌮','🍜','🍣','🍦','🎂','🍰',
    '☕','🚀','✈️','🏠','🌍','🌈','⭐','🌙','☀️','⚡','🔥','💥','❄️','💎','💯','✨',
  ];

  // Pinned message is derived from messages.is_pinned — Supabase-synced, so
  // any member pinning/unpinning propagates via the UPDATE realtime subscription.
  const pinnedMsg   = messages.find(m => m.is_pinned);
  const pinnedMsgId = pinnedMsg?.id || null;

  return (
    <KeyboardAvoidingView style={[g.container, { backgroundColor: bg }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={[g.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Text style={[g.backTx, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[g.groupAvatar, { backgroundColor: (accent || '#6C63FF') + '22', overflow: 'hidden' }]}
          onPress={() => setInfoEditModal(true)}>
          {groupPhoto
            ? <Image source={{ uri: groupPhoto }} style={{ width: '100%', height: '100%' }} />
            : <Text style={{ fontSize: 18 }}>👥</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => setInfoEditModal(true)}>
          <Text style={[g.hName, { color: tx }]} numberOfLines={1}>{groupName || 'Group'}</Text>
          <Text style={[g.hSub, { color: sub }]}>
            🔒  {groupMembers.length > 0
              ? `${groupMembers.length} ${groupMembers.length === 1 ? 'member' : 'members'}`
              : 'Encrypted'}
          </Text>
        </TouchableOpacity>
        {/* Group call launchers — voice + video. Tapping either spins up
            a fresh conference with just me; the existing Add Participant
            modal on ActiveCallScreen invites everyone else by @handle
            or phone. Once member records carry userIds we can pre-ring
            the whole group in one shot via initialParticipants. */}
        <TouchableOpacity
          onPress={() => startGroupCall('voice')}
          accessibilityLabel="Start group voice call"
          style={{ paddingHorizontal: 6 }}>
          <Phone size={20} color={accent} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => startGroupCall('video')}
          accessibilityLabel="Start group video call"
          style={{ paddingHorizontal: 6 }}>
          <VideoIcon size={20} color={accent} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={leaveGroup} style={{ paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 18, color: sub }}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Pinned message banner — tap to scroll to it, long-press or ✕ to unpin */}
      {pinnedMsgId && (() => {
        const pinned = messages.find(m => m.id === pinnedMsgId);
        if (!pinned) return null;
        const preview = (() => {
          const raw = pinned.text || '';
          if (pinned.type === 'image' || raw.startsWith('IMG:') || raw.startsWith('LOCALIMG:')) return '📷 Photo';
          if (pinned.type === 'gallery' || raw.startsWith('GALLERY:')) return '🖼️ Gallery';
          if (pinned.type === 'video' || raw.startsWith('VID:') || raw.startsWith('LOCALVID:')) return '🎥 Video';
          return raw.substring(0, 60);
        })();
        return (
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: card, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }}
            onPress={() => {
              const idx = [...messages].reverse().findIndex(m => m.id === pinnedMsgId);
              if (idx >= 0) flatRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
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
        ref={flatRef}
        data={[...messages].reverse()}
        keyExtractor={(item, i) => String(item.id || i)}
        inverted
        contentContainerStyle={{ padding: 12, paddingTop: 8 }}
        renderItem={({ item }) => {

          return (
            <Bubble item={item} currentUserId={currentUserId} colors={colors}
              onFullScreen={uri => setFullImgUri(uri)}
              onPlay={uri => setVidUri(uri)}
              onLongPress={() => { longPressFeedback(); setPickerMsg(item); }}
              tappedId={tappedId}
              onTap={id => setTappedId(prev => prev === id ? null : id)}
              onReply={() => setReplyingTo({ id: item.id, text: item.text, sender: item.sender_handle })}
              reactions={reactions[item.id] || []}
              onReact={emoji => toggleGroupReaction(item.id, emoji)} />
          );
        }}
        ListEmptyComponent={
          <View style={g.emptyBox}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🔒</Text>
            <Text style={[g.emptyTx, { color: sub }]}>Messages are end-to-end encrypted.{'\n'}Say hello!</Text>
          </View>
        }
      />

      {/* Reply bar */}
      {replyingTo && (
        <View style={[g.replyBar, { backgroundColor: card, borderTopColor: border }]}>
          <View style={{ flex: 1 }}>
            <ReplyPreview
              content={replyingTo.text}
              label={replyingTo.sender ? `↩ ${replyingTo.sender}` : '↩ Reply'}
              labelColor={accent}
              textColor={sub}
              borderColor={accent}
            />
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={{ padding: 6 }}>
            <Text style={{ color: sub, fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Staged media area */}
      {hasStaged ? (
        <View style={{ borderTopWidth: 1, borderTopColor: border }}>
          {stagedPhotos.length > 0 && (
            <StagedPhotosPicker
              photos={stagedPhotos}
              onRemove={i => setStagedPhotos(prev => prev.filter((_, j) => j !== i))}
              onAddMore={() => handleAttach('photo')}
              accent={accent} inputBg={inputBg} border={border} sub={sub} tx={tx}
            />
          )}
          {stagedVideos.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, backgroundColor: inputBg, marginHorizontal: 12, borderRadius: 12, marginBottom: 4 }}>
              <Text style={{ fontSize: 28 }}>🎥</Text>
              <Text style={{ color: tx, fontWeight: '600', flex: 1 }}>{stagedVideos.length} video{stagedVideos.length > 1 ? 's' : ''} ready</Text>
              <TouchableOpacity onPress={() => setStagedVideos([])}><Text style={{ color: sub, fontSize: 16 }}>✕</Text></TouchableOpacity>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, paddingBottom: 24, gap: 8 }}>
            <TextInput style={{ flex: 1, backgroundColor: inputBg, color: tx, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 80 }}
              placeholder="Caption… (optional)" placeholderTextColor={sub} value={inputText} onChangeText={setInputText} multiline />
            <TouchableOpacity style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => stagedVideos.length > 0 ? sendStagedVideos() : sendStagedPhotos()} disabled={sending}>
              {sending ? <ActivityIndicator color="#000" size="small" /> : <Text style={{ color: '#000', fontWeight: '900', fontSize: 18 }}>➤</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {/* Typing indicator */}
          {typingUsers.length > 0 && (
            <View style={[g.typingBar, { backgroundColor: card, borderTopColor: border }]}>
              <View style={g.typingDots}>
                <View style={[g.dot, { backgroundColor: sub }]} />
                <View style={[g.dot, { backgroundColor: sub, opacity: 0.6 }]} />
                <View style={[g.dot, { backgroundColor: sub, opacity: 0.3 }]} />
              </View>
              <Text style={[g.typingTx, { color: sub }]}>
                {typingUsers.map(t => t.handle || 'Someone').join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
              </Text>
            </View>
          )}

          {/* @mentions autocomplete — floats above the composer while the
              user is mid-'@word' typing. Filtered by query substring. */}
          {mentionQuery !== null && (() => {
            const q = mentionQuery.toLowerCase();
            const candidates = groupMembers
              .map(m => (typeof m === 'string' ? { name: m, handle: m } : m))
              .filter(m => {
                const h = (m.handle || m.name || '').toLowerCase().replace(/^@/, '');
                return !q || h.startsWith(q) || h.includes(q);
              })
              .slice(0, 6);
            if (!candidates.length) return null;
            return (
              <View style={[g.mentionPop, { backgroundColor: card, borderColor: border }]}>
                {candidates.map((m, i) => {
                  const handle = (m.handle || m.name || 'member').replace(/^@/, '');
                  const display = m.name && m.name !== handle ? m.name : `@${handle}`;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        // Replace the in-progress '@query' with '@handle ' at the cursor.
                        const atIdx = inputText.lastIndexOf('@');
                        if (atIdx < 0) return;
                        const head = inputText.slice(0, atIdx);
                        const next = `${head}@${handle} `;
                        setInputText(next);
                        setMentionQuery(null);
                      }}
                      style={[g.mentionRow, { borderBottomColor: border }]}>
                      <View style={[g.mentionAvatar, { backgroundColor: accent }]}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{(display || '?')[1 - (display?.startsWith('@') ? 0 : 1)]?.toUpperCase() || (display || '?')[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[g.mentionName, { color: tx }]}>{display}</Text>
                        <Text style={[g.mentionSub, { color: sub }]}>@{handle}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })()}

          {isRecording ? (
            // Recording-mode input bar — same UX as the 1:1 chat: red
            // dot + live timer + Cancel + Send buttons. Replaces the
            // normal input row only while a recording is in progress.
            <View style={[g.inputBar, { backgroundColor: card, borderTopColor: border }]}>
              <TouchableOpacity
                style={[g.plusBtn, { backgroundColor: inputBg, borderColor: '#ff3b30' }]}
                onPress={cancelRecording}
                accessibilityLabel="Cancel recording">
                <Text style={{ color: '#ff3b30', fontSize: 18, fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
              <View style={[g.input, { backgroundColor: inputBg, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 }]}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff3b30' }} />
                <Text style={{ color: tx, fontWeight: '600' }}>
                  Recording…  {Math.floor(recordingElapsed / 60)}:{(recordingElapsed % 60).toString().padStart(2, '0')}
                </Text>
              </View>
              <TouchableOpacity
                style={[g.sendBtn, { backgroundColor: accent }]}
                onPress={stopRecording}
                accessibilityLabel="Send voice note"
                disabled={sending}>
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>}
              </TouchableOpacity>
            </View>
          ) : (
          <View style={[g.inputBar, { backgroundColor: card, borderTopColor: border }]}>
          <TouchableOpacity style={[g.plusBtn, { backgroundColor: inputBg, borderColor: accent }]} onPress={() => setAttachModal(true)}>
            <Text style={[g.plusTx, { color: accent }]}>+</Text>
          </TouchableOpacity>
          <TextInput
            style={[g.input, { color: tx, backgroundColor: inputBg }]}
            placeholder="Message..." placeholderTextColor={sub}
            value={inputText}
            onChangeText={v => {
              setInputText(v);
              broadcastTyping(groupId, currentUserId, currentHandle || 'member', v.length > 0);

              // Detect if we're mid-@-mention. Scan backwards from end until
              // we hit a space or the start. If we hit '@' first, we're in
              // a mention context and capture whatever follows it as the query.
              const tail = v.split(/\s/).pop() || '';
              if (tail.startsWith('@')) {
                setMentionQuery(tail.slice(1));
              } else if (mentionQuery !== null) {
                setMentionQuery(null);
              }
            }}
            onBlur={() => broadcastTyping(groupId, currentUserId, currentHandle || 'member', false)}
            multiline maxLength={2000} />
          {/* Empty input → mic button (records voice note); typing
              swaps it back to the normal Send button. */}
          {inputText.trim() ? (
            <TouchableOpacity
              style={[g.sendBtn, { backgroundColor: accent }]}
              onPress={() => sendText()} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#000', fontSize: 18 }}>➤</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[g.sendBtn, { backgroundColor: accent }]}
              onPress={startRecording}
              accessibilityLabel="Record voice note"
              disabled={sending}>
              <Mic size={20} color="#ffffff" strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
          )}
        </>
      )}

      {/* Viewer modals */}
      <FullScreenImg uri={fullImgUri} onClose={() => setFullImgUri(null)} />
      <VideoModal    uri={vidUri}     onClose={() => setVidUri(null)} />

      {/* Reaction picker — long-press entry point. The "⋯" (More) button
          forwards to the full action menu (Pin/Reply/Edit/Delete). */}
      <ReactionPicker
        visible={!!pickerMsg}
        onClose={() => setPickerMsg(null)}
        onReact={emoji => { if (pickerMsg) toggleGroupReaction(pickerMsg.id, emoji); }}
        onMore={() => { if (pickerMsg) { setSelectedMsg(pickerMsg); setMsgMenuVis(true); } }}
        myReaction={(reactions[pickerMsg?.id] || []).find(r => r.user_id === currentUserId)?.emoji || null}
        card={card}
        accent={accent}
      />

      {/* Long-press message menu */}
      <Modal visible={msgMenuVis} transparent animationType="fade" onRequestClose={() => setMsgMenuVis(false)}>
        <TouchableOpacity style={g.menuOverlay} activeOpacity={1} onPress={() => setMsgMenuVis(false)}>
          <View style={[g.msgMenu, { backgroundColor: card }]}>
            <Text style={[g.menuPreview, { color: sub }]} numberOfLines={2}>{selectedMsg?.text?.substring(0, 80)}</Text>
            <TouchableOpacity style={[g.menuOpt, { borderTopColor: border }]}
              onPress={() => { setReplyingTo({ id: selectedMsg.id, text: selectedMsg.text, sender: selectedMsg.sender_handle || 'them' }); setMsgMenuVis(false); }}>
              <Text style={g.menuOptIcon}>↩️</Text>
              <Text style={[g.menuOptLabel, { color: tx }]}>Reply</Text>
            </TouchableOpacity>
            {/* Pin / Unpin — persists via group_messages.is_pinned */}
            <TouchableOpacity style={[g.menuOpt, { borderTopColor: border }]}
              onPress={() => { togglePin(selectedMsg); setMsgMenuVis(false); }}>
              <Text style={g.menuOptIcon}>📌</Text>
              <Text style={[g.menuOptLabel, { color: tx }]}>{pinnedMsgId === selectedMsg?.id ? 'Unpin' : 'Pin'}</Text>
            </TouchableOpacity>
            {/* Report — only other users' messages */}
            {selectedMsg?.sender_id && selectedMsg?.sender_id !== currentUserId && (
              <TouchableOpacity style={[g.menuOpt, { borderTopColor: border }]}
                onPress={() => {
                  setReportTarget(selectedMsg);
                  setMsgMenuVis(false);
                  setTimeout(() => setReportVisible(true), 250);
                }}>
                <Text style={g.menuOptIcon}>🚩</Text>
                <Text style={[g.menuOptLabel, { color: '#FF9500' }]}>Report</Text>
              </TouchableOpacity>
            )}
            {selectedMsg?.sender_id === currentUserId && (Date.now() - new Date(selectedMsg?.created_at).getTime()) < 3600000 && (
              <TouchableOpacity style={[g.menuOpt, { borderTopColor: border }]}
                onPress={() => { setEditText(selectedMsg.text || ''); setEditingMsg(selectedMsg); setMsgMenuVis(false); }}>
                <Text style={g.menuOptIcon}>✏️</Text>
                <Text style={[g.menuOptLabel, { color: tx }]}>Edit</Text>
              </TouchableOpacity>
            )}
            {selectedMsg?.sender_id === currentUserId && (
              <TouchableOpacity style={[g.menuOpt, { borderTopColor: border }]} onPress={doDelete}>
                <Text style={g.menuOptIcon}>🗑️</Text>
                <Text style={[g.menuOptLabel, { color: '#FF3B30' }]}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[g.menuCancel, { borderTopColor: border }]} onPress={() => setMsgMenuVis(false)}>
              <Text style={[g.menuCancelTx, { color: sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report message modal — map group message.text → content */}
      <ReportMessageModal
        visible={reportVisible}
        onClose={() => { setReportVisible(false); setReportTarget(null); }}
        message={reportTarget ? { ...reportTarget, content: reportTarget.text } : null}
        roomId={groupId}
        reporterId={currentUserId}
        reporterHandle={currentHandle}
      />

      {/* Attach sheet */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={g.modalOverlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[g.sheet, { backgroundColor: card }]}>
            <View style={[g.sheetHandle, { backgroundColor: border }]} />
            <Text style={[g.sheetTitle, { color: tx }]}>Attachments</Text>
            <View style={g.attachGrid}>
              {ATTACHMENTS.map((a, i) => (
                <TouchableOpacity key={i} style={g.attachItem} onPress={() => pickAttach(a.type)}>
                  <View style={[g.attachIcon, { backgroundColor: inputBg }]}><Text style={{ fontSize: 26 }}>{a.icon}</Text></View>
                  <Text style={[g.attachLabel, { color: sub }]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Emoji picker modal */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={[g.modalOverlay]}>
          <View style={[g.sheet, { backgroundColor: card, maxHeight: '65%' }]}>
            <View style={[g.sheetHandle, { backgroundColor: border }]} />
            <View style={g.sheetHeaderRow}>
              <Text style={[g.sheetTitle, { color: tx }]}>Emoji</Text>
              <TouchableOpacity style={[g.sheetXBtn, { backgroundColor: accent }]} onPress={() => setEmojiModal(false)}>
                <Text style={g.sheetXTx}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingBottom: 20 }}>
                {EMOJIS.map((e, i) => (
                  <TouchableOpacity key={i}
                    style={{ width: 46, height: 46, borderRadius: 10, backgroundColor: inputBg, alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => { setEmojiModal(false); postMsg(e); }}>
                    <Text style={{ fontSize: 26 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Group info edit modal (tap header avatar or member count row) —
          reuses ContactEditModal to keep one form component. Notes field
          on the modal doubles as the group description. The modal's
          existing photo-upload path handles Supabase Storage for us. */}
      <ContactEditModal
        visible={infoEditModal}
        contact={{
          firstName: groupName,
          id:        groupId,
          phone:     '',
          email:     '',
          photo:     groupPhoto,
          notes:     groupDesc,
        }}
        onClose={() => setInfoEditModal(false)}
        onSave={async (updated) => {
          setInfoEditModal(false);
          // Optimistic local update so the header re-renders instantly.
          const newName  = updated.firstName || groupName;
          const newPhoto = updated.photo !== undefined ? updated.photo : groupPhoto;
          const newDesc  = updated.notes  !== undefined ? updated.notes  : groupDesc;
          setGroupName(newName);
          setGroupPhoto(newPhoto);
          setGroupDesc(newDesc);

          // Persist to AsyncStorage so the Chats list picks up the new name/photo.
          try {
            const raw = await AsyncStorage.getItem('vaultchat_groups');
            if (raw) {
              const gs = JSON.parse(raw).map(g =>
                g.id === groupId
                  ? { ...g, name: newName, photo: newPhoto, desc: newDesc }
                  : g,
              );
              await AsyncStorage.setItem('vaultchat_groups', JSON.stringify(gs));
            }
          } catch {}
        }}
        colors={{ bg, card, tx, sub, border, inputBg, accent }}
      />

      {/* GIF picker */}
      <GifPickerModal visible={gifVisible} onClose={() => setGifVisible(false)}
        onSelectGif={(gif) => {
          setGifVisible(false);
          if (gif.isEmoji) {
            postMsg(gif.url); // emoji — send as text
          } else {
            postMsg(gif.url, 'gif'); // real GIF
          }
        }} colors={colors} />

      {/* Edit message modal */}
      <Modal visible={!!editingMsg} transparent animationType="slide" onRequestClose={() => setEditingMsg(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border }}>
              <TouchableOpacity onPress={() => setEditingMsg(null)}>
                <Text style={{ color: sub, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ color: tx, fontWeight: '700', fontSize: 16 }}>Edit Message</Text>
              <TouchableOpacity onPress={doEditGroupMessage}>
                <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>Save</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={{ margin: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: inputBg, color: tx, fontSize: 16, minHeight: 80, maxHeight: 160 }}
              value={editText} onChangeText={setEditText}
              multiline autoFocus
              placeholder="Edit your message…" placeholderTextColor={sub}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Premium modal */}
      <PremiumModal visible={premiumVis} onClose={() => setPremiumVis(false)} onUpgraded={() => setPremium(true)} colors={colors} />
    </KeyboardAvoidingView>
  );
}

const g = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 56, paddingBottom: 12, borderBottomWidth: 1, gap: 10 },
  backTx:         { fontSize: 30, fontWeight: 'bold' },
  groupAvatar:    { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  hName:          { fontWeight: 'bold', fontSize: 15 },
  hSub:           { fontSize: 11 },
  msgWrapper:     { marginBottom: 6, maxWidth: '80%' },
  right:          { alignSelf: 'flex-end' },
  left:           { alignSelf: 'flex-start' },
  senderHandle:   { fontSize: 11, fontWeight: '700', marginBottom: 2, marginLeft: 4 },
  bubble:         { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mediaPad:       { paddingHorizontal: 4, paddingVertical: 4 },
  cap:            { fontSize: 13, paddingHorizontal: 6, paddingTop: 4 },
  msgTx:          { fontSize: 15, lineHeight: 21 },
  msgTime:        { fontSize: 10, marginTop: 4, textAlign: 'right' },
  replyQuote:     { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 6, paddingVertical: 2 },
  replyQSender:   { fontSize: 12, fontWeight: '700', marginBottom: 1 },
  replyQText:     { fontSize: 12, lineHeight: 16 },
  replyBar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 10 },
  replyLine:      { width: 3, height: 34, borderRadius: 2 },
  replyBarSender: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  replyBarText:   { fontSize: 13 },
  emptyBox:       { alignItems: 'center', paddingTop: 80 },
  emptyTx:        { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  inputBar:       { flexDirection: 'row', alignItems: 'center', padding: 10, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8, paddingBottom: 24, minHeight: 70 },

  // @mention autocomplete
  mentionPop:     {
    marginHorizontal: 12, marginBottom: 6,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    maxHeight: 260, overflow: 'hidden',
  },
  mentionRow:     {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mentionAvatar:  { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  mentionName:    { fontSize: 14, fontWeight: '600' },
  mentionSub:     { fontSize: 11 },
  plusBtn:        { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  plusTx:         { fontSize: 26, fontWeight: '300', lineHeight: 30 },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  sheetXBtn:      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sheetXTx:       { color: '#000', fontWeight: '900', fontSize: 14 },
  input:          { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 100 },
  sendBtn:        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  menuOverlay:    { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  msgMenu:        { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  menuPreview:    { fontSize: 13, textAlign: 'center', paddingHorizontal: 20, paddingVertical: 14, opacity: 0.7 },
  menuOpt:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 14 },
  menuOptIcon:    { fontSize: 18, width: 28, textAlign: 'center' },
  menuOptLabel:   { fontSize: 16 },
  menuCancel:     { paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  menuCancelTx:   { fontSize: 16, fontWeight: '600' },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet:          { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 44 },
  sheetHandle:    { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:     { fontWeight: 'bold', fontSize: 16, marginBottom: 16, textAlign: 'center' },
  attachGrid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', gap: 16 },
  typingBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  typingDots:     { flexDirection: 'row', gap: 3, alignItems: 'center' },
  dot:            { width: 6, height: 6, borderRadius: 3 },
  typingTx:       { fontSize: 12, fontStyle: 'italic' },
  attachItem:     { alignItems: 'center', width: 72 },
  attachIcon:     { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  attachLabel:    { fontSize: 11 },
});
