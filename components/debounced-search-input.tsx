"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"

export function DebouncedSearchInput({
  value,
  onDebouncedChange,
  placeholder,
  className,
  delayMs = 200,
}: {
  value: string
  onDebouncedChange: (next: string) => void
  placeholder?: string
  className?: string
  delayMs?: number
}) {
  const [localValue, setLocalValue] = useState(value)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  useEffect(() => {
    if (localValue === value) return
    const timer = window.setTimeout(() => {
      onDebouncedChange(localValue)
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [localValue, value, onDebouncedChange, delayMs])

  return (
    <Input
      placeholder={placeholder}
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      className={className}
    />
  )
}
