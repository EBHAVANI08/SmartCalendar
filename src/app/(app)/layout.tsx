import { AppShell } from '@/components/layout/app-shell';
import { ReactNode } from 'react';

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
