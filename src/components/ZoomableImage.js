// ZoomableImage — fullscreen image viewer with pinch-to-zoom.
// Uses ScrollView's built-in maximumZoomScale which works natively
// on both iOS and Android without any extra packages.
// Double-tap zooms to 2.5x. Pinch zooms between 1x and 5x.
import React, { useRef } from 'react';
import {
  View, ScrollView, Image, TouchableOpacity, Text,
  Modal, StyleSheet, Dimensions, TouchableWithoutFeedback,
} from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

export default function ZoomableImage({ uri, visible, onClose }) {
  const scrollRef = useRef(null);
  const isZoomed  = useRef(false);

  if (!visible || !uri) return null;

  function handleDoubleTap() {
    if (!scrollRef.current) return;
    if (isZoomed.current) {
      // Zoom back out to 1x
      scrollRef.current.scrollResponderZoomTo({
        x: 0, y: 0, width: SW, height: SH, animated: true,
      });
      isZoomed.current = false;
    } else {
      // Zoom to 2.5x centered
      const zoomWidth  = SW  / 2.5;
      const zoomHeight = SH  / 2.5;
      scrollRef.current.scrollResponderZoomTo({
        x: (SW  - zoomWidth)  / 2,
        y: (SH  - zoomHeight) / 2,
        width:  zoomWidth,
        height: zoomHeight,
        animated: true,
      });
      isZoomed.current = true;
    }
  }

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}>
      <View style={s.bg}>
        {/* Close button */}
        <TouchableOpacity
          style={s.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}>
          <Text style={s.closeTx}>✕  Close</Text>
        </TouchableOpacity>

        {/* Pinch-to-zoom ScrollView */}
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.contentContainer}
          maximumZoomScale={5}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          centerContent
          bouncesZoom>
          <TouchableWithoutFeedback onPress={handleDoubleTap}>
            <Image
              source={{ uri }}
              style={s.img}
              resizeMode="contain"
            />
          </TouchableWithoutFeedback>
        </ScrollView>

        {/* Hint */}
        <View style={s.hint}>
          <Text style={s.hintTx}>Pinch to zoom · Double-tap to reset</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg:               { flex: 1, backgroundColor: '#000' },
  closeBtn:         { position: 'absolute', top: 56, right: 20, zIndex: 20, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  closeTx:          { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  scroll:           { flex: 1 },
  contentContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  img:              { width: SW, height: SH * 0.85 },
  hint:             { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' },
  hintTx:           { color: 'rgba(255,255,255,0.35)', fontSize: 12 },
});
