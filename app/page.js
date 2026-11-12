'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { db } from './lib/firebase'
import {
  ref, push, onValue, off, serverTimestamp,
  query, limitToLast, runTransaction,
} from 'firebase/database'

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = ['#8B5CF6','#EC4899','#F59E0B','#10B981','#3B82F6','#EF4444','#14B8A6','#F97316','#6366F1','#84CC16']
function colorFor(name = '') {
  let h = 0
  for (const c of name) h = ((h << 5) - h + c.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const diff = now - d
  if (diff < 86_400_000 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  return d.toLocaleDateString('en', { month: 'short', day: 'numeric' }) + ' · ' +
    d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const EMOJIS = ['👍','❤️','😂','😮','😢','😡']

// ── Setup Card ────────────────────────────────────────────────────────────────

function SetupCard({ onDone }) {
  const [val, setVal] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const name = val.trim()
    if (!name) return
    localStorage.setItem('chat_username', name)
    onDone(name)
  }

  return (
    <div className="h-[100dvh] bg-[#F0F2F5] flex items-center justify-center p-4">
      <div className="bg-white border border-[#E4E6EB] rounded-2xl p-8 w-full max-w-sm">
        <div className="w-12 h-12 rounded-full bg-[#0084FF] flex items-center justify-center mb-5">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
          </svg>
        </div>
        <h1 className="text-[#050505] text-xl font-bold mb-1">Join the chat</h1>
        <p className="text-[#65676B] text-sm mb-6">
          Pick a name — everyone in the room will see it.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            autoFocus
            type="text"
            maxLength={24}
            placeholder="Your name…"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="border border-[#E4E6EB] rounded-xl px-4 py-3 text-sm text-[#050505] placeholder:text-[#BCC0C4] focus:outline-none focus:border-[#0084FF] transition-colors"
          />
          <button
            type="submit"
            disabled={!val.trim()}
            className="bg-[#0084FF] hover:bg-[#006EE0] active:bg-[#005CC8] disabled:bg-[#BCC0C4] text-white font-semibold text-sm rounded-xl py-3 transition-colors"
          >
            Join
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isOwn, showName, showAvatar, myName, onReact }) {
  const [showBar, setShowBar] = useState(false)
  const [showTs, setShowTs] = useState(false)
  const hideTimer = useRef(null)

  const color = colorFor(msg.name)
  const letter = (msg.name || '?')[0].toUpperCase()

  const reactions = msg.reactions || {}
  const reactionEntries = Object.entries(reactions).filter(([, v]) => v > 0)

  const startHide = () => { hideTimer.current = setTimeout(() => setShowBar(false), 500) }
  const cancelHide = () => clearTimeout(hideTimer.current)

  return (
    <div className={`flex ${isOwn ? 'flex-row-reverse' : 'flex-row'} items-end gap-1.5 ${showName ? 'mt-3' : 'mt-0.5'}`}>
      {/* Avatar (others only) */}
      <div className="w-7 flex-shrink-0 self-end mb-0.5">
        {!isOwn && showAvatar && (
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold select-none"
            style={{ backgroundColor: color }}
          >
            {letter}
          </div>
        )}
      </div>

      <div className={`flex flex-col max-w-[72%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {/* Sender name */}
        {!isOwn && showName && (
          <span className="text-xs text-[#65676B] ml-1 mb-0.5">{msg.name}</span>
        )}

        {/* Bubble + reaction bar wrapper */}
        <div
          className="relative"
          onMouseEnter={() => { cancelHide(); setShowBar(true) }}
          onMouseLeave={startHide}
        >
          <button
            onClick={() => setShowTs((v) => !v)}
            className={`px-3.5 py-2 text-sm leading-relaxed text-left break-words rounded-2xl
              ${isOwn
                ? 'bg-[#0084FF] text-white rounded-br-[4px]'
                : 'bg-[#F0F2F5] text-[#050505] rounded-bl-[4px]'
              }`}
          >
            {msg.content}
          </button>

          {/* Floating reaction picker */}
          {showBar && (
            <div
              className={`absolute z-30 flex items-center gap-0.5 bg-white border border-[#E4E6EB] rounded-full px-2 py-1 -bottom-8 ${isOwn ? 'right-0' : 'left-0'}`}
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
              onMouseEnter={cancelHide}
              onMouseLeave={startHide}
            >
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => { onReact(msg.id, e); setShowBar(false) }}
                  className="text-base w-7 h-7 flex items-center justify-center rounded-full hover:bg-[#F0F2F5] hover:scale-125 transition-transform"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Timestamp */}
        {showTs && (
          <span className={`text-[11px] text-[#65676B] mt-1 ${isOwn ? 'mr-1' : 'ml-1'}`}>
            {formatTime(msg.ts)}
          </span>
        )}

        {/* Reaction summary */}
        {reactionEntries.length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'mr-1 justify-end' : 'ml-1'}`}>
            {reactionEntries.map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReact(msg.id, emoji)}
                className="bg-white border border-[#E4E6EB] rounded-full px-1.5 py-0.5 text-xs flex items-center gap-0.5 hover:bg-[#F0F2F5] transition-colors"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}
              >
                <span>{emoji}</span>
                <span className="text-[#65676B]">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chat Room ─────────────────────────────────────────────────────────────────

function ChatRoom({ userName }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [onlineCount, setOnlineCount] = useState(1)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const userId = useRef(Math.random().toString(36).slice(2))

  // ── Load messages (last 200) ──
  useEffect(() => {
    const msgsRef = query(ref(db, 'messages'), limitToLast(200))
    const unsub = onValue(msgsRef, (snap) => {
      const data = snap.val() || {}
      const list = Object.entries(data).map(([id, v]) => ({ id, ...v }))
      list.sort((a, b) => (a.ts || 0) - (b.ts || 0))
      setMessages(list)
    })
    return () => off(msgsRef, 'value', unsub)
  }, [])

  // ── Presence ──
  useEffect(() => {
    const presRef = ref(db, `presence/${userId.current}`)
    const countRef = ref(db, 'presence')

    // Set online
    import('firebase/database').then(({ set, onDisconnect, serverTimestamp }) => {
      set(presRef, { name: userName, ts: Date.now() })
      onDisconnect(presRef).remove()
    })

    // Count online
    const unsub = onValue(countRef, (snap) => {
      const data = snap.val() || {}
      // Count entries updated in last 2 minutes
      const cutoff = Date.now() - 120_000
      const count = Object.values(data).filter((v) => v.ts > cutoff).length
      setOnlineCount(Math.max(1, count))
    })

    return () => {
      off(countRef, 'value', unsub)
      import('firebase/database').then(({ remove }) => remove(presRef))
    }
  }, [userName])

  // ── Auto scroll ──
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send message ──
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await push(ref(db, 'messages'), {
      name: userName,
      content: text,
      ts: Date.now(),
    })
  }, [input, userName])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleInputChange = (e) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  // ── React to a message ──
  const handleReact = (msgId, emoji) => {
    const reactRef = ref(db, `messages/${msgId}/reactions/${emoji}`)
    runTransaction(reactRef, (current) => (current || 0) + 1)
  }

  return (
    <div className="bg-[#F0F2F5] h-[100dvh] flex items-center justify-center">
      <div className="bg-white border border-[#E4E6EB] flex flex-col w-full max-w-[480px] h-full md:h-[92vh] md:rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-[#E4E6EB] flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-[#0084FF] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
            </svg>
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <div className="text-[#050505] font-semibold text-sm">Group Chat</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-[#31A24C] flex-shrink-0" />
              <span className="text-[#65676B] text-xs">
                {onlineCount} {onlineCount === 1 ? 'person' : 'people'} online
              </span>
            </div>
          </div>
          {/* Your name badge */}
          <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold select-none"
              style={{ backgroundColor: colorFor(userName) }}
            >
              {userName[0].toUpperCase()}
            </div>
            <span className="text-xs text-[#65676B] hidden sm:block">{userName}</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center select-none">
              <div className="w-14 h-14 rounded-full bg-[#F0F2F5] flex items-center justify-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#BCC0C4">
                  <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/>
                </svg>
              </div>
              <p className="text-[#65676B] text-sm">No messages yet.</p>
              <p className="text-[#BCC0C4] text-xs mt-1">Be the first to say something!</p>
            </div>
          ) : (
            <div className="flex flex-col pb-2">
              {messages.map((msg, i) => {
                const isOwn = msg.name === userName
                const prevMsg = i > 0 ? messages[i - 1] : null
                const nextMsg = i < messages.length - 1 ? messages[i + 1] : null
                const showName = !prevMsg || prevMsg.name !== msg.name
                const showAvatar = !nextMsg || nextMsg.name !== msg.name

                return (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    isOwn={isOwn}
                    showName={showName}
                    showAvatar={showAvatar}
                    myName={userName}
                    onReact={handleReact}
                  />
                )
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-[#E4E6EB] flex-shrink-0 flex items-end gap-2">
          <div className="flex-1 bg-[#F0F2F5] rounded-full px-4 py-2 flex items-end min-h-[38px]">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Aa"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent resize-none text-sm text-[#050505] placeholder:text-[#BCC0C4] focus:outline-none leading-relaxed max-h-[120px] py-0.5"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            aria-label="Send"
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ color: input.trim() ? '#0084FF' : '#BCC0C4' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Root ──────────────────────────────────────────────────────────────────────

export default function Page() {
  const [userName, setUserName] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('chat_username')
    if (stored) setUserName(stored)
    else setUserName('')
  }, [])

  if (userName === null) return <div className="h-[100dvh] bg-[#F0F2F5]" />
  if (!userName) return <SetupCard onDone={setUserName} />
  return <ChatRoom userName={userName} />
}
