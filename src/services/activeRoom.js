// ============================================================
//  VaultChat — Active Room tracker
//  src/services/activeRoom.js
//
//  Module-level state tracking which ChatRoom the user is
//  currently focused on. ChatsScreen's global message:new
//  handler reads this synchronously to skip incrementing unread
//  badges for the room the user is actively viewing.
//
//  Set by ChatRoomScreen via useFocusEffect on focus, cleared
//  on blur. Lives outside React state so non-React readers
//  (event handlers in services, deep callbacks) can check it
//  without props/context plumbing.
// ============================================================

let active = null;

export function setActiveRoom(roomId) {
  active = roomId || null;
}

export function clearActiveRoom() {
  active = null;
}

export function getActiveRoom() {
  return active;
}

export function isActiveRoom(roomId) {
  return active && roomId && active === roomId;
}
