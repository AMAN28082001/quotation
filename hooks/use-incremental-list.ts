"use client"

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"

const DEFAULT_BATCH_SIZE = 15

type UseIncrementalListOptions = {
  batchSize?: number
  /** When this changes, visible count resets to one batch. */
  resetKey?: string | number
  enabled?: boolean
  /** Server-side total when `items` is only a loaded subset (e.g. paginated API). */
  totalCount?: number
  /** Scroll container for intersection (defaults to viewport). Use for overflow lists. */
  rootRef?: RefObject<Element | null>
}

/**
 * Reveals list items in batches. Loads the next batch when the sentinel enters the viewport
 * (or via `loadMore`).
 */
export function useIncrementalList<T>(
  items: T[],
  options?: UseIncrementalListOptions,
) {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE
  const enabled = options?.enabled ?? true
  const resetKey = options?.resetKey
  const totalCountOverride = options?.totalCount
  const rootRef = options?.rootRef

  const [visibleCount, setVisibleCount] = useState(batchSize)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setVisibleCount(batchSize)
  }, [resetKey, batchSize])

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + batchSize, items.length))
  }, [batchSize, items.length])

  useEffect(() => {
    if (!enabled || items.length === 0) return

    const el = sentinelRef.current
    if (!el) return

    const root = rootRef?.current ?? null
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        loadMore()
      },
      { root, rootMargin: "240px 0px 0px 0px", threshold: 0 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, items.length, loadMore, visibleCount, rootRef])

  const visibleItems = items.slice(0, Math.min(visibleCount, items.length))
  const listTotal = Math.max(totalCountOverride ?? items.length, items.length)
  const hasMore = visibleCount < items.length

  return {
    visibleItems,
    visibleCount: visibleItems.length,
    totalCount: listTotal,
    hasMore,
    loadMore,
    sentinelRef,
  }
}
