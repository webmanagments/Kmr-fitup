// Firebase Realtime Database over REST: the URL, server time and a request helper with a timeout.
import {LEADERBOARD_URL} from '../config.ts';

export function dbUrl(): string {
  let override = '';
  try {
    override = localStorage.getItem('kmr.dbOverride') ?? '';
  } catch {
    /* ignore */
  }
  return (override || LEADERBOARD_URL).replace(/\/+$/, '');
}

export const leaderboardEnabled = () => dbUrl() !== '';

export const TIMESTAMP = {'.sv': 'timestamp'};

export async function request(path: string, init?: RequestInit, timeout = 8000): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    return await fetch(`${dbUrl()}/${path}`, {...init, signal: ctl.signal});
  } finally {
    clearTimeout(timer);
  }
}
