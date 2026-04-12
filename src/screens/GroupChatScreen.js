import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Image, Modal, Alert, Linking } from 'react-native';
import { useTheme } from '../services/theme';
import { supabase } from '../services/supabase';
import { isPremiumUser, injectAds } from '../services/adsService';
import GifPickerModal from '../components/GifPickerModal';
import PremiumModal from '../components/PremiumModal';

export default function GroupChatScreen({ route, navigation }) {
  const { groupId, groupName } = route.params || {};
  const colors = useTheme();
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [msgMenuVisible, setMsgMenuVisible] = useState(false);
  const [gifPickerVisible, setGifPickerVisible] = useState(false);
  const [premium, setPremium] = useState(false);
  const [premiumModalVisible, setPremiumModalVisible] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentHandle, setCurrentHandle] = useState('');
  const flatListRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    (async () => {
      const prem = await isPremiumUser();
      setPremium(prem);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const { data } = await supabase.from('profiles').select('handle').eq('id', user.id).single();
        if (data) setCurrentHandle(data.handle);
      }
    })();
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 3000);
    return () => clearInterval(pollRef.current);
  }, [groupId]);

  const fetchMessages = async () => {
    try {
      const { data, error } = await supabase.from('group_messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true });
      if (!error && data) setMessages(data.filter(m => m.id));
    } catch (e) { console.warn('fetchGroupMessages error:', e); }
  };

  const sendMessage = async (overrideText, type = 'text') => {
    const text = overrideText ?? inputText.trim();
    if (!text && type === 'text') return;
    const payload = {
      group_id: groupId,
      sender_id: currentUserId,
      sender_handle: currentHandle,
      text,
      type,
      reply_to_id: replyingTo?.id || null,
      reply_to_text: replyingTo?.text || null,
      reply_to_sender: replyingTo?.sender || null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, { ...payload, id: `temp_${Date.now()}` }]);
    setInputText('');
    setReplyingTo(null);
    flatListRef.current?.scrollToEnd({ animated: true });
    try { await supabase.from('group_messages').insert(payload); } catch (e) { console.warn('group send error:', e); }
  };

  const openMsgMenu = (msg) => { setSelectedMsg(msg); setMsgMenuVisible(true); };

  const doReply = () => {
    setReplyingTo({ id: selectedMsg.id, text: selectedMsg.text, sender: selectedMsg.sender_handle || 'them' });
    setMsgMenuVisible(false);
  };

  const doDeleteMsg = async () => {
    setMsgMenuVisible(false);
    if (selectedMsg.sender_id !== currentUserId) return;
    Alert.alert('Delete Message', 'Delete this message?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setMessages((prev) => prev.filter((m) => m.id !== selectedMsg.id));
        await supabase.from('group_messages').delete().eq('id', selectedMsg.id);
      }},
    ]);
  };

  const renderMessage = useCallback(({ item }) => {
    if (item.isAd) {
      return (
        <TouchableOpacity style={styles.adBubble} onPress={() => { if (item.isUpgradeAd) setPremiumModalVisible(true); else if (item.url) Linking.openURL(item.url); }}>
          <Text style={styles.adSponsor}>{item.sponsor} · Sponsored</Text>
          <Text style={styles.adText}>{item.text}</Text>
        </TouchableOpacity>
      );
    }
    const isMe = item.sender_id === currentUserId;
    return (
      <TouchableOpacity activeOpacity={0.85} onLongPress={() => openMsgMenu(item)} style={[styles.msgWrapper, isMe ? styles.right : styles.left]}>
        {!isMe && <Text style={[styles.senderHandle, { color: '#6C63FF' }]}>@{item.sender_handle || 'unknown'}</Text>}
        <View style={[styles.bubble, { backgroundColor: isMe ? '#6C63FF' : (colors.card || '#1C1C1E') }]}>
          {item.reply_to_id && (
            <View style={[styles.replyQuote, { borderLeftColor: isMe ? 'rgba(255,255,255,0.6)' : '#6C63FF' }]}>
              <Text style={[styles.replyQuoteSender, { color: isMe ? 'rgba(255,255,255,0.8)' : '#6C63FF' }]}>{item.reply_to_sender}</Text>
              <Text style={[styles.replyQuoteText, { color: isMe ? 'rgba(255,255,255,0.7)' : (colors.sub || '#8E8E93') }]} numberOfLines={2}>{item.reply_to_text}</Text>
            </View>
          )}
          {item.type === 'gif'
            ? <Image source={{ uri: item.text }} style={styles.gifBubble} resizeMode="contain" />
            : <Text style={[styles.msgText, { color: isMe ? '#fff' : (colors.tx || '#fff') }]}>{item.text}</Text>
          }
          <Text style={[styles.msgTime, { color: isMe ? 'rgba(255,255,255,0.6)' : (colors.sub || '#8E8E93') }]}>{formatMsgTime(item.created_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [currentUserId, colors]);

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.bg || '#000' }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList ref={flatListRef} data={injectAds(messages, premium, 8)} keyExtractor={(item) => String(item.id)} renderItem={renderMessage} contentContainerStyle={styles.msgList} onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })} />
      {replyingTo && (
        <View style={[styles.replyBar, { backgroundColor: colors.card || '#1C1C1E', borderTopColor: colors.border || '#2C2C2E' }]}>
          <View style={styles.replyBarContent}>
            <View style={styles.replyBarLine} />
            <View>
              <Text style={[styles.replyBarSender, { color: '#6C63FF' }]}>{replyingTo.sender}</Text>
              <Text style={[styles.replyBarText, { color: colors.sub || '#8E8E93' }]} numberOfLines={1}>{replyingTo.text}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.replyBarClose}>
            <Text style={{ color: colors.sub || '#8E8E93', fontSize: 18 }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={[styles.inputArea, { backgroundColor: colors.card || '#1C1C1E', borderTopColor: colors.border || '#2C2C2E' }]}>
        <TouchableOpacity style={styles.gifBtn} onPress={() => setGifPickerVisible(true)}>
          <Text style={styles.gifBtnText}>GIF</Text>
        </TouchableOpacity>
        <TextInput style={[styles.input, { color: colors.tx || '#fff', backgroundColor: colors.inputBg || '#2C2C2E' }]} placeholder="Message..." placeholderTextColor={colors.sub || '#8E8E93'} value={inputText} onChangeText={setInputText} multiline maxLength={2000} />
        <TouchableOpacity style={[styles.sendBtn, { backgroundColor: inputText.trim() ? '#6C63FF' : (colors.sub || '#8E8E93') }]} onPress={() => sendMessage()} disabled={!inputText.trim()}>
          <Text style={styles.sendIcon}>↑</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={msgMenuVisible} transparent animationType="fade" onRequestClose={() => setMsgMenuVisible(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setMsgMenuVisible(false)}>
          <View style={[styles.msgMenu, { backgroundColor: colors.card || '#1C1C1E' }]}>
            <Text style={[styles.menuPreview, { color: colors.sub || '#8E8E93' }]} numberOfLines={2}>{selectedMsg?.text}</Text>
            {[
              { icon: '↩️', label: 'Reply', fn: doReply },
              ...(selectedMsg?.sender_id === currentUserId ? [{ icon: '🗑️', label: 'Delete', fn: doDeleteMsg, danger: true }] : []),
            ].map(({ icon, label, fn, danger }) => (
              <TouchableOpacity key={label} style={[styles.menuOpt, { borderTopColor: colors.border || '#2C2C2E' }]} onPress={fn}>
                <Text style={styles.menuOptIcon}>{icon}</Text>
                <Text style={[styles.menuOptLabel, { color: danger ? '#FF3B30' : (colors.tx || '#fff') }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
      <GifPickerModal visible={gifPickerVisible} onClose={() => setGifPickerVisible(false)} onSelectGif={(gif) => sendMessage(gif.url, 'gif')} colors={colors} />
      <PremiumModal visible={premiumModalVisible} onClose={() => setPremiumModalVisible(false)} onUpgraded={() => setPremium(true)} colors={colors} />
    </KeyboardAvoidingView>
  );
}

function formatMsgTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  msgList: { padding: 12, paddingBottom: 8 },
  msgWrapper: { marginBottom: 8, maxWidth: '78%' },
  right: { alignSelf: 'flex-end' },
  left: { alignSelf: 'flex-start' },
  senderHandle: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 4 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  replyQuote: { borderLeftWidth: 3, paddingLeft: 8, marginBottom: 8, paddingVertical: 2 },
  replyQuoteSender: { fontSize: 12, fontWeight: '700', marginBottom: 1 },
  replyQuoteText: { fontSize: 12, lineHeight: 16 },
  gifBubble: { width: 200, height: 150, borderRadius: 12 },
  msgText: { fontSize: 15, lineHeight: 21 },
  msgTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  adBubble: { alignSelf: 'center', marginVertical: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#1C1C2E', borderRadius: 14, borderLeftWidth: 3, borderLeftColor: '#6C63FF', maxWidth: '85%' },
  adSponsor: { color: '#6C63FF', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  adText: { color: '#ccc', fontSize: 13 },
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  replyBarContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  replyBarLine: { width: 3, height: 36, backgroundColor: '#6C63FF', borderRadius: 2 },
  replyBarSender: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  replyBarText: { fontSize: 13 },
  replyBarClose: { padding: 6 },
  inputArea: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  gifBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center', marginBottom: 1 },
  gifBtnText: { color: '#6C63FF', fontSize: 12, fontWeight: '800' },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginBottom: 1 },
  sendIcon: { color: '#fff', fontSize: 18, fontWeight: '700' },
  menuOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  msgMenu: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36 },
  menuPreview: { fontSize: 13, textAlign: 'center', paddingHorizontal: 20, paddingVertical: 14, opacity: 0.7 },
  menuOpt: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, gap: 14 },
  menuOptIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  menuOptLabel: { fontSize: 16 },
});
