import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, Conversation, Message, MessageReply, UserStatusMode, FriendRequest } from './types';
import { AuthModal } from './components/AuthModal';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { NewChatModal } from './components/NewChatModal';
import { ProfileModal } from './components/ProfileModal';
import { UserDetailModal } from './components/UserDetailModal';
import { SwitchUserModal } from './components/SwitchUserModal';
import { NotificationPromptModal } from './components/NotificationPromptModal';
import { StatusPickerModal } from './components/StatusPickerModal';
import { AddFriendModal } from './components/AddFriendModal';
import { sendBrowserNotification, getNotificationPermission } from './utils/notifications';
import { sounds } from './utils/audio';
import { MessageSquare, ArrowLeft, Users, ShieldAlert, UserPlus } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('id_messenger_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [currentMessages, setCurrentMessages] = useState<Message[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [userStatuses, setUserStatuses] = useState<Record<string, { status: UserStatusMode; dndUntil?: number | null }>>({});
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => getNotificationPermission());
  const [pendingFriendRequestsCount, setPendingFriendRequestsCount] = useState<number>(0);

  // Modals state
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [showPartnerDetailModal, setShowPartnerDetailModal] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);

  // Mobile navigation state
  const [mobileView, setMobileView] = useState<'sidebar' | 'chat'>('sidebar');

  const wsRef = useRef<WebSocket | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const partnerTypingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Stable references to prevent WebSocket effect re-triggering loops
  const currentUserRef = useRef<User | null>(currentUser);
  currentUserRef.current = currentUser;

  const activeConversationIdRef = useRef<string | null>(activeConversationId);
  activeConversationIdRef.current = activeConversationId;

  const friendsRef = useRef<User[]>(friends);
  friendsRef.current = friends;

  const allUsersRef = useRef<User[]>(allUsers);
  allUsersRef.current = allUsers;

  const conversationsRef = useRef<Conversation[]>(conversations);
  conversationsRef.current = conversations;

  // Active Partner user object
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const partnerUser = activeConversation?.otherUser;

  // Save currentUser to localStorage
  const handleLoginSuccess = (user: User, token: string, isNewRegistration?: boolean) => {
    localStorage.setItem('id_messenger_user', JSON.stringify(user));
    localStorage.setItem('id_messenger_token', token);
    setCurrentUser(user);
    setActiveConversationId(null);
    setMobileView('sidebar');

    // Prompt for notifications if new registration or not yet answered
    if (isNewRegistration || getNotificationPermission() === 'default') {
      setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 400);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('id_messenger_user');
    localStorage.removeItem('id_messenger_token');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setCurrentUser(null);
    setActiveConversationId(null);
    setConversations([]);
    setFriends([]);
    setCurrentMessages([]);
  };

  // Fetch friends
  const fetchFriends = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/friends?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setFriends(data.friends || []);
    } catch (e) {
      console.warn('Friends fetch paused:', e);
    }
  }, []);

  // Fetch pending friend requests
  const fetchPendingFriendRequests = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/friends/requests?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setPendingFriendRequestsCount((data.incoming || []).length);
    } catch (e) {
      console.warn('Friend requests fetch paused:', e);
    }
  }, []);

  // Fetch conversations
  const fetchConversations = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/conversations?userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.warn('Conversations fetch paused:', e);
    }
  }, []);

  // Fetch all users
  const fetchAllUsers = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/users/search?currentUserId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      setAllUsers(data.users || []);
    } catch (e) {
      console.warn('Users fetch paused:', e);
    }
  }, []);

  // Fetch messages for a conversation
  const fetchMessages = useCallback(async (convId: string, userId: string) => {
    try {
      const res = await fetch(`/api/messages?conversationId=${convId}&userId=${userId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.notFriends) {
        alert(data.error || '친구 사이에서만 대화할 수 있습니다.');
        setActiveConversationId(null);
        return;
      }
      setCurrentMessages(data.messages || []);

      // Decrement unread count locally
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (e) {
      console.warn('Messages fetch paused:', e);
    }
  }, []);

  // Initialize data on user change
  const currentUserId = currentUser?.id;
  useEffect(() => {
    if (!currentUserId) return;
    fetchFriends(currentUserId);
    fetchPendingFriendRequests(currentUserId);
    fetchConversations(currentUserId);
    fetchAllUsers(currentUserId);
  }, [currentUserId, fetchFriends, fetchPendingFriendRequests, fetchConversations, fetchAllUsers]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!currentUserId || !activeConversationId) return;
    fetchMessages(activeConversationId, currentUserId);
  }, [activeConversationId, currentUserId, fetchMessages]);

  // Setup WebSocket connection - Stable, only connects once per logged-in user
  useEffect(() => {
    if (!currentUserId) return;

    let isUnmounted = false;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isUnmounted) {
        ws.close();
        return;
      }
      // Authenticate socket with current user ID
      ws.send(JSON.stringify({ type: 'auth', payload: { userId: currentUserId } }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const me = currentUserRef.current;
        const curActiveConvId = activeConversationIdRef.current;

        switch (msg.type) {
          case 'presence:sync': {
            setOnlineUserIds(new Set(msg.payload.onlineUserIds));
            if (msg.payload.userStatuses) {
              setUserStatuses(msg.payload.userStatuses);
            }
            break;
          }

          case 'friend:request': {
            if (me) fetchPendingFriendRequests(me.id);
            sounds.playIncomingMessage();
            sendBrowserNotification('새 친구 요청', {
              body: `${msg.payload?.request?.sender?.name || '새 사용자'}님이 친구 요청을 보냈습니다!`,
            });
            break;
          }

          case 'friend:response': {
            if (me) {
              fetchFriends(me.id);
              fetchConversations(me.id);
              fetchPendingFriendRequests(me.id);
            }
            if (msg.payload?.accepted) {
              sounds.playIncomingMessage();
              sendBrowserNotification('친구 수락 완료', {
                body: `친구 요청이 수락되어 대화를 시작할 수 있습니다 🎉`,
              });
            }
            break;
          }

          case 'message:new': {
            const incoming: Message = msg.payload.message;
            const isForCurrentChat = incoming.conversationId === curActiveConvId;

            if (isForCurrentChat) {
              setCurrentMessages((prev) => {
                if (prev.some((m) => m.id === incoming.id)) return prev;
                return [...prev, incoming];
              });
              // If sent to me and I'm currently looking at the chat, mark as read
              if (me && incoming.receiverId === me.id) {
                if (me.status !== 'dnd') {
                  sounds.playIncomingMessage();
                }
                fetch(`/api/messages?conversationId=${incoming.conversationId}&userId=${me.id}`);
              }
            } else {
              if (me && incoming.receiverId === me.id) {
                if (me.status !== 'dnd') {
                  sounds.playIncomingMessage();
                }
              }
            }

            // Trigger Browser Push Notification if received from someone else and not DND
            if (me && incoming.receiverId === me.id && me.status !== 'dnd') {
              const knownFriends = friendsRef.current;
              const knownAll = allUsersRef.current;
              const knownConvs = conversationsRef.current;

              const sender =
                knownFriends.find((u) => u.id === incoming.senderId) ||
                knownAll.find((u) => u.id === incoming.senderId) ||
                knownConvs.find((c) => c.otherUser?.id === incoming.senderId)?.otherUser;
              const senderTitle = sender
                ? `${sender.name} (@${sender.username})`
                : '새 메시지';

              sendBrowserNotification(senderTitle, {
                body: incoming.text,
                onClick: () => {
                  setActiveConversationId(incoming.conversationId);
                  setMobileView('chat');
                },
              });
            }

            // Update conversation list item
            setConversations((prev) => {
              const exists = prev.some((c) => c.id === incoming.conversationId);
              if (exists) {
                return prev
                  .map((c) => {
                    if (c.id === incoming.conversationId) {
                      return {
                        ...c,
                        lastMessage: incoming,
                        updatedAt: incoming.createdAt,
                        unreadCount:
                          isForCurrentChat || (me && incoming.senderId === me.id)
                            ? 0
                            : c.unreadCount + 1,
                      };
                    }
                    return c;
                  })
                  .sort((a, b) => b.updatedAt - a.updatedAt);
              } else {
                if (me) fetchConversations(me.id);
                return prev;
              }
            });

            break;
          }

          case 'message:read': {
            const { conversationId, readerId } = msg.payload;
            const me = currentUserRef.current;
            if (me && readerId !== me.id) {
              setCurrentMessages((prev) =>
                prev.map((m) =>
                  m.conversationId === conversationId && m.senderId === me.id
                    ? { ...m, read: true }
                    : m
                )
              );
            }
            break;
          }

          case 'message:react': {
            const { messageId, emoji, userId, action } = msg.payload;
            setCurrentMessages((prev) =>
              prev.map((m) => {
                if (m.id !== messageId) return m;
                const reactions = { ...(m.reactions || {}) };
                const userList = [...(reactions[emoji] || [])];
                if (action === 'add' && !userList.includes(userId)) {
                  userList.push(userId);
                  reactions[emoji] = userList;
                } else if (action === 'remove') {
                  const filtered = userList.filter((u) => u !== userId);
                  if (filtered.length > 0) {
                    reactions[emoji] = filtered;
                  } else {
                    delete reactions[emoji];
                  }
                }
                return { ...m, reactions };
              })
            );
            break;
          }

          case 'typing:start': {
            if (msg.payload?.senderId) {
              setTypingUsers((prev) => new Set(prev).add(msg.payload.senderId));
              if (partnerTypingTimerRef.current) clearTimeout(partnerTypingTimerRef.current);
              partnerTypingTimerRef.current = setTimeout(() => {
                setTypingUsers((prev) => {
                  const next = new Set(prev);
                  next.delete(msg.payload.senderId);
                  return next;
                });
              }, 2500);
            }
            break;
          }

          case 'typing:stop': {
            if (msg.payload?.senderId) {
              setTypingUsers((prev) => {
                const next = new Set(prev);
                next.delete(msg.payload.senderId);
                return next;
              });
            }
            break;
          }
        }
      } catch (e) {
        console.error('WS message error:', e);
      }
    };

    ws.onclose = () => {
      // Reconnect cleanly if not unmounted
      if (!isUnmounted && currentUserRef.current) {
        reconnectTimeout = setTimeout(() => {
          if (!isUnmounted && currentUserRef.current) {
            fetchConversations(currentUserRef.current.id);
            fetchFriends(currentUserRef.current.id);
          }
        }, 3000);
      }
    };

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws.close();
    };
  }, [currentUserId, fetchConversations, fetchFriends, fetchPendingFriendRequests]);

  // Send message handler
  const handleSendMessage = async (text: string, replyTo?: MessageReply) => {
    if (!currentUser || !partnerUser) return;

    sounds.playSentMessage();

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: currentUser.id,
          receiverId: partnerUser.id,
          text,
          replyTo,
        }),
      });
      const data = await res.json();
      if (data.notFriends) {
        alert(data.error || '상대방과 친구가 되어야만 메시지를 보낼 수 있습니다.');
        return;
      }
      if (data.message) {
        // Stop typing immediately
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'typing:stop',
              payload: {
                senderId: currentUser.id,
                receiverId: partnerUser.id,
                conversationId: activeConversationId,
              },
            })
          );
        }
      }
    } catch (e) {
      console.error('Send message failed:', e);
    }
  };

  // React to message handler
  const handleReactMessage = async (messageId: string, emoji: string) => {
    if (!currentUser) return;
    try {
      await fetch('/api/messages/react', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          emoji,
          userId: currentUser.id,
        }),
      });
    } catch (e) {
      console.error('Reaction failed:', e);
    }
  };

  // Accept Friend Request
  const handleAcceptFriendRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          userId: currentUser.id,
          accept: true,
        }),
      });
      if (res.ok) {
        fetchFriends(currentUser.id);
        fetchConversations(currentUser.id);
        fetchPendingFriendRequests(currentUser.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Reject Friend Request
  const handleRejectFriendRequest = async (requestId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/friends/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          userId: currentUser.id,
          accept: false,
        }),
      });
      if (res.ok) {
        fetchPendingFriendRequests(currentUser.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Typing event trigger (debounced)
  const handleTyping = () => {
    if (!currentUser || !partnerUser || !wsRef.current) return;
    if (wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: 'typing:start',
        payload: {
          senderId: currentUser.id,
          receiverId: partnerUser.id,
          conversationId: activeConversationId,
        },
      })
    );

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'typing:stop',
            payload: {
              senderId: currentUser.id,
              receiverId: partnerUser.id,
              conversationId: activeConversationId,
            },
          })
        );
      }
    }, 1500);
  };

  // Start chat with a specific user (must be a friend)
  const handleStartChatWithUser = (targetUser: User) => {
    if (!currentUser) return;
    const sorted = [currentUser.id, targetUser.id].sort();
    const convId = `conv_${sorted[0]}_${sorted[1]}`;

    // If conversation does not exist in state, add a placeholder
    if (!conversations.some((c) => c.id === convId)) {
      const newConv: Conversation = {
        id: convId,
        participantIds: [currentUser.id, targetUser.id],
        otherUser: targetUser,
        unreadCount: 0,
        updatedAt: Date.now(),
      };
      setConversations((prev) => [newConv, ...prev]);
    }

    setActiveConversationId(convId);
    setMobileView('chat');
  };

  const handleSelectConversation = (convId: string) => {
    setActiveConversationId(convId);
    setMobileView('chat');
  };

  if (!currentUser) {
    return <AuthModal onLoginSuccess={handleLoginSuccess} />;
  }

  // Get partner status mode:
  // If user explicitly set DND and hasn't expired -> 'dnd'
  // Else if user socket is currently connected -> 'online'
  // Else -> 'offline' (automatic)
  const partnerStatusData = partnerUser ? userStatuses[partnerUser.id] : null;
  const isPartnerConnected = partnerUser ? onlineUserIds.has(partnerUser.id) : false;
  const partnerStatusMode: UserStatusMode =
    partnerStatusData?.status === 'dnd'
      ? 'dnd'
      : isPartnerConnected
      ? 'online'
      : 'offline';

  return (
    <div className="relative flex h-screen w-full bg-[#0c0e14] text-slate-100 overflow-hidden font-sans select-none antialiased md:p-3 lg:p-5">
      {/* Ambient Glowing Background Orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[55%] h-[55%] bg-blue-600/20 rounded-full blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[55%] h-[55%] bg-purple-600/20 rounded-full blur-[130px]" />
        <div className="absolute top-[40%] left-[30%] w-[35%] h-[35%] bg-indigo-500/10 rounded-full blur-[110px]" />
      </div>

      {/* Main Frosted Glass App Frame */}
      <div className="relative z-10 w-full h-full flex bg-white/5 backdrop-blur-2xl border border-white/10 md:rounded-3xl shadow-2xl overflow-hidden">
        {/* Sidebar Component */}
        <div
          className={`h-full w-full md:w-auto shrink-0 md:flex ${
            mobileView === 'sidebar' ? 'flex' : 'hidden md:flex'
          }`}
        >
          <Sidebar
            currentUser={currentUser}
            conversations={conversations}
            friends={friends}
            activeConversationId={activeConversationId}
            onlineUserIds={onlineUserIds}
            userStatuses={userStatuses}
            soundEnabled={soundEnabled}
            notificationPermission={notificationPermission}
            pendingFriendRequestsCount={pendingFriendRequestsCount}
            onToggleSound={() => {
              const next = sounds.toggleSound();
              setSoundEnabled(next);
            }}
            onOpenNotificationPrompt={() => setShowNotificationPrompt(true)}
            onOpenStatusPicker={() => setShowStatusPicker(true)}
            onOpenAddFriendModal={() => setShowAddFriendModal(true)}
            onSelectConversation={handleSelectConversation}
            onStartChatWithUser={handleStartChatWithUser}
            onOpenNewChatModal={() => setShowAddFriendModal(true)}
            onOpenProfileModal={() => setShowProfileModal(true)}
            onSwitchUser={() => setShowSwitchModal(true)}
            onLogout={handleLogout}
          />
        </div>

        {/* Chat Area Component */}
        <div
          className={`h-full flex-1 flex flex-col min-w-0 bg-white/[0.02] ${
            mobileView === 'chat' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {activeConversation && partnerUser ? (
            <div className="h-full flex flex-col min-w-0">
              {/* Mobile Back Header */}
              <div className="md:hidden flex items-center gap-2 p-2 bg-black/40 border-b border-white/10 backdrop-blur-md">
                <button
                  id="mobile-back-to-sidebar-btn"
                  type="button"
                  onClick={() => setMobileView('sidebar')}
                  className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10 flex items-center gap-1.5 text-xs font-semibold transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>대화 목록으로</span>
                </button>
              </div>

              <ChatArea
                currentUser={currentUser}
                partner={partnerUser}
                messages={currentMessages}
                conversationId={activeConversation.id}
                isPartnerOnline={isPartnerConnected}
                partnerStatusMode={partnerStatusMode}
                isPartnerTyping={typingUsers.has(partnerUser.id)}
                onSendMessage={handleSendMessage}
                onReactMessage={handleReactMessage}
                onTyping={handleTyping}
                onOpenPartnerDetails={() => setShowPartnerDetailModal(true)}
              />
            </div>
          ) : (
            /* Empty Chat State */
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-black/10">
              <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-blue-400 mb-5 shadow-2xl backdrop-blur-xl">
                <MessageSquare className="w-9 h-9" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">대화를 선택해주세요</h2>
              <p className="text-sm text-white/50 max-w-sm mb-6 leading-relaxed">
                친구 목록에서 대화할 상대를 선택하거나, 친구 추가 버튼을 눌러 새 친구를 요청해보세요.
              </p>
              <button
                id="empty-state-new-chat-btn"
                type="button"
                onClick={() => setShowAddFriendModal(true)}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl text-sm shadow-lg shadow-blue-600/30 border border-blue-400/30 transition-all flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>친구 추가하고 대화하기</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add Friend & Requests Modal */}
      {showAddFriendModal && (
        <AddFriendModal
          currentUser={currentUser}
          onClose={() => setShowAddFriendModal(false)}
          onRequestSent={() => {
            fetchFriends(currentUser.id);
            fetchPendingFriendRequests(currentUser.id);
          }}
          onAcceptRequest={handleAcceptFriendRequest}
          onRejectRequest={handleRejectFriendRequest}
        />
      )}

      {/* Status Picker Modal */}
      {showStatusPicker && (
        <StatusPickerModal
          user={currentUser}
          onClose={() => setShowStatusPicker(false)}
          onStatusUpdated={(updated) => {
            setCurrentUser(updated);
            localStorage.setItem('id_messenger_user', JSON.stringify(updated));
          }}
        />
      )}

      {/* New Chat Modal (fallback) */}
      {showNewChatModal && (
        <NewChatModal
          currentUserId={currentUser.id}
          onClose={() => setShowNewChatModal(false)}
          onSelectUser={handleStartChatWithUser}
        />
      )}

      {/* Profile Settings Modal */}
      {showProfileModal && (
        <ProfileModal
          user={currentUser}
          onClose={() => setShowProfileModal(false)}
          onUpdate={(updated) => {
            setCurrentUser(updated);
            localStorage.setItem('id_messenger_user', JSON.stringify(updated));
            fetchAllUsers(currentUser.id);
            fetchFriends(currentUser.id);
          }}
          onLogout={handleLogout}
        />
      )}

      {/* Partner User Details Modal */}
      {showPartnerDetailModal && partnerUser && (
        <UserDetailModal
          user={partnerUser}
          isOnline={isPartnerConnected}
          onClose={() => setShowPartnerDetailModal(false)}
        />
      )}

      {/* Switch Account Modal */}
      {showSwitchModal && (
        <SwitchUserModal
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setShowSwitchModal(false)}
          onSelectUser={(switched) => {
            handleLoginSuccess(switched, `token_${switched.id}`);
          }}
          onAddNewAccount={() => {
            handleLogout();
          }}
        />
      )}

      {/* Notification Prompt Modal */}
      <NotificationPromptModal
        isOpen={showNotificationPrompt}
        onClose={() => setShowNotificationPrompt(false)}
        onEnabled={() => {
          setNotificationPermission(getNotificationPermission());
        }}
      />

    </div>
  );
}
