import React from 'react';
import { Animated, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { supabase } from '../services/supabase';

const SwipeableRow = ({ children, item, isGroup = false }) => {
  if (!item) return children;

  const handlePin = async () => {
    // Determine which table to update: 'group_messages' or 'messages'
    const tableName = isGroup ? 'group_messages' : 'messages';
    
    const { error } = await supabase
      .from(tableName)
      .update({ is_pinned: !item.is_pinned })
      .eq('id', item.id);

    if (error) {
      console.error("Pin Error:", error.message);
      // If 'group_messages' doesn't exist, try the standard 'messages' table
      if (isGroup) {
         await supabase.from('messages').update({ is_pinned: !item.is_pinned }).eq('id', item.id);
      }
    }
  };

  const renderRightActions = () => (
    <View style={{ width: 80, flexDirection: 'row' }}>
      <TouchableOpacity 
        style={[styles.rightAction, { backgroundColor: '#FFD700' }]} 
        onPress={handlePin}
      >
        <Text style={styles.actionText}>{item.is_pinned ? 'Unpin' : 'Pin'}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Swipeable renderRightActions={renderRightActions}>
      <View style={styles.rowContainer}>
        {item.is_pinned && <Text style={styles.pinIcon}>📌</Text>}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  rowContainer: { flexDirection: 'row', alignItems: 'center' },
  pinIcon: { fontSize: 16, marginLeft: 10, marginRight: -5 },
  rightAction: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  actionText: { color: 'black', fontWeight: 'bold' },
});

export default SwipeableRow;
