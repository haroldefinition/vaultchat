import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert,
  Modal, KeyboardAvoidingView, Platform, FlatList, ScrollView,
  Animated, Dimensions,
} from 'react-native';
import { useTheme } from '../services/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabase';
import { getMyHandle } from '../services/vaultHandle';
import GifPickerModal from '../components/GifPickerModal';

const { width: SW } = Dimensions.get('window');
const BACKEND = 'https://vaultchat-production-3a96.up.railway.app';

// ── iMessage-style emoji categories ──────────────────────────
const EMOJI_CATEGORIES = [
  {
    label: '😀', title: 'Smileys',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','🫠','😉','😊','😇',
      '🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑',
      '🤗','🤭','🫢','🫣','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏',
      '😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮',
      '🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤',
      '😟','🙁','☹️','😮','😯','😲','😳','🥺','🫹','😦','😧','😨','😰','😥',
      '😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬',
      '😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖',
    ],
  },
  {
    label: '👋', title: 'People & Hands',
    emojis: [
      '👋','🤚','🖐','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞',
      '🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊',
      '👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅','🤳','💪',
      '🦾','🦵','🦶','👂','🦻','👃','👀','👁','👅','🫦','👄','🦷','👶','🧒',
      '👦','👧','🧑','👱','👨','🧔','👩','🧓','👴','👵','🙍','🙎','🙅','🙆',
      '💁','🙋','🧏','🙇','🤦','🤷','👮','🕵','💂','🥷','👷','🫅','🤴','👸',
      '👰','🤵','🫄','🤰','🤱','👼','🎅','🤶','🦸','🦹','🧙','🧝','🧛','🧟',
      '🧞','🧜','🧚','🧑‍🤝‍🧑','👫','👬','👭','💏','💑','👪',
    ],
  },
  {
    label: '🐶', title: 'Animals',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷',
      '🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺',
      '🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪲','🦟','🦗','🕷',
      '🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟',
      '🐬','🐳','🐋','🦈','🦭','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛',
      '🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙',
      '🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜',
      '🦢','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔','🐾',
    ],
  },
  {
    label: '🍕', title: 'Food & Drink',
    emojis: [
      '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍑','🥭','🍍',
      '🥥','🥝','🍅','🫒','🥑','🍆','🥔','🥕','🌽','🌶','🫑','🥒','🥬','🥦',
      '🧄','🧅','🥜','🫘','🌰','🍞','🥐','🥖','🫓','🥨','🥯','🥞','🧇','🧀',
      '🍖','🍗','🥩','🥓','🌭','🍔','🍟','🍕','🫔','🌮','🌯','🥙','🧆','🥚',
      '🍳','🥘','🍲','🫕','🥣','🥗','🍿','🧂','🥫','🍱','🍘','🍙','🍚','🍛',
      '🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🦪','🍦',
      '🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼',
      '🥛','☕','🫖','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸',
    ],
  },
  {
    label: '⚽', title: 'Activities',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🪀','🏓','🏸','🏒',
      '🏑','🥍','🏏','🪃','🥅','⛳','🪁','🛝','🎣','🤿','🎽','🎿','🛷','🥌',
      '🎯','🪃','🎱','🎮','🎰','🧩','🪄','♟','🎭','🎨','🖼','🎪','🤹','🎬',
      '🎤','🎧','🎼','🎵','🎶','🎷','🪗','🎸','🎹','🥁','🪘','🎺','🎻','🪕',
      '🏆','🥇','🥈','🥉','🏅','🎖','🎗','🏵','🎫','🎟','🎪','🤸','🏋','🤼',
      '🤺','🤾','⛷','🏂','🏄','🚣','🧗','🚵','🚴','🏇','🤽','🧘','🧗','🏊',
    ],
  },
  {
    label: '🌍', title: 'Travel & Places',
    emojis: [
      '🌍','🌎','🌏','🌐','🗺','🧭','🌋','🏔','⛰','🗻','🏕','🏖','🏜','🏝',
      '🏞','🏟','🏛','🏗','🧱','🏘','🏚','🏠','🏡','🏢','🏣','🏤','🏥','🏦',
      '🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🗽','⛪','🕌','🛕',
      '🕍','⛩','🕋','⛲','⛺','🌁','🌃','🏙','🌄','🌅','🌆','🌇','🌉','🌌',
      '🎠','🎡','🎢','✈️','🛩','🚀','🛸','🚁','🛶','⛵','🚤','🛥','🛳','⛴',
      '🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚞','🚝','🚋','🚌','🚍',
      '🚎','🏎','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🦯','🦽','🦼','🛴',
      '🛵','🏍','🚲','🛺','🚨','🚥','🚦','🛑','⛽','🚧','⚓','🛟','🚏','🗺',
    ],
  },
  {
    label: '💡', title: 'Objects',
    emojis: [
      '⌚','📱','📲','💻','⌨️','🖥','🖨','🖱','🖲','💾','💿','📀','📷','📸',
      '📹','🎥','📽','🎞','📞','☎️','📟','📠','📺','📻','🧭','⏱','⏲','⏰',
      '🕰','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯','🪔','🧯','💰','💴','💵',
      '💶','💷','💸','💳','🪙','💹','📈','📉','📊','📦','📫','📪','📬','📭',
      '📮','🗳','✏️','✒️','🖋','🖊','📝','💼','📁','📂','🗂','📅','📆','🗒',
      '🗓','📇','📋','📌','📍','✂️','🗃','🗄','🗑','🔒','🔓','🔏','🔐','🔑',
      '🗝','🔨','🪓','⛏','⚒','🛠','🗡','⚔️','🛡','🪚','🔧','🪛','🔩','⚙️',
      '🗜','⚗️','🧪','🧫','🧬','🔬','🔭','📡','💊','🩺','🩹','🩻','🩼','🏥',
    ],
  },
  {
    label: '❤️', title: 'Symbols',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕',
      '💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','✡️','🔯','🕎',
      '☯️','☦️','🛐','⛎','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓',
      '🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚',
      '💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘',
      '❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞',
      '📵','🔕','🔇','💤','🔃','🔄','🔙','🔚','🔛','🔜','🔝','⚜️','🔱','📛',
      '🔰','♻️','✅','🈯','💹','❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💲','➕',
      '➖','➗','✖️','🟰','♾️','‼️','⁉️','❓','❔','❕','❗','〰️','💱','⚠️',
      '⬆️','↗️','➡️','↘️','⬇️','↙️','⬅️','↖️','↕️','↔️','↩️','↪️','⤴️','⤵️',
      '🔀','🔁','🔂','🔼','🔽','⏩','⏪','⏫','⏬','⏭','⏮','⏯','🔊','📣',
      '🔔','🔕','🎵','🎶','💬','💭','🗯','🔇','📢','🔉','🔈','🔔','🃏','🀄',
    ],
  },
];

function generateRoomId(phone1, phone2) {
  const sorted = [phone1.replace(/\D/g,''), phone2.replace(/\D/g,'')].sort();
  const combined = sorted[0] + sorted[1];
  let h1 = 0, h2 = 0;
  for (let i = 0; i < combined.length; i++) {
    h1 = Math.imul(31, h1) + combined.charCodeAt(i) | 0;
    h2 = Math.imul(37, h2) + combined.charCodeAt(i) | 0;
  }
  const a = Math.abs(h1).toString(16).padStart(8, '0');
  const b = Math.abs(h2).toString(16).padStart(8, '0');
  const c = Math.abs(h1 ^ h2).toString(16).padStart(8, '0');
  return `${a.slice(0,8)}-${b.slice(0,4)}-4${b.slice(1,4)}-a${c.slice(0,3)}-${a}${b.slice(0,4)}`;
}

// ── Emoji picker panel ────────────────────────────────────────
function EmojiPicker({ onPick, accent, card, sub, inputBg, border }) {
  const [catIdx, setCatIdx] = useState(0);
  const cat = EMOJI_CATEGORIES[catIdx];
  return (
    <View style={[ep.wrap, { backgroundColor: card, borderTopColor: border }]}>
      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={[ep.tabs, { borderBottomColor: border }]}
        contentContainerStyle={{ gap: 2, paddingHorizontal: 8 }}>
        {EMOJI_CATEGORIES.map((c, i) => (
          <TouchableOpacity key={i}
            style={[ep.tab, i === catIdx && { backgroundColor: accent + '33', borderRadius: 10 }]}
            onPress={() => setCatIdx(i)}>
            <Text style={{ fontSize: 22 }}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* Category title */}
      <Text style={[ep.catTitle, { color: sub }]}>{cat.title.toUpperCase()}</Text>
      {/* Emojis grid */}
      <FlatList
        data={cat.emojis}
        keyExtractor={(item, i) => `${catIdx}-${i}`}
        numColumns={8}
        style={{ maxHeight: 220 }}
        contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 8 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={ep.emojiBtn} onPress={() => onPick(item)}>
            <Text style={{ fontSize: 28 }}>{item}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
const ep = StyleSheet.create({
  wrap:     { borderTopWidth: StyleSheet.hairlineWidth },
  tabs:     { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 6 },
  tab:      { paddingHorizontal: 6, paddingVertical: 4 },
  catTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
  emojiBtn: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
});

// ── Main Screen ───────────────────────────────────────────────
export default function NewMessageScreen({ navigation, route }) {
  const { bg, card, tx, sub, border, inputBg, accent } = useTheme();
  const [toInput,       setToInput]       = useState('');
  const [msg,           setMsg]           = useState('');
  const [user,          setUser]          = useState(null);
  const [selectedName,  setSelectedName]  = useState('');
  const [myHandle,      setMyHandle]      = useState('');
  const [showEmoji,     setShowEmoji]     = useState(false);
  const [gifVisible,    setGifVisible]    = useState(false);
  const msgRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUser(session.user);
    }).catch(() => {});
    getMyHandle().then(h => { if (h) setMyHandle(h); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (route.params?.selectedContact) {
      const c = route.params.selectedContact;
      setToInput(c.handle || c.phone || '');
      setSelectedName(c.name || c.firstName || '');
    }
  }, [route.params?.selectedContact]);

  function pickEmoji(e) {
    setMsg(prev => prev + e);
  }

  function pickGif(gif) {
    setGifVisible(false);
    if (gif.isEmoji) {
      setMsg(prev => prev + gif.url);
    } else {
      setMsg(prev => prev + (prev ? ' ' : '') + gif.url);
    }
  }

  async function startChat() {
    const cleaned = toInput.trim();
    if (!cleaned) {
      Alert.alert('To:', 'Enter a phone number or @handle.');
      return;
    }
    // Handle @handle lookup vs phone number
    const phone  = cleaned.startsWith('@') ? cleaned : cleaned.replace(/\D/g, '');
    const myPhone = user?.phone?.replace('+1','') || '0000000000';
    const roomId  = generateRoomId(myPhone, phone);

    // Save chat to local store
    try {
      const raw  = await AsyncStorage.getItem('vaultchat_chats');
      const list = raw ? JSON.parse(raw) : [];
      if (!list.find(c => c.phone === phone)) {
        list.unshift({
          roomId, phone,
          name:        selectedName || phone,
          handle:      cleaned.startsWith('@') ? cleaned : '',
          photo:       null,
          lastMessage: msg || 'New chat',
          time:        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          pinned:      false,
          hideAlerts:  false,
        });
        await AsyncStorage.setItem('vaultchat_chats', JSON.stringify(list));
      }
    } catch {}

    // Send initial message if typed
    if (msg.trim()) {
      try {
        const senderId = user?.id || 'local';
        await fetch(`${BACKEND}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: roomId, sender_id: senderId, content: msg.trim() }),
        });
      } catch {}
    }

    navigation.replace('ChatRoom', {
      roomId,
      recipientPhone: phone,
      recipientName:  selectedName || '',
      recipientPhoto: null,
    });
  }

  return (
    <KeyboardAvoidingView
      style={[s.container, { backgroundColor: bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>

      {/* Header */}
      <View style={[s.header, { backgroundColor: card, borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: accent, fontSize: 16 }}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>New Message</Text>
        <TouchableOpacity onPress={startChat} disabled={toInput.trim().length < 3}>
          <Text style={{ color: toInput.trim().length >= 3 ? accent : sub, fontWeight: '700', fontSize: 16 }}>
            Start
          </Text>
        </TouchableOpacity>
      </View>

      {/* To: row */}
      <View style={[s.toRow, { backgroundColor: card, borderBottomColor: border }]}>
        <Text style={[s.toLabel, { color: accent }]}>To:</Text>
        <TextInput
          style={[s.toInput, { color: tx }]}
          placeholder="Phone number or @handle"
          placeholderTextColor={sub}
          value={toInput}
          onChangeText={v => { setToInput(v); setSelectedName(''); }}
          autoCapitalize="none"
          keyboardType="default"
          autoFocus
          returnKeyType="done"
        />
        {/* + button → ContactPicker */}
        <TouchableOpacity
          style={[s.toPickBtn, { backgroundColor: accent }]}
          onPress={() => navigation.navigate('ContactPicker')}>
          <Text style={{ color: '#000', fontSize: 20, fontWeight: '700', lineHeight: 24 }}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Selected contact badge */}
      {selectedName ? (
        <View style={[s.badge, { backgroundColor: accent + '22', borderColor: accent + '55' }]}>
          <Text style={{ color: accent, fontWeight: '700', fontSize: 13 }}>
            ✓ {selectedName}{toInput.startsWith('@') ? '  ' + toInput : ''}
          </Text>
          <TouchableOpacity onPress={() => { setToInput(''); setSelectedName(''); }}>
            <Text style={{ color: sub, fontSize: 16, marginLeft: 10 }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      {/* Emoji picker panel (slides up above input bar) */}
      {showEmoji && (
        <EmojiPicker
          onPick={pickEmoji}
          accent={accent} card={card} sub={sub} inputBg={inputBg} border={border}
        />
      )}

      {/* Input bar */}
      <View style={[s.inputBar, { backgroundColor: card, borderTopColor: border }]}>
        {/* GIF button */}
        <TouchableOpacity
          style={[s.toolBtn, { backgroundColor: inputBg, borderColor: border }]}
          onPress={() => { setShowEmoji(false); setGifVisible(true); }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: accent }}>GIF</Text>
        </TouchableOpacity>
        {/* Emoji button */}
        <TouchableOpacity
          style={[s.toolBtn, { backgroundColor: showEmoji ? accent + '33' : inputBg, borderColor: showEmoji ? accent : border }]}
          onPress={() => setShowEmoji(v => !v)}>
          <Text style={{ fontSize: 20 }}>😊</Text>
        </TouchableOpacity>

        <TextInput
          ref={msgRef}
          style={[s.msgInput, { backgroundColor: inputBg, color: tx }]}
          placeholder="Message…"
          placeholderTextColor={sub}
          value={msg}
          onChangeText={setMsg}
          onFocus={() => setShowEmoji(false)}
          multiline
          maxLength={2000}
        />

        {/* Send */}
        <TouchableOpacity
          style={[s.sendBtn, { backgroundColor: toInput.trim().length >= 3 ? accent : inputBg }]}
          onPress={startChat}
          disabled={toInput.trim().length < 3}>
          <Text style={{ color: toInput.trim().length >= 3 ? '#000' : sub, fontSize: 18, fontWeight: '700' }}>
            ➤
          </Text>
        </TouchableOpacity>
      </View>

      {/* GIF picker */}
      <GifPickerModal
        visible={gifVisible}
        onClose={() => setGifVisible(false)}
        onSelectGif={pickGif}
        colors={{ card, tx, sub, inputBg, border, accent }}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  toRow:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, paddingLeft: 16, minHeight: 56 },
  toLabel:     { fontWeight: '700', fontSize: 16, width: 28 },
  toInput:     { flex: 1, fontSize: 16, paddingVertical: 14, paddingHorizontal: 8 },
  toPickBtn:   { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  badge:       { flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1 },
  inputBar:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  toolBtn:     { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  msgInput:    { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, fontSize: 15, maxHeight: 100, minHeight: 42 },
  sendBtn:     { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
