import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert } from 'react-native';
import { supabase } from '../services/supabase';

const SwipeableRow = ({ children, item, isGroup = false }) => {
  if (!item) return children;

  const handlePin = async () => {
    const tableName = isGroup ? 'group_messages' : 'messages';
    
    const { error } = await supabase
      .from(tableName)
      .update({ is_pinned: !item.is_pinned })
      .eq('id', item.id);

    if (error) {
      console.error("Pin Error:", error.message);
    } else {
      console.log("Success! Message pin toggled.");
    }
  };

  const showOptions = () => {
    Alert.alert(
      "Message Options",
      "What would you like to do?",
      [
        { 
          text: item.is_pinned ? "Unpin Message" : "Pin Message", 
          onPress: handlePin 
        },
        { 
          text: "Cancel", 
          style: "cancel" 
        }
      ]
    );
  };

  return (
    <TouchableOpacity 
      onLongPress={showOptions} 
      delayLongPress={500}
      activeOpacity={0.7}
    >
      <View style={styles.rowContainer}>
        {item.is_pinned && <Text style={styles.pinIcon}>📌</Text>}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  rowContainer: { 
    flexDirection: 'row', 
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10
  },
  pinIcon: { 
    fontSize: 16, 
    marginRight: 8 
  }
});

export default SwipeableRow;
