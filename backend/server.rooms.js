console.log("[DEBUG] Starting backend server.rooms.js...");
try {
  const path = require("path");
  const express = require("express");
  const http = require("http");
  const { Server } = require("socket.io");
  const cors = require("cors");

  const app = express();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: "*",
    },
  });

  const users = new Map();
  const rooms = new Map();
  const directThreads = new Map();
  const roomTyping = new Map();
  const privateTyping = new Map();

  const normalizeRoomCode = (value) => (value || "LOBBY").trim().toUpperCase().slice(0, 12);

  const createMessage = ({
    sender = "Anonymous",
    text = "",
    type = "message",
    scope = "room",
    roomCode = null,
  }) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sender,
    text,
    type,
    scope,
    roomCode,
    timestamp: new Date().toISOString(),
  });

  const pushLimited = (collection, item, limit = 100) => {
    collection.push(item);

    if (collection.length > limit) {
      collection.shift();
    }
  };

  const getThreadKey = (first, second) => [first, second].sort().join(":");

  const getOrCreateRoom = (roomCode) => {
    const code = normalizeRoomCode(roomCode);

    if (!rooms.has(code)) {
      rooms.set(code, {
        code,
        members: new Set(),
        messages: [],
      });
    }

    return rooms.get(code);
  };

  const emitRoomUsers = (roomCode) => {
    if (!roomCode || !rooms.has(roomCode)) {
      return;
    }

    const room = rooms.get(roomCode);
    const members = Array.from(room.members)
      .map((socketId) => {
        const user = users.get(socketId);

        if (!user) {
          return null;
        }

        return {
          id: socketId,
          name: user.name,
          roomCode: user.roomCode,
        };
      })
      .filter(Boolean);

    io.to(roomCode).emit("room users", members);
  };

  const emitRoomTyping = (roomCode) => {
    const typingMap = roomTyping.get(roomCode) || new Map();
    io.to(roomCode).emit("room typing", Array.from(typingMap.values()));
  };

  const emitPrivateTyping = (socketId, partnerId) => {
    const threadKey = getThreadKey(socketId, partnerId);
    const typingMap = privateTyping.get(threadKey) || new Map();

    [socketId, partnerId].forEach((participantId) => {
      const otherUsers = Array.from(typingMap.entries())
        .filter(([id]) => id !== participantId)
        .map(([, name]) => name);

      io.to(participantId).emit("private typing", {
        partnerId: participantId === socketId ? partnerId : socketId,
        users: otherUsers,
      });
    });
  };

  const clearTypingForSocket = (socketId) => {
    const user = users.get(socketId);

    if (user?.roomCode && roomTyping.has(user.roomCode)) {
      roomTyping.get(user.roomCode).delete(socketId);
      emitRoomTyping(user.roomCode);
    }

    for (const [threadKey, typingMap] of privateTyping.entries()) {
      if (typingMap.delete(socketId)) {
        const [first, second] = threadKey.split(":");
        emitPrivateTyping(first, second);
      }
    }
  };

  const joinRoom = (socket, requestedRoomCode, announceJoin = true) => {
    const user = users.get(socket.id);

    if (!user) {
      return;
    }

    const nextRoomCode = normalizeRoomCode(requestedRoomCode);
    const previousRoomCode = user.roomCode;

    if (previousRoomCode === nextRoomCode) {
      const room = getOrCreateRoom(nextRoomCode);
      socket.emit("room joined", {
        roomCode: nextRoomCode,
        messages: room.messages,
      });
      emitRoomUsers(nextRoomCode);
      emitRoomTyping(nextRoomCode);
      return;
    }

    if (previousRoomCode) {
      socket.leave(previousRoomCode);

      if (rooms.has(previousRoomCode)) {
        const previousRoom = rooms.get(previousRoomCode);
        previousRoom.members.delete(socket.id);

        const leaveMessage = createMessage({
          sender: "System",
          text: `${user.name} left room ${previousRoomCode}.`,
          type: "system",
          roomCode: previousRoomCode,
        });

        pushLimited(previousRoom.messages, leaveMessage);
        io.to(previousRoomCode).emit("room message", leaveMessage);
        emitRoomUsers(previousRoomCode);
      }
    }

    const room = getOrCreateRoom(nextRoomCode);
    room.members.add(socket.id);
    user.roomCode = nextRoomCode;
    socket.join(nextRoomCode);

    if (announceJoin) {
      const joinMessage = createMessage({
        sender: "System",
        text: `${user.name} joined room ${nextRoomCode}.`,
        type: "system",
        roomCode: nextRoomCode,
      });

      pushLimited(room.messages, joinMessage);
      io.to(nextRoomCode).emit("room message", joinMessage);
    }

    socket.emit("room joined", {
      roomCode: nextRoomCode,
      messages: room.messages,
    });
    emitRoomUsers(nextRoomCode);
    emitRoomTyping(nextRoomCode);
  };

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      users: users.size,
      rooms: Array.from(rooms.keys()),
    });
  });

  const frontendBuildPath = path.resolve(__dirname, "../frontend/build");
  app.use(express.static(frontendBuildPath));

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    users.set(socket.id, {
      id: socket.id,
      name: "Anonymous",
      roomCode: null,
    });

    socket.emit("session ready", {
      socketId: socket.id,
      defaultRoomCode: "LOBBY",
    });

    socket.on("user joined", ({ name, roomCode }) => {
      const user = users.get(socket.id);

      if (!user) {
        return;
      }

      const nextName = name?.trim() || "Anonymous";
      const previousName = user.name;
      const renamed = previousName !== nextName;

      user.name = nextName;

      if (renamed && user.roomCode && rooms.has(user.roomCode)) {
        const room = rooms.get(user.roomCode);
        const renameMessage = createMessage({
          sender: "System",
          text: `${previousName} is now chatting as ${nextName}.`,
          type: "system",
          roomCode: user.roomCode,
        });

        pushLimited(room.messages, renameMessage);
        io.to(user.roomCode).emit("room message", renameMessage);
      }

      joinRoom(socket, roomCode || user.roomCode || "LOBBY", !user.roomCode);
    });

    socket.on("join room", ({ roomCode }) => {
      joinRoom(socket, roomCode, true);
    });

    socket.on("load private thread", ({ partnerId }) => {
      const threadKey = getThreadKey(socket.id, partnerId);
      socket.emit("private thread", {
        partnerId,
        messages: directThreads.get(threadKey) || [],
      });
    });

    socket.on("typing", ({ scope, partnerId, isTyping }) => {
      const user = users.get(socket.id);

      if (!user) {
        return;
      }

      if (scope === "private" && partnerId) {
        const threadKey = getThreadKey(socket.id, partnerId);

        if (!privateTyping.has(threadKey)) {
          privateTyping.set(threadKey, new Map());
        }

        const typingMap = privateTyping.get(threadKey);

        if (isTyping) {
          typingMap.set(socket.id, user.name);
        } else {
          typingMap.delete(socket.id);
        }

        emitPrivateTyping(socket.id, partnerId);
        return;
      }

      if (!user.roomCode) {
        return;
      }

      if (!roomTyping.has(user.roomCode)) {
        roomTyping.set(user.roomCode, new Map());
      }

      const typingMap = roomTyping.get(user.roomCode);

      if (isTyping) {
        typingMap.set(socket.id, user.name);
      } else {
        typingMap.delete(socket.id);
      }

      emitRoomTyping(user.roomCode);
    });

    socket.on("room message", ({ text }) => {
      const user = users.get(socket.id);

      if (!user || !user.roomCode || !text?.trim()) {
        return;
      }

      clearTypingForSocket(socket.id);

      const room = getOrCreateRoom(user.roomCode);
      const payload = createMessage({
        sender: user.name,
        text: text.trim(),
        type: "message",
        scope: "room",
        roomCode: user.roomCode,
      });

      pushLimited(room.messages, payload);
      io.to(user.roomCode).emit("room message", payload);
    });

    socket.on("private message", ({ text, recipientId }) => {
      const user = users.get(socket.id);

      if (!user || !recipientId || !users.has(recipientId) || !text?.trim()) {
        return;
      }

      clearTypingForSocket(socket.id);

      const threadKey = getThreadKey(socket.id, recipientId);

      if (!directThreads.has(threadKey)) {
        directThreads.set(threadKey, []);
      }

      const payload = createMessage({
        sender: user.name,
        text: text.trim(),
        type: "message",
        scope: "private",
      });

      pushLimited(directThreads.get(threadKey), payload);

      [socket.id, recipientId].forEach((participantId) => {
        io.to(participantId).emit("private message", {
          partnerId: participantId === socket.id ? recipientId : socket.id,
          message: payload,
        });
      });
    });

    socket.on("disconnect", () => {
      const user = users.get(socket.id);

      if (!user) {
        return;
      }

      clearTypingForSocket(socket.id);

      if (user.roomCode && rooms.has(user.roomCode)) {
        const room = rooms.get(user.roomCode);
        room.members.delete(socket.id);

        const leaveMessage = createMessage({
          sender: "System",
          text: `${user.name} left room ${user.roomCode}.`,
          type: "system",
          roomCode: user.roomCode,
        });

        pushLimited(room.messages, leaveMessage);
        io.to(user.roomCode).emit("room message", leaveMessage);
        emitRoomUsers(user.roomCode);
      }

      users.delete(socket.id);
      console.log("User disconnected:", socket.id);
    });
  });

  const PORT = process.env.PORT || 49152;

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/socket.io")) {
      next();
      return;
    }

    res.sendFile(path.join(frontendBuildPath, "index.html"), (error) => {
      if (error) {
        next();
      }
    });
  });

  server.listen(PORT, () => {
    console.log("Server running on port", PORT);
  });
} catch (err) {
  console.error("[ERROR] Backend failed to start:", err);
}
