import { createSlice } from '@reduxjs/toolkit'
import type { UserProfile } from '@/types/models'

interface AuthState {
  firebaseUid: string | null
  profile: UserProfile | null
  profileLoaded: boolean
}

const initialState: AuthState = {
  firebaseUid: null,
  profile: null,
  profileLoaded: false,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(
      state,
      action: { payload: { uid: string | null; profile: UserProfile | null; loaded: boolean } },
    ) {
      state.firebaseUid = action.payload.uid
      state.profile = action.payload.profile
      state.profileLoaded = action.payload.loaded
    },
    clearSession(state) {
      state.firebaseUid = null
      state.profile = null
      state.profileLoaded = true
    },
  },
})

export const { setSession, clearSession } = authSlice.actions
export default authSlice.reducer
