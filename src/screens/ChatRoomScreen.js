// VaultChat — ChatRoomScreen
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Image, Modal, Alert,
  ActivityIndicator, ScrollView, Linking, Dimensions,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { useTheme } from '../services/theme';
import { uploadMedia } from '../services/mediaUpload';
import { ResolvedPhotoStack, ResolvedVideoCarousel, VideoCarousel } from '../components/MediaBubbles';

const BACKEND  = 'https://vaultchat-production-3a96.up.railway.app';
const { width: SW } = Dimensions.get('window');

const GIFS = [
  {emoji:'😂',msg:'😂'},{emoji:'🎉',msg:'🎉'},{emoji:'👋',msg:'👋'},
  {emoji:'🔥',msg:'🔥'},{emoji:'💯',msg:'💯'},{emoji:'🤯',msg:'🤯'},
  {emoji:'👀',msg:'👀'},{emoji:'💪',msg:'💪'},{emoji:'😎',msg:'😎'},
  {emoji:'🥳',msg:'🥳'},{emoji:'❤️',msg:'❤️'},{emoji:'🏆',msg:'🏆'},
  {emoji:'😭',msg:'😭'},{emoji:'🤣',msg:'🤣'},{emoji:'💀',msg:'💀'},{emoji:'🫶',msg:'🫶'},
];
const EMOJIS = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','☺️','😚',
  '😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😏','😒','🙄','😬',
  '😌','😔','😪','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎',
  '😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱',
  '🥱','😤','😡','😠','🤬','😈','👿','💀','☠️','💩','🤡','👻','👽','👾','🤖',
  '👋','✋','👌','✌️','🤞','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','👏','🙌','🫶','🙏','💪',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘',
  '🎉','🎊','🎁','🎀','🏆','🥇','🎯','🎲','🎮','🎭','🎨','🎶','🎵',
  '🌸','🌺','🌻','🌹','🌷','💐','🌿','☘️','🍀','🦋','🐶','🐱',
  '🍕','🍔','🌮','🍜','🍣','🍦','🎂','🍰','🧁','☕','🥤',
  '🚀','✈️','🏠','🌍','🌈','⭐','🌙','☀️','⚡','🔥','💥','❄️','💎','💫','💯','✨',
];

// ── Full-screen image viewer ──────────────────────────────────
function FullScreenImage({ uri, visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fs.bg}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose}>
          <Text style={fs.closeTx}>✕  Close</Text>
        </TouchableOpacity>
        {uri ? <Image source={{uri}} style={fs.img} resizeMode="contain"/> : null}
      </View>
    </Modal>
  );
}

// ── In-app video player (single video) ───────────────────────
function VideoPlayerModal({ uri, visible, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!visible && ref.current) ref.current.pauseAsync().catch(()=>{});
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={fs.bg}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose}>
          <Text style={fs.closeTx}>✕  Close</Text>
        </TouchableOpacity>
        {uri ? (
          <Video ref={ref} source={{uri}} style={fs.video}
            resizeMode={ResizeMode.CONTAIN} shouldPlay useNativeControls/>
        ) : null}
      </View>
    </Modal>
  );
}

// ── Contact profile modal ─────────────────────────────────────
function ContactProfileModal({ visible, onClose, name, phone, photo, accent, bg, card, tx, sub, border, onSave, roomId }) {
  const [editName,  setEditName]  = useState(name  || '');
  const [editPhone, setEditPhone] = useState(phone || '');
  const [editAddr,  setEditAddr]  = useState('');
  const [editUrl,   setEditUrl]   = useState('');
  const [editBday,  setEditBday]  = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPhoto, setEditPhoto] = useState(photo || null);
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEditName(name||''); setEditPhone(phone||''); setEditPhoto(photo||null);
    AsyncStorage.getItem(`contact_extra_${phone}`).then(s => {
      if (s) { const d=JSON.parse(s); setEditAddr(d.address||''); setEditUrl(d.url||''); setEditBday(d.birthday||''); setEditNotes(d.notes||''); }
    }).catch(()=>{});
  }, [visible]);

  async function pickPhoto() {
    const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!p.granted) { Alert.alert('Permission needed'); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes:'images', quality:0.8, allowsEditing:true, aspect:[1,1] });
    if (!r.canceled && r.assets?.[0]) setEditPhoto(r.assets[0].uri);
  }

  async function save() {
    setSaving(true);
    await AsyncStorage.setItem(`contact_extra_${editPhone||phone}`, JSON.stringify({address:editAddr,url:editUrl,birthday:editBday,notes:editNotes}));
    const raw = await AsyncStorage.getItem('vaultchat_chats');
    if (raw) {
      const up = JSON.parse(raw).map(ch =>
        (ch.roomId===roomId||ch.phone===phone||ch.phone===editPhone)
          ? {...ch,name:editName||ch.name,phone:editPhone||ch.phone,photo:editPhoto||ch.photo} : ch
      );
      await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(up));
    }
    onSave && onSave({name:editName, phone:editPhone, photo:editPhoto});
    Alert.alert('Saved!','Contact updated.'); setSaving(false); onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={pm.overlay}>
        <View style={[pm.sheet,{backgroundColor:bg}]}>
          <View style={pm.hdr}>
            <TouchableOpacity onPress={onClose}><Text style={{color:sub,fontSize:15}}>Cancel</Text></TouchableOpacity>
            <Text style={[pm.title,{color:tx}]}>Contact</Text>
            <TouchableOpacity onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator size="small" color={accent}/> : <Text style={{color:accent,fontWeight:'bold',fontSize:15}}>Save</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:40}}>
            <TouchableOpacity onPress={pickPhoto} style={pm.avWrap}>
              <View style={[pm.av,{backgroundColor:accent}]}>
                {editPhoto ? <Image source={{uri:editPhoto}} style={pm.avImg}/> : <Text style={pm.avTx}>{(editName||'?')[0]?.toUpperCase()}</Text>}
              </View>
              <Text style={[pm.changePhoto,{color:accent}]}>{editPhoto?'Change Photo':'Add Photo'}</Text>
            </TouchableOpacity>
            {[
              {label:'Name',    val:editName,  set:setEditName,  kb:'default',   multi:false},
              {label:'Mobile',  val:editPhone, set:setEditPhone, kb:'phone-pad', multi:false},
              {label:'Address', val:editAddr,  set:setEditAddr,  kb:'default',   multi:true},
              {label:'URL',     val:editUrl,   set:setEditUrl,   kb:'url',       multi:false},
              {label:'Birthday',val:editBday,  set:setEditBday,  kb:'default',   multi:false},
              {label:'Notes',   val:editNotes, set:setEditNotes, kb:'default',   multi:true},
            ].map(({label,val,set,kb,multi}) => (
              <View key={label} style={[pm.field,{backgroundColor:card,borderColor:border}]}>
                <Text style={[pm.fLabel,{color:sub}]}>{label}</Text>
                <TextInput style={[pm.fInput,{color:tx}]} value={val} onChangeText={set}
                  keyboardType={kb} autoCapitalize={kb==='default'?'words':'none'}
                  multiline={multi} placeholder={label} placeholderTextColor={sub}/>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Single photo bubble ───────────────────────────────────────
function SinglePhoto({ msgKey, isLocal, onFullScreen, onReply }) {
  const [uri, setUri] = useState(null);
  useEffect(() => {
    if (isLocal) AsyncStorage.getItem(msgKey).then(v => { if (v) setUri(v); });
    else setUri(msgKey);
  }, [msgKey]);
  if (!uri) return (
    <View style={{width:220,height:180,borderRadius:14,backgroundColor:'#1a1a2e',alignItems:'center',justifyContent:'center'}}>
      <ActivityIndicator size="small" color="#555"/>
    </View>
  );
  return (
    <TouchableOpacity onPress={() => onFullScreen(uri)} onLongPress={onReply} delayLongPress={450} activeOpacity={0.88}>
      <Image source={{uri}} style={{width:220,height:180,borderRadius:14}} resizeMode="cover"/>
    </TouchableOpacity>
  );
}

// ── Video bubble (single) ─────────────────────────────────────
function VideoBubble({ uri, isMe, tx, onPlay, onReply }) {
  return (
    <TouchableOpacity style={c.vidBubble} onPress={() => onPlay(uri)} onLongPress={onReply} delayLongPress={450} activeOpacity={0.85}>
      <View style={c.vidCircle}><Text style={{fontSize:28,marginLeft:4,color:'#fff'}}>▶</Text></View>
      <Text style={[c.vidLabel,{color:isMe?'rgba(255,255,255,0.75)':tx}]}>Tap to play video</Text>
    </TouchableOpacity>
  );
}

// ── Message bubble ────────────────────────────────────────────
function Bubble({ item, myId, tx, sub, card, accent, onFullScreen, onPlay, onReply }) {
  const me    = item.sender_id === myId;
  const raw   = item.content || '';
  const nlIdx = raw.indexOf('\n');
  const main  = nlIdx >= 0 ? raw.substring(0, nlIdx) : raw;
  const cap   = nlIdx >= 0 ? raw.substring(nlIdx+1).trim() : '';

  const isGallery = main.startsWith('GALLERY:');
  const isVideos  = main.startsWith('VIDEOS:');
  const isSingle  = main.startsWith('LOCALIMG:') || main.startsWith('IMG:');
  const isVideo   = main.startsWith('LOCALVID:') || main.startsWith('VID:');
  const isFile    = main.startsWith('FILE:');
  const isReply   = raw.startsWith('REPLY:');
  const isMedia   = isGallery || isVideos || isSingle || isVideo;

  const timeStr = (() => {
    try { return new Date(item.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
    catch { return ''; }
  })();

  const bubbleBase = [c.bubble, me ? c.myBubble : [c.theirBubble,{backgroundColor:card}], isMedia && c.mediaPad];

  if (isReply) {
    const pipe   = raw.indexOf('|');
    const quoted = raw.substring(6, pipe);
    const actual = raw.substring(pipe+1);
    return (
      <View style={[c.bWrap, me ? c.myWrap : c.theirWrap]}>
        <TouchableOpacity style={bubbleBase} onLongPress={() => onReply(item)} delayLongPress={450} activeOpacity={0.88}>
          <View style={[c.replyQ,{borderLeftColor:me?'rgba(255,255,255,0.5)':accent}]}>
            <Text style={[c.replyLabel,{color:me?'rgba(255,255,255,0.7)':accent}]}>↩ Reply</Text>
            <Text style={[c.replyTx,{color:me?'rgba(255,255,255,0.55)':sub}]} numberOfLines={2}>{quoted}</Text>
          </View>
          <Text style={[c.msgTx,{color:me?'#fff':tx}]}>{actual}</Text>
        </TouchableOpacity>
        <Text style={[c.time, me?c.tRight:c.tLeft]}>{timeStr}</Text>
      </View>
    );
  }

  if (isGallery) {
    const keys = main.replace('GALLERY:','').split('|');
    return (
      <View style={[c.bWrap, me ? c.myWrap : c.theirWrap]}>
        <View style={[c.bubble, c.mediaPad, me?c.myBubble:[c.theirBubble,{backgroundColor:card}]]}>
          <ResolvedPhotoStack keys={keys} onLongPress={() => onReply(item)}/>
          {cap ? <Text style={[c.caption,{color:me?'rgba(255,255,255,0.9)':tx}]}>{cap}</Text> : null}
        </View>
        <Text style={[c.time, me?c.tRight:c.tLeft]}>{timeStr}</Text>
      </View>
    );
  }

  if (isVideos) {
    return (
      <View style={[c.bWrap, me ? c.myWrap : c.theirWrap]}>
        <View style={[c.bubble, c.mediaPad, me?c.myBubble:[c.theirBubble,{backgroundColor:card}]]}>
          <ResolvedVideoCarousel content={main} onLongPress={() => onReply(item)}/>
          {cap ? <Text style={[c.caption,{color:me?'rgba(255,255,255,0.9)':tx}]}>{cap}</Text> : null}
        </View>
        <Text style={[c.time, me?c.tRight:c.tLeft]}>{timeStr}</Text>
      </View>
    );
  }

  if (isSingle) {
    const key = main.replace('LOCALIMG:','').replace('IMG:','');
    return (
      <View style={[c.bWrap, me ? c.myWrap : c.theirWrap]}>
        <View style={[c.bubble, c.mediaPad, me?c.myBubble:[c.theirBubble,{backgroundColor:card}]]}>
          <SinglePhoto msgKey={key} isLocal={main.startsWith('LOCALIMG:')} onFullScreen={onFullScreen} onReply={() => onReply(item)}/>
          {cap ? <Text style={[c.caption,{color:me?'rgba(255,255,255,0.9)':tx}]}>{cap}</Text> : null}
        </View>
        <Text style={[c.time, me?c.tRight:c.tLeft]}>{timeStr}</Text>
      </View>
    );
  }

  if (isVideo) {
    const uri = main.replace('LOCALVID:','').replace('VID:','');
    return (
      <View style={[c.bWrap, me ? c.myWrap : c.theirWrap]}>
        <View style={[c.bubble, c.mediaPad, me?c.myBubble:[c.theirBubble,{backgroundColor:card}]]}>
          <VideoBubble uri={uri} isMe={me} tx={tx} onPlay={onPlay} onReply={() => onReply(item)}/>
          {cap ? <Text style={[c.caption,{color:me?'rgba(255,255,255,0.9)':tx}]}>{cap}</Text> : null}
        </View>
        <Text style={[c.time, me?c.tRight:c.tLeft]}>{timeStr}</Text>
      </View>
    );
  }

  if (isFile) {
    const [fname, url] = main.replace('FILE:','').split('|');
    return (
      <View style={[c.bWrap, me ? c.myWrap : c.theirWrap]}>
        <TouchableOpacity style={bubbleBase} onPress={() => url && Linking.openURL(url)} onLongPress={() => onReply(item)} delayLongPress={450}>
          <View style={{flexDirection:'row',alignItems:'center',gap:10}}>
            <Text style={{fontSize:26}}>📄</Text>
            <View>
              <Text style={[c.msgTx,{color:me?'#fff':tx}]}>{fname}</Text>
              <Text style={{fontSize:11,color:me?'rgba(255,255,255,0.6)':sub}}>Tap to open</Text>
            </View>
          </View>
        </TouchableOpacity>
        <Text style={[c.time, me?c.tRight:c.tLeft]}>{timeStr}</Text>
      </View>
    );
  }

  // Plain text
  return (
    <View style={[c.bWrap, me ? c.myWrap : c.theirWrap]}>
      <TouchableOpacity style={bubbleBase} onLongPress={() => onReply(item)} delayLongPress={450} activeOpacity={0.88}>
        <Text style={[c.msgTx,{color:me?'#fff':tx}]}>{raw}</Text>
      </TouchableOpacity>
      <Text style={[c.time, me?c.tRight:c.tLeft]}>{timeStr}</Text>
    </View>
  );
}

// ── Compose area — staged media preview ───────────────────────
// All props passed explicitly — no references to parent-scope state setters
function ComposeArea({ stagedPhotos, stagedVideos, text, setText,
                       onSendPhotos, onSendVideos, onRemovePhoto, onAddMore,
                       onClearVideos, sending, sub, tx, inputBg, border, accent }) {
  return (
    <View style={comp.wrap}>

      {/* Photo thumbnails */}
      {stagedPhotos.length > 0 && (
        <View style={comp.previewArea}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{gap:6,padding:10}}>
            {stagedPhotos.map((p,i) => (
              <View key={i} style={{position:'relative'}}>
                <Image source={{uri:p.uri}} style={comp.thumb} resizeMode="cover"/>
                <TouchableOpacity
                  style={comp.removeBadge}
                  onPress={() => onRemovePhoto(i)}>
                  <Text style={{color:'#fff',fontSize:12,fontWeight:'900',lineHeight:16}}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {stagedPhotos.length < 20 && (
              <TouchableOpacity
                style={[comp.addMore,{backgroundColor:inputBg,borderColor:border}]}
                onPress={onAddMore}>
                <Text style={{fontSize:26,color:sub}}>+</Text>
                <Text style={{fontSize:10,color:sub}}>Add</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
          <View style={[comp.countBadge,{backgroundColor:accent}]}>
            <Text style={{color:'#000',fontSize:11,fontWeight:'800'}}>
              {stagedPhotos.length} photo{stagedPhotos.length>1?'s':''}
            </Text>
          </View>
        </View>
      )}

      {/* Video preview */}
      {stagedVideos.length > 0 && (
        <View style={[comp.videoRow,{backgroundColor:inputBg}]}>
          <Text style={{fontSize:32}}>🎥</Text>
          <View style={{flex:1}}>
            <Text style={{color:tx,fontWeight:'600',fontSize:14}}>
              {stagedVideos.length} video{stagedVideos.length>1?'s':''} ready
            </Text>
            <Text style={{color:sub,fontSize:12}}>Will upload on send</Text>
          </View>
          <TouchableOpacity onPress={onClearVideos} style={{padding:8}}>
            <Text style={{color:sub,fontSize:18}}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Caption input + send */}
      <View style={[comp.inputRow,{borderTopColor:border}]}>
        <TextInput
          style={[comp.input,{backgroundColor:inputBg,color:tx}]}
          placeholder="Add a caption… (optional)"
          placeholderTextColor={sub}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity
          style={[comp.sendBtn,{backgroundColor:accent}]}
          onPress={() => { if (stagedVideos.length > 0) onSendVideos(); else onSendPhotos(); }}
          disabled={sending}>
          {sending
            ? <ActivityIndicator color="#000" size="small"/>
            : <Text style={{color:'#000',fontWeight:'900',fontSize:20}}>➤</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────
export default function ChatRoomScreen({ route, navigation }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const { roomId, recipientPhone, recipientName, recipientPhoto } = route.params || {};

  const [messages,     setMessages]     = useState([]);
  const [text,         setText]         = useState('');
  const [sending,      setSending]      = useState(false);
  const [myId,         setMyId]         = useState('');
  const [replyTo,      setReplyTo]      = useState(null);
  const [stagedPhotos, setStagedPhotos] = useState([]);  // up to 20
  const [stagedVideos, setStagedVideos] = useState([]);  // up to 10
  const [fullImgUri,   setFullImgUri]   = useState(null);
  const [vidUri,       setVidUri]       = useState(null);
  const [attachModal,  setAttachModal]  = useState(false);
  const [gifModal,     setGifModal]     = useState(false);
  const [emojiModal,   setEmojiModal]   = useState(false);
  const [emojiTab,     setEmojiTab]     = useState('emoji');
  const [profileModal, setProfileModal] = useState(false);
  const [contactName,  setContactName]  = useState(recipientName  || '');
  const [contactPhone, setContactPhone] = useState(recipientPhone || '');
  const [contactPhoto, setContactPhoto] = useState(recipientPhoto || null);

  const listRef       = useRef(null);
  const pendingAttach = useRef(null);

  useEffect(() => {
    loadUser(); fetchMessages();
    const poll = setInterval(fetchMessages, 3000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (!attachModal && pendingAttach.current) {
      const t = pendingAttach.current; pendingAttach.current = null;
      setTimeout(() => handleAttachType(t), 700);
    }
  }, [attachModal]);

  async function loadUser() {
    const s = await AsyncStorage.getItem('vaultchat_user');
    if (s) { const p = JSON.parse(s); setMyId(p.id || p.phone || ''); }
  }

  async function fetchMessages() {
    try {
      const res  = await fetch(`${BACKEND}/messages/${roomId}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
    } catch {}
  }

  async function postMessage(content) {
    await fetch(`${BACKEND}/messages`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({room_id:roomId, sender_id:myId||'anon', content}),
    });
    fetchMessages();
    const raw = await AsyncStorage.getItem('vaultchat_chats');
    if (raw) {
      const up = JSON.parse(raw).map(ch =>
        ch.roomId===roomId ? {...ch,lastMessage:content.substring(0,40),
          time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} : ch
      );
      await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(up));
    }
  }

  async function sendText(override) {
    let content = override || text.trim();
    if (!content) return;
    if (replyTo && !override) {
      content = `REPLY:${(replyTo.content||'').substring(0,60)}|${content}`;
      setReplyTo(null);
    }
    setText(''); setSending(true);
    try { await postMessage(content); } catch {}
    setSending(false);
  }

  async function sendStagedPhotos() {
    if (!stagedPhotos.length) return;
    setSending(true);
    try {
      const caption = text.trim();
      let content = stagedPhotos.length === 1
        ? `LOCALIMG:${stagedPhotos[0].key}`
        : `GALLERY:${stagedPhotos.map(p=>p.key).join('|')}`;
      if (caption) content += '\n' + caption;
      await postMessage(content);
    } catch {}
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
        await postMessage(content);
      } else {
        const urls = await Promise.all(stagedVideos.map(v => uploadMedia(v.uri,'video')));
        const valid = urls.filter(Boolean);
        let content = valid.length ? `VIDEOS:${valid.join('|')}` : '🎥 Videos';
        if (caption) content += '\n' + caption;
        await postMessage(content);
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
        mediaTypes:'images', quality:0.85, allowsMultipleSelection:true, selectionLimit:20,
      });
      if (!r.canceled && r.assets?.length) {
        const newPhotos = await Promise.all(r.assets.map(async asset => {
          const key = `img_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
          await AsyncStorage.setItem(key, asset.uri);
          return { uri:asset.uri, key };
        }));
        setStagedPhotos(prev => [...prev,...newPhotos].slice(0,20));
      }
    } else if (type === 'video') {
      const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:'videos', quality:1, allowsMultipleSelection:true, selectionLimit:10,
      });
      if (!r.canceled && r.assets?.length) {
        setStagedVideos(prev => [...prev,...r.assets.map(a=>({uri:a.uri}))].slice(0,10));
      }
    } else if (type === 'camera') {
      const p = await ImagePicker.requestCameraPermissionsAsync();
      if (!p.granted) { Alert.alert('Permission needed'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality:0.85 });
      if (!r.canceled && r.assets?.[0]) {
        const key = `img_${Date.now()}`;
        await AsyncStorage.setItem(key, r.assets[0].uri);
        setStagedPhotos(prev => [...prev,{uri:r.assets[0].uri,key}].slice(0,20));
      }
    } else if (type === 'file') {
      const r = await DocumentPicker.getDocumentAsync({type:'*/*',copyToCacheDirectory:true});
      if (!r.canceled && r.assets?.[0]) {
        const f = r.assets[0]; setSending(true);
        const url = await uploadMedia(f.uri,'file');
        await sendText(url ? `FILE:${f.name}|${url}` : `📁 ${f.name}`);
        setSending(false);
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
    {icon:'🖼️',label:'Gallery', type:'photo'},
    {icon:'🎥',label:'Video',   type:'video'},
    {icon:'📸',label:'Camera',  type:'camera'},
    {icon:'📁',label:'File',    type:'file'},
    {icon:'🎭',label:'GIF',     type:'gif'},
    {icon:'😀',label:'Emoji',   type:'emoji'},
    {icon:'📍',label:'Location',type:'location'},
  ];

  return (
    <KeyboardAvoidingView style={[c.container,{backgroundColor:bg}]} behavior={Platform.OS==='ios'?'padding':'height'}>
      {/* Header */}
      <View style={[c.header,{backgroundColor:card,borderBottomColor:border}]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={c.backBtn}>
          <Text style={[c.backTx,{color:accent}]}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setProfileModal(true)} style={[c.hAvatar,{backgroundColor:accent}]}>
          {contactPhoto ? <Image source={{uri:contactPhoto}} style={c.hAvatarImg}/> : <Text style={c.hAvatarTx}>{(contactName||'?')[0]?.toUpperCase()}</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={{flex:1}} onPress={() => setProfileModal(true)}>
          <Text style={[c.hName,{color:tx}]}>{contactName||contactPhone||'Chat'}</Text>
          <Text style={[c.hSub,{color:sub}]}>🛡️ Metadata protected · E2EE</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ActiveCall',{recipientName:contactName,recipientPhone:contactPhone,callType:'video'})} style={c.callBtn}><Text style={{fontSize:20}}>📹</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ActiveCall',{recipientName:contactName,recipientPhone:contactPhone,callType:'voice'})} style={c.callBtn}><Text style={{fontSize:20}}>📞</Text></TouchableOpacity>

      </View>

      {/* Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item,i) => item.id||String(i)}
        onContentSizeChange={() => listRef.current?.scrollToEnd({animated:true})}
        contentContainerStyle={{padding:12,paddingBottom:8}}
        renderItem={({item}) => (
          <Bubble
            item={item} myId={myId} tx={tx} sub={sub} card={card} accent={accent}
            onFullScreen={uri => setFullImgUri(uri)}
            onPlay={uri => setVidUri(uri)}
            onReply={msg => setReplyTo(msg)}
          />
        )}
        ListEmptyComponent={
          <View style={c.emptyBox}>
            <Text style={{fontSize:40,marginBottom:10}}>🔒</Text>
            <Text style={[c.emptyTx,{color:sub}]}>No messages yet. Say hello!</Text>
          </View>
        }
      />

      {/* Reply bar */}
      {replyTo && (
        <View style={[c.replyBar,{backgroundColor:card,borderTopColor:border,borderLeftColor:accent}]}>
          <View style={{flex:1}}>
            <Text style={[c.replyBarLabel,{color:accent}]}>↩ Replying</Text>
            <Text style={[c.replyBarTx,{color:sub}]} numberOfLines={1}>{replyTo.content?.substring(0,60)}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{padding:8}}>
            <Text style={{color:sub,fontSize:20}}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Staged media compose area */}
      {hasStaged ? (
        <ComposeArea
          stagedPhotos={stagedPhotos}
          stagedVideos={stagedVideos}
          text={text}
          setText={setText}
          onSendPhotos={sendStagedPhotos}
          onSendVideos={sendStagedVideos}
          onRemovePhoto={i => setStagedPhotos(prev => prev.filter((_,j)=>j!==i))}
          onAddMore={() => handleAttachType('photo')}
          onClearVideos={() => setStagedVideos([])}
          sending={sending}
          sub={sub} tx={tx} inputBg={inputBg} border={border} accent={accent}
        />
      ) : (
        <View style={[c.inputBar,{backgroundColor:card,borderTopColor:border}]}>
          <TouchableOpacity style={[c.plusBtn,{backgroundColor:inputBg,borderColor:accent}]} onPress={() => setAttachModal(true)}>
            <Text style={[c.plusTx,{color:accent}]}>+</Text>
          </TouchableOpacity>
          <TextInput
            style={[c.input,{backgroundColor:inputBg,color:tx}]}
            placeholder={replyTo?'Type your reply...':'Message...'}
            placeholderTextColor={sub}
            value={text}
            onChangeText={setText}
            multiline
          />
          <TouchableOpacity
            style={[c.sendBtn,{backgroundColor:text.trim()?accent:inputBg}]}
            onPress={() => sendText()} disabled={!text.trim()||sending}>
            {sending ? <ActivityIndicator color="#fff" size="small"/> : <Text style={{color:text.trim()?'#000':sub,fontSize:18}}>➤</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Modals */}
      <ContactProfileModal
        visible={profileModal} onClose={() => setProfileModal(false)}
        name={contactName} phone={contactPhone} photo={contactPhoto}
        accent={accent} bg={bg} card={card} tx={tx} sub={sub} border={border}
        roomId={roomId}
        onSave={u => { if(u.name) setContactName(u.name); if(u.phone) setContactPhone(u.phone); if(u.photo) setContactPhoto(u.photo); }}
      />
      <FullScreenImage  uri={fullImgUri} visible={!!fullImgUri} onClose={() => setFullImgUri(null)}/>
      <VideoPlayerModal uri={vidUri}     visible={!!vidUri}     onClose={() => setVidUri(null)}/>

      {/* Attach sheet */}
      <Modal visible={attachModal} transparent animationType="slide">
        <TouchableOpacity style={c.overlay} activeOpacity={1} onPress={() => setAttachModal(false)}>
          <View style={[c.sheet,{backgroundColor:card}]}>
            <View style={[c.handle,{backgroundColor:border}]}/>
            <Text style={[c.sheetTitle,{color:tx}]}>Attachments</Text>
            <View style={c.attachGrid}>
              {ATTACHMENTS.map((a,i) => (
                <TouchableOpacity key={i} style={c.attachItem} onPress={() => pickAttach(a.type)}>
                  <View style={[c.attachIcon,{backgroundColor:inputBg}]}><Text style={{fontSize:28}}>{a.icon}</Text></View>
                  <Text style={[c.attachLabel,{color:sub}]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* GIF modal */}
      <Modal visible={gifModal} transparent animationType="slide">
        <View style={c.overlay}>
          <View style={[c.sheet,{backgroundColor:card,maxHeight:'60%'}]}>
            <View style={[c.handle,{backgroundColor:border}]}/>
            <Text style={[c.sheetTitle,{color:tx}]}>Send a GIF</Text>
            <View style={c.gifGrid}>
              {GIFS.map((g,i) => (
                <TouchableOpacity key={i} style={[c.gifItem,{backgroundColor:inputBg}]}
                  onPress={() => { setGifModal(false); sendText(g.msg); }}>
                  <Text style={{fontSize:32}}>{g.emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[c.cancelBtn,{backgroundColor:inputBg}]} onPress={() => setGifModal(false)}>
              <Text style={{color:sub,fontWeight:'bold'}}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Emoji modal */}
      <Modal visible={emojiModal} transparent animationType="slide">
        <View style={c.overlay}>
          <View style={[c.sheet,{backgroundColor:card,maxHeight:'65%'}]}>
            <View style={[c.handle,{backgroundColor:border}]}/>
            <View style={[c.tabRow,{backgroundColor:inputBg}]}>
              {['emoji','gif'].map(t => (
                <TouchableOpacity key={t} style={[c.tab,emojiTab===t&&{backgroundColor:card}]} onPress={() => setEmojiTab(t)}>
                  <Text style={{fontSize:13,fontWeight:'bold',color:tx}}>{t==='emoji'?'😀 Emoji':'🎭 GIF'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {emojiTab==='gif' ? (
                <View style={c.gifGrid}>
                  {GIFS.map((g,i) => (
                    <TouchableOpacity key={i} style={[c.gifItem,{backgroundColor:inputBg}]} onPress={() => { setEmojiModal(false); sendText(g.msg); }}>
                      <Text style={{fontSize:32}}>{g.emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={c.emojiGrid}>
                  {EMOJIS.map((e,i) => (
                    <TouchableOpacity key={i} style={[c.emojiItem,{backgroundColor:inputBg}]} onPress={() => { setEmojiModal(false); sendText(e); }}>
                      <Text style={{fontSize:26}}>{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
            <TouchableOpacity style={[c.cancelBtn,{backgroundColor:inputBg}]} onPress={() => setEmojiModal(false)}>
              <Text style={{color:sub,fontWeight:'bold'}}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── ComposeArea styles ────────────────────────────────────────
const comp = StyleSheet.create({
  wrap:        { backgroundColor:'transparent' },
  previewArea: { position:'relative' },
  thumb:       { width:90, height:90, borderRadius:12 },
  removeBadge: { position:'absolute', top:-7, right:-7, width:22, height:22, borderRadius:11, backgroundColor:'#ff3b30', alignItems:'center', justifyContent:'center', zIndex:10 },
  addMore:     { width:90, height:90, borderRadius:12, borderWidth:1.5, borderStyle:'dashed', alignItems:'center', justifyContent:'center', gap:3 },
  countBadge:  { position:'absolute', top:14, left:14, paddingHorizontal:8, paddingVertical:3, borderRadius:10 },
  videoRow:    { flexDirection:'row', alignItems:'center', gap:12, padding:12, marginHorizontal:12, borderRadius:14, marginBottom:4 },
  inputRow:    { flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingVertical:10, paddingBottom:24, gap:10, borderTopWidth:1 },
  input:       { flex:1, paddingHorizontal:14, paddingVertical:10, borderRadius:22, fontSize:15, maxHeight:80, minHeight:42 },
  sendBtn:     { width:44, height:44, borderRadius:22, alignItems:'center', justifyContent:'center' },
});

const fs = StyleSheet.create({
  bg:       { flex:1, backgroundColor:'rgba(0,0,0,0.97)', alignItems:'center', justifyContent:'center' },
  closeBtn: { position:'absolute', top:56, right:20, backgroundColor:'rgba(255,255,255,0.15)', borderRadius:20, paddingHorizontal:14, paddingVertical:8 },
  closeTx:  { color:'#fff', fontWeight:'bold' },
  img:      { width:'100%', height:'80%' },
  video:    { width:'100%', height:300 },
});

const pm = StyleSheet.create({
  overlay:     { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  sheet:       { borderTopLeftRadius:28, borderTopRightRadius:28, padding:20, paddingTop:16, maxHeight:'92%' },
  hdr:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  title:       { fontSize:16, fontWeight:'bold' },
  avWrap:      { alignItems:'center', marginBottom:20 },
  av:          { width:80, height:80, borderRadius:40, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  avImg:       { width:80, height:80, borderRadius:40 },
  avTx:        { color:'#fff', fontSize:30, fontWeight:'bold' },
  changePhoto: { fontSize:12, fontWeight:'600', marginTop:8 },
  field:       { borderRadius:12, borderWidth:1, paddingHorizontal:14, paddingVertical:10, marginBottom:10 },
  fLabel:      { fontSize:11, fontWeight:'700', marginBottom:4 },
  fInput:      { fontSize:15, minHeight:24 },
});

const c = StyleSheet.create({
  container:  { flex:1 },
  header:     { flexDirection:'row', alignItems:'center', paddingHorizontal:12, paddingTop:56, paddingBottom:12, borderBottomWidth:1, gap:8 },
  backBtn:    { padding:4 },
  backTx:     { fontSize:30, fontWeight:'bold' },
  hAvatar:    { width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  hAvatarImg: { width:40, height:40, borderRadius:20 },
  hAvatarTx:  { color:'#fff', fontWeight:'bold', fontSize:16 },
  hName:      { fontWeight:'bold', fontSize:15 },
  hSub:       { fontSize:11 },
  callBtn:    { padding:8 },
  bWrap:      { marginBottom:2, maxWidth:'80%' },
  myWrap:     { alignSelf:'flex-end', alignItems:'flex-end' },
  theirWrap:  { alignSelf:'flex-start', alignItems:'flex-start' },
  bubble:     { borderRadius:20, paddingHorizontal:14, paddingVertical:10 },
  myBubble:   { backgroundColor:'#0b7ef5', borderBottomRightRadius:4 },
  theirBubble:{ borderBottomLeftRadius:4 },
  mediaPad:   { paddingHorizontal:4, paddingVertical:4 },
  msgTx:      { fontSize:16, lineHeight:22 },
  caption:    { fontSize:14, lineHeight:20, paddingHorizontal:6, paddingTop:6, paddingBottom:2 },
  time:       { fontSize:11, color:'#8e8e93', marginTop:3, marginBottom:8 },
  tRight:     { alignSelf:'flex-end', marginRight:4 },
  tLeft:      { alignSelf:'flex-start', marginLeft:4 },
  replyQ:     { borderLeftWidth:3, paddingLeft:8, paddingVertical:4, borderRadius:4, marginBottom:6 },
  replyLabel: { fontSize:11, fontWeight:'bold', marginBottom:2 },
  replyTx:    { fontSize:12 },
  replyBar:   { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:10, borderTopWidth:1, borderLeftWidth:4 },
  replyBarLabel:{ fontSize:11, fontWeight:'bold', marginBottom:2 },
  replyBarTx: { fontSize:12 },
  vidBubble:  { width:220, height:130, borderRadius:14, backgroundColor:'#111', alignItems:'center', justifyContent:'center', gap:8 },
  vidCircle:  { width:52, height:52, borderRadius:26, backgroundColor:'rgba(255,255,255,0.15)', alignItems:'center', justifyContent:'center' },
  vidLabel:   { fontSize:12, fontWeight:'600' },
  emptyBox:   { alignItems:'center', paddingTop:80 },
  emptyTx:    { fontSize:15, textAlign:'center' },
  inputBar:   { flexDirection:'row', alignItems:'center', padding:10, paddingHorizontal:12, borderTopWidth:1, gap:8, paddingBottom:24, minHeight:70 },
  plusBtn:    { width:44, height:44, borderRadius:22, borderWidth:2, alignItems:'center', justifyContent:'center' },
  plusTx:     { fontSize:26, fontWeight:'300', lineHeight:30 },
  input:      { flex:1, paddingHorizontal:14, paddingVertical:10, borderRadius:22, fontSize:15, maxHeight:100, minHeight:42 },
  sendBtn:    { width:44, height:44, borderRadius:22, alignItems:'center', justifyContent:'center' },
  overlay:    { flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' },
  sheet:      { borderTopLeftRadius:28, borderTopRightRadius:28, padding:20, paddingBottom:44 },
  handle:     { width:40, height:4, borderRadius:2, alignSelf:'center', marginBottom:16 },
  sheetTitle: { fontWeight:'bold', fontSize:16, marginBottom:16, textAlign:'center' },
  attachGrid: { flexDirection:'row', flexWrap:'wrap', justifyContent:'space-around', gap:16 },
  attachItem: { alignItems:'center', width:72 },
  attachIcon: { width:58, height:58, borderRadius:18, alignItems:'center', justifyContent:'center', marginBottom:6 },
  attachLabel:{ fontSize:11 },
  gifGrid:    { flexDirection:'row', flexWrap:'wrap', gap:10, paddingBottom:12 },
  gifItem:    { width:'22%', borderRadius:14, padding:10, alignItems:'center' },
  emojiGrid:  { flexDirection:'row', flexWrap:'wrap', gap:4, paddingBottom:12 },
  emojiItem:  { width:46, height:46, borderRadius:10, alignItems:'center', justifyContent:'center' },
  cancelBtn:  { borderRadius:12, padding:12, alignItems:'center', marginTop:8 },
  tabRow:     { flexDirection:'row', marginBottom:12, borderRadius:12, padding:4 },
  tab:        { flex:1, padding:8, borderRadius:10, alignItems:'center' },
});
