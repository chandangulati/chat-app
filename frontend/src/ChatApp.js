import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import "./ChatApp.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:3002";

function ChatApp() {
  const [socket, setSocket] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [roomUsers, setRoomUsers] = useState([]);
  const [isJoined, setIsJoined] = useState(false);
  const messagesEndRef = useRef(null);

  // 🔌 Connect to backend
  useEffect(() => {
    const newSocket = io(BACKEND_URL);

    newSocket.on("connect", () => {
      console.log("✅ Connected to backend");
    });

    newSocket.on("room message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    newSocket.on("room users", (users) => {
      setRoomUsers(users);
    });

    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 👤 Save Name
  const saveProfile = () => {
    if (socket && displayName.trim()) {
      socket.emit("user joined", { name: displayName });
      alert("✅ Profile Saved!");
    } else {
      alert("Please enter a valid display name.");
    }
  };

  // 🚪 Join Room
  const joinRoom = () => {
    if (socket && roomCode && displayName) {
      socket.emit("join room", { roomCode });
      setMessages([]);
      setIsJoined(true);
    } else {
      alert("⚠️ Please save your profile name and enter a room code first.");
    }
  };

  // 🚪 Leave Room
  const leaveRoom = () => {
    setIsJoined(false);
    setRoomCode("");
    setMessages([]);
  };

  // 📨 Send Message
  const sendMessage = () => {
    if (socket && messageInput.trim()) {
      socket.emit("room message", {
        text: messageInput,
      });
      setMessageInput("");
    }
  };

  if (!isJoined) {
    return (
      <div className="chat-container" style={{ background: '#f5f5f5', alignItems: 'center' }}>
        <div className="profile-card">
          <div className="header-banner">
            <h2>REAL-TIME CO-OP</h2>
            <h1>Nexus Chat</h1>
            <p>Connect instantly with your friends and team in secure chat rooms.</p>
          </div>

          <div className="profile-section">
            <div className="avatar">
              {displayName ? displayName.charAt(0).toUpperCase() : "?"}
            </div>
            <div className="profile-content">
              <h3>Your Profile</h3>
              <p>Set a display name before joining a chat room.</p>
              <label>DISPLAY NAME</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name..."
              />
              <button className="save-btn" onClick={saveProfile}>Save Profile</button>
            </div>
          </div>

          <div className="room-section">
            <h4>Join a Room</h4>
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="Enter Room Code (e.g. dev-team)"
            />
            <div className="button-group">
              <button className="join-btn" onClick={joinRoom}>Join Room</button>
            </div>
            <p className="share-info">Share your room code with others to start talking: <strong>{roomCode || '---'}</strong></p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {/* LEFT SIDEBAR */}
      <div style={{ width: "320px", background: "white", borderRight: "1px solid #e0e0e0", display: "flex", flexDirection: "column" }}>
        <div className="room-header">
          <h2>Nexus Chat</h2>
          <div className="room-status" style={{ marginBottom: 0 }}>Room: <strong>{roomCode}</strong></div>
        </div>
        
        <div className="users-list" style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
          <h3 style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>Online Users ({roomUsers.length})</h3>
          {roomUsers.map((u) => (
            <div className="user-item" key={u.id}>
              <div 
                className="user-avatar" 
                style={{ 
                  background: u.name === displayName ? "#2d8e7d" : "#c8e6c9", 
                  color: u.name === displayName ? "white" : "#2d8e7d" 
                }}
              >
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <strong>{u.name} {u.name === displayName ? "(You)" : ""}</strong>
                <p>Online</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '20px', borderTop: '1px solid #e0e0e0' }}>
           <button className="open-btn" style={{ width: '100%', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }} onClick={leaveRoom}>
             ← Leave Room
           </button>
        </div>
      </div>

      {/* RIGHT MAIN CHAT */}
      <div className="room-chat" style={{ flex: 1, width: 'auto' }}>
        <div className="messages-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: '5px' }}>
             <h3>Chat Messages</h3>
             <span className="room-status" style={{ marginBottom: 0 }}>🟢 Live</span>
          </div>
          
          <div className="messages-list">
             {messages.length === 0 ? (
               <div style={{ textAlign: 'center', color: '#999', marginTop: '40px', background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
                  <p>Welcome to <strong>{roomCode}</strong>!</p>
                  <p style={{ fontSize: '13px', marginTop: '5px' }}>Be the first to say hello.</p>
               </div>
            ) : (
                messages.map((msg, index) => {
                  const isMe = msg.sender === displayName;
                  return (
                    <div 
                      key={index} 
                      className="message" 
                      style={{ 
                        marginLeft: isMe ? 'auto' : '0',
                        marginRight: isMe ? '0' : 'auto',
                        maxWidth: '80%',
                        background: isMe ? '#e8f5e9' : 'white',
                        borderColor: isMe ? '#c8e6c9' : '#e0e0e0',
                        borderBottomRightRadius: isMe ? '2px' : '8px',
                        borderBottomLeftRadius: !isMe ? '2px' : '8px',
                      }}
                    >
                      <strong style={{ color: isMe ? '#2d8e7d' : '#333' }}>{isMe ? "You" : msg.sender}</strong>
                      <p>{msg.text}</p>
                    </div>
                  );
                })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="quick-replies">
          <button onClick={() => setMessageInput("Hello everyone! 👋")}>Hello everyone! 👋</button>
          <button onClick={() => setMessageInput("How is everyone doing?")}>How is everyone doing?</button>
          <button onClick={() => setMessageInput("I agree! 👍")}>I agree! 👍</button>
          <button onClick={() => setMessageInput("Be right back ⏳")}>Be right back ⏳</button>
        </div>

        <div className="message-input-area">
          <textarea
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type your message... (Press Enter to send)"
          />
          <div className="input-buttons">
            <button className="clear-btn" onClick={() => setMessageInput("")}>Clear</button>
            <button className="send-btn" onClick={sendMessage}>Send Message 🚀</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatApp;