import axios from 'axios';
import { useAuthStore } from '@/store/authStore';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
});

// Attach Firebase ID token to every request.
// Read the user from the Zustand auth store (populated via onAuthStateChanged)
// rather than auth.currentUser, which can be null if persistence init is slow.
api.interceptors.request.use(async (config) => {
  const user = useAuthStore.getState().user;
  if (user) {
    const token = await user.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const API_BASE_URL = BASE_URL;
