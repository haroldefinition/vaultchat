// unreadBadge.js — Global unread message count for the Chats tab badge.
// Uses React Context so the tab bar and chat screens share the same state.
// ChatsScreen marks all chats as read on focus.
// Realtime message handler increments on new incoming message.
import React, { createContext, useContext, useState, useCallback } from 'react';

const UnreadContext = createContext({ count: 0, increment: () => {}, clear: () => {} });

export function UnreadProvider({ children }) {
  const [count, setCount] = useState(0);

  const increment = useCallback(() => setCount(n => n + 1), []);
  const clear     = useCallback(() => setCount(0), []);

  return (
    <UnreadContext.Provider value={{ count, increment, clear }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() { return useContext(UnreadContext); }
