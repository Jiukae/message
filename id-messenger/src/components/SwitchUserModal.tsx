import React, { useState } from 'react';
import { User } from '../types';
import { X, ArrowRightLeft, UserCheck, Plus, Check } from 'lucide-react';

interface SwitchUserModalProps {
  currentUser: User;
  allUsers: User[];
  onClose: () => void;
  onSelectUser: (user: User) => void;
  onAddNewAccount: () => void;
}

export const SwitchUserModal: React.FC<SwitchUserModalProps> = ({
  currentUser,
  allUsers,
  onClose,
  onSelectUser,
  onAddNewAccount,
}) => {
  const [switching, setSwitching] = useState<string | null>(null);

  const handleSwitch = async (user: User) => {
    if (user.id === currentUser.id) return;
    setSwitching(user.id);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, password: 'password123' }),
      });
      const data = await res.json();
      if (data.user) {
        onSelectUser(data.user);
        onClose();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[92vh] flex flex-col bg-[#121622]/90 border border-white/15 rounded-3xl shadow-2xl backdrop-blur-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
              계정 전환하기
            </h2>
            <p className="text-xs text-white/50 mt-0.5">
              다른 아이디로 로그인하여 실시간 1:1 메시지를 테스트해보세요
            </p>
          </div>
          <button
            id="close-switch-modal-btn"
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
          {allUsers.map((user) => {
            const isCurrent = user.id === currentUser.id;
            return (
              <button
                key={user.id}
                id={`switch-to-user-${user.username}-btn`}
                type="button"
                disabled={isCurrent || switching !== null}
                onClick={() => handleSwitch(user)}
                className={`w-full p-3 rounded-2xl flex items-center justify-between transition-all text-left backdrop-blur-sm ${
                  isCurrent
                    ? 'bg-blue-600/20 border border-blue-400/30 text-white cursor-default'
                    : 'bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-400/40 text-white/90'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-tr ${user.avatarBg || 'from-blue-500 to-purple-600'} border border-white/15 flex items-center justify-center text-lg shadow-sm shrink-0`}>
                    {user.avatarEmoji || '💬'}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm truncate">{user.name}</span>
                      <span className="text-xs text-blue-400 font-mono">@{user.username}</span>
                    </div>
                    <p className="text-xs text-white/50 truncate">
                      {user.customStatus || '회원'}
                    </p>
                  </div>
                </div>

                {isCurrent ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-emerald-300 bg-emerald-500/20 px-2.5 py-1 rounded-xl border border-emerald-400/30">
                    <Check className="w-3.5 h-3.5" />
                    현재 계정
                  </span>
                ) : switching === user.id ? (
                  <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                ) : (
                  <span className="text-xs font-medium text-white/50 hover:text-white px-2.5 py-1 rounded-xl bg-white/5 border border-white/10">
                    전환
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Add / Register new account */}
        <div className="p-4 bg-black/20 border-t border-white/10 backdrop-blur-md">
          <button
            id="register-new-from-switch-btn"
            type="button"
            onClick={() => {
              onClose();
              onAddNewAccount();
            }}
            className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-2xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4 text-blue-400" />
            <span>새로운 아이디 회원가입하기</span>
          </button>
        </div>

      </div>
    </div>
  );
};
