import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'

export interface ScanEvent {
  type: 'info' | 'success' | 'error' | 'critical' | 'high' | 'medium'
  message: string
  timestamp: string
  done?: boolean
}

interface UseScanStreamOptions {
  token: string | null
  onEvent: (event: ScanEvent) => void
  onDone?: () => void
  enabled?: boolean
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/**
 * Opens a Socket.IO connection to /scans and subscribes to events for the
 * given scanId. Cleans up on unmount or when scanId changes.
 *
 * Pass `enabled: false` (or `token: null`) to skip connecting — used for
 * the mock demo path.
 */
export function useScanStream(scanId: string | null, options: UseScanStreamOptions) {
  const { token, onEvent, onDone, enabled = true } = options
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!scanId || !token || !enabled) return

    const socket = io(`${API_URL}/scans`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('subscribe', scanId)
    })

    socket.on('scan_event', (event: ScanEvent) => {
      onEvent(event)
      if (event.done) {
        onDone?.()
        socket.emit('unsubscribe', scanId)
      }
    })

    socket.on('connect_error', (err) => {
      console.warn('[useScanStream] connect error:', err.message)
    })

    return () => {
      socket.emit('unsubscribe', scanId)
      socket.disconnect()
      socketRef.current = null
    }
    // onEvent/onDone are intentionally excluded — callers should wrap in useCallback if needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, token, enabled])
}
