import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, KeyboardAvoidingView, Platform, Modal, Alert, StatusBar, SafeAreaView, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../services/theme';

let supabase = null;
try { supabase = require('../services/supabase').supabase; } catch (e) {}

export default function GroupChatScreen({ route, navigation }) {
  const groupId   = route?.params?.groupId   ?? null;
  const groupName = route?.params?.groupName ?? 'Group';
  const theme = useTheme();
  const { bg, card, tx, sub, border, inputBg, accent } = theme;
  const [messages, setMessages]         = useState([]);
  const [inputText, setInputText]       = useState('');
  const [replyingTo, setReplyingTo]     = useState(null);
  const [selectedMsg, setSelectedMsg]   = useState(null);
  const [menuVisible, setMenuVisible]   = useState(false);
  const [loading, setLoading]           = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentHandle, setCurrentHandle] = useState('You');
  const [sending, setSending]           = useState(false);
  const flatListRef = useRef(null);
  const pollRef     = useRef(null);
  const inputRef    = useRef(null);

  useEffect(() => {
    loadCurrentUser();
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [groupId]);

  const loadCurrentUser = async () => {
    try {
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        const user = data?.user;
        if (user) {
          setCurrentUserId(user.id);
          const { data: profile } = await supabase.from('profiles').select('handle, display_name').eq('id', user.id).single();
          if (profile) setCurrentHandle(profile.handle || profile.display_name || 'You');
          return;
        }
      }
      const raw  = await AsyncStorage.getItem('vaultchat_user');
      const name = await AsyncStorage.getItem('vaultchat_display_name');
      if (raw)  { const u = JSON.parse(raw); setCurrentUserId(u.id || u.phone || 'local'); }
      if (name) setCurrentHandle(name);
    } catch (e) { console.warn('loadCurrentUser error:', e); }
  };

  const fetchMessages = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    try {
      if (supabase) {
        const { data, error } = await supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true });
        if (!error && data) { setMessages(data); setLoading(false); return; }
      }
      const raw = await AsyncStorage.getItem(`vaultchat_group_msgs_${groupId}`);
      if (raw) setMessages(JSON.parse(raw));
    } catch (e) { console.warn('fetchMessages error:', e); }
    finally { setLoading(false); }
  }, [groupId]);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    setInputText('');
    const tempId  = `temp_${Date.now()}`;
    const nowISO  = new Date().toISOString();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMsg  = { id: tempId, group_id: groupId, sender_id: currentUserId, sender_handle: currentHandle, content: text, type: 'text', reply_to_id: replyingTo?.id ?? null, reply_preview: replyingTo ? (replyingTo.content || '').slice(0, 80) : null, created_at: nowISO, display_time: nowTime, is_temp: true };
    setMessages(prev => [...prev, newMsg]);
    setReplyingTo(null);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      if (supabase) {
        const { data, error } = await supabase.from('group_messages').insert({ group_id: groupId, sender_id: currentUserId || null, sender_handle: currentHandle, content: text, type: 'text', reply_to_id: replyingTo?.id ?? null, reply_preview: replyingTo ? (replyingTo.content || '').slice(0, 80) : null }).select().single();
        if (!error && data) { setMessages(prev => prev.map(m => m.id === tempId ? { ...data, display_time: nowTime } : m)); }
      } else {
        const localMsg = { ...newMsg, id: `local_${Date.now()}`, is_temp: false };
        const raw = await AsyncStorage.getItem(`vaultchat_group_msgs_${groupId}`);
        const existing = raw ? JSON.parse(raw) : [];
        await AsyncStorage.setItem(`vaultchat_group_msgs_${groupId}`, JSON.stringify([...existing, localMsg]));
        setMessages(prev => prev.map(m => m.id === tempId ? localMsg : m));
      }
      // Update group preview
      const raw = await AsyncStorage.getItem('vaultchat_groups');
      if (raw) {
        const groups  = JSON.parse(raw);
        const time    = nowTime;
        const updated = groups.map(g => g.id === groupId ? { ...g, lastMessage: `${currentHandle}: ${text}`, time } : g);
        await AsyncStorage.setItem('vaultchat_groups', JSON.stringify(updated));
      }
    } catch (e) {
      console.warn('sendMessage error:', e);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setInputText(text);
    } finally { setSending(false); }
  };

  const openMsgMenu  = (msg) => { setSelectedMsg(msg); setMenuVisible(true); };
  const handleReply  = () => { setReplyingTo(selectedMsg); setMenuVisible(false); inputRef.current?.focus(); };
  const handleDelete = () => {
    Alert.alert('Delete Message', 'Delete this message?', [
      { text: 'Cancel', style: 'cancel', onPress: () => setMenuVisible(false) },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setMenuVisible(false);
        setMessages(prev => prev.filter(m => m.id !== selectedMsg.id));
        if (supabase) await supabase.from('group_messages').delete().eq('id', selectedMsg.id);
      }},
    ]);
  };

  const isMe = (msg) => msg?.sender_id === currentUserId || msg?.sender_handle === currentHandle;
  const getTime = (msg) => { if (msg?.display_time) return msg.display_time; try { return new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

  const renderMessage = ({ item }) => {
    const me = isMe(item);
    return (
      <TouchableOpacity activeOpacity={0.85} onLongPress={() => openMsgMenu(item)} delayLongPress={400}>
        <View style={[s.msgRow, me ? s.msgRowMe : s.msgRowThem]}>
          {!me && <Text style={[s.senderHandle, { color: accent }]}>{item.sender_handle || 'Member'}</Text>}
          {item.reply_preview && (
            <View style={[s.replyBar, { backgroundColor: accent + '22', borderLeftColor: accent }]}>
              <Text style={[s.replyBarText, { color: sub }]} numberOfLines={1}>↩ {item.reply_preview}</Text>
            </View>
          )}
          <View style={[s.bubble, me ? [s.bubbleMe, { backgroundColor: accent }] : [s.bubbleThem, { backgroundColor: card, borderColor: border }]]}>
            <Text style={[s.msgText, { color: me ? '#fff' : tx }]}>{item.content}</Text>
            <View style={s.msgMeta}>
              {item.is_temp && <Text style={[s.tick, { color: me ? 'rgba(255,255,255,0.6)' : sub }]}>⏳ </Text>}
              <Text style={[s.msgTime, { color: me ? 'rgba(255,255,255,0.7)' : sub }]}>{getTime(item)}</Text>
              {me && !item.is_temp && <Text style={[s.tick, { color: 'rgba(255,255,255,0.8)' }]}> ✓✓</Text>}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={bg} />
      <View style={[s.header, { backgroundColor: bg, borderBottomColor: border }]}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[s.backArrow, { color: accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <View style={[s.headerAvatar, { backgroundColor: accent + '22' }]}><Text style={s.headerAvatarEmoji}>👥</Text></View>
          <View>
            <Text style={[s.headerName, { color: tx }]} numberOfLines={1}>{groupName}</Text>
            <Text style={[s.headerEnc, { color: accent }]}>🔒 Encrypted</Text>
          </View>
        </View>
        <TouchableOpacity style={s.headerInfo} onPress={() => Alert.alert(groupName, 'End-to-end encrypted group.')}>
          <Text style={[s.headerInfoIcon, { color: sub }]}>⋯</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {loading ? (
          <View style={s.loader}><ActivityIndicator color={accent} size="large" /></View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => String(item.id)}
            renderItem={renderMessage}
            ListEmptyComponent={<View style={s.emptyChat}><Text style={s.emptyChatEmoji}>🔒</Text><Text style={[s.emptyChatText, { color: sub }]}>Messages are end-to-end encrypted.{'\n'}Say hello!</Text></View>}
            contentContainerStyle={[s.msgList, messages.length === 0 && { flex: 1 }]}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            style={{ flex: 1, backgroundColor: bg }}
          />
        )}

        {replyingTo && (
          <View style={[s.replyBanner, { backgroundColor: card, borderTopColor: border, borderLeftColor: accent }]}>
            <View style={s.replyBannerContent}>
              <Text style={[s.replyBannerLabel, { color: accent }]}>Replying to {replyingTo.sender_handle || 'message'}</Text>
              <Text style={[s.replyBannerText, { color: sub }]} numberOfLines={1}>{replyingTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyingTo(null)} style={s.replyBannerClose}>
              <Text style={[{ color: sub, fontSize: 18 }]}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[s.inputBar, { backgroundColor: bg, borderTopColor: border }]}>
          <TextInput ref={inputRef} style={[s.input, { backgroundColor: inputBg, color: tx, borderColor: border }]} placeholder="Encrypted message…" placeholderTextColor={sub} value={inputText} onChangeText={setInputText} multiline maxLength={2000} />
          <TouchableOpacity style={[s.sendBtn, { backgroundColor: inputText.trim() ? accent : border }]} onPress={sendMessage} disabled={!inputText.trim() || sending} activeOpacity={0.8}>
            <Text style={s.sendBtnText}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={s.menuOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={[s.menuSheet, { backgroundColor: card }]}>
            <Text style={[s.menuPreview, { color: sub, borderBottomColor: border }]} numberOfLines={2}>{selectedMsg?.content}</Text>
            <TouchableOpacity style={[s.menuRow, { borderBottomColor: border }]} onPress={handleReply}>
              <Text style={s.menuIcon}>↩</Text><Text style={[s.menuLabel, { color: tx }]}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.menuRow, { borderBottomColor: border }]} onPress={() => { setMenuVisible(false); Alert.alert('Copied', 'Message copied.'); }}>
              <Text style={s.menuIcon}>📋</Text><Text style={[s.menuLabel, { color: tx }]}>Copy</Text>
            </TouchableOpacity>
            {isMe(selectedMsg) && (
              <TouchableOpacity style={[s.menuRow, { borderBottomColor: 'transparent' }]} onPress={handleDelete}>
                <Text style={s.menuIcon}>🗑️</Text><Text style={[s.menuLabel, { color: '#ff4444' }]}>Delete</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[s.menuCancel, { borderTopColor: border }]} onPress={() => setMenuVisible(false)}>
              <Text style={[s.menuCancelText, { color: sub }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 4, marginRight: 4 },
  backArrow: { fontSize: 32, lineHeight: 36, fontWeight: '300' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  headerAvatarEmoji: { fontSize: 18 },
  headerName: { fontSize: 16, fontWeight: '700' },
  headerEnc: { fontSize: 11 },
  headerInfo: { padding: 8 },
  headerInfoIcon: { fontSize: 20, fontWeight: '700' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  msgList: { paddingHorizontal: 12, paddingVertical: 8 },
  msgRow: { marginBottom: 6 },
  msgRowMe: { alignItems: 'flex-end' },
  msgRowThem: { alignItems: 'flex-start' },
  senderHandle: { fontSize: 12, fontWeight: '600', marginBottom: 2, marginLeft: 12 },
  replyBar: { marginBottom: 4, paddingHorizontal: 10, paddingVertical: 4, borderLeftWidth: 3, borderRadius: 6, maxWidth: '85%' },
  replyBarText: { fontSize: 12 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18 },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleThem: { borderBottomLeftRadius: 4, borderWidth: 1 },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  msgTime: { fontSize: 11 },
  tick: { fontSize: 11 },
  emptyChat: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyChatEmoji: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  replyBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3 },
  replyBannerContent: { flex: 1 },
  replyBannerLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  replyBannerText: { fontSize: 13 },
  replyBannerClose: { padding: 6 },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  sendBtnText: { color: '#fff', fontSize: 16 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  menuSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 },
  menuPreview: { fontSize: 13, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  menuIcon: { fontSize: 18, width: 26, textAlign: 'center' },
  menuLabel: { fontSize: 16 },
  menuCancel: { paddingVertical: 16, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  menuCancelText: { fontSize: 16, fontWeight: '600' },
});
