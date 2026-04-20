import React from 'react';
import { Animated, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { supabase } from '../services/supabase';

const SwipeableRow = ({ children, item }) => {
  // SAFETY CHECK: If there is no item, just show the message without swipe logic
  if (!item) return children;

  const handlePin = async () => {
    const { error } = await supabase
      .from('messages')
      .update({ is_pinned: !item.is_pinned })
      .eq('id', item.id);

    if (error) console.error("Pin Error:", error.message);
  };

  const renderRightActions = (progress, dragX) => {
    return (
      <View style={{ width: 80, flexDirection: 'row' }}>
        <TouchableOpacity 
          style={[styles.rightAction, { backgroundColor: '#FFD700' }]} 
          onPress={handlePin}
        >
          <Text style={styles.actionText}>{item.is_pinned ? 'Unpin' : 'Pin'}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Swipeable renderRightActions={renderRightActions}>
      {children}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  rightAction: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  actionText: {
    color: 'black',
    fontWeight: 'bold',
  },
});

export default SwipeableRow;
