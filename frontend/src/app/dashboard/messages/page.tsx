"use client"

import { MoreVertical, Paperclip, Search, Send } from "lucide-react";
import { useState } from "react";

const conversations = [
  { id: 1, name: "Dr. Emily Smith", role: "Cardiology", lastMessage: "Patient files have been updated", time: "10:30 AM", unread: 2, online: true },
  { id: 2, name: "Sarah Johnson", role: "Patient", lastMessage: "Thank you for the appointment", time: "9:45 AM", unread: 0, online: false },
  {
    id: 3, name: "Dr. Michael Williams", role: "Pediatrics",
    lastMessage: "Can we schedule a team meeting?", time: "Yesterday", unread: 1, online: true
  },
  {
    id: 4, name: "Mike Chen", role: "Patient", lastMessage: "I have a question about my prescription", time: "Yesterday", unread: 0, online: false
  },
  { id: 5, name: "Nursing team", role: "Group", lastMessage: "Shift schedule for next week", time: "2 days ago", unread: 5, online: true },
];

const messages = [
  { id: 1, sender: "Dr. Emily Smith", content: "Hi, I've reviewed the patient files you sent", time: "10:25 AM", isOwn: false },
  {
    id: 2, sender: "You", content: "Great! Did you find any concerns?",
    time: "10:27 AM", isOwn: true
  },
  { id: 3, sender: "Dr. Emily Smith", content: "Everything looks good. I've made some notes in the system.", time: "10:28 AM", isOwn: false },
  { id: 4, sender: "Dr. Emily Smith", content: "Patient files have been updated", time: "10:30 AM", isOwn: false },
];

export default function Messages() {
  const [selectedChat, setSelectedChat] = useState(conversations[0]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-gray-900">Messages</h1>
        <p className="text-gray-600 mt-1">Communicate with staff and patients</p>
      </div>

      {/* Messages Interface */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-[calc(100vh-240px)]">
        <div className="grid grid-cols-1 md:grid-cols-3 h-full">
          {/* Conversation List */}
          <div className="border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-4 py-2">
                <Search className="w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  className="bg-transparent border-none outline-none flex-1 text-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedChat(conv)}
                  className={`p-4 border-b border-gray-100 cursor-pointer transition-colors ${selectedChat.id === conv.id ? "bg-cyan-50" : "hover:bg-gray-50"
                    }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className="w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white">
                        {conv.name
                          .split(" ")
                          .map(n => n?.[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                      {conv.online && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-gray-900 truncate">{conv.name}</p>
                        <span className="text-xs text-gray-500">{conv.time}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{conv.role}</p>
                      <p className="text-sm text-gray-600 mt-1 truncate"
                      >{conv.lastMessage}</p>
                    </div>
                    {conv.unread > 0 && (
                      <div className="w-5 h-5 bg-cyan-600 text-white rounded-full flex items-center justify-center text-xs">{conv.unread}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Chat Area */}
          <div className="md:col-span-2 flex flex-col">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full flex items-center justify-center text-white">
                    {selectedChat.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  {selectedChat.online && (
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full" />
                  )}
                </div>
                <div>
                  <p className="text-gray-900">{selectedChat.name}</p>
                  <p className="text-sm text-gray-600">{selectedChat.role}</p>
                </div>
              </div>
              <button className="p-2 rounded-lg hover:bg-gray-100">
                <MoreVertical className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Message */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.isOwn ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[70%] break-words ${msg.isOwn ? "order-2" : "order-1"} `}>{!msg.isOwn && (
                    <p className="text-xs text-gray-600 mb-1">{msg.sender}</p>
                  )}
                    <div
                      className={`rounded-lg p-3 ${msg.isOwn
                        ? "bg-cyan-600 text-white"
                        : "bg-gray-100 text-gray-900"
                        }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{msg.time}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex items-end gap-2">
                <button className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
                  <Paperclip className="w-5 h-5" />
                </button>
                <div className="flex-1 bg-gray-100 rounded-lg px-4 py-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    className="w-full bg-transparent border-none outline-none text-sm"
                  />
                </div>
                <button className="p-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}