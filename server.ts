import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

export type UserStatusMode = 'online' | 'dnd' | 'offline';

interface UserRecord {
  id: string;
  username: string; // unique lowercase ID
  name: string;
  password?: string;
  avatarBg: string;
  avatarEmoji: string;
  customStatus?: string;
  status: UserStatusMode;
  dndUntil?: number | null; // expiration timestamp or null for indefinite
  lastSeen: number;
  createdAt: number;
}

interface FriendRequestRecord {
  id: string;
  senderId: string;
  receiverId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

interface MessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: number;
  read: boolean;
  replyTo?: {
    id: string;
    senderName: string;
    text: string;
  };
  reactions?: Record<string, string[]>;
  attachment?: {
    type: 'image' | 'file';
    url: string;
    name: string;
    size?: string;
  };
}

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial seed data
const initialUsers: UserRecord[] = [
  {
    id: "user_jiuk",
    username: "jiuk",
    name: "지욱 (Jiuk)",
    password: "password123",
    avatarBg: "from-blue-500 to-indigo-600",
    avatarEmoji: "⚡",
    customStatus: "새로운 프로젝트 구상 중 ✨",
    status: "online",
    lastSeen: Date.now(),
    createdAt: Date.now() - 86400000 * 5,
  },
  {
    id: "user_minseo",
    username: "minseo",
    name: "김민서",
    password: "password123",
    avatarBg: "from-rose-400 to-pink-600",
    avatarEmoji: "🌸",
    customStatus: "오늘도 좋은 하루 보내세요!",
    status: "online",
    lastSeen: Date.now(),
    createdAt: Date.now() - 86400000 * 4,
  },
  {
    id: "user_haewon",
    username: "haewon",
    name: "이해원",
    password: "password123",
    avatarBg: "from-amber-400 to-orange-500",
    avatarEmoji: "🚀",
    customStatus: "디자인 리뷰 환영 🎨",
    status: "dnd",
    lastSeen: Date.now() - 1000 * 60 * 15,
    createdAt: Date.now() - 86400000 * 3,
  },
  {
    id: "user_daniel",
    username: "daniel",
    name: "다니엘 (Daniel)",
    password: "password123",
    avatarBg: "from-emerald-400 to-teal-600",
    avatarEmoji: "🌿",
    customStatus: "운동 중 / 메시지 남겨주세요",
    status: "offline",
    lastSeen: Date.now() - 1000 * 60 * 60 * 2,
    createdAt: Date.now() - 86400000 * 2,
  },
];

// Initial friend connection: Jiuk <-> Minseo
const initialFriendRequests: FriendRequestRecord[] = [
  {
    id: "freq_seed_1",
    senderId: "user_minseo",
    receiverId: "user_jiuk",
    status: "accepted",
    createdAt: Date.now() - 86400000 * 2,
  },
];

const initialMessages: MessageRecord[] = [
  {
    id: "msg_seed_1",
    conversationId: "conv_user_jiuk_user_minseo",
    senderId: "user_minseo",
    receiverId: "user_jiuk",
    text: "안녕하세요 지욱님! 서로 친구가 되어 대화를 나눌 수 있어요 😊",
    createdAt: Date.now() - 1000 * 60 * 40,
    read: true,
    reactions: { "👋": ["user_jiuk"] },
  },
  {
    id: "msg_seed_2",
    conversationId: "conv_user_jiuk_user_minseo",
    senderId: "user_jiuk",
    receiverId: "user_minseo",
    text: "안녕하세요 민서님! 친구 수락 감사합니다. 앞으로 여기서 실시간으로 편하게 소통해요!",
    createdAt: Date.now() - 1000 * 60 * 25,
    read: true,
    reactions: { "✨": ["user_minseo"] },
  },
];

interface DBState {
  users: UserRecord[];
  friendRequests: FriendRequestRecord[];
  messages: MessageRecord[];
}

function loadDB(): DBState {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      return {
        users: data.users || initialUsers,
        friendRequests: data.friendRequests || initialFriendRequests,
        messages: data.messages || initialMessages,
      };
    }
  } catch (err) {
    console.error("Failed to load db.json, using seed:", err);
  }
  return {
    users: [...initialUsers],
    friendRequests: [...initialFriendRequests],
    messages: [...initialMessages],
  };
}

function saveDB(state: DBState) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save db.json:", err);
  }
}

let db = loadDB();

// Helper to check if two users are accepted friends
function areFriends(userId1: string, userId2: string): boolean {
  if (userId1 === userId2) return true;
  return db.friendRequests.some(
    (fr) =>
      fr.status === "accepted" &&
      ((fr.senderId === userId1 && fr.receiverId === userId2) ||
        (fr.senderId === userId2 && fr.receiverId === userId1))
  );
}

// Helper to get normalized conversation ID for two users (sorted)
function getConversationId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  return `conv_${sorted[0]}_${sorted[1]}`;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  // Connected sockets mapped by userId -> Set<WebSocket>
  const userSockets = new Map<string, Set<WebSocket>>();

  function broadcastToUser(userId: string, data: any) {
    const sockets = userSockets.get(userId);
    if (sockets) {
      const payload = JSON.stringify(data);
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }

  function broadcastPresence() {
    const onlineUserIds = Array.from(userSockets.keys()).filter((uid) => {
      const sockets = userSockets.get(uid);
      return sockets && sockets.size > 0;
    });

    const userStatuses: Record<string, { status: UserStatusMode; dndUntil?: number | null }> = {};
    const now = Date.now();

    for (const u of db.users) {
      let currentStatus: UserStatusMode = u.status || "offline";
      // Check if DND has expired
      if (currentStatus === "dnd" && u.dndUntil && u.dndUntil < now) {
        currentStatus = onlineUserIds.includes(u.id) ? "online" : "offline";
        u.status = currentStatus;
        u.dndUntil = null;
        saveDB(db);
      }

      userStatuses[u.id] = {
        status: currentStatus,
        dndUntil: u.dndUntil,
      };
    }

    const payload = JSON.stringify({
      type: "presence:sync",
      payload: { onlineUserIds, userStatuses },
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    let currentUserId: string | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "auth") {
          currentUserId = msg.payload.userId;
          if (currentUserId) {
            if (!userSockets.has(currentUserId)) {
              userSockets.set(currentUserId, new Set());
            }
            userSockets.get(currentUserId)!.add(ws);

            // Update user lastSeen in db (keep status unless offline)
            const u = db.users.find((x) => x.id === currentUserId);
            if (u) {
              if (u.status === "offline") {
                u.status = "online";
              }
              u.lastSeen = Date.now();
              saveDB(db);
            }
            broadcastPresence();
          }
        } else if (msg.type === "typing:start" || msg.type === "typing:stop") {
          if (msg.payload?.receiverId) {
            broadcastToUser(msg.payload.receiverId, msg);
          }
        }
      } catch (e) {
        console.error("WS parse error", e);
      }
    });

    ws.on("close", () => {
      if (currentUserId) {
        const sockets = userSockets.get(currentUserId);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) {
            userSockets.delete(currentUserId);
            const u = db.users.find((x) => x.id === currentUserId);
            if (u && u.status !== "dnd") {
              u.status = "offline";
              u.lastSeen = Date.now();
              saveDB(db);
            }
          }
        }
        broadcastPresence();
      }
    });
  });

  // Periodically check expired DND timers
  setInterval(() => {
    const now = Date.now();
    let updated = false;
    for (const u of db.users) {
      if (u.status === "dnd" && u.dndUntil && u.dndUntil < now) {
        const isOnline = userSockets.has(u.id) && userSockets.get(u.id)!.size > 0;
        u.status = isOnline ? "online" : "offline";
        u.dndUntil = null;
        updated = true;
      }
    }
    if (updated) {
      saveDB(db);
      broadcastPresence();
    }
  }, 10000);

  // --- API Routes ---

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  // Check username availability
  app.get("/api/users/check", (req, res) => {
    const username = ((req.query.username as string) || "").trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ available: false, message: "아이디를 입력해주세요." });
    }
    const exists = db.users.some((u) => u.username.toLowerCase() === username);
    return res.json({ available: !exists });
  });

  // Sign up (Register)
  app.post("/api/auth/register", (req, res) => {
    const { username, name, password, avatarBg, avatarEmoji, customStatus } = req.body;

    const cleanUsername = (username || "").trim().toLowerCase();
    const cleanName = (name || "").trim();

    if (!cleanUsername || cleanUsername.length < 2) {
      return res.status(400).json({ error: "아이디는 2자 이상 입력해주세요." });
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: "아이디는 영문 소문자, 숫자, 밑줄(_), 하이픈(-), 점(.)만 사용할 수 있습니다." });
    }
    if (!cleanName) {
      return res.status(400).json({ error: "이름(닉네임)을 입력해주세요." });
    }
    if (db.users.some((u) => u.username.toLowerCase() === cleanUsername)) {
      return res.status(400).json({ error: "이미 존재하는 아이디입니다." });
    }

    const newUser: UserRecord = {
      id: `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      username: cleanUsername,
      name: cleanName,
      password: password || "password123",
      avatarBg: avatarBg || "from-blue-500 to-indigo-600",
      avatarEmoji: avatarEmoji || "💬",
      customStatus: customStatus || "새로운 회원입니다 👋",
      status: "online",
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };

    db.users.push(newUser);

    // Automatically make Minseo a friend to test right away
    db.friendRequests.push({
      id: `freq_welcome_${Date.now()}`,
      senderId: "user_minseo",
      receiverId: newUser.id,
      status: "accepted",
      createdAt: Date.now(),
    });

    const welcomeMsg: MessageRecord = {
      id: `msg_welcome_${Date.now()}`,
      conversationId: getConversationId("user_minseo", newUser.id),
      senderId: "user_minseo",
      receiverId: newUser.id,
      text: `안녕하세요 ${newUser.name}님! (@${newUser.username}) 가입을 축하드립니다 🎉 우리는 친구로 연결되었습니다. 다른 친구에게도 친구 신청을 보내보세요!`,
      createdAt: Date.now(),
      read: false,
    };
    db.messages.push(welcomeMsg);

    saveDB(db);

    const { password: _, ...safeUser } = newUser;
    return res.json({ user: safeUser, token: `token_${newUser.id}` });
  });

  // Login
  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    const cleanUsername = (username || "").trim().toLowerCase();

    const user = db.users.find((u) => u.username.toLowerCase() === cleanUsername);
    if (!user) {
      return res.status(401).json({ error: "등록되지 않은 아이디입니다." });
    }

    if (password && user.password && user.password !== password) {
      return res.status(401).json({ error: "비밀번호가 일치하지 않습니다." });
    }

    if (user.status === "offline") {
      user.status = "online";
    }
    user.lastSeen = Date.now();
    saveDB(db);

    const { password: _, ...safeUser } = user;
    return res.json({ user: safeUser, token: `token_${user.id}` });
  });

  // Get current user details
  app.get("/api/auth/me", (req, res) => {
    const userId = req.query.userId as string;
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }
    const { password: _, ...safeUser } = user;
    return res.json({ user: safeUser });
  });

  // Update profile
  app.post("/api/user/profile", (req, res) => {
    const { userId, name, avatarBg, avatarEmoji, customStatus } = req.body;
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    if (name) user.name = name.trim();
    if (avatarBg) user.avatarBg = avatarBg;
    if (avatarEmoji) user.avatarEmoji = avatarEmoji;
    if (customStatus !== undefined) user.customStatus = customStatus;

    saveDB(db);
    const { password: _, ...safeUser } = user;
    return res.json({ user: safeUser });
  });

  // Update User Status (Online, DND with duration, Offline)
  app.post("/api/user/status", (req, res) => {
    const { userId, status, dndDurationMinutes } = req.body;
    const user = db.users.find((u) => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    }

    if (status === "dnd") {
      user.status = "dnd";
      if (dndDurationMinutes && dndDurationMinutes > 0) {
        user.dndUntil = Date.now() + dndDurationMinutes * 60 * 1000;
      } else {
        user.dndUntil = null; // Indefinite until manual switch
      }
    } else if (status === "offline") {
      user.status = "offline";
      user.dndUntil = null;
    } else {
      user.status = "online";
      user.dndUntil = null;
    }

    saveDB(db);
    broadcastPresence();

    const { password: _, ...safeUser } = user;
    return res.json({ user: safeUser });
  });

  // --- Friend System Endpoints ---

  // Get accepted friends for current user
  app.get("/api/friends", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ friends: [] });

    const onlineSet = new Set(userSockets.keys());

    // Find all accepted friend relations
    const friendUserIds = db.friendRequests
      .filter(
        (fr) =>
          fr.status === "accepted" &&
          (fr.senderId === userId || fr.receiverId === userId)
      )
      .map((fr) => (fr.senderId === userId ? fr.receiverId : fr.senderId));

    const uniqueFriendIds = Array.from(new Set(friendUserIds));

    const friends = uniqueFriendIds
      .map((fid) => {
        const u = db.users.find((user) => user.id === fid);
        if (!u) return null;
        const { password: _, ...safe } = u;
        return {
          ...safe,
          isOnline: onlineSet.has(u.id),
        };
      })
      .filter(Boolean);

    return res.json({ friends });
  });

  // Get incoming & outgoing friend requests
  app.get("/api/friends/requests", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ incoming: [], outgoing: [] });

    const incoming = db.friendRequests
      .filter((fr) => fr.receiverId === userId && fr.status === "pending")
      .map((fr) => {
        const sender = db.users.find((u) => u.id === fr.senderId);
        const { password: _, ...safeSender } = sender || ({} as any);
        return {
          ...fr,
          sender: safeSender,
        };
      });

    const outgoing = db.friendRequests
      .filter((fr) => fr.senderId === userId && fr.status === "pending")
      .map((fr) => {
        const receiver = db.users.find((u) => u.id === fr.receiverId);
        const { password: _, ...safeReceiver } = receiver || ({} as any);
        return {
          ...fr,
          receiver: safeReceiver,
        };
      });

    return res.json({ incoming, outgoing });
  });

  // Send a friend request by username or ID
  app.post("/api/friends/request", (req, res) => {
    const { senderId, targetUsername, targetUserId } = req.body;

    const sender = db.users.find((u) => u.id === senderId);
    if (!sender) {
      return res.status(401).json({ error: "발신자를 찾을 수 없습니다." });
    }

    let targetUser: UserRecord | undefined;
    if (targetUserId) {
      targetUser = db.users.find((u) => u.id === targetUserId);
    } else if (targetUsername) {
      const clean = targetUsername.replace(/^@/, "").trim().toLowerCase();
      targetUser = db.users.find((u) => u.username.toLowerCase() === clean);
    }

    if (!targetUser) {
      return res.status(404).json({ error: "해당 아이디의 사용자를 찾을 수 없습니다." });
    }

    if (targetUser.id === senderId) {
      return res.status(400).json({ error: "자기 자신에게는 친구 요청을 보낼 수 없습니다." });
    }

    // Check if already friends
    if (areFriends(senderId, targetUser.id)) {
      return res.status(400).json({ error: "이미 친구로 등록된 사용자입니다." });
    }

    // Check if pending request already exists
    const existingReq = db.friendRequests.find(
      (fr) =>
        fr.status === "pending" &&
        ((fr.senderId === senderId && fr.receiverId === targetUser.id) ||
          (fr.senderId === targetUser.id && fr.receiverId === senderId))
    );

    if (existingReq) {
      if (existingReq.senderId === targetUser.id) {
        // If target already sent a request to sender, auto-accept it!
        existingReq.status = "accepted";
        saveDB(db);

        const { password: _, ...safeSender } = sender;
        const { password: __, ...safeTarget } = targetUser;

        const payload = {
          type: "friend:response",
          payload: { request: existingReq, accepted: true },
        };
        broadcastToUser(senderId, payload);
        broadcastToUser(targetUser.id, payload);

        return res.json({ message: "상대방의 요청을 수락하여 친구가 되었습니다!", request: existingReq, autoAccepted: true });
      }
      return res.status(400).json({ error: "이미 친구 요청을 보냈거나 대기 중입니다." });
    }

    const newReq: FriendRequestRecord = {
      id: `freq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId,
      receiverId: targetUser.id,
      status: "pending",
      createdAt: Date.now(),
    };

    db.friendRequests.push(newReq);
    saveDB(db);

    const { password: _, ...safeSender } = sender;
    const { password: __, ...safeTarget } = targetUser;

    const populatedReq = {
      ...newReq,
      sender: safeSender,
      receiver: safeTarget,
    };

    // Notify receiver in real-time
    broadcastToUser(targetUser.id, {
      type: "friend:request",
      payload: { request: populatedReq },
    });

    return res.json({ message: `@${targetUser.username} 님에게 친구 요청을 보냈습니다.`, request: populatedReq });
  });

  // Respond to friend request (Accept or Reject)
  app.post("/api/friends/respond", (req, res) => {
    const { requestId, userId, accept } = req.body;

    const request = db.friendRequests.find((fr) => fr.id === requestId);
    if (!request) {
      return res.status(404).json({ error: "친구 요청을 찾을 수 없습니다." });
    }

    if (request.receiverId !== userId) {
      return res.status(403).json({ error: "요청을 처리할 권한이 없습니다." });
    }

    request.status = accept ? "accepted" : "rejected";
    saveDB(db);

    const sender = db.users.find((u) => u.id === request.senderId);
    const receiver = db.users.find((u) => u.id === request.receiverId);

    const populatedReq = {
      ...request,
      sender: sender ? (({ password: _, ...safe }) => safe)(sender) : undefined,
      receiver: receiver ? (({ password: _, ...safe }) => safe)(receiver) : undefined,
    };

    const wsPayload = {
      type: "friend:response",
      payload: { request: populatedReq, accepted: accept },
    };

    broadcastToUser(request.senderId, wsPayload);
    broadcastToUser(request.receiverId, wsPayload);

    return res.json({ request: populatedReq, accepted: accept });
  });

  // Search users to add as friend
  app.get("/api/users/search", (req, res) => {
    const query = ((req.query.q as string) || "").trim().toLowerCase();
    const currentUserId = req.query.currentUserId as string;
    const onlineSet = new Set(userSockets.keys());

    const results = db.users
      .filter((u) => {
        if (u.id === currentUserId) return false;
        if (!query) return true;
        return (
          u.username.toLowerCase().includes(query) ||
          u.name.toLowerCase().includes(query) ||
          (u.customStatus && u.customStatus.toLowerCase().includes(query))
        );
      })
      .map((u) => {
        const { password: _, ...safe } = u;
        const isFriend = areFriends(currentUserId, u.id);
        const hasPendingRequest = db.friendRequests.some(
          (fr) =>
            fr.status === "pending" &&
            ((fr.senderId === currentUserId && fr.receiverId === u.id) ||
              (fr.senderId === u.id && fr.receiverId === currentUserId))
        );

        return {
          ...safe,
          isOnline: onlineSet.has(u.id),
          isFriend,
          hasPendingRequest,
        };
      });

    return res.json({ users: results });
  });

  // Get conversations for user (Only with Friends)
  app.get("/api/conversations", (req, res) => {
    const userId = req.query.userId as string;
    if (!userId) return res.json({ conversations: [] });

    const onlineSet = new Set(userSockets.keys());

    // Find all distinct other participants
    const userConvs = new Map<
      string,
      { otherUserId: string; conversationId: string; lastMessage?: MessageRecord; unreadCount: number; updatedAt: number }
    >();

    for (const msg of db.messages) {
      if (msg.senderId === userId || msg.receiverId === userId) {
        const otherUserId = msg.senderId === userId ? msg.receiverId : msg.senderId;
        
        // Only include if they are accepted friends
        if (!areFriends(userId, otherUserId)) {
          continue;
        }

        const convId = msg.conversationId;

        if (!userConvs.has(convId)) {
          userConvs.set(convId, {
            otherUserId,
            conversationId: convId,
            unreadCount: 0,
            updatedAt: msg.createdAt,
          });
        }

        const item = userConvs.get(convId)!;
        if (!item.lastMessage || msg.createdAt > item.lastMessage.createdAt) {
          item.lastMessage = msg;
          item.updatedAt = msg.createdAt;
        }
        if (msg.receiverId === userId && !msg.read) {
          item.unreadCount += 1;
        }
      }
    }

    const conversations = Array.from(userConvs.values())
      .map((item) => {
        const other = db.users.find((u) => u.id === item.otherUserId);
        if (!other) return null;
        const { password: _, ...safeOther } = other;
        return {
          id: item.conversationId,
          participantIds: [userId, item.otherUserId],
          otherUser: {
            ...safeOther,
            isOnline: onlineSet.has(other.id),
          },
          lastMessage: item.lastMessage,
          unreadCount: item.unreadCount,
          updatedAt: item.updatedAt,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.updatedAt || 0) - (a?.updatedAt || 0));

    return res.json({ conversations });
  });

  // Get messages for conversation (Check friend relationship)
  app.get("/api/messages", (req, res) => {
    const conversationId = req.query.conversationId as string;
    const userId = req.query.userId as string;

    if (!conversationId) {
      return res.status(400).json({ error: "conversationId is required" });
    }

    const parts = conversationId.replace("conv_", "").split("_");
    const otherId = parts.find((p) => p !== userId);

    if (otherId && !areFriends(userId, otherId)) {
      return res.status(403).json({ error: "친구 사이에서만 대화 내역을 조회할 수 있습니다.", notFriends: true });
    }

    // Mark unread messages sent to current user as read
    let updated = false;
    db.messages.forEach((m) => {
      if (m.conversationId === conversationId && m.receiverId === userId && !m.read) {
        m.read = true;
        updated = true;
      }
    });

    if (updated) {
      saveDB(db);
      if (otherId) {
        broadcastToUser(otherId, {
          type: "message:read",
          payload: { conversationId, readerId: userId },
        });
      }
    }

    const messages = db.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt);

    return res.json({ messages });
  });

  // Send message (Only allowed between accepted Friends)
  app.post("/api/messages/send", (req, res) => {
    const { senderId, receiverId, text, replyTo, attachment } = req.body;

    if (!senderId || !receiverId) {
      return res.status(400).json({ error: "senderId and receiverId are required" });
    }

    if (!areFriends(senderId, receiverId)) {
      return res.status(403).json({
        error: "상대방과 친구가 되어야만 대화를 나눌 수 있습니다. 먼저 친구 요청을 보내주세요!",
        notFriends: true,
      });
    }

    if (!text && !attachment) {
      return res.status(400).json({ error: "메시지 내용이나 첨부파일을 입력해주세요." });
    }

    const conversationId = getConversationId(senderId, receiverId);

    const newMsg: MessageRecord = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      conversationId,
      senderId,
      receiverId,
      text: (text || "").trim(),
      createdAt: Date.now(),
      read: false,
      replyTo,
      attachment,
    };

    db.messages.push(newMsg);
    saveDB(db);

    const wsPayload = {
      type: "message:new",
      payload: { message: newMsg },
    };

    // Broadcast to receiver & sender
    broadcastToUser(receiverId, wsPayload);
    broadcastToUser(senderId, wsPayload);

    return res.json({ message: newMsg });
  });

  // React to message
  app.post("/api/messages/react", (req, res) => {
    const { messageId, emoji, userId } = req.body;
    const msg = db.messages.find((m) => m.id === messageId);
    if (!msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (!msg.reactions) {
      msg.reactions = {};
    }

    if (!msg.reactions[emoji]) {
      msg.reactions[emoji] = [];
    }

    const userList = msg.reactions[emoji];
    const idx = userList.indexOf(userId);
    let action: 'add' | 'remove' = 'add';

    if (idx >= 0) {
      userList.splice(idx, 1);
      if (userList.length === 0) {
        delete msg.reactions[emoji];
      }
      action = 'remove';
    } else {
      userList.push(userId);
      action = 'add';
    }

    saveDB(db);

    const wsPayload = {
      type: "message:react",
      payload: {
        messageId,
        conversationId: msg.conversationId,
        emoji,
        userId,
        action,
      },
    };

    broadcastToUser(msg.senderId, wsPayload);
    broadcastToUser(msg.receiverId, wsPayload);

    return res.json({ reactions: msg.reactions });
  });

  // Vite middleware for development vs static production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`ID Messenger Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
