// ============================================================
//  VaultChat — QR Code Contact Exchange (task #68)
//  src/screens/QRContactScreen.js
//
//  Two-tab screen for trading contact info face-to-face without
//  typing a handle.
//
//    ┌─────────────┬──────────────┐
//    │  My Code    │    Scan      │
//    └─────────────┴──────────────┘
//
//  MY CODE tab — renders a QR encoding a canonical VaultChat user
//  URL of the form:
//      vaultchat://user/<handle>?name=<display>
//  The `name` query param is just a hint so the scanner can show
//  a friendly match card before the lookup completes — the handle
//  is the actual identifier.
//
//  SCAN tab — fullscreen camera with QR-only barcode filtering.
//  On scan:
//    1. Parse the URL, extract the handle.
//    2. Look up the profile via findByHandle.
//    3. Show a confirmation sheet with { avatar, name, @handle }
//       and two CTAs: "Start Chat" / "Save Contact".
//
//  Why local + server resolution: the QR only embeds the handle
//  (not the peer's Supabase userId) because handles are the stable
//  public identifier. userId is resolved server-side on scan so
//  an older QR code still works after a handle rename (we'd catch
//  it and show a "not found" state).
//
//  Route params:
//    initialTab — 'mine' | 'scan' (default 'mine')
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Share, Animated,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../services/theme';
import { getMyHandle, getMyDisplayName, findByHandle } from '../services/vaultHandle';
import { supabase } from '../services/supabase';

// Canonical payload format. Keep it a real URL so it also works when
// scanned by the iOS system camera (universal-link handling can route
// into the app later once task #67 lands).
const URL_PREFIX = 'vaultchat://user/';

function buildPayload({ handle, name }) {
  const h = (handle || '').replace(/^@+/, '');
  const nameParam = name ? `?name=${encodeURIComponent(name)}` : '';
  return `${URL_PREFIX}${h}${nameParam}`;
}

// Forgiving parser — accepts the canonical form AND bare @handles / raw
// handles, so the scanner stays useful if someone generates QR elsewhere.
function parsePayload(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;

  // Canonical URL form
  if (t.toLowerCase().startsWith(URL_PREFIX)) {
    const rest = t.slice(URL_PREFIX.length);
    const [handlePart, queryPart] = rest.split('?');
    const handle = (handlePart || '').replace(/^@+/, '').split('/')[0];
    let name = null;
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      name = params.get('name');
    }
    return handle ? { handle, name } : null;
  }

  // Bare @handle
  if (t.startsWith('@')) {
    const handle = t.slice(1).replace(/\s/g, '');
    return handle ? { handle, name: null } : null;
  }

  // Raw alphanumeric (accept only if it looks handle-shaped)
  if (/^[a-z0-9_]{3,32}$/i.test(t)) return { handle: t, name: null };

  return null;
}

// ── MY CODE tab ─────────────────────────────────────────────
function MyCodeTab({ theme }) {
  const { bg, card, tx, sub, accent, border } = theme;
  const [handle, setHandle] = useState(null);
  const [name, setName]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [h, n] = await Promise.all([getMyHandle(), getMyDisplayName()]);
        setHandle(h || null);
        setName(n || null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function shareCode() {
    if (!handle) return;
    const url = buildPayload({ handle, name });
    try {
      await Share.share({
        message: `Add me on VaultChat: ${handle}\n${url}`,
        url,
        title: 'My VaultChat Code',
      });
    } catch {}
  }

  if (loading) {
    return (
      <View style={s.tabContent}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  if (!handle) {
    return (
      <View style={s.tabContent}>
        <Text style={[s.bigEmoji]}>🔗</Text>
        <Text style={[s.headline, { color: tx }]}>No handle yet</Text>
        <Text style={[s.sub, { color: sub }]}>
          Set a @handle in Settings to generate your QR code.
        </Text>
      </View>
    );
  }

  const payload = buildPayload({ handle, name });

  return (
    <View style={s.tabContent}>
      {/* QR container — white plate gives the QR library a clean ground
          regardless of light/dark theme (QR scanners are picky about
          contrast and luminance on the dark areas). */}
      <View style={[s.qrPlate, { backgroundColor: '#ffffff', borderColor: border }]}>
        <QRCode
          value={payload}
          size={230}
          color="#000000"
          backgroundColor="#ffffff"
          ecl="M"
        />
      </View>

      {/* Show the bare handle (no '@'). Display surfaces app-wide
          drop the '@' — only signup entry and live mention typing
          carry it. */}
      <Text style={[s.handleBig, { color: accent }]}>{handle.replace(/^@+/, '')}</Text>
      {!!name && <Text style={[s.nameSmall, { color: sub }]}>{name}</Text>}

      <Text style={[s.tip, { color: sub }]}>
        Point a friend's camera at this code to exchange contacts instantly.
      </Text>

      <TouchableOpacity style={[s.shareBtn, { backgroundColor: accent }]} onPress={shareCode}>
        <Text style={s.shareBtnTx}>Share My Code</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── SCAN tab ────────────────────────────────────────────────
function ScanTab({ theme, navigation }) {
  const { bg, card, tx, sub, accent, border, inputBg } = theme;
  const [permission, requestPermission] = useCameraPermissions();

  // Scan latch — once we've matched a QR we pause further scans until the
  // user either starts a chat, saves the contact, or dismisses the sheet.
  // Otherwise the scanner fires continuously at ~30fps while the QR is in view.
  const [matched, setMatched] = useState(null); // { handle, name, profile } | 'looking' | { error }
  const scanBusyRef = useRef(false);

  const handleBarcode = useCallback(async ({ data }) => {
    if (scanBusyRef.current) return;
    const parsed = parsePayload(data);
    if (!parsed) return; // not a VaultChat QR — ignore silently, keep scanning

    scanBusyRef.current = true;
    setMatched('looking');

    const profile = await findByHandle(parsed.handle);
    if (!profile) {
      setMatched({ error: `No VaultChat user found for @${parsed.handle}.` });
      return;
    }

    // Guard against scanning your own code (funny but useless)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id && session.user.id === profile.id) {
        setMatched({ error: "That's your own code 🙂" });
        return;
      }
    } catch {}

    setMatched({ handle: parsed.handle, hintName: parsed.name, profile });
  }, []);

  function resetScan() {
    scanBusyRef.current = false;
    setMatched(null);
  }

  function startChat() {
    if (!matched?.profile) return;
    const p = matched.profile;
    // Display name fallback uses the bare handle (no '@') so the
    // chat header matches the rest of the app's display surfaces.
    // The actual @-form is reserved for signup entry + mention typing.
    const displayName = p.display_name || matched.hintName || p.vault_handle || 'VaultChat User';
    // NewMessageScreen reads `selectedContact: { handle, phone, name }` —
    // keep that shape exactly so the "To:" field prefills correctly and
    // the existing handle-resolution path finds the profile.
    navigation.replace('NewMessage', {
      selectedContact: {
        handle: p.vault_handle ? `@${p.vault_handle}` : null,
        phone:  p.phone || null,
        name:   displayName,
      },
    });
  }

  // Permission states — render helpful explanations instead of dumping
  // the user onto a black camera surface with no hint.
  if (!permission) {
    return <View style={s.tabContent}><ActivityIndicator color={accent} /></View>;
  }
  if (!permission.granted) {
    return (
      <View style={s.tabContent}>
        <Text style={s.bigEmoji}>📷</Text>
        <Text style={[s.headline, { color: tx }]}>Camera access needed</Text>
        <Text style={[s.sub, { color: sub }]}>
          VaultChat uses the camera only to read QR codes — frames never leave your device.
        </Text>
        <TouchableOpacity
          style={[s.shareBtn, { backgroundColor: accent, marginTop: 24 }]}
          onPress={() => requestPermission()}>
          <Text style={s.shareBtnTx}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={matched ? undefined : handleBarcode}
      />

      {/* Framing overlay — aspirational square in the center so the user
          knows where to point. Purely cosmetic; expo-camera reads the
          whole frame regardless of where the QR sits within it. */}
      <View style={s.scanFrameWrap} pointerEvents="none">
        <View style={[s.scanFrame, { borderColor: accent }]}>
          <View style={[s.corner, s.cornerTL, { borderColor: accent }]} />
          <View style={[s.corner, s.cornerTR, { borderColor: accent }]} />
          <View style={[s.corner, s.cornerBL, { borderColor: accent }]} />
          <View style={[s.corner, s.cornerBR, { borderColor: accent }]} />
        </View>
        <Text style={s.scanHint}>Point at a VaultChat QR code</Text>
      </View>

      {/* Match / Loading / Error sheet — slides up from the bottom once we
          either find a profile or hit an error. Dimmed background ensures
          text is readable against whatever the camera happens to see. */}
      {matched && (
        <View style={s.matchOverlay}>
          <View style={[s.matchSheet, { backgroundColor: card, borderColor: border }]}>
            {matched === 'looking' ? (
              <View style={{ alignItems: 'center', gap: 10, paddingVertical: 14 }}>
                <ActivityIndicator color={accent} />
                <Text style={{ color: sub, fontSize: 13 }}>Looking up contact…</Text>
              </View>
            ) : matched?.error ? (
              <View style={{ alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <Text style={{ fontSize: 40 }}>⚠️</Text>
                <Text style={{ color: tx, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
                  {matched.error}
                </Text>
                <TouchableOpacity style={[s.ghostBtn, { borderColor: border }]} onPress={resetScan}>
                  <Text style={{ color: tx, fontWeight: '700' }}>Scan again</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={[s.matchAvatar, { backgroundColor: accent }]}>
                    <Text style={s.matchAvatarTx}>
                      {((matched.profile.display_name || matched.hintName || matched.handle || '?')[0] || '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {/* Name = bare display label; sub-line = bare handle.
                        The '@' symbol now only appears in signup entry
                        and live mention typing, never as a passive
                        display ornament. */}
                    <Text style={{ color: tx, fontWeight: '700', fontSize: 17 }}>
                      {matched.profile.display_name || matched.hintName || matched.handle}
                    </Text>
                    <Text style={{ color: sub, fontSize: 13 }}>
                      {matched.profile.vault_handle || matched.handle}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                  <TouchableOpacity
                    style={[s.ghostBtn, { borderColor: border, flex: 1 }]}
                    onPress={resetScan}>
                    <Text style={{ color: tx, fontWeight: '700' }}>Scan again</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.primaryBtn, { backgroundColor: accent, flex: 1 }]}
                    onPress={startChat}>
                    <Text style={s.primaryBtnTx}>Start Chat</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────
export default function QRContactScreen({ route, navigation }) {
  const theme = useTheme();
  const { bg, card, tx, sub, accent, border } = theme;

  const initial = route?.params?.initialTab === 'scan' ? 'scan' : 'mine';
  const [tab, setTab] = useState(initial);

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ minWidth: 60 }}>
          <Text style={{ color: sub, fontSize: 16 }}>Close</Text>
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: tx }]}>QR Code</Text>
        <View style={{ minWidth: 60 }} />
      </View>

      {/* Segmented toggle — same visual treatment as CallScreen */}
      <View style={[s.tabToggleWrap]}>
        <View style={[s.tabToggle, { backgroundColor: card, borderColor: border }]}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'mine' && { backgroundColor: accent }]}
            onPress={() => setTab('mine')}>
            <Text style={[s.tabBtnText, { color: tab === 'mine' ? '#fff' : sub }]}>My Code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'scan' && { backgroundColor: accent }]}
            onPress={() => setTab('scan')}>
            <Text style={[s.tabBtnText, { color: tab === 'scan' ? '#fff' : sub }]}>Scan</Text>
          </TouchableOpacity>
        </View>
      </View>

      {tab === 'mine'
        ? <MyCodeTab theme={theme} />
        : <ScanTab theme={theme} navigation={navigation} />}
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  header:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },

  // Segmented control — mirrors CallScreen's updated two-row header
  tabToggleWrap: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  tabToggle:   { flexDirection: 'row', borderRadius: 22, borderWidth: 1, padding: 3 },
  tabBtn:      { flex: 1, paddingVertical: 8, borderRadius: 19, alignItems: 'center' },
  tabBtnText:  { fontSize: 13, fontWeight: '700' },

  tabContent:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 10 },
  bigEmoji:    { fontSize: 52, marginBottom: 10 },
  headline:    { fontSize: 18, fontWeight: '700' },
  sub:         { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // My code tab
  qrPlate:     {
    padding: 18, borderRadius: 20, borderWidth: 1,
    marginBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  handleBig:   { fontSize: 24, fontWeight: '800', letterSpacing: 0.2 },
  nameSmall:   { fontSize: 14, marginTop: 2 },
  tip:         { fontSize: 13, textAlign: 'center', paddingHorizontal: 20, marginTop: 16 },
  shareBtn:    { marginTop: 22, paddingHorizontal: 26, paddingVertical: 13, borderRadius: 24 },
  shareBtnTx:  { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Scan tab — frame overlay
  scanFrameWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame:     { width: 240, height: 240, borderRadius: 22 },
  corner:        { position: 'absolute', width: 30, height: 30, borderColor: '#fff' },
  cornerTL:      { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 22 },
  cornerTR:      { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 22 },
  cornerBL:      { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 22 },
  cornerBR:      { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 22 },
  scanHint:      {
    position: 'absolute', bottom: 120,
    color: '#fff', fontSize: 14, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6,
  },

  // Match sheet
  matchOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  matchSheet:   {
    margin: 16, borderRadius: 20, borderWidth: 1,
    padding: 18, paddingBottom: 24,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  matchAvatar:  { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  matchAvatarTx:{ color: '#fff', fontWeight: '700', fontSize: 22 },
  primaryBtn:   { paddingVertical: 12, borderRadius: 24, alignItems: 'center' },
  primaryBtnTx: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ghostBtn:     { paddingVertical: 12, borderRadius: 24, alignItems: 'center', borderWidth: 1 },
});
