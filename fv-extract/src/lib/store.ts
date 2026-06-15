import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'dashboard' | 'calendar' | 'substitutions' | 'teachers' | 'notifications' | 'curriculum';
export type RoleMode = 'admin' | 'teacher';
export type CalendarSubView = 'grid' | 'section-detail';
export type SubstitutionSubView = 'list' | 'detail' | 'manual-assign';
export type TeacherSubView = 'list' | 'detail';
export type TeacherPortalView = 'schedule' | 'notifications' | 'weekly';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string | null;
  designation?: string | null;
  employeeId?: string;
}

interface AppState {
  // Auth
  isLoggedIn: boolean;
  user: User | null;
  role: RoleMode;

  // View state
  currentView: ViewMode;
  calendarSubView: CalendarSubView;
  substitutionSubView: SubstitutionSubView;
  teacherSubView: TeacherSubView;
  teacherPortalView: TeacherPortalView;

  // Selections
  selectedDate: string;
  selectedSectionId: string | null;
  selectedGradeLevel: number | null;
  selectedSubstitutionId: string | null;

  // Real-time
  unreadNotifications: number;
  isConnected: boolean;

  // Actions
  login: (user: User, role: RoleMode) => void;
  logout: () => void;
  setCurrentView: (view: ViewMode) => void;
  setCalendarSubView: (view: CalendarSubView) => void;
  setSubstitutionSubView: (view: SubstitutionSubView) => void;
  setTeacherSubView: (view: TeacherSubView) => void;
  setTeacherPortalView: (view: TeacherPortalView) => void;
  setSelectedDate: (date: string) => void;
  setSelectedSectionId: (id: string | null) => void;
  setSelectedGradeLevel: (level: number | null) => void;
  setSelectedSubstitutionId: (id: string | null) => void;
  setUnreadNotifications: (count: number) => void;
  incrementUnread: () => void;
  setIsConnected: (connected: boolean) => void;
}

function getWeekday(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  return d.toISOString().split('T')[0];
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      user: null,
      role: 'admin',
      currentView: 'dashboard',
      calendarSubView: 'grid',
      substitutionSubView: 'list',
      teacherSubView: 'list',
      teacherPortalView: 'schedule',
      selectedDate: getWeekday(),
      selectedSectionId: null,
      selectedGradeLevel: null,
      selectedSubstitutionId: null,
      unreadNotifications: 0,
      isConnected: false,

      login: (user, role) => set({ isLoggedIn: true, user, role, currentView: role === 'admin' ? 'dashboard' : 'calendar' }),
      logout: () => set({ isLoggedIn: false, user: null, role: 'admin', currentView: 'dashboard' }),
      setCurrentView: (view) => set({ currentView: view }),
      setCalendarSubView: (view) => set({ calendarSubView: view }),
      setSubstitutionSubView: (view) => set({ substitutionSubView: view }),
      setTeacherSubView: (view) => set({ teacherSubView: view }),
      setTeacherPortalView: (view) => set({ teacherPortalView: view }),
      setSelectedDate: (date) => set({ selectedDate: date }),
      setSelectedSectionId: (id) => set({ selectedSectionId: id }),
      setSelectedGradeLevel: (level) => set({ selectedGradeLevel: level }),
      setSelectedSubstitutionId: (id) => set({ selectedSubstitutionId: id }),
      setUnreadNotifications: (count) => set({ unreadNotifications: count }),
      incrementUnread: () => set((s) => ({ unreadNotifications: s.unreadNotifications + 1 })),
      setIsConnected: (connected) => set({ isConnected: connected }),
    }),
    { name: 'school-calendar-store', partialize: (state) => ({ isLoggedIn: state.isLoggedIn, user: state.user, role: state.role }) }
  )
);
