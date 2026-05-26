import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function QuanLyKinhRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/quan-ly-kho-gong');
  }, [router]);

  return null;
}
