'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function WorkerProfileEditRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/worker/onboarding?returnTo=/worker/profile');
  }, []);
  return null;
}
