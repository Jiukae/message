import React, { useState, useEffect, useRef } from 'react';
import { User, Message, MessageReply } from '../types';
import {
  Send,
  Smile,
  Paperclip,
  Reply,
  Copy,
  Check,
  CheckCheck,
  MoreVertical,
  Search,
  X,
  Sparkles,
  Info,
  ChevronDown,
  Image as ImageIcon,
  ThumbsUp,
  Heart,
  SmilePlus,
} from 'lucide-react';

interface ChatAreaProps {
  currentUser: User;
  partner: User;
  messages: Message[];
  conversationId: string;
  isPartnerOnline: boolean;
  partnerStatusMode?: 'online' | 'dnd' | 'offline';
  isPartnerTyping: boolean;
  onSendMessage: (text: string, replyTo?: MessageReply, attachment?: any) => void;
  onReactMessage: (messageId: string, emoji: string) => void;
  onTyping: () => void;
  onOpenPartnerDetails: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '🔥', '👏', '🙏', '✨', '😍', '🤔', '😭'];
const QUICK_STICKERS = [
  '안녕하세요! 반갑습니다 😊',
  '네, 확인했습니다! 👍',
  '감사합니다! 좋은 하루 되세요 ✨',
  '잠시만 기다려주세요 ⏳',
  '축하드립니다! 🎉🎉',
];

export const ChatArea: React.FC<ChatAreaProps> = ({
  currentUser,
  partner,
  messages,
  conversationId,
  isPartnerOnline,
  partnerStatusMode = 'offline',
  isPartnerTyping,
  onSendMessage,
  onReactMessage,
  onTyping,
  onOpenPartnerDetails,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<MessageReply | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerMenu, setShowStickerMenu] = useState(false);
  const [searchInChat, setSearchInChat] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isPartnerTyping]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(inputText.trim(), replyingTo || undefined);
    setInputText('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
    setShowStickerMenu(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      onTyping();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    onTyping();
    // Auto-expand height
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  // Filter messages if search active
  const displayedMessages = messages.filter((m) => {
    if (!searchInChat.trim()) return true;
    return m.text.toLowerCase().includes(searchInChat.toLowerCase());
  });

  // Group messages by date
  const formatDateLabel = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };

  const formatMessageTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <main className="flex-1 h-full flex flex-col bg-transparent min-w-0 relative">
      
      {/* Header */}
      <header className="h-16 px-4 md:px-6 border-b border-white/10 bg-black/20 backdrop-blur-xl flex items-center justify-between shrink-0 z-10">
        
        {/* Partner Info */}
        <div
          onClick={onOpenPartnerDetails}
          className="flex items-center gap-3 min-w-0 cursor-pointer p-1.5 -m-1.5 rounded-2xl hover:bg-white/5 transition-all group"
        >
          <div className="relative shrink-0">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${partner.avatarBg || 'from-blue-500 to-purple-500'} border border-white/15 flex items-center justify-center text-lg shadow-md group-hover:scale-105 transition-transform`}>
              {partner.avatarEmoji || '💬'}
            </div>
            {/* Status dot: Online (Green), DND (Red), Offline (Gray) */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0c0e14] ${
                partnerStatusMode === 'dnd'
                  ? 'bg-rose-500 shadow-sm shadow-rose-500/50 ring-1 ring-rose-400/30'
                  : isPartnerOnline || partnerStatusMode === 'online'
                  ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 ring-1 ring-emerald-400/30'
                  : 'bg-white/30'
              }`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-white group-hover:text-blue-300 transition-colors truncate">
                {partner.name}
              </span>
              <span className="text-xs text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded-md border border-blue-400/20 shrink-0">
                @{partner.username}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              {isPartnerTyping ? (
                <span className="text-blue-400 font-medium flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]" />
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.4s]" />
                  {partner.username}이 입력 중입니다...
                </span>
              ) : (
                <span
                  className={
                    partnerStatusMode === 'dnd'
                      ? 'text-rose-400 text-[11px] font-medium'
                      : isPartnerOnline || partnerStatusMode === 'online'
                      ? 'text-emerald-400 text-[11px] font-medium'
                      : 'text-white/40 text-[11px]'
                  }
                >
                  {partnerStatusMode === 'dnd'
                    ? '방해 금지'
                    : isPartnerOnline || partnerStatusMode === 'online'
                    ? '온라인'
                    : '오프라인'}
                  {partner.customStatus && ` • ${partner.customStatus}`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          <button
            id="toggle-search-in-chat-btn"
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors ${
              showSearch ? 'bg-white/15 text-blue-400 border-blue-400/30' : ''
            }`}
            title="대화 검색"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            id="partner-profile-info-btn"
            type="button"
            onClick={onOpenPartnerDetails}
            className="p-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="상대방 프로필 정보"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* In-Chat Search Bar */}
      {showSearch && (
        <div className="px-4 py-2.5 bg-black/30 backdrop-blur-md border-b border-white/10 flex items-center gap-2 animate-in slide-in-from-top duration-150">
          <Search className="w-4 h-4 text-white/40 shrink-0" />
          <input
            id="in-chat-search-input"
            type="text"
            autoFocus
            value={searchInChat}
            onChange={(e) => setSearchInChat(e.target.value)}
            placeholder="이 대화방에서 검색..."
            className="w-full bg-transparent text-white text-xs placeholder-white/30 focus:outline-none"
          />
          {searchInChat && (
            <button
              id="clear-in-chat-search-btn"
              type="button"
              onClick={() => setSearchInChat('')}
              className="text-white/40 hover:text-white p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            id="close-in-chat-search-btn"
            type="button"
            onClick={() => {
              setShowSearch(false);
              setSearchInChat('');
            }}
            className="text-xs text-white/60 hover:text-white px-2 py-1 bg-white/10 hover:bg-white/15 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      )}

      {/* Messages Thread Container */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {displayedMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/40 py-12">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-tr ${partner.avatarBg || 'from-blue-500 to-purple-500'} border border-white/15 flex items-center justify-center text-3xl shadow-xl mb-3`}>
              {partner.avatarEmoji || '💬'}
            </div>
            <h4 className="text-base font-bold text-white mb-1">
              {partner.name} (@{partner.username})님과의 대화
            </h4>
            <p className="text-xs text-white/40 max-w-xs">
              {searchInChat
                ? '검색된 메시지가 없습니다.'
                : '아이디로 연결되었습니다. 첫 인사를 건네며 대화를 시작해보세요!'}
            </p>
            {!searchInChat && (
              <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-md">
                {QUICK_STICKERS.map((stk, idx) => (
                  <button
                    key={idx}
                    id={`quick-greeting-btn-${idx}`}
                    type="button"
                    onClick={() => onSendMessage(stk)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-400/40 text-white/80 hover:text-white rounded-xl text-xs backdrop-blur-sm transition-all"
                  >
                    {stk}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          displayedMessages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser.id;
            const prevMsg = displayedMessages[idx - 1];
            const showDateHeader =
              !prevMsg ||
              new Date(prevMsg.createdAt).toDateString() !==
                new Date(msg.createdAt).toDateString();

            return (
              <React.Fragment key={msg.id}>
                {/* Date Separator */}
                {showDateHeader && (
                  <div className="flex items-center justify-center my-4">
                    <span className="px-3 py-1 bg-white/5 border border-white/10 text-white/40 text-[10px] font-medium uppercase tracking-widest rounded-full backdrop-blur-sm shadow-sm">
                      {formatDateLabel(msg.createdAt)}
                    </span>
                  </div>
                )}

                {/* Message Item */}
                <div
                  id={`message-item-${msg.id}`}
                  className={`group relative flex gap-2.5 items-end ${
                    isMe ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {/* Left Avatar (for recipient) */}
                  {!isMe && (
                    <div className="shrink-0 mb-1">
                      <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${partner.avatarBg || 'from-blue-500 to-purple-500'} border border-white/10 flex items-center justify-center text-sm shadow-sm`}>
                        {partner.avatarEmoji || '💬'}
                      </div>
                    </div>
                  )}

                  {/* Message Box and Metadata */}
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[70%]`}>
                    
                    {/* Hover Action Bar */}
                    <div
                      className={`opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mb-1 bg-black/50 border border-white/15 px-2 py-0.5 rounded-xl shadow-xl backdrop-blur-md z-10 ${
                        isMe ? 'mr-1' : 'ml-1'
                      }`}
                    >
                      <button
                        id={`react-btn-heart-${msg.id}`}
                        type="button"
                        onClick={() => onReactMessage(msg.id, '❤️')}
                        className="p-1 hover:scale-125 text-xs transition-transform"
                        title="좋아요"
                      >
                        ❤️
                      </button>
                      <button
                        id={`react-btn-thumb-${msg.id}`}
                        type="button"
                        onClick={() => onReactMessage(msg.id, '👍')}
                        className="p-1 hover:scale-125 text-xs transition-transform"
                        title="최고"
                      >
                        👍
                      </button>
                      <button
                        id={`react-btn-smile-${msg.id}`}
                        type="button"
                        onClick={() => onReactMessage(msg.id, '😂')}
                        className="p-1 hover:scale-125 text-xs transition-transform"
                        title="웃음"
                      >
                        😂
                      </button>
                      <button
                        id={`reply-to-msg-${msg.id}-btn`}
                        type="button"
                        onClick={() =>
                          setReplyingTo({
                            id: msg.id,
                            senderName: isMe ? currentUser.name : partner.name,
                            text: msg.text,
                          })
                        }
                        className="p-1 text-white/60 hover:text-white transition-colors"
                        title="답장하기"
                      >
                        <Reply className="w-3 h-3" />
                      </button>
                      <button
                        id={`copy-msg-${msg.id}-btn`}
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.text)}
                        className="p-1 text-white/60 hover:text-white transition-colors"
                        title="복사"
                      >
                        {copiedMsgId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    {/* Bubble Content */}
                    <div
                      className={`relative px-4 py-3 rounded-2xl shadow-md break-words text-sm backdrop-blur-md ${
                        isMe
                          ? 'bg-blue-600/40 border border-blue-400/30 text-white font-medium rounded-tr-none'
                          : 'bg-white/10 border border-white/10 text-white/90 rounded-tl-none'
                      }`}
                    >
                      {/* Reply Reference Header */}
                      {msg.replyTo && (
                        <div
                          className={`mb-2 p-2 rounded-xl text-xs border-l-2 flex flex-col ${
                            isMe
                              ? 'bg-blue-900/40 border-blue-300 text-blue-100'
                              : 'bg-white/5 border-blue-400 text-white/80'
                          }`}
                        >
                          <span className="font-semibold text-[11px] opacity-90">
                            {msg.replyTo.senderName}님에게 답장
                          </span>
                          <span className="truncate opacity-80 mt-0.5">
                            {msg.replyTo.text}
                          </span>
                        </div>
                      )}

                      {/* Main Text */}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                    </div>

                    {/* Message Meta Info (Time, Read receipt) */}
                    <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-white/40 font-mono">
                      {isMe && (
                        <span className="text-blue-400 font-semibold">
                          {msg.read ? '읽음' : '1'}
                        </span>
                      )}
                      <span>{formatMessageTime(msg.createdAt)}</span>
                    </div>

                    {/* Reactions Display */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(msg.reactions).map(([emoji, uids]) => {
                          const userList = Array.isArray(uids) ? (uids as string[]) : [];
                          const hasReacted = userList.includes(currentUser.id);
                          return (
                            <button
                              key={emoji}
                              id={`reaction-${msg.id}-${emoji}`}
                              type="button"
                              onClick={() => onReactMessage(msg.id, emoji)}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all backdrop-blur-sm ${
                                hasReacted
                                  ? 'bg-blue-500/30 border-blue-400/40 text-blue-200 shadow-sm'
                                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                              }`}
                            >
                              <span>{emoji}</span>
                              <span className="text-[10px] font-bold">{userList.length}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        {/* Typing indicator bubble */}
        {isPartnerTyping && (
          <div className="flex gap-2.5 items-end justify-start animate-in fade-in duration-200">
            <div className={`w-8 h-8 rounded-xl bg-gradient-to-tr ${partner.avatarBg || 'from-blue-500 to-purple-500'} border border-white/10 flex items-center justify-center text-sm shadow-sm shrink-0 mb-1`}>
              {partner.avatarEmoji || '💬'}
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-white/10 border border-white/10 text-white/80 rounded-tl-none flex items-center gap-1.5 text-xs backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:0.4s]" />
              <span className="ml-1 text-[11px] text-white/90 font-medium">{partner.username}이 입력 중입니다...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-black/30 backdrop-blur-md border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs min-w-0">
            <Reply className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-blue-400">
                {replyingTo.senderName}
              </span>
              <span className="text-white/60 ml-1.5 truncate">
                {replyingTo.text}
              </span>
            </div>
          </div>
          <button
            id="cancel-reply-btn"
            type="button"
            onClick={() => setReplyingTo(null)}
            className="text-white/50 hover:text-white p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="absolute bottom-24 left-4 z-20 p-3 bg-[#121622]/90 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150">
          <div className="text-xs font-semibold text-white/50 mb-2 px-1">
            빠른 이모지
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                id={`picker-emoji-${emoji}`}
                type="button"
                onClick={() => {
                  setInputText((prev) => prev + emoji);
                  setShowEmojiPicker(false);
                  textareaRef.current?.focus();
                }}
                className="w-8 h-8 rounded-xl hover:bg-white/10 text-lg flex items-center justify-center transition-transform hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Stickers Popup */}
      {showStickerMenu && (
        <div className="absolute bottom-24 left-12 z-20 p-3 bg-[#121622]/90 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-2xl w-64 animate-in fade-in zoom-in-95 duration-150">
          <div className="text-xs font-semibold text-white/50 mb-2 px-1 flex items-center justify-between">
            <span>자주 쓰는 메시지</span>
            <button onClick={() => setShowStickerMenu(false)} className="text-white/40 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            {QUICK_STICKERS.map((stk, idx) => (
              <button
                key={idx}
                id={`preset-sticker-btn-${idx}`}
                type="button"
                onClick={() => {
                  onSendMessage(stk, replyingTo || undefined);
                  setReplyingTo(null);
                  setShowStickerMenu(false);
                }}
                className="w-full text-left p-2 hover:bg-white/10 rounded-xl text-xs text-white/90 transition-colors truncate"
              >
                {stk}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Message Input Bottom Bar */}
      <footer className="p-4 md:p-5 bg-black/20 border-t border-white/10 backdrop-blur-xl shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-2 focus-within:border-blue-400/40 focus-within:ring-1 focus-within:ring-blue-500/30 transition-all backdrop-blur-sm">
          
          {/* Action buttons on left */}
          <div className="flex items-center gap-0.5">
            <button
              id="emoji-picker-btn"
              type="button"
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker);
                setShowStickerMenu(false);
              }}
              className={`p-2 rounded-xl text-white/40 hover:text-white transition-colors ${
                showEmojiPicker ? 'bg-white/10 text-blue-400' : 'hover:bg-white/5'
              }`}
              title="이모지 선택"
            >
              <Smile className="w-5 h-5" />
            </button>

            <button
              id="quick-sticker-menu-btn"
              type="button"
              onClick={() => {
                setShowStickerMenu(!showStickerMenu);
                setShowEmojiPicker(false);
              }}
              className={`p-2 rounded-xl text-white/40 hover:text-white transition-colors ${
                showStickerMenu ? 'bg-white/10 text-blue-400' : 'hover:bg-white/5'
              }`}
              title="자주 쓰는 메시지"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          </div>

          {/* Text Area */}
          <div className="flex-1 min-w-0">
            <textarea
              ref={textareaRef}
              id="chat-message-input"
              rows={1}
              value={inputText}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              placeholder={`@${partner.username} 님에게 메시지 보내기...`}
              className="w-full px-2 py-1.5 bg-transparent border-none text-white placeholder-white/30 text-sm focus:outline-none resize-none max-h-32 leading-relaxed"
            />
          </div>

          {/* Send Button */}
          <button
            id="send-message-btn"
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-600/30 border border-blue-400/30 transition-all shrink-0"
            title="전송"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </footer>

    </main>
  );
};
