'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import Image from 'next/image';
import Navbar from "../Components/Navbar";
import RequireAuth from "@/app/Components/RequireAuth";
import { db, storage } from "@/app/Firebase/firebase";
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { v4 as uuidv4 } from "uuid";
import { getAuth } from "firebase/auth";
import { recordActivityLog } from "@/app/Components/recordActivityLog";

type Preview = {
  type: 'image' | 'file';
  src: string;
  name?: string;
  file?: File;
};
type ChatMessage = {
  id?: string;
  nickname: string;
  text?: string | null;
  file?: Preview[] | null;
  sender: string;
  time: string;
  userPhoto?: string | null;
  createdAt?: Timestamp;
};

const auth = getAuth();

function ChatContent({ user }: { user: User }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [, setAuthUser] = useState<User | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const hasLoggedLoadRef = useRef(false);

  // Simple authentication and activity logging - INTEGRATED
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      if (currentUser) {
        setAuthUser(currentUser);

        try {
          // Log page access with specific page name
          await recordActivityLog({
            action: "View Page",
            details: "User accessed the Community Chat page",
            userId: currentUser.uid,
            userEmail: currentUser.email || undefined,
            category: "user",
          });
          console.log('✅ Page visit logged for Community Chat page');
        } catch (error) {
          console.error('❌ Error logging page visit:', error);
        }
      } else {
        setAuthUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load messages in real-time
  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs.map((doc) => {
        const data = doc.data() as ChatMessage;
        return { id: doc.id, ...data };
      });
      setMessages(msgs);

      if (!hasLoggedLoadRef.current && msgs.length > 0) {
        hasLoggedLoadRef.current = true;
        recordActivityLog({
          action: 'Load Chat Messages',
          details: `Loaded ${msgs.length} chat messages`,
          userId: user.uid,
          userEmail: user.email || undefined,
          category: 'chat',
        });
      }
    });
    return () => unsub();
  }, [user.uid, user.email]);

  // Auto-expand textarea
  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
  }, [text]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setPreview((prev) => [
            ...prev,
            { type: 'image', src: reader.result as string, name: file.name, file },
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        setPreview((prev) => [
          ...prev,
          { type: 'file', src: '', name: file.name, file },
        ]);
      }
    });

    await recordActivityLog({
      action: 'Attach Files',
      details: `Attached ${files.length} file(s) to chat message`,
      userId: user.uid,
      userEmail: user.email || undefined,
      category: 'chat',
    });

    e.currentTarget.value = '';
  };

  const removePreview = async (index: number) => {
    const removedFile = preview[index];
    setPreview(preview.filter((_, i) => i !== index));

    await recordActivityLog({
      action: 'Remove File Attachment',
      details: `Removed file attachment: ${removedFile.name}`,
      userId: user.uid,
      userEmail: user.email || undefined,
      category: 'chat',
    });
  };

  const generateProfilePicture = (email: string) => {
    const colors = [
      'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
      'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
    ];
    const colorIndex = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    const initial = email.charAt(0).toUpperCase();
    return { color: colors[colorIndex], initial };
  };

  const send = async () => {
    if (!text.trim() && preview.length === 0) return;

    const uploadedFiles: Preview[] = [];

    // Upload files to Firebase Storage
    for (const f of preview) {
      if (f.file) {
        try {
          const fileRef = ref(storage, `chat/${uuidv4()}-${f.name}`);
          await uploadBytes(fileRef, f.file);
          const url = await getDownloadURL(fileRef);
          uploadedFiles.push({ type: f.type, src: url, name: f.name });
        } catch (error) {
          console.error('Error uploading file:', error);
          await recordActivityLog({
            action: 'File Upload Error',
            details: `Failed to upload file: ${f.name} - ${error}`,
            userId: user.uid,
            userEmail: user.email || undefined,
            category: 'chat',
            severity: 'medium',
          });
        }
      }
    }

    try {
      const messageData = {
        nickname: user.email || "Anonymous",
        text: text.trim() || null,
        file: uploadedFiles.length > 0 ? uploadedFiles : null,
        sender: user.uid,
        userPhoto: user.photoURL || null,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, "messages"), messageData);

      // Notify all users about new chat message
      await addDoc(collection(db, "notifications"), {
        userId: "all",
        type: "chat",
        title: "New Community Chat Message",
        body: `${user.email || "Someone"} sent a new message.`,
        createdAt: serverTimestamp(),
        read: false,
      });

      await recordActivityLog({
        action: 'Send Message',
        details: `Sent chat message${text.trim() ? ` with text` : ''}${uploadedFiles.length > 0 ? ` and ${uploadedFiles.length} file(s)` : ''}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'chat',
      });

      setText('');
      setPreview([]);
    } catch (error) {
      console.error('Error sending message:', error);

      await addDoc(collection(db, "notifications"), {
        userId: user.uid,
        type: "error", 
        title: "Message Failed",
        body: `Failed to send message. Please try again.`,
        createdAt: serverTimestamp(),
        read: false,
      });

      await recordActivityLog({
        action: 'Send Message Error',
        details: `Failed to send chat message: ${error}`,
        userId: user.uid,
        userEmail: user.email || undefined,
        category: 'chat',
        severity: 'medium',
      });
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      send();
    } else if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      setText((t) => t + '\n');
    }
  };

  const openModal = async (image: string) => {
    setSelectedImage(image);
    setModalOpen(true);

    await recordActivityLog({
      action: 'View Image',
      details: 'Opened image in modal view',
      userId: user.uid,
      userEmail: user.email || undefined,
      category: 'chat',
    });
  };

  const closeModal = async () => {
    setModalOpen(false);
    setSelectedImage(null);

    await recordActivityLog({
      action: 'Close Image Modal',
      details: 'Closed image modal view',
      userId: user.uid,
      userEmail: user.email || undefined,
      category: 'chat',
    });
  };

  const downloadImage = async (src: string, name?: string) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = name || 'image';
    link.target = '_blank';
    link.click();

    await addDoc(collection(db, "notifications"), {
      userId: user.uid,
      type: "success",
      title: "Image Downloaded", 
      body: `Downloaded image: ${name || 'image'}`,
      createdAt: serverTimestamp(),
      read: false,
    });

    await recordActivityLog({
      action: 'Download Image',
      details: `Downloaded image: ${name || 'image'}`,
      userId: user.uid,
      userEmail: user.email || undefined,
      category: 'chat',
    });
  };

  const toggleInfo = async () => {
    const newState = !infoOpen;
    setInfoOpen(newState);

    await recordActivityLog({
      action: newState ? 'Open Chat Info' : 'Close Chat Info',
      details: `${newState ? 'Opened' : 'Closed'} chat information sidebar`,
      userId: user.uid,
      userEmail: user.email || undefined,
      category: 'chat',
    });
  };

  return (
    <div className="flex min-h-screen bg-[#e7f0fa]">
      <div className="ml-[260px] flex-1 flex">
        <div className={`flex flex-col ${infoOpen ? 'w-[calc(100%-18rem)]' : 'w-full'}`}>
          {/* Header */}
          <div className="sticky top-0 z-20 bg-white border-b">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 relative">
                  <Image
                    src="/CommunityGroupIcon.png"
                    alt="SK Community Group"
                    fill
                    className="object-cover rounded-full"
                  />
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-800">
                    SK Community Group
                  </div>
                  <div className="text-sm text-gray-500">
                    A Safe Space for SK Constituents
                  </div>
                </div>
              </div>

              <button
                onClick={toggleInfo}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-300 hover:bg-gray-400 text-gray-600 transition-colors"
                aria-label="Toggle info sidebar"
              >
                i
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 px-4 py-4 overflow-y-auto max-h-[calc(100vh-160px)]">
            <div className="flex flex-col gap-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message) => {
                  const isCurrentUser = message.sender === user.uid;
                  const profileData = generateProfilePicture(message.nickname);

                  return (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      {/* Profile Picture */}
                      <div className="flex-shrink-0">
                        {message.userPhoto ? (
                          <div className="w-8 h-8 relative">
                            <Image
                              src={message.userPhoto}
                              alt={message.nickname}
                              fill
                              className="object-cover rounded-full"
                            />
                          </div>
                        ) : (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${profileData.color}`}>
                            {profileData.initial}
                          </div>
                        )}
                      </div>

                      {/* Message Content */}
                      <div className={`flex flex-col max-w-[70%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                        <div className={`flex items-center gap-2 mb-1 ${isCurrentUser ? 'flex-row-reverse' : 'flex-row'}`}>
                          <span className="text-xs text-gray-500 font-medium">{message.nickname}</span>
                          <span className="text-xs text-gray-400">{message.time}</span>
                        </div>

                        {/* Files/Images */}
                        {message.file &&
                          message.file.map((file, index) =>
                            file.type === 'image' ? (
                              <div
                                key={index}
                                className="relative rounded-md max-w-[200px] max-h-[200px] mb-2 cursor-pointer overflow-hidden hover:opacity-90 transition-opacity"
                                onClick={() => openModal(file.src)}
                              >
                                <Image
                                  src={file.src}
                                  alt={file.name || 'image'}
                                  width={200}
                                  height={200}
                                  className="rounded-md object-cover"
                                />
                              </div>
                            ) : (
                              <a
                                key={index}
                                href={file.src}
                                download={file.name}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-3 rounded-md bg-gray-100 text-gray-700 inline-flex items-center gap-2 mb-2 hover:bg-gray-200 transition-colors"
                                onClick={async () => {
                                  await recordActivityLog({
                                    action: 'Download File',
                                    details: `Downloaded file: ${file.name}`,
                                    userId: user.uid,
                                    userEmail: user.email || undefined,
                                    category: 'chat',
                                  });
                                }}
                              >
                                <span>📄</span>
                                <span className="text-sm">{file.name}</span>
                              </a>
                            )
                          )}

                        {/* Text Message */}
                        {message.text && (
                          <div
                            className={`rounded-lg p-3 break-words ${
                              isCurrentUser
                                ? 'bg-blue-500 text-white rounded-br-sm'
                                : 'bg-white text-gray-800 border rounded-bl-sm'
                            }`}
                          >
                            <div style={{ whiteSpace: 'pre-wrap' }}>{message.text}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Input Section */}
          <div className="sticky bottom-0 z-20 bg-white border-t px-4 py-3">
            {/* File Preview */}
            {preview.length > 0 && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {preview.map((file, index) => (
                  <div
                    key={index}
                    className="w-16 h-16 rounded-md overflow-hidden border relative flex items-center justify-center bg-gray-50"
                  >
                    {file.type === 'image' ? (
                      <Image src={file.src} alt={file.name || 'image'} fill className="object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-xs px-1 text-center">
                        <span className="text-lg">📄</span>
                        <span className="truncate max-w-full text-[10px]">{file.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removePreview(index)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-xs flex items-center justify-center transition-colors"
                      aria-label="Remove file"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Message Input */}
            <div className="flex items-center gap-3">
              <label className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 cursor-pointer transition-colors">
                <input
                  ref={fileInputRef}
                  onChange={onFileChange}
                  type="file"
                  accept="image/*,*/*"
                  multiple
                  className="hidden"
                />
                <Image src="/AttachedFileIcon.svg" alt="Attach files" width={22} height={22} />
              </label>

              <div className="flex-1">
                <div className="relative flex items-center border rounded-full bg-gray-50 focus-within:bg-white focus-within:border-blue-300 transition-colors">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Type your message..."
                    className="flex-1 resize-none outline-none bg-transparent rounded-full px-4 py-2 text-sm leading-5 max-h-[200px]"
                    rows={1}
                  />

                  <div className="absolute right-2 flex items-center gap-2">
                    <button
                      onClick={send}
                      disabled={!text.trim() && preview.length === 0}
                      className="w-8 h-8 rounded-full bg-[#1167B1] flex items-center justify-center hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                      aria-label="Send message"
                    >
                      <Image src="/SendIcon.svg" alt="Send" width={16} height={16} />
                    </button>
                  </div>
                </div>

                <div className="text-xs text-gray-400 mt-2">
                  Press <kbd className="px-1 rounded bg-gray-100">Alt + Enter</kbd> for newline —{' '}
                  <kbd className="px-1 rounded bg-gray-100">Enter</kbd> to send.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Sidebar */}
        {infoOpen && (
          <aside className="w-72 bg-white border-l shadow-md">
            <div className="p-4 flex flex-col h-full">
              <div className="flex flex-col items-center">
                <div className="w-20 h-20 relative mb-2">
                  <Image
                    src="/CommunityGroupIcon.png"
                    alt="SK Community Group"
                    fill
                    className="object-cover rounded-full"
                  />
                </div>
                <h3 className="font-semibold text-gray-800">Group Information</h3>
                <p className="text-sm text-gray-600 text-center mt-2">
                  This is a safe space where everyone can openly express themselves without fear of judgment.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto mt-4 space-y-4">
                {/* Media Shared */}
                <div>
                  <p className="text-sm font-semibold text-[#1167B1] mb-2">Media Shared</p>
                  <div className="grid grid-cols-3 gap-2">
                    {messages.some((m) => m.file?.some((f) => f.type === 'image')) ? (
                      messages
                        .flatMap((m) => m.file?.filter((f) => f.type === 'image') || [])
                        .map((media, index) => (
                          <div
                            key={index}
                            className="relative w-full h-20 bg-gray-100 rounded-md overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => openModal(media.src)}
                          >
                            <Image src={media.src} alt={media.name || 'image'} fill className="object-cover" />
                          </div>
                        ))
                    ) : (
                      <p className="text-sm text-gray-500 italic col-span-3">No media yet.</p>
                    )}
                  </div>
                </div>

                {/* Files Shared */}
                <div>
                  <p className="text-sm font-semibold text-[#1167B1] mb-2">Files Shared</p>
                  <div className="space-y-2">
                    {messages.some((m) => m.file?.some((f) => f.type === 'file')) ? (
                      messages
                        .flatMap((m) => m.file?.filter((f) => f.type === 'file') || [])
                        .map((file, index) => (
                          <div key={index} className="p-2 bg-gray-100 rounded-md text-gray-700 hover:bg-gray-200 transition-colors">
                            <div className="flex items-center space-x-2">
                              <span className="text-lg">📄</span>
                              <a
                                href={file.src}
                                download={file.name}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate max-w-[200px] text-[#1167B1] hover:underline"
                                onClick={async () => {
                                  await recordActivityLog({
                                    action: 'Download File from Sidebar',
                                    details: `Downloaded file from sidebar: ${file.name}`,
                                    userId: user.uid,
                                    userEmail: user.email || undefined,
                                    category: 'chat',
                                  });
                                }}
                              >
                                {file.name}
                              </a>
                            </div>
                          </div>
                        ))
                    ) : (
                      <p className="text-sm text-gray-500 italic">No files yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Image Modal */}
      {modalOpen && selectedImage && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50">
          <div className="relative max-w-[90vw] max-h-[90vh]">
            <div className="relative">
              <Image
                src={selectedImage}
                alt="Image preview"
                width={800}
                height={600}
                className="object-contain rounded-lg max-w-full max-h-[90vh]"
              />
            </div>
            <button
              onClick={() => downloadImage(selectedImage, 'image')}
              className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Download
            </button>
          </div>
          <button
            onClick={closeModal}
            className="absolute top-4 right-4 text-white text-2xl font-bold bg-red-600 hover:bg-red-700 rounded-full w-10 h-10 flex items-center justify-center transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return (
    <>
      <RequireAuth>
        {(user) => <ChatContent user={user} />}
      </RequireAuth>
      <Navbar />
    </>
  );
}