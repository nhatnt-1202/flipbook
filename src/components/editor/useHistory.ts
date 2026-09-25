"use client";

import { useCallback, useState } from "react";

const LIMIT = 100;

type State<T> = { past: T[]; present: T; future: T[] };

/**
 * Undo/redo cho state bất biến.
 *   set(next)           — thay đổi và ghi một bước lịch sử
 *   set(next, false)    — thay đổi tạm (đang kéo, đang gõ), chưa ghi lịch sử
 *   checkpoint(before)  — ghi `before` làm một bước, dùng sau chuỗi thay đổi tạm (thả chuột, rời ô nhập).
 *                         Truyền hàm để dựng `before` từ giá trị hiện tại (vd. chỉ thay một phần).
 */
export function useHistory<T>(initial: T) {
  const [state, setState] = useState<State<T>>({ past: [], present: initial, future: [] });

  const set = useCallback((next: T | ((prev: T) => T), record = true) => {
    setState((s) => {
      const value = typeof next === "function" ? (next as (prev: T) => T)(s.present) : next;
      if (value === s.present) return s;
      if (!record) return { ...s, present: value };
      return { past: [...s.past, s.present].slice(-LIMIT), present: value, future: [] };
    });
  }, []);

  const checkpoint = useCallback((before: T | ((present: T) => T)) => {
    setState((s) => {
      const b = typeof before === "function" ? (before as (present: T) => T)(s.present) : before;
      return b === s.present ? s : { past: [...s.past, b].slice(-LIMIT), present: s.present, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setState((s) => {
      if (!s.past.length) return s;
      return { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      if (!s.future.length) return s;
      return { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) };
    });
  }, []);

  // Nạp dữ liệu mới (vd. sau khi tải từ server), xóa lịch sử
  const reset = useCallback((value: T) => setState({ past: [], present: value, future: [] }), []);

  return {
    value: state.present,
    set,
    checkpoint,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
