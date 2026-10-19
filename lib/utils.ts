import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Clean Aleo-formatted number strings (remove visibility modifiers and type suffixes).
 *
 * Handles formats like "1u8.private", "1000000u64.public", "0u8", "123456789u128", etc.
 *
 * @param value - Aleo-formatted number string or other value
 * @returns Cleaned number string
 *
 * @example
 * cleanAleoNumber("1000000u64") // "1000000"
 * cleanAleoNumber("0u8") // "0"
 * cleanAleoNumber("1u8.private") // "1"
 * cleanAleoNumber("100u64.public") // "100"
 * cleanAleoNumber(123) // "123"
 */
export function cleanAleoNumber(value: any): string {
  if (typeof value === 'string') {
    return value
      .replace(/\.(private|public)$/, '')
      .replace(/(u8|u16|u32|u64|u128|i8|i16|i32|i64|i128)$/i, '');
  }
  return String(value);
}
